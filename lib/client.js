/**
 * dsh-headroom-panel — client half.
 *
 * Loaded by the DSH web app through window.__ModuleLoader__. Two surfaces:
 *   1. LEFT navigation entry "Headroom" + a full-width system-level page
 *      (`sidebar.panellist` + `main` slots) — the primary placement, because
 *      headroom routing/compression is global, not per conversation.
 *   2. A compact panel reused by dsh-better-sidebar / the fallback floating
 *      button (only used when the left nav registration fails).
 *
 * All data comes from the host half's /api/dsh-headroom-panel/* routes.
 */
window.__ModuleLoader__.load({
  id: 'dsh-headroom-panel',
  factory: (e) => {
    const React = e('react')
    const h = React.createElement

    const NS = 'dsh-headroom-panel'
    const FONT = '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, -apple-system, sans-serif'

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

    const fmtInt = (value) => (typeof value === 'number' && Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '—')
    const fmtUsd = (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      return '$' + value.toFixed(Math.abs(value) >= 1 ? 2 : 4)
    }
    const fmtPct = (value) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(1) + '%' : '—')
    const fmtDuration = (seconds) => {
      if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—'
      const total = Math.round(seconds)
      const days = Math.floor(total / 86400)
      const hh = Math.floor((total % 86400) / 3600)
      const mm = Math.floor((total % 3600) / 60)
      if (days > 0) return days + ' 天 ' + hh + ' 小时'
      if (hh > 0) return hh + ' 小时 ' + mm + ' 分'
      return mm + ' 分 ' + (total % 60) + ' 秒'
    }
    const fmtTime = (iso) => {
      if (!iso) return '—'
      try {
        const d = new Date(iso)
        return d.toLocaleTimeString('zh-CN', { hour12: false })
      } catch {
        return '—'
      }
    }

    function reportClientBoot() {
      try {
        fetch('api/dsh-headroom-panel/client-boot', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ version: '0.1.4', at: Date.now(), ua: typeof navigator === 'undefined' ? '' : navigator.userAgent }),
        }).catch(() => {})
      } catch {
        /* best effort */
      }
    }

    /** Shared data/state for both surfaces (wide page and compact panel). */
    function useHeadroom() {
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
        if (next && next.proxy && !initialized.current) {
          initialized.current = true
          setModeDraft(next.proxy.optimize === false ? 'passthrough' : next.proxy.mode || 'cache')
          setUpstreamDraft(next.proxy.anthropic_upstream || '')
          setPortDraft(String(next.proxy.port || 8787))
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
        const tick = () => { if (alive) load() }
        tick()
        const timer = setInterval(tick, 8000)
        return () => { alive = false; clearInterval(timer) }
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

      return {
        data,
        error,
        note,
        busy,
        load,
        run,
        modeDraft, setModeDraft,
        upstreamDraft, setUpstreamDraft,
        portDraft, setPortDraft,
        proxy: data && data.proxy,
        route: data && data.route,
        stats: data && data.stats,
        toggleRoute: () => run('route', () => call('route', { target: data && data.route && data.route.mode === 'headroom' ? 'off' : 'on' }), '路由已写入，重启 DSH 后生效'),
        saveConfig: () => run('config', () => call('config', { mode: modeDraft, anthropicUpstream: upstreamDraft, port: Number(portDraft) }), '配置已保存，代理已重启'),
        restartProxy: () => run('restart', () => call('restart'), '代理已重启'),
        refresh: () => run('refresh', () => call('status')),
      }
    }

    const S = {
      page: {
        height: '100%', overflow: 'auto', background: 'transparent',
        fontFamily: FONT, fontSize: '14px', lineHeight: '1.65',
        color: 'var(--dsw-alias-label-primary, inherit)',
      },
      container: { maxWidth: '1360px', margin: '0 auto', padding: '26px 40px 64px', boxSizing: 'border-box' },
      header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '18px', marginBottom: '22px', flexWrap: 'wrap' },
      title: { margin: 0, fontSize: '27px', fontWeight: 700, letterSpacing: '0.2px', lineHeight: '1.2' },
      subtitle: { margin: '7px 0 0', fontSize: '13px', opacity: 0.6 },
      headerRight: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
      statusPill: (ok) => ({
        display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 13px', borderRadius: '999px',
        fontSize: '13px', border: '1px solid rgba(128,128,128,0.3)',
        background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
      }),
      dot: (ok) => ({ width: '8px', height: '8px', borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444', flex: '0 0 auto' }),
      btn: (primary, disabled) => ({
        border: '1px solid ' + (primary ? 'rgba(99,102,241,0.65)' : 'rgba(128,128,128,0.35)'),
        background: primary ? 'rgba(99,102,241,0.16)' : 'transparent',
        borderRadius: '9px', padding: '7px 14px', fontSize: '13px', color: 'inherit',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
      }),
      card: {
        border: '1px solid rgba(128,128,128,0.22)', borderRadius: '14px', padding: '18px 20px',
        background: 'rgba(128,128,128,0.06)', boxSizing: 'border-box', minWidth: 0,
      },
      cardTitle: { fontSize: '12px', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', opacity: 0.55, marginBottom: '12px' },
      kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '18px' },
      kpiCard: { border: '1px solid rgba(128,128,128,0.22)', borderRadius: '14px', padding: '16px 18px', background: 'rgba(128,128,128,0.06)' },
      kpiLabel: { fontSize: '12.5px', opacity: 0.6, marginBottom: '6px' },
      kpiValue: { fontSize: '25px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: '1.15', letterSpacing: '0.2px' },
      kpiSub: { fontSize: '12px', opacity: 0.55, marginTop: '5px' },
      grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '14px', marginBottom: '18px', alignItems: 'start' },
      row: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '16px', padding: '6px 0', borderBottom: '1px dashed rgba(128,128,128,0.16)' },
      rowLabel: { opacity: 0.65, flex: '0 0 auto', fontSize: '13.5px' },
      rowValue: { fontVariantNumeric: 'tabular-nums', textAlign: 'right', wordBreak: 'break-all', fontSize: '13.5px' },
      formRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' },
      formLabel: { minWidth: '56px', opacity: 0.65, fontSize: '13.5px' },
      input: {
        flex: '1 1 auto', minWidth: 0, border: '1px solid rgba(128,128,128,0.35)', borderRadius: '9px',
        padding: '7px 11px', background: 'rgba(0,0,0,0.12)', color: 'inherit', fontSize: '13.5px', fontFamily: 'inherit',
      },
      select: {
        border: '1px solid rgba(128,128,128,0.35)', borderRadius: '9px', padding: '7px 11px',
        background: 'rgba(0,0,0,0.12)', color: 'inherit', fontSize: '13.5px', fontFamily: 'inherit',
      },
      btnRow: { display: 'flex', gap: '10px', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap' },
      formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px 22px' },
      noteBox: { fontSize: '12.5px', opacity: 0.65, marginBottom: '14px' },
      note: { fontSize: '12.5px', opacity: 0.62 },
      warn: { fontSize: '13px', color: '#f59e0b', marginBottom: '14px' },
      error: { fontSize: '13px', color: '#ef4444', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: '14px' },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
      th: { textAlign: 'left', padding: '6px 10px 8px 0', borderBottom: '1px solid rgba(128,128,128,0.25)', fontWeight: 600, opacity: 0.6, whiteSpace: 'nowrap' },
      td: { padding: '7px 10px 7px 0', borderBottom: '1px dashed rgba(128,128,128,0.16)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
      badge: (good) => ({
        display: 'inline-block', padding: '1px 8px', borderRadius: '999px', fontSize: '11.5px',
        background: good ? 'rgba(34,197,94,0.14)' : 'rgba(128,128,128,0.18)',
      }),
    }

    function KV(props) {
      return h('div', { style: S.row }, h('span', { style: S.rowLabel }, props.label), h('span', { style: S.rowValue }, props.value))
    }

    function Kpi(props) {
      return h('div', { style: S.kpiCard },
        h('div', { style: S.kpiLabel }, props.label),
        h('div', { style: S.kpiValue }, props.value),
        props.sub ? h('div', { style: S.kpiSub }, props.sub) : null)
    }

    /* ------------------------------------------------------------------ */
    /* Wide, system-level page (left navigation entry)                     */
    /* ------------------------------------------------------------------ */
    function WidePage() {
      const s = useHeadroom()
      const { proxy, route, stats } = s
      const online = !!(proxy && proxy.running)
      const routeLabel = !route ? '未知' : route.mode === 'headroom' ? '经本地 headroom' : route.mode === 'direct' ? '直连官方' : '未配置（直连官方）'
      const recent = (stats && stats.recent) || []

      const header = h('div', { style: S.header },
        h('div', null,
          h('h1', { style: S.title }, 'Headroom'),
          h('p', { style: S.subtitle }, '系统级 LLM 代理 · 路由与压缩对全部会话生效，配置一次全局复用')),
        h('div', { style: S.headerRight },
          h('span', { style: S.statusPill(online) }, h('span', { style: S.dot(online) }), online ? '运行中 · v' + proxy.version : '未运行'),
          h('button', { style: S.btn(false, !!s.busy), disabled: !!s.busy, onClick: s.refresh }, '刷新'),
          h('button', {
            style: S.btn(false, !online), disabled: !online,
            onClick: () => { if (proxy) window.open('http://127.0.0.1:' + proxy.port + '/stats', '_blank') },
          }, '原始统计')))

      const kpis = h('div', { style: S.kpiGrid },
        h(Kpi, { label: '本次统计请求数', value: fmtInt(stats && stats.apiRequests), sub: stats && stats.compressed != null ? '其中压缩 ' + fmtInt(stats.compressed) + ' 次' : null }),
        h(Kpi, { label: '平均压缩率', value: fmtPct(stats && stats.avgCompressionPct), sub: stats && stats.bestCompressionPct ? '最佳 ' + fmtPct(stats.bestCompressionPct) : null }),
        h(Kpi, { label: '本次移除 token', value: fmtInt(stats && stats.tokensRemoved), sub: stats && stats.cache ? '缓存命中 ' + fmtPct(stats.cache.hitRate) : null }),
        h(Kpi, { label: '本次节省金额', value: fmtUsd(stats && stats.cost && stats.cost.savedUsd), sub: '终身 ' + fmtUsd(stats && stats.lifetime && stats.lifetime.compressionUsd) }))

      const runtimeCard = h('div', { style: S.card },
        h('div', { style: S.cardTitle }, '运行状态'),
        h(KV, { label: '状态', value: online ? '运行中' : '未运行' }),
        h(KV, { label: '版本', value: proxy && proxy.version ? 'v' + proxy.version : '—' }),
        h(KV, { label: '端口', value: proxy ? String(proxy.port) : '—' }),
        h(KV, { label: '运行时长', value: online ? fmtDuration(proxy.uptimeSeconds) : '—' }),
        h(KV, { label: '上游', value: (proxy && proxy.upstream) || '—' }),
        h(KV, { label: '模式', value: proxy ? (proxy.optimize === false ? 'passthrough（不优化）' : String(proxy.mode)) : '—' }),
        h(KV, { label: '进程', value: proxy && proxy.pid ? 'pid ' + proxy.pid : '—' }))

      const routeCard = h('div', { style: S.card },
        h('div', { style: S.cardTitle }, 'DSH 路由'),
        h(KV, { label: '当前', value: routeLabel }),
        h(KV, { label: 'inferenceOrigin', value: route && route.inferenceOrigin ? route.inferenceOrigin.value : '—' }),
        h(KV, { label: 'baseURL', value: route && route.baseURL ? route.baseURL.value : '—' }),
        h('div', { style: S.btnRow },
          h('button', { style: S.btn(true, !!s.busy || !route), disabled: !!s.busy || !route, onClick: s.toggleRoute },
            route && route.mode === 'headroom' ? '切回直连官方' : '写入 headroom 路由'),
          h('span', { style: S.note }, '修改后需重启 DSH 生效')))

      const modeOptions = [
        h('option', { value: 'cache', key: 'cache' }, 'cache — 保缓存，温和压缩'),
        h('option', { value: 'token', key: 'token' }, 'token — 激进压缩'),
        h('option', { value: 'passthrough', key: 'passthrough' }, 'passthrough — 只转发不压缩'),
      ]
      const configCard = h('div', { style: S.card },
        h('div', { style: S.cardTitle }, '代理配置（保存后自动重启 headroom）'),
        h('div', { style: S.formGrid },
          h('div', { style: S.formRow },
            h('span', { style: S.formLabel }, '模式'),
            h('select', { style: S.select, value: s.modeDraft, disabled: !!s.busy, onChange: (event) => s.setModeDraft(event.target.value) }, modeOptions)),
          h('div', { style: S.formRow },
            h('span', { style: S.formLabel }, '上游'),
            h('input', { style: S.input, value: s.upstreamDraft, disabled: !!s.busy, onChange: (event) => s.setUpstreamDraft(event.target.value) })),
          h('div', { style: S.formRow },
            h('span', { style: S.formLabel }, '端口'),
            h('input', { style: S.input, value: s.portDraft, disabled: !!s.busy, inputMode: 'numeric', onChange: (event) => s.setPortDraft(event.target.value) }))),
        h('div', { style: S.btnRow },
          h('button', { style: S.btn(true, !!s.busy), disabled: !!s.busy, onClick: s.saveConfig }, '应用并重启代理'),
          h('button', { style: S.btn(false, !!s.busy), disabled: !!s.busy, onClick: s.restartProxy }, '仅重启代理'),
          h('span', { style: S.note }, '升级 headroom 后务必点一次「仅重启代理」，否则新旧版本混跑会报 ImportError')))

      const savingsCard = h('div', { style: S.card },
        h('div', { style: S.cardTitle }, '节省统计'),
        h(KV, { label: '本次会话请求', value: fmtInt(stats && stats.session && stats.session.requests) }),
        h(KV, { label: '本次会话省 token', value: fmtInt(stats && stats.session && stats.session.tokensSaved) }),
        h(KV, { label: '本次移除 token', value: fmtInt(stats && stats.tokensRemoved) }),
        h(KV, { label: '前缀缓存命中', value: fmtPct(stats && stats.cache && stats.cache.hitRate) }),
        h(KV, { label: '平均延迟', value: stats && stats.latencyMs ? Math.round(stats.latencyMs) + ' ms' : '—' }),
        h('div', { style: { height: '10px' } }),
        h(KV, { label: '终身 token 节省', value: fmtInt(stats && stats.lifetime && stats.lifetime.tokensSaved) }),
        h(KV, { label: '终身压缩省 $', value: fmtUsd(stats && stats.lifetime && stats.lifetime.compressionUsd) }),
        h(KV, { label: '终身缓存省 $', value: fmtUsd(stats && stats.lifetime && stats.lifetime.cacheUsd) }))

      const recentRows = recent.map((entry, index) => h('tr', { key: index },
        h('td', { style: S.td }, fmtTime(entry.at)),
        h('td', { style: S.td }, entry.model || '—'),
        h('td', { style: S.td }, fmtInt(entry.before) + ' → ' + fmtInt(entry.after)),
        h('td', { style: S.td }, (entry.saved == null ? '—' : '+' + fmtInt(entry.saved)) + (entry.pct == null ? '' : '（' + fmtPct(entry.pct) + '）')),
        h('td', { style: S.td }, h('span', { style: S.badge(entry.cacheHit) }, entry.cacheHit ? '命中' : '未命中'))))

      const recentTable = recent.length === 0
        ? h('div', { style: S.note }, '暂无请求记录')
        : h('table', { style: S.table },
            h('thead', null, h('tr', null,
              h('th', { style: S.th }, '时间'),
              h('th', { style: S.th }, '模型'),
              h('th', { style: S.th }, '输入 → 压缩后'),
              h('th', { style: S.th }, '省 token'),
              h('th', { style: S.th }, '缓存'))),
            h('tbody', null, recentRows))

      const recentCard = h('div', { style: S.card },
        h('div', { style: S.cardTitle }, '最近请求'),
        recentTable)

      return h('div', { style: S.page },
        h('div', { style: S.container },
          header,
          proxy && proxy.versionWarning ? h('div', { style: S.warn }, proxy.versionWarning) : null,
          s.error ? h('div', { style: S.error }, s.error) : null,
          s.note ? h('div', { style: S.noteBox }, s.note) : null,
          kpis,
          h('div', { style: S.grid2 }, runtimeCard, routeCard),
          configCard,
          h('div', { style: S.grid2 }, savingsCard, recentCard)))
    }

    /* ------------------------------------------------------------------ */
    /* Compact panel (better-sidebar tab / fallback floating popover)      */
    /* ------------------------------------------------------------------ */
    function CompactPanel() {
      const s = useHeadroom()
      const { proxy, route, stats } = s
      const online = !!(proxy && proxy.running)
      const compact = {
        root: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', fontFamily: FONT, fontSize: '12.5px', lineHeight: '1.55', color: 'inherit', overflow: 'auto', height: '100%', boxSizing: 'border-box' },
        card: { border: '1px solid rgba(128,128,128,0.25)', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' },
        title: { fontSize: '11px', fontWeight: 600, opacity: 0.6, letterSpacing: '0.05em', textTransform: 'uppercase' },
        row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
        label: { opacity: 0.7 },
        value: { fontVariantNumeric: 'tabular-nums', fontWeight: 500 },
        dot: (ok) => ({ width: '8px', height: '8px', borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444', flex: '0 0 auto' }),
        btn: (primary, disabled) => ({ border: '1px solid rgba(128,128,128,0.35)', borderRadius: '7px', padding: '4px 9px', fontSize: '12px', background: primary ? 'rgba(99,102,241,0.16)' : 'transparent', color: 'inherit', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }),
        input: { flex: '1 1 auto', minWidth: 0, border: '1px solid rgba(128,128,128,0.35)', borderRadius: '7px', padding: '4px 7px', background: 'transparent', color: 'inherit', fontSize: '12px', fontFamily: 'inherit' },
      }
      const kv = (label, value) => h('div', { style: compact.row }, h('span', { style: compact.label }, label), h('span', { style: compact.value }, value))
      return h('div', { style: compact.root },
        h('div', { style: compact.row },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 600 } },
            h('span', { style: compact.dot(online) }), 'Headroom Proxy'),
          h('div', { style: { display: 'flex', gap: '6px' } },
            h('button', { style: compact.btn(false, !!s.busy), disabled: !!s.busy, onClick: s.refresh }, '刷新'))),
        s.error ? h('div', { style: { color: '#ef4444' } }, s.error) : null,
        s.note ? h('div', { style: { opacity: 0.65 } }, s.note) : null,
        proxy && proxy.versionWarning ? h('div', { style: { color: '#f59e0b' } }, proxy.versionWarning) : null,
        h('div', { style: compact.card },
          h('div', { style: compact.title }, '运行状态'),
          kv('状态', online ? '运行中' : '未运行'),
          kv('版本 / 端口', online ? 'v' + proxy.version + ' / ' + proxy.port : '—'),
          kv('运行时长', online ? fmtDuration(proxy.uptimeSeconds) : '—'),
          kv('模式', proxy ? (proxy.optimize === false ? 'passthrough' : proxy.mode) : '—')),
        h('div', { style: compact.card },
          h('div', { style: compact.title }, 'DSH 路由'),
          kv('当前', !route ? '未知' : route.mode === 'headroom' ? '经 headroom' : route.mode === 'direct' ? '直连官方' : '未配置'),
          h('button', { style: compact.btn(true, !!s.busy || !route), disabled: !!s.busy || !route, onClick: s.toggleRoute }, route && route.mode === 'headroom' ? '切到直连' : '写入 headroom 路由'),
          h('div', { style: { opacity: 0.6, fontSize: '11px' } }, '切换后需重启 DSH')),
        stats ? h('div', { style: compact.card },
          h('div', { style: compact.title }, '节省'),
          kv('请求数', fmtInt(stats.apiRequests)),
          kv('平均压缩率', fmtPct(stats.avgCompressionPct)),
          kv('移除 token', fmtInt(stats.tokensRemoved)),
          kv('终身 token', fmtInt(stats.lifetime && stats.lifetime.tokensSaved))) : null)
    }

    /** Left-navigation icon (chart/monitor glyph). */
    const NavIcon = () => h('svg', {
      width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
      strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
      style: { display: 'block', marginLeft: '-1px' },
    },
      h('rect', { x: 3, y: 4.5, width: 18, height: 12, rx: 2.5 }),
      h('path', { d: 'M12 16.5v3M8 21h8' }),
      h('path', { d: 'M6.5 12l2.8-2.8 2.4 2.2 2.8-3.2 2.6 2.6' }))

    function mountFloating() {
      try {
        const host = document.createElement('div')
        host.setAttribute('data-dsh-headroom-panel', 'floating')
        document.body.appendChild(host)
        const ReactDOMClient = e('react-dom/client')
        const createRoot = ReactDOMClient.createRoot || (ReactDOMClient.default && ReactDOMClient.default.createRoot)
        if (typeof createRoot !== 'function') { host.remove(); return () => {} }
        const root = createRoot(host)
        const Open = () => {
          const [open, setOpen] = React.useState(false)
          return h('div', { style: { position: 'fixed', right: '14px', bottom: '14px', zIndex: 2147483000, fontFamily: FONT } },
            open ? h('div', {
              style: {
                position: 'fixed', right: '14px', bottom: '58px', width: '380px', maxHeight: '72vh', overflow: 'auto',
                background: 'var(--dsw-alias-bg-primary, #1b1e24)', border: '1px solid rgba(128,128,128,0.35)',
                borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', padding: '4px',
              },
            }, h(CompactPanel, null)) : null,
            h('button', {
              onClick: () => setOpen(!open), title: 'Headroom 代理状态与配置',
              style: {
                display: 'flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 12px', borderRadius: '16px',
                border: '1px solid rgba(128,128,128,0.4)', background: 'var(--dsw-alias-bg-primary, #1b1e24)',
                color: 'inherit', cursor: 'pointer', fontSize: '12px', boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
              },
            }, h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e' } }), 'Headroom'))
        }
        root.render(h(Open, null))
        return () => { try { root.unmount() } catch {} ; try { host.remove() } catch {} }
      } catch (error) {
        try { console.warn('dsh-headroom-panel: floating mount failed', error) } catch {}
        return () => {}
      }
    }

    function apply(ctx) {
      reportClientBoot()
      const cleanupFns = []
      let floatingMounted = false
      const mountFallback = () => {
        if (floatingMounted) return
        floatingMounted = true
        cleanupFns.push(mountFloating())
      }

      // Primary surface: LEFT navigation entry + full-width main-area page.
      let navOk = false
      try {
        const navDisposer = ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'dsh-headroom-panel',
          order: 88,
          label: () => h('span', { style: { fontSize: '14px' } }, 'Headroom'),
        }, NavIcon))
        const mainDisposer = ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'dsh-headroom-panel',
        }, WidePage))
        cleanupFns.push(() => {
          try { if (typeof navDisposer === 'function') navDisposer() } catch {}
          try { if (typeof mainDisposer === 'function') mainDisposer() } catch {}
        })
        navOk = true
      } catch (error) {
        try { console.warn('dsh-headroom-panel: left navigation registration failed', error) } catch {}
      }
      if (!navOk) mountFallback()

      // Secondary surface: dsh-better-sidebar tab (when installed).
      try {
        const better = ctx.get('betterSidebar')
        if (better && typeof better.registerTab === 'function') {
          const handle = ctx.effect(() => better.registerTab({
            id: 'dsh-headroom-panel',
            title: () => 'Headroom',
            description: () => '本地 headroom 代理状态与配置（系统级）',
            order: 30,
            single: true,
            component: () => h(CompactPanel, null),
          }), 'dsh-headroom-panel: better-sidebar tab')
          cleanupFns.push(() => { try { if (handle && typeof handle.dispose === 'function') handle.dispose() } catch {} })
        }
      } catch {}

      return () => {
        for (const fn of cleanupFns) {
          try { fn() } catch {}
        }
      }
    }

    return { name: NS, inject: ['slots'], apply, __preview: { WidePage, CompactPanel } }
  },
})
