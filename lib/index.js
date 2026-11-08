/**
 * dsh-headroom-panel — host half (DeepSeek Harness plugin).
 *
 * Exposes a small JSON API on the DSH host connection so the web client half
 * can show and change the local headroom proxy state:
 *
 *   POST /api/dsh-headroom-panel/status   -> proxy health/config/stats + DSH route state
 *   POST /api/dsh-headroom-panel/config   -> patch ~/.headroom/proxy.json (+ restart proxy)
 *   POST /api/dsh-headroom-panel/route    -> on|off for the DSH routing lines in cordis.patch.yml
 *   POST /api/dsh-headroom-panel/restart  -> restart the headroom proxy
 *
 * The proxy itself is managed by ~/.headroom/proxy_startup.pyw (Startup shortcut);
 * this plugin only reads/writes ~/.headroom/proxy.json and restarts that launcher.
 */
import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HOME = os.homedir()

/**
 * All paths are env-overridable so the plugin also works on non-default setups
 * (custom DSH profile dir, different Python version, portable installs):
 *   DSH_HEADROOM_PROXY_JSON   default ~/.headroom/proxy.json
 *   DSH_HEADROOM_STARTUP      default ~/.headroom/proxy_startup.pyw
 *   DSH_HEADROOM_PYTHONW      default %LOCALAPPDATA%\Programs\Python\Python313\pythonw.exe
 *   DSH_HEADROOM_PATCH        default ~/.dsh/profiles/desktop/cordis.patch.yml
 *   DSH_HEADROOM_SITE_PACKAGES (optional) used for the version-mismatch guard
 */
const PROXY_JSON = process.env.DSH_HEADROOM_PROXY_JSON || path.join(HOME, '.headroom', 'proxy.json')
const STARTUP = process.env.DSH_HEADROOM_STARTUP || path.join(HOME, '.headroom', 'proxy_startup.pyw')
const PYTHONW = process.env.DSH_HEADROOM_PYTHONW ||
  path.join(HOME, 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'pythonw.exe')
