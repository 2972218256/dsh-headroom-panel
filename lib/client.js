/**
 * dsh-headroom-panel — client half.
 *
 * Loaded by the DSH web app through window.__ModuleLoader__. Registers a
 * right-sidebar tab ("Headroom") that shows live headroom proxy stats and lets
 * the user change the proxy mode/upstream/port and the DSH routing (on/off).
 * All data comes from the host half's /api/dsh-headroom-panel/* routes.
 */
window.__ModuleLoader__.load({
  id: 'dsh-headroom-panel',
  factory: (e) => {
    const React = e('react')
    const h = React.createElement

    async function call(route, body) {
      const response = await fetch('api/dsh-headroom-panel/' + route, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const json = await response.json()
      if (!json || json.ok !== true) {
        throw new Error((json && json.error && json.error.message) || 'headroom api failed (HTTP ' + response.status + ')')
      }
      return json.value
    }

    const fmtInt = (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
      return Math.round(value).toLocaleString('en-US')
    }
    const fmtUsd = (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
      const digits = Math.abs(value) >= 1 ? 2 : 4
      return '$' + value.toFixed(digits)
    }
    const fmtPct = (value) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) + '%' : '-')
    const fmtDuration = (seconds) => {
      if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '-'
      const total = Math.round(seconds)
      const hh = Math.floor(total / 3600)
      const mm = Math.floor((total % 3600) / 60)
      if (hh > 0) return hh + 'h ' + mm + 'm'
      return mm + 'm ' + (total % 60) + 's'
    }

    const S = {
      root: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', fontSize: '12px', lineHeight: '1.5', color: 'var(--dsw-alias-label-primary, inherit)', overflow: 'auto', height: '100%', boxSizing: 'border-box' },
      card: { border: '1px solid rgba(128,128,128,0.25)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' },
      cardTitle: { fontSize: '11px', fontWeight: 600, opacity: 0.6, letterSpacing: '0.04em', textTransform: 'uppercase' },
      row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
      label: { opacity: 0.7 },
      value: { fontVariantNumeric: 'tabular-nums', fontWeight: 500 },
      dot: (ok) => ({ width: '8px', height: '8px', borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444', flex: '0 0 auto' }),
      button: (disabled) => ({ border: '1px solid rgba(128,128,128,0.35)', borderRadius: '6px', padding: '4px 9px', fontSize: '12px', background: 'transparent', color: 'inherit', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }),
      buttonPrimary: (disabled) => ({ border: '1px solid rgba(99,102,241,0.65)', background: 'rgba(99,102,241,0.16)', borderRadius: '6px', padding: '4px 9px', fontSize: '12px', color: 'inherit', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }),
      input: { flex: '1 1 auto', minWidth: 0, border: '1px solid rgba(128,128,128,0.35)', borderRadius: '6px', padding: '4px 7px', background: 'transparent', color: 'inherit', fontSize: '12px' },
      select: { border: '1px solid rgba(128,128,128,0.35)', borderRadius: '6px', padding: '4px 7px', background: 'transparent', color: 'inherit', fontSize: '12px' },
      note: { fontSize: '11px', opacity: 0.65 },
      warn: { fontSize: '11px', color: '#f59e0b' },
      error: { fontSize: '11px', color: '#ef4444', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
      rowList: { display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px' },
    }

    function kv(label, value) {
      return h('div', { style: S.row }, h('span', { style: S.label }, label), h('span', { style: S.value }, value))
    }

    function Panel() {
      const [data, setData] = React.useState(null)
      const [error, setError] = React.useState('')
      const [note, setNote] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [modeDraft, setModeDraft] = React.useState('cache')
      const [upstreamDraft, setUpstreamDraft] = React.useState('')
      const [portDraft, setPortDraft] = React.useState('8787')
      const initialized = React.useRef(false)

      const applyData = React.useCallback((next) => {
        setData(next)
        if (next && next.proxy) {
          if (!initialized.current) {
            initialized.current = true
            setModeDraft(next.proxy.optimize === false ? 'passthrough' : next.proxy.mode || 'cache')
            setUpstreamDraft(next.proxy.anthropic_upstream || '')
            setPortDraft(String(next.proxy.port || 8787))
          }
        }
      }, [])

      const load = React.useCallback(async () => {
        try {
          applyData(await call('status'))
          setError('')
        } catch (err) {
          setError(String((err && err.message) || err))
        }
      }, [applyData])

      React.useEffect(() => {
        let alive = true
        const tick = () => {
          if (!alive) return
          load()
        }
        tick()
        const timer = setInterval(tick, 8000)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [load])

      const run = async (name, fn, message) => {
        setBusy(name)
        setNote('')
        setError('')
        try {
          const next = await fn()
          applyData(next)
          if (message) setNote(message)
        } catch (err) {
          setError(String((err && err.message) || err))
        } finally {
          setBusy('')
        }
      }

      const proxy = (data && data.proxy) || null
      const route = (data && data.route) || null
      const stats = (data && data.stats) || null
      const online = !!(proxy && proxy.running)

      return h('div', { style: S.root },
        h('div', { style: S.row },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 } },
            h('span', { style: S.dot(online) }),
            h('span', null, 'Headroom Proxy')),
          h('div', { style: { display: 'flex', gap: '6px' } },
            h('button', { style: S.button(!!busy), disabled: !!busy, onClick: () => run('refresh', () => call('status')) }, '刷新'),
            h('button', { style: S.button(!online), disabled: !online, onClick: () => { if (proxy) window.open('http://127.0.0.1:' + proxy.port + '/dashboard', '_blank') } }, '看板'))),

        error ? h('div', { style: S.error }, error) : null,
        note ? h('div', { style: S.note }, note) : null,
        proxy && proxy.versionWarning ? h('div', { style: S.warn }, proxy.versionWarning) : null,

        h('div', { style: S.card },
          h('div', { style: S.cardTitle }, '运行状态'),
          kv('状态', online ? '运行中' : '未运行'),
          kv('版本 / 端口', online ? String(proxy.version || '-') + ' / ' + String(proxy.port) : String(proxy ? proxy.port : '-')),
          kv('运行时长', online ? fmtDuration(proxy.uptimeSeconds) : '-'),
          kv('上游', (proxy && proxy.upstream) || '-'),
          kv('模式', proxy ? (proxy.optimize === false ? 'passthrough（不优化）' : String(proxy.mode)) : '-')),

        h('div', { style: S.card },
          h('div', { style: S.cardTitle }, 'DSH 路由'),
          kv('当前', route ? (route.mode === 'headroom' ? '经本地 headroom' : route.mode === 'direct' ? '直连官方' : '未配置（直连官方）') : '未知'),
          h('div', { style: S.rowList },
            route && route.inferenceOrigin ? h('div', null, 'inferenceOrigin: ' + route.inferenceOrigin.value) : null,
            route && route.baseURL ? h('div', null, 'baseURL: ' + route.baseURL.value) : null),
          h('div', { style: S.row },
            h('button', {
              style: S.buttonPrimary(!!busy || !route),
              disabled: !!busy || !route,
              onClick: () => run('route', () => call('route', { target: route && route.mode === 'headroom' ? 'off' : 'on' }), '已写入配置，重启 DSH 后生效'),
            }, route && route.mode === 'headroom' ? '切到直连' : route && route.mode === 'direct' ? '切到 headroom' : '写入 headroom 路由')),
          h('div', { style: S.warn }, '切换路由需要重启 DSH 才会生效')),

        h('div', { style: S.card },
          h('div', { style: S.cardTitle }, '代理配置（重启 headroom 生效）'),
          h('div', { style: S.row },
            h('span', { style: S.label }, '模式'),
            h('select', { style: S.select, value: modeDraft, disabled: !!busy, onChange: (event) => setModeDraft(event.target.value) },
              h('option', { value: 'cache' }, 'cache'),
              h('option', { value: 'token' }, 'token'),
              h('option', { value: 'passthrough' }, 'passthrough'))),
          h('div', { style: S.row },
            h('span', { style: S.label }, '上游'),
            h('input', { style: S.input, value: upstreamDraft, disabled: !!busy, onChange: (event) => setUpstreamDraft(event.target.value) })),
          h('div', { style: S.row },
            h('span', { style: S.label }, '端口'),
            h('input', { style: S.input, value: portDraft, disabled: !!busy, inputMode: 'numeric', onChange: (event) => setPortDraft(event.target.value) })),
          h('div', { style: S.row },
            h('button', {
              style: S.buttonPrimary(!!busy),
              disabled: !!busy,
              onClick: () => run('config', () => call('config', { mode: modeDraft, anthropicUpstream: upstreamDraft, port: Number(portDraft) }), '配置已保存，代理已重启'),
            }, '应用并重启代理'),
            h('button', {
              style: S.button(!!busy),
              disabled: !!busy,
              onClick: () => run('restart', () => call('restart'), '代理已重启'),
            }, '仅重启代理'))),

        stats ? h('div', { style: S.card },
          h('div', { style: S.cardTitle }, '节省统计'),
          kv('请求数', fmtInt(stats.apiRequests)),
          kv('压缩次数', fmtInt(stats.compressed)),
          kv('平均压缩率', fmtPct(stats.avgCompressionPct)),
          kv('本次移除 token', fmtInt(stats.tokensRemoved)),
          kv('本次会话省 token', fmtInt(stats.session && stats.session.tokensSaved)),
          kv('前缀缓存命中', fmtPct(stats.cache && stats.cache.hitRate)),
          kv('本次节省金额', fmtUsd(stats.cost && stats.cost.savedUsd)),
          h('div', { style: { height: '1px', background: 'rgba(128,128,128,0.2)', margin: '3px 0' } }),
          kv('终身 token 节省', fmtInt(stats.lifetime && stats.lifetime.tokensSaved)),
          kv('终身压缩省 $', fmtUsd(stats.lifetime && stats.lifetime.compressionUsd)),
          kv('终身缓存省 $', fmtUsd(stats.lifetime && stats.lifetime.cacheUsd)),
          kv('平均延迟', stats.latencyMs ? Math.round(stats.latencyMs) + ' ms' : '-')) : null,

        stats && Array.isArray(stats.recent) && stats.recent.length > 0 ? h('div', { style: S.card },
          h('div', { style: S.cardTitle }, '最近请求'),
          stats.recent.map((entry, index) => h('div', { key: index, style: S.rowList },
            h('div', { style: S.row },
              h('span', { style: S.label }, entry.model || 'model'),
              h('span', { style: S.value }, fmtInt(entry.before) + ' → ' + fmtInt(entry.after) + '  (' + (entry.saved ? '+' + fmtInt(entry.saved) : '0') + ')'))),
          )) : null,

        proxy && proxy.pid ? h('div', { style: S.note }, 'pid ' + proxy.pid) : null)
    }

    function apply(ctx) {
      // Cordis service injection: the sidebar-right UI plugin publishes
      // sidebarRightTabs; wait for it, then register our tab + pane slots.
      const handle = ctx.inject(['sidebarRightTabs'], (scoped) => {
        const tabs = scoped.sidebarRightTabs
        if (!tabs || typeof tabs.register !== 'function') {
          if (ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn('dsh-headroom-panel: sidebarRightTabs.register is unavailable; tab not added')
          return
        }
        const disposers = []
        const push = (disposer) => { if (typeof disposer === 'function') disposers.push(disposer) }
        try {
          push(tabs.register({
            id: 'dsh-headroom-panel',
            kind: 'dsh-headroom-panel',
            title: () => 'Headroom',
          }))
          push(scoped.slots.inject('sidebar.right.pane.tab', () => scoped.slots.register({ name: 'sidebar.right.pane.tab', key: 'dsh-headroom-panel' }, () => h(Panel, null))))
          push(scoped.slots.inject('sidebar.right.pane.tab.title', () => scoped.slots.register({ name: 'sidebar.right.pane.tab.title', key: 'dsh-headroom-panel' }, () => h('span', null, 'Headroom'))))
        } catch (error) {
          for (const dispose of disposers) { try { dispose() } catch {} }
          if (ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn('dsh-headroom-panel: sidebar tab registration failed: ' + String((error && error.message) || error))
          return
        }
        return () => {
          for (const dispose of disposers) { try { dispose() } catch {} }
        }
      })
      return () => { try { if (handle && typeof handle.dispose === 'function') handle.dispose() } catch {} }
    }

    return { name: 'dsh-headroom-panel', inject: ['slots'], apply }
  },
})