const PATCH_FILE = process.env.DSH_HEADROOM_PATCH ||
  path.join(HOME, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml')

// Boot/loading evidence: proves whether the host half (and later the client
// half, via /client-boot) really loaded in a given DSH process.
const BOOT_LOG = path.join(HOME, '.headroom', 'panel-boot.log')

const DEFAULTS = {
  host: '127.0.0.1',
  port: 8787,
  mode: 'cache',
  optimize: true,
  anthropic_upstream: 'https://api.deepseek.com/anthropic',
  openai_upstream: 'https://api.deepseek.com',
  provider_name: 'DeepSeek',
  extra_args: [],
  extra_env: {
    HF_ENDPOINT: 'https://hf-mirror.com',
    HEADROOM_BEACON: 'off',
    HEADROOM_UPDATE_CHECK: 'off',
    HEADROOM_WS_FAIL_OPEN_ON_COMPRESSION_FAILURE: '1',
  },
}

function recordBoot(source, detail) {
  try {
    fs.mkdirSync(path.dirname(BOOT_LOG), { recursive: true })
    fs.appendFileSync(BOOT_LOG, new Date().toISOString() + ' ' + source + (detail ? ' ' + detail : '') + '\n', 'utf8')
  } catch {
    /* boot logging is best-effort only */
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function readProxyConfig() {
  const cfg = JSON.parse(JSON.stringify(DEFAULTS))
  try {
    const user = JSON.parse(fs.readFileSync(PROXY_JSON, 'utf8'))
    if (user && typeof user === 'object' && !Array.isArray(user)) {
      for (const key of ['host', 'mode', 'anthropic_upstream', 'openai_upstream', 'provider_name']) {
        if (typeof user[key] === 'string' && user[key].trim()) cfg[key] = user[key].trim()
      }
      if (Number.isInteger(user.port) && user.port > 0 && user.port <= 65535) cfg.port = user.port
      if (typeof user.optimize === 'boolean') cfg.optimize = user.optimize
      if (Array.isArray(user.extra_args)) cfg.extra_args = user.extra_args.map(String)
      if (user.extra_env && typeof user.extra_env === 'object') {
        for (const [name, value] of Object.entries(user.extra_env)) {
          if (name && value !== null && value !== undefined) cfg.extra_env[name] = String(value)
        }
      }
    }
  } catch {
    /* keep defaults */
  }
  return cfg
}

function writeProxyConfig(cfg) {
  fs.mkdirSync(path.dirname(PROXY_JSON), { recursive: true })
  fs.writeFileSync(PROXY_JSON, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
}

const ROUTE_KEY_RE = /^(\s*)(#\s*)?(inferenceOrigin|baseURL):\s*"([^"]*)"\s*#\s*\[headroom-route\]/

function readRouteState() {
  const state = { inferenceOrigin: null, baseURL: null, mode: 'unknown' }
  let text = ''
  try {
    text = fs.readFileSync(PATCH_FILE, 'utf8')
  } catch {
    return state
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(ROUTE_KEY_RE)
    if (!m) continue
    const entry = { value: m[4], on: !m[2] }
    if (m[3] === 'inferenceOrigin') state.inferenceOrigin = entry
    else state.baseURL = entry
  }
  if (state.inferenceOrigin && state.baseURL) {
    if (state.inferenceOrigin.on && state.baseURL.on) state.mode = 'headroom'
    else if (!state.inferenceOrigin.on && !state.baseURL.on) state.mode = 'direct'
    else state.mode = 'mixed'
  }
  return state
}

function setRouteState(on, port) {
  const target = 'http://127.0.0.1:' + String(port)
  let text
  try {
    text = fs.readFileSync(PATCH_FILE, 'utf8')
  } catch (error) {
    throw new Error('patch file not readable: ' + PATCH_FILE + ' (' + String(error && error.message) + ')')
  }
  let found = 0
  const lines = text.split(/\r?\n/).map((line) => {
    const m = line.match(ROUTE_KEY_RE)
    if (!m) return line
    found += 1
    const indent = m[1]
    const key = m[3]
    const value = on ? target : m[4]
    return indent + (on ? '' : '# ') + key + ': "' + value + '"   # [headroom-route] ' + key
  })
  if (found < 2) {
    // No managed block yet (e.g. the profile was restored to stock defaults).
    // Turning routing ON appends the block; turning it OFF leaves the stock state.
    if (on) appendRouteBlock(port)
    return
  }
  fs.writeFileSync(PATCH_FILE, lines.join('\n'), 'utf8')
}

/** Append the managed routing block (used when the profile has no block yet). */
function appendRouteBlock(port) {
  const target = 'http://127.0.0.1:' + String(port)
  let text
  try {
    text = fs.readFileSync(PATCH_FILE, 'utf8')
  } catch (error) {
    throw new Error('patch file not readable: ' + PATCH_FILE + ' (' + String((error && error.message) || error) + ')')
  }
  const block = [
    '',
    '# ============ headroom-route managed block ============',
    '# 由 dsh-headroom-panel 插件 / ~/.dsh/headroom-route.ps1 维护；切换后需重启 DSH 生效。',
    '- id: deepseek-account',
    '  name: "@deepseek-ai/dsh-deepseek-account-platform"',
    '  config:',
    '    desktopPlatform: !!js "ctx.get(\'profileContext\')?.name === \'desktop\' && [\'darwin\', \'win32\'].includes(process.platform) ? process.platform : null"',
    '    inferenceOrigin: "' + target + '"   # [headroom-route] inferenceOrigin',
    '- id: llm-deepseek-account',
    '  name: "@deepseek-ai/dsh-llm-deepseek-account"',
    '  config:',
    '    baseURL: "' + target + '"           # [headroom-route] baseURL',
    '# ============ /headroom-route managed block ============',
    '',
  ].join('\n')
  const separator = text.endsWith('\n') ? '' : '\n'
  fs.writeFileSync(PATCH_FILE, text + separator + block, 'utf8')
}

async function fetchJson(url, timeoutMs) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

async function getHealth(port) {
  return fetchJson('http://127.0.0.1:' + String(port) + '/health', 2500)
}

async function getStats(port) {
  return fetchJson('http://127.0.0.1:' + String(port) + '/stats', 6000)
}

/** Versions of headroom_ai present on disk (site-packages dist-info names). */
function installedVersions() {
  const candidates = []
  if (process.env.DSH_HEADROOM_SITE_PACKAGES) candidates.push(process.env.DSH_HEADROOM_SITE_PACKAGES)
  if (PYTHONW && path.basename(PYTHONW).toLowerCase().startsWith('python')) {
    candidates.push(path.join(path.dirname(PYTHONW), 'Lib', 'site-packages'))
  }
  const versions = []
  for (const sitePackages of candidates) {
    try {
      for (const name of fs.readdirSync(sitePackages)) {
        const match = name.match(/^headroom_ai-([0-9][^.]*(?:\.[0-9]+)*)\.dist-info$/)
        if (match && !versions.includes(match[1])) versions.push(match[1])
      }
    } catch {
      /* site-packages unreadable: skip */
    }
  }
  return versions
}

function summarizeStats(raw) {
  if (!raw || typeof raw !== 'object') return null
  const summary = raw.summary || {}
  const comp = summary.compression || {}
  const cost = summary.cost || {}
  const cache = (raw.prefix_cache && raw.prefix_cache.totals) || {}
  const life = (raw.persistent_savings && raw.persistent_savings.lifetime) || {}
  const session = (raw.persistent_savings && raw.persistent_savings.display_session) || {}
  const latency = raw.latency || {}
  const logs = Array.isArray(raw.recent_requests) ? raw.recent_requests : []
  return {
    apiRequests: summary.api_requests ?? null,
    compressed: comp.requests_compressed ?? null,
    avgCompressionPct: comp.avg_compression_pct ?? null,
    bestCompressionPct: comp.best_compression_pct ?? null,
    tokensRemoved: comp.total_tokens_removed ?? null,
    tokensBefore: comp.total_tokens_before ?? null,
    cost: {
      withoutUsd: cost.without_headroom_usd ?? null,
      withUsd: cost.with_headroom_usd ?? null,
      savedUsd: cost.savings_usd ?? cost.total_saved_usd ?? null,
      savedPct: cost.savings_pct ?? null,
    },
    cache: {
      readTokens: cache.cache_read_tokens ?? null,
      hitRate: cache.hit_rate ?? null,
      savingsUsd: cache.savings_usd ?? null,
    },
    lifetime: {
      requests: life.requests ?? null,
      tokensSaved: life.tokens_saved ?? null,
      compressionUsd: life.compression_savings_usd ?? null,
      cacheReadTokens: life.cache_read_tokens ?? null,
      cacheUsd: life.cache_savings_usd ?? null,
    },
    session: {
      requests: session.requests ?? null,
      tokensSaved: session.tokens_saved ?? null,
      startedAt: session.started_at ?? null,
    },
    latencyMs: latency.average_ms ?? null,
    recent: logs.slice(0, 5).map((entry) => ({
      model: entry.model ?? '',
      before: entry.input_tokens_original ?? null,
      after: entry.input_tokens_optimized ?? null,
      saved: entry.tokens_saved ?? null,
      pct: entry.savings_percent ?? null,
      cacheHit: entry.cache_hit === true,
      at: entry.timestamp ?? null,
    })),
  }
}

async function statusPayload() {
  const proxy = readProxyConfig()
  const health = await getHealth(proxy.port)
  const stats = health ? summarizeStats(await getStats(proxy.port)) : null
  const installed = installedVersions()
  const runningVersion = health ? health.version ?? null : null
  const versionWarning = runningVersion && installed.length > 0 && !installed.includes(runningVersion)
    ? '磁盘上的 headroom 是 ' + installed.join(' / ') + '，运行中的代理是 ' + runningVersion +
      '。升级后没有重启代理会触发 ImportError，请点“仅重启代理”。'
    : ''
  return {
    proxy: {
      ...proxy,
      running: !!health,
      version: runningVersion,
      installedVersions: installed,
      versionWarning,
      healthMode: health && health.config ? health.config.savings_profile ?? null : null,
      uptimeSeconds: health ? health.uptime_seconds ?? null : null,
      upstream: health && health.checks && health.checks.upstream ? health.checks.upstream.url ?? null : null,
      pid: health && health.config ? health.config.pid ?? null : null,
    },
    route: readRouteState(),
    stats,
    paths: { proxyJson: PROXY_JSON, patch: PATCH_FILE, startup: STARTUP, pythonw: PYTHONW, bootLog: BOOT_LOG },
    canRestartProxy: fs.existsSync(PYTHONW) && fs.existsSync(STARTUP),
  }
}

const execFileAsync = (file, args) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide: true }, (error, stdout, stderr) => {
    if (error) reject(new Error(String(stderr || error.message)))
    else resolve(stdout)
  })
})

/**
 * Start the proxy launcher through WMI instead of as our own child.
 *
 * Why: a process spawned from a DSH tool shell inherits the DSH process tree
 * (Windows job object), so it is killed when DSH restarts — the proxy silently
 * disappears after the next DSH restart. WMI-created processes are owned by
 * Wmiprvse and survive. Falls back to a plain detached spawn when WMI is
 * unavailable.
 */
async function spawnProxyOutsideJob(pythonw, startup) {
  const commandLine = ('"' + pythonw + '" "' + startup + '"').replace(/'/g, "''")
  const script = "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='" + commandLine + "'} | Out-Null"
  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script])
    return
  } catch (error) {
    if (process.env.DSH_HEADROOM_DEBUG) console.warn('dsh-headroom-panel: WMI spawn failed, falling back:', String(error && error.message))
  }
  const child = spawn(pythonw, [startup], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
}

async function restartProxy() {
  const cfg = readProxyConfig()
  const before = await getHealth(cfg.port)
  const pid = before && before.config ? Number(before.config.pid) : NaN
  if (Number.isFinite(pid) && pid > 0) {
    try {
      process.kill(pid)
    } catch {
      /* already gone */
    }
  }
  for (let i = 0; i < 40; i += 1) {
    await sleep(250)
    if (!(await getHealth(cfg.port))) break
  }
  if (!fs.existsSync(PYTHONW)) throw new Error('pythonw.exe not found: ' + PYTHONW)
  if (!fs.existsSync(STARTUP)) throw new Error('proxy launcher not found: ' + STARTUP)
  await spawnProxyOutsideJob(PYTHONW, STARTUP)
  for (let i = 0; i < 120; i += 1) {
    await sleep(500)
    const health = await getHealth(cfg.port)
    if (health && health.status === 'healthy') return
  }
  throw new Error('headroom proxy did not become healthy within 60s')
}

async function applyConfig(body) {
  if (!body || typeof body !== 'object') throw new Error('body is not JSON')
  const cfg = readProxyConfig()
  let dirty = false
  if (typeof body.mode === 'string') {
    const mode = body.mode.trim().toLowerCase()
    if (mode === 'cache' || mode === 'token') {
      cfg.mode = mode
      cfg.optimize = true
      dirty = true
    } else if (mode === 'passthrough') {
      cfg.optimize = false
      dirty = true
    } else {
      throw new Error('unknown mode: ' + body.mode)
    }
  }
  if (typeof body.optimize === 'boolean') {
    cfg.optimize = body.optimize
    dirty = true
  }
  if (body.anthropicUpstream !== undefined) {
    const url = String(body.anthropicUpstream || '').trim()
    if (!/^https?:\/\/\S+$/.test(url)) throw new Error('anthropic upstream must be an http(s) URL')
    cfg.anthropic_upstream = url
    dirty = true
  }
  if (body.port !== undefined) {
    const port = Number(body.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('port must be 1-65535')
    cfg.port = port
    dirty = true
  }
  if (!dirty) throw new Error('nothing to change')
  writeProxyConfig(cfg)
  await restartProxy()
  const route = readRouteState()
  if (body.port !== undefined && route.mode === 'headroom') setRouteState(true, cfg.port)
  const payload = await statusPayload()
  payload.restartDshRequired = route.mode === 'headroom' && body.port !== undefined
  return payload
}

async function applyRoute(body) {
  if (!body || typeof body !== 'object') throw new Error('body is not JSON')
  const cfg = readProxyConfig()
  if (body.target === 'off') setRouteState(false, cfg.port)
  else if (body.target === 'on') setRouteState(true, cfg.port)
  else throw new Error("target must be 'on' or 'off'")
  const payload = await statusPayload()
  payload.restartDshRequired = true
  return payload
}

const OK_HEADERS = { 'cache-control': 'no-store' }
const ok = (value) => Response.json({ ok: true, value }, { headers: OK_HEADERS })
const fail = (error) => Response.json(
  { ok: false, error: { code: 'dsh-headroom-panel/error', message: String((error && error.message) || error) } },
  { headers: OK_HEADERS },
)

const readBody = async (request) => {
  try {
    return await request.json()
  } catch {
    return null
  }
}

const guarded = (handler) => async (request) => {
  try {
    return ok(await handler(request))
  } catch (error) {
    return fail(error)
  }
}

export const name = 'dsh-headroom-panel'
export const inject = []

export function apply(ctx) {
  recordBoot('host', 'pid=' + process.pid)
  ctx.inject(['connection'], (scoped) => {
    const connection = scoped.get('connection')
    const register = connection && connection.fetch && typeof connection.fetch.register === 'function'
      ? connection.fetch.register.bind(connection.fetch)
      : undefined
    if (!register) {
      if (ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn('dsh-headroom-panel: connection.fetch.register is unavailable; routes not mounted')
      return
    }
    const mount = (routePath, handler) => {
      try {
        scoped.effect(
          () => register({ path: routePath, methods: ['POST'], requestBody: 'buffered', fetch: handler }),
          'dsh-headroom-panel: ' + routePath,
        )
      } catch (error) {
        if (ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn('dsh-headroom-panel: failed to mount ' + routePath + ': ' + String((error && error.message) || error))
      }
    }
    mount('/api/dsh-headroom-panel/status', guarded(() => statusPayload()))
    mount('/api/dsh-headroom-panel/config', guarded(async (request) => applyConfig(await readBody(request))))
    mount('/api/dsh-headroom-panel/route', guarded(async (request) => applyRoute(await readBody(request))))
    mount('/api/dsh-headroom-panel/client-boot', guarded(async (request) => {
      const body = await readBody(request)
      recordBoot('client', JSON.stringify(body || {}))
      return { ok: true, at: Date.now() }
    }))
    mount('/api/dsh-headroom-panel/restart', guarded(async () => {
      await restartProxy()
      return statusPayload()
    }))
  })
}

/** Test hooks (used by scripts/test-host.mjs); not part of the plugin API. */
export const __test = { readProxyConfig, writeProxyConfig, readRouteState, setRouteState, statusPayload, restartProxy, summarizeStats, getHealth }
