import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type {
  DashboardSnapshot, EvaluationBatch, EvaluationCase, Scenario, SkillDraft,
} from '../contracts/index.js'
import skillManagerRemote from './remote.js'
import { CLIENT_CSS } from './shell.css.js'
import { createPreviewApi } from './preview-api.js'
import { SkillEditor } from './skill-workspace.js'
import { ScenariosPage, SettingsPage } from './management-pages.js'
import { GateTraceCanvas, traceSpanType, spanDuration, type TraceGraphEdge } from './trace-graph.js'
import { callRemote, useRemoteQuery, useMutation, randomOperation, safeError, type AnyRecord, type RemoteApi } from './api.js'
export { unwrapRemoteResult } from './api.js'

/** Services supplied by the Harness Client Module loader. */
// `remote` provides the mount manager.  The generated namespace is mounted by
// this entry itself, so it must be requested by a child `ctx.inject` after the
// mount completes (declaring it here would deadlock the entry before `$mount`).
export const inject = ['slots', 'remote']

type NavId = 'dashboard' | 'skills' | 'evaluations' | 'traces' | 'scenarios' | 'settings'
type WorkbenchFocus = {
  skillId?: string; evaluationId?: string; caseId?: string; traceId?: string
  traceSource?: string; traceFrom?: string; traceTo?: string
  releaseId?: string; skillTab?: 'versions'
}

const NAV_ITEMS: Array<{ id: NavId; label: string; glyph: string }> = [
  { id: 'dashboard', label: 'Dashboard', glyph: '▦' },
  { id: 'skills', label: 'Skill 管理', glyph: '✦' },
  { id: 'evaluations', label: '测评中心', glyph: '◒' },
  { id: 'traces', label: 'Trace 追踪', glyph: '⌁' },
  { id: 'scenarios', label: '业务场景', glyph: '◇' },
]

const EMPTY_DASHBOARD: DashboardSnapshot = {
  status: 'empty',
  counts: { activeSkills: 0, publishedSkills: 0, publishReadySkills: 0, pendingEvaluations: 0, unmeasuredSkills: 0, traces24h: 0, releaseChanges30d: 0 },
  sections: [
    { id: 'work', title: '待处理工作', description: '按门槛和新鲜度排序', status: 'empty', items: [] },
    { id: 'skills', title: 'Skill 状态', description: '草稿、归档和生效版本', status: 'empty', items: [] },
    { id: 'quality', title: '测评质量', description: '最近批次的人工结论', status: 'empty', items: [] },
    { id: 'production', title: '生产表现', description: '仅统计真实生产 Trace', status: 'empty', items: [] },
  ],
  generatedAt: '',
}


// A Host may expose the raw SlotCore (outside the dynamic creator guard). Keep
// our page root at a deterministic shadowing priority in that environment, and
// let the creator guard replace it with its own per-registration priority when
// present. The WeakMap also makes hot-reload/re-apply idempotent per Context.
let nextStandaloneRootPriority = -1_000
const activeApplications = new WeakMap<object, { cleanup?: () => void | Promise<void> }>()


function routeFromLocation(): NavId {
  if (typeof window === 'undefined') return 'dashboard'
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  return (NAV_ITEMS.some(item => item.id === raw) || raw === 'settings' ? raw : 'dashboard') as NavId
}

function useHashRoute(allowNavigation?: (next: NavId) => boolean): [NavId, (next: NavId) => void] {
  const [route, setRoute] = useState<NavId>(routeFromLocation)
  const routeRef = useRef(route)
  const guardRef = useRef(allowNavigation)
  routeRef.current = route; guardRef.current = allowNavigation
  useEffect(() => {
    const sync = () => {
      const next = routeFromLocation()
      if (next !== routeRef.current && guardRef.current?.(next) === false) {
        window.history.replaceState({}, '', window.location.pathname + window.location.search + '#/' + routeRef.current)
        return
      }
      setRoute(next)
    }
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    sync()
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync) }
  }, [])
  const navigate = useCallback((next: NavId) => {
    if (typeof window === 'undefined') { setRoute(next); return }
    const hash = `#/${next}`
    if (window.location.hash === hash) { setRoute(next); return }
    window.history.pushState({ skillManagerRoute: next }, '', `${window.location.pathname}${window.location.search}${hash}`)
    setRoute(next)
  }, [])
  return [route, navigate]
}

function resolveRemoteService(ctx: AnyRecord): AnyRecord | undefined {
  // `remote` is a declared Client service, so this direct read is safe in the
  // creator-mode guard.  The `get()` fallback keeps the browser entry usable in
  // the small test/standalone contexts that do not expose Cordis accessors.
  const direct = ctx?.remote
  if (direct && typeof direct === 'object') return direct
  if (typeof ctx?.get === 'function') {
    try {
      const lookedUp = ctx.get('remote')
      if (lookedUp && typeof lookedUp === 'object') return lookedUp
    } catch {}
  }
  return undefined
}

function resolveRemote(ctx: AnyRecord): RemoteApi {
  // The generated namespace is its own Cordis service. Optional lookup also
  // works in creator mode, without probing undeclared properties on a traced
  // `remote` service (even a caught guard error marks the plugin as failed).
  const mounted = optionalContextService(ctx, 'remote.skillManager')
  if (mounted) return mounted
  const remote = resolveRemoteService(ctx)
  // Plain preview/test adapters may store the namespace on a regular object.
  // Use `has` before reading these compatibility fields: dynamic facades
  // deliberately support membership checks for safe capability discovery.
  if (remote) {
    for (const key of ['skillManager', 'skillManagerV1']) {
      if (!(key in remote)) continue
      const value = remote[key]
      if (value && typeof value === 'object') return value
    }
    if ('v1' in remote && remote.v1?.skillManager) return remote.v1.skillManager
    if ('get' in remote && typeof remote.get === 'function') {
      const value = remote.get('skillManager')
      if (value && typeof value === 'object') return value
    }
  }
  if (typeof window !== 'undefined' && (window as AnyRecord).__SKILL_MANAGER_PREVIEW__ === true) return createPreviewApi(EMPTY_DASHBOARD)
  return undefined
}


function prettyValue(value: unknown): string {
  if (value === undefined) return '—'
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) }
  catch { return String(value) }
}


export function requestNativeExit(_ctx: AnyRecord, disposeRoot?: () => void): void {
  // Removing our shadowing registration elects the existing native root in
  // both Web and Desktop. The renderer owns the React tree and its removal;
  // no navigation, invented layout event, or manual DOM deletion is needed.
  disposeRoot?.()
}

function optionalContextService(ctx: AnyRecord, name: string): AnyRecord | undefined {
  if (typeof ctx?.get !== 'function') return undefined
  try { return ctx.get(name) as AnyRecord | undefined } catch { return undefined }
}

function cleanupDom(): void {
  if (typeof document === 'undefined') return
  document.querySelectorAll('style[data-skill-manager]').forEach(node => node.remove())
  document.documentElement.classList.remove('sm-plugin-active')
  document.body.classList.remove('sm-plugin-active')
  document.body.removeAttribute('data-skill-manager')
  document.documentElement.style.removeProperty('--sm-desktop-titlebar')
  document.documentElement.style.removeProperty('--sm-host-top')
  delete document.documentElement.dataset.smDesktop
}

function applyDesktopSafeArea(ctx: AnyRecord): void {
  if (typeof document === 'undefined') return
  const hasLookup = typeof ctx?.get === 'function'
  const nativeWindow = hasLookup ? optionalContextService(ctx, 'desktopWindow') : ctx?.desktopWindow
  const desktop = hasLookup
    ? optionalContextService(ctx, 'desktop') ?? optionalContextService(ctx, 'platform')?.desktop
    : ctx?.desktop || ctx?.platform?.desktop
  // Desktop publishes geometry independently of its replaceable root. Its
  // framed modes already inset #root; advanced mode leaves content at y=0.
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location?.search || '' : '')
  const mode = params.get('dsh-desktop-mode')
  const platform = params.get('dsh-desktop-platform')
  const hasDesktopMarker = ['advanced', 'compatibility', 'extended'].includes(mode || '') && ['darwin', 'win32', 'linux'].includes(platform || '')
  const markerInset = hasDesktopMarker ? mode === 'extended' || (mode === 'compatibility' && platform !== 'linux') ? 36 : platform === 'linux' ? 0 : 32 : undefined
  const raw = nativeWindow?.dragRegion?.height ?? nativeWindow?.safeAreaInsets?.top
    ?? desktop?.titlebarInset ?? desktop?.titleBarInset ?? desktop?.safeArea?.top
    ?? (hasLookup ? optionalContextService(ctx, 'titlebarInset') : ctx?.titlebarInset)
    ?? (typeof window !== 'undefined' ? (window as AnyRecord).__DSH_DESKTOP_TITLEBAR_INSET__ : undefined)
    ?? markerInset
  const inset = Number(raw)
  if (Number.isFinite(inset) && inset > 0) {
    const rootTop = document.getElementById?.('root')?.getBoundingClientRect().top || 0
    const reservedByHost = Math.max(0, Math.min(rootTop, inset, 96))
    document.documentElement.style.setProperty('--sm-desktop-titlebar', `${Math.max(0, Math.min(inset, 96) - reservedByHost)}px`)
    document.documentElement.style.setProperty('--sm-host-top', `${reservedByHost}px`)
    document.documentElement.dataset.smDesktop = 'true'
  }
}

function installStyle(): void {
  if (typeof document === 'undefined' || document.querySelector('style[data-skill-manager]')) return
  const style = document.createElement('style'); style.dataset.skillManager = 'true'; style.textContent = `${CLIENT_CSS}
.sm-app{padding-top:max(env(safe-area-inset-top),var(--sm-desktop-titlebar,0px));height:calc(100dvh - var(--sm-host-top,0px));min-height:calc(100dvh - var(--sm-host-top,0px));}
.sm-app>.sm-sidebar{height:100%;min-height:0;}
.sm-app>.sm-main{min-height:0;}
html[data-sm-desktop="true"] .sm-app::before{content:"";position:fixed;top:0;left:0;right:0;height:var(--sm-desktop-titlebar,0px);background:#fbfaf7;-webkit-app-region:drag;z-index:5;}
`; document.head.appendChild(style)
  document.documentElement.classList.add('sm-plugin-active'); document.body.classList.add('sm-plugin-active'); document.body.dataset.skillManager = 'active'
}

export async function apply(ctx: AnyRecord): Promise<() => Promise<void>> {
  if (ctx && typeof ctx === 'object') await activeApplications.get(ctx)?.cleanup?.()
  const state: { cleanup?: () => void | Promise<void> } = {}
  if (ctx && typeof ctx === 'object') activeApplications.set(ctx, state)
  let disposeRemote: (() => Promise<void>) | undefined
  let disposeRoot: (() => void) | undefined
  let disposeUi: (() => Promise<void>) | undefined
  let cleanupPromise: Promise<void> | undefined
  const cleanup = (): Promise<void> => {
    if (cleanupPromise) return cleanupPromise
    cleanupPromise = (async () => {
      const rootDisposer = disposeRoot
      disposeRoot = undefined
      try { requestNativeExit(ctx, rootDisposer) } catch {}
      const uiDisposer = disposeUi
      disposeUi = undefined
      try { await uiDisposer?.() } catch {}
      const remoteDisposer = disposeRemote
      disposeRemote = undefined
      try { await remoteDisposer?.() } catch {}
      cleanupDom()
      if (ctx && typeof ctx === 'object' && activeApplications.get(ctx) === state) activeApplications.delete(ctx)
    })()
    return cleanupPromise
  }
  state.cleanup = cleanup
  try {
    const remote = resolveRemoteService(ctx)
    if (typeof remote?.$mount === 'function') {
      // This is the step that turns the Host registration into the real
      // `ctx.remote.skillManager` namespace.  Without it the UI is only a
      // shell and every action is disabled.
      disposeRemote = await remote.$mount(skillManagerRemote)
    }
    const leave = () => { void cleanup() }
    installStyle()
    applyDesktopSafeArea(ctx)
    const registerUi = (scope: AnyRecord): void => {
      const api = resolveRemote(scope)
      const renderProps = { api, onExit: leave }
      if (scope?.slots?.register) {
        // The renderer assigns a unique descending priority for dynamic root
        // registrations. Supplying a literal value can collide with another
        // creator-mode profile and is the source of the "root already has a
        // registration" startup error.
        disposeRoot = scope.slots.register({ name: 'root', id: 'skill-manager-root', priority: nextStandaloneRootPriority--, locale: 'skillManager', inject: () => renderProps }, SkillManagerRoot)
      } else if (typeof document !== 'undefined') {
        const host = document.getElementById('skill-manager-root') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'skill-manager-root' }))
        const root = createRoot(host)
        root.render(<SkillManagerRoot {...renderProps} />)
        disposeRoot = () => root.unmount()
      }
    }
    if (ctx && 'inject' in ctx && typeof ctx.inject === 'function') {
      // A mounted Remote namespace is a Cordis service in its own right. Park
      // the UI registration on that service so the callback receives the real
      // API and never probes `ctx.remote.skillManager` before it exists.
      const ui = ctx.inject(['slots', 'remote.skillManager'], registerUi)
      // Retain the child disposer before awaiting its activation: a rejected
      // child still owns a fiber and any effects it registered before failure.
      disposeUi = async () => { await ui.dispose() }
      await ui
    } else {
      // Creator-mode Context facades withhold `inject`. `$mount` has already
      // awaited the namespace, so optional lookup can now register the same
      // UI using only the facade's declared `slots` and `remote` services.
      registerUi(ctx)
    }
    return cleanup
  } catch (error) {
    await cleanup()
    throw error
  }
}

function SkillManagerRoot(props: { api?: RemoteApi; onExit: () => void }): React.ReactElement {
  return <SkillManagerApp api={props.api} onExit={props.onExit} />
}

export function SkillManagerApp({ api, onExit }: { api?: RemoteApi; onExit: () => void }): React.ReactElement {
  const [refresh, setRefresh] = useState(0)
  const [notice, setNotice] = useState<string>()
  const [hasUnsaved, setHasUnsaved] = useState(false)
  const [confirmExit, setConfirmExit] = useState(false)
  const [pendingRoute, setPendingRoute] = useState<NavId>()
  const [focus, setFocus] = useState<WorkbenchFocus>({})
  const [pendingFocus, setPendingFocus] = useState<typeof focus>({})
  const [route, navigate] = useHashRoute(next => { if (hasUnsaved) { setPendingRoute(next); setPendingFocus({}); return false } return true })
  const connection = useRemoteQuery<AnyRecord>(api, 'settingsHealth', [], {})
  useEffect(() => { if (!api) return; const timer = window.setInterval(connection.reload, 15000); return () => window.clearInterval(timer) }, [api])
  const connectionLabel = !api ? '未连接 Harness' : connection.error ? '连接失败' : !connection.data.status ? '连接中' : connection.data.status === 'healthy' ? '管理服务正常' : '服务需关注'
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => { if (hasUnsaved) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [hasUnsaved])
  const bump = useCallback(() => setRefresh(value => value + 1), [])
  const go = (next: NavId, target: typeof focus = {}) => {
    if (hasUnsaved) { setPendingRoute(next); setPendingFocus(target); return }
    setFocus(target); navigate(next); setNotice(undefined)
  }
  const requestExit = () => { if (hasUnsaved) setConfirmExit(true); else onExit() }
  return <div className="sm-app" data-sm-owner="skill-manager">
    <Sidebar connectionLabel={connectionLabel} route={route} onNavigate={go} onExit={requestExit} />
    <main className="sm-main">
      <Topbar connectionLabel={connectionLabel} connected={Boolean(connection.data.status) && !connection.error} route={route} api={api} />
      {notice ? <div className="sm-toast" role="status">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice(undefined)}>×</button></div> : null}
      {!api ? <ConnectionBanner /> : connection.error ? <InlineError message={connection.error} onRetry={connection.reload} /> : null}
      {route === 'dashboard' ? <DashboardPage api={api} refresh={refresh} onNavigate={go} onChanged={bump} onNotice={setNotice} /> : null}
      {route === 'skills' ? <SkillsPage initialSkillId={focus.skillId} initialReleaseId={focus.releaseId} initialTab={focus.skillTab} api={api} refresh={refresh} onChanged={bump} onNavigate={go} onNotice={setNotice} onDirtyChange={setHasUnsaved} /> : null}
      {route === 'evaluations' ? <EvaluationsPage onDirtyChange={setHasUnsaved} initialSkillId={focus.skillId} initialEvaluationId={focus.evaluationId} initialCaseId={focus.caseId} api={api} refresh={refresh} onChanged={bump} onNavigate={go} onNotice={setNotice} /> : null}
      {route === 'traces' ? <TracesPage initialSkillId={focus.skillId} initialTraceId={focus.traceId} initialEvaluationId={focus.evaluationId} initialCaseId={focus.caseId} initialSource={focus.traceSource} initialFrom={focus.traceFrom} initialUntil={focus.traceTo} api={api} refresh={refresh} onChanged={bump} onNavigate={go} onNotice={setNotice} /> : null}
      {route === 'scenarios' ? <ScenariosPage onDirtyChange={setHasUnsaved} api={api} refresh={refresh} onChanged={bump} onNotice={setNotice} /> : null}
      {route === 'settings' ? <SettingsPage onDirtyChange={setHasUnsaved} api={api} onExit={requestExit} onNotice={setNotice} /> : null}
    </main>
    {confirmExit || pendingRoute ? <div className="sm-modal-backdrop"><div className="sm-modal" role="dialog" aria-modal="true" aria-labelledby="sm-exit-title"><h2 id="sm-exit-title">还有未保存修改</h2><p>离开将丢弃尚未保存的编辑内容。已保存草稿不会受影响。</p><div><Button onClick={() => { setConfirmExit(false); setPendingRoute(undefined) }}>继续编辑</Button><Button variant="danger" onClick={() => { setConfirmExit(false); setHasUnsaved(false); if (pendingRoute) { setFocus(pendingFocus); navigate(pendingRoute); setPendingRoute(undefined) } else onExit() }}>放弃未保存更改</Button></div></div></div> : null}
  </div>
}

function Sidebar({ route, onNavigate, onExit, connectionLabel }: { connectionLabel: string; route: NavId; onNavigate: (next: NavId) => void; onExit: () => void }): React.ReactElement {
  return <aside className="sm-sidebar">
    <div className="sm-brand"><span className="sm-brand-mark">DS</span><div><strong>Skill Manager</strong><small>DeepSeek Harness</small></div></div>
    <nav aria-label="Skill Manager 主导航" className="sm-nav">
      {NAV_ITEMS.map(item => <button className={`sm-nav-item ${route === item.id ? 'is-active' : ''}`} key={item.id} type="button" onClick={() => onNavigate(item.id)}><span className="sm-nav-glyph" aria-hidden="true">{item.glyph}</span><span>{item.label}</span></button>)}
    </nav>
    <div className="sm-sidebar-bottom"><div className="sm-health"><i />{connectionLabel}</div><button className={`sm-nav-item ${route === 'settings' ? 'is-active' : ''}`} type="button" onClick={() => onNavigate('settings')}><span className="sm-nav-glyph" aria-hidden="true">⚙</span><span>系统设置</span></button><button type="button" className="sm-native-link" onClick={onExit}>↩ 返回原生 Harness</button></div>
  </aside>
}

function Topbar({ route, api, connectionLabel, connected }: { route: NavId; api?: RemoteApi; connectionLabel: string; connected: boolean }): React.ReactElement {
  const label = route === 'skills' ? 'Skill 管理' : route === 'evaluations' ? '测评中心' : route === 'traces' ? 'Trace 追踪' : route === 'scenarios' ? '业务场景' : route === 'settings' ? '系统设置' : 'Dashboard'
  return <header className="sm-topbar"><div className="sm-breadcrumb"><span>工作台</span><b>/</b><strong>{label}</strong></div><div className="sm-top-status"><span className={connected ? 'dot-ready' : 'dot-warning'} />{connected ? '已连接' : connectionLabel}<span className="sm-top-divider" />本地工作区</div></header>
}

function ConnectionBanner(): React.ReactElement {
  return <div className="sm-connection-banner"><span className="sm-banner-icon">!</span><div><strong>尚未连接 Harness Remote</strong><p>页面仍可浏览结构，但保存、测评、Trace 和发布动作会在 skill-manager Profile 挂载后启用。</p></div><code>skillManager.v1</code></div>
}

function PageIntro({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: React.ReactNode }): React.ReactElement {
  return <header className="gate-page-head"><div className="gate-title-group"><div className="gate-title-line"><h1>{title}</h1></div><div className="gate-title-meta"><span>{eyebrow || 'WORKSPACE'}</span><span>{description}</span></div></div>{actions ? <div className="gate-page-actions">{actions}</div> : null}</header>
}

function Button({ children, onClick, variant = 'secondary', disabled = false, type = 'button', title }: { children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; disabled?: boolean; type?: 'button' | 'submit'; title?: string }): React.ReactElement {
  return <button type={type} title={title} disabled={disabled} className={`sm-button gate-button sm-button-${variant}`} onClick={onClick}>{children}</button>
}

function StatusPill({ status }: { status: string }): React.ReactElement {
  const label: Record<string, string> = { ready: '已就绪', passed: '通过', blocked: '需处理', pending: '待运行', running: '运行中', completed: '已完成', stale: '已过期', empty: '暂无数据', archived: '已归档', candidate: '候选', confirmed: '已确认', published: '已发布', production: '生产', 'harness-native': 'Harness', 'workbench-test': '测试', failed: '失败', failure: '失败', cancelled: '已取消', healthy: '健康', degraded: '降级', unknown: '无法判断', correct: '正确', incorrect: '错误', 'quality-passed': '质量达标', 'below-threshold': '未达标', unannotated: '待标注', 'insufficient-labels': '标注不足', unaligned: '未生产对齐', unconfigured: '门槛未配置', 'exception-release': '例外发布', 'load-unknown': '加载未知', 'notification-failed': '通知失败', 'rolled-back': '已回滚' }
  const tone = ['ready', 'passed', 'completed', 'published', 'healthy', 'correct', 'quality-passed'].includes(status) ? 'green' : ['blocked', 'stale', 'failure', 'failed', 'degraded', 'incorrect', 'below-threshold', 'notification-failed'].includes(status) ? 'red' : ['pending', 'candidate', 'running', 'confirmed', 'cancelled', 'unannotated', 'insufficient-labels', 'unaligned', 'unconfigured', 'exception-release'].includes(status) ? 'amber' : 'blue'
  const gateTone = tone === 'green' ? 'success' : tone === 'red' ? 'error' : tone === 'amber' ? 'warning' : 'info'
  return <span className={`sm-pill sm-pill-${tone} gate-status status ${gateTone}`}><i />{label[status] || status}</span>
}


export function DashboardPage({ api, refresh, onNavigate, onChanged, onNotice }: { api: RemoteApi; refresh: number; onNavigate: (route: NavId, target?: WorkbenchFocus) => void; onChanged: () => void; onNotice: (message: string) => void }): React.ReactElement {
  const query = useRemoteQuery<{ status?: string; dashboard?: DashboardSnapshot } | DashboardSnapshot>(api, 'dashboardGet', [], EMPTY_DASHBOARD, true)
  // Optional strict arguments are still positional in the generated Remote;
  // pass an explicit undefined slot so the Gateway does not reject the call.
  const releases = useRemoteQuery<{ releases: AnyRecord[]; changes?: DashboardSnapshot['releaseChanges'] }>(api, 'releaseList', [undefined], { releases: [] }, Boolean(api))
  useEffect(() => { if (refresh > 0) query.reload() }, [refresh])
  useEffect(() => { if (refresh > 0) releases.reload() }, [refresh])
  const snapshot = (query.data as AnyRecord)?.dashboard || query.data as DashboardSnapshot
  const data: DashboardSnapshot = snapshot?.counts ? snapshot as DashboardSnapshot : EMPTY_DASHBOARD
  const create = useMutation(api, 'skillCreate', () => { onChanged(); onNavigate('skills') })
  const createSkill = async () => { try { await create.run({ title: '新建 Skill' }); onNotice('已创建工作草稿') } catch (error) { onNotice(safeError(error)) } }
  const section = (id: DashboardSnapshot['sections'][number]['id']) => data.sections.find(item => item.id === id) || EMPTY_DASHBOARD.sections.find(item => item.id === id)!
  const work = section('work'); const skills = section('skills'); const quality = section('quality'); const production = section('production')
  const routeFor = (action: string): NavId => action === 'settings' ? 'settings' : action.includes('trace') ? 'traces' : action.includes('skill') ? 'skills' : 'evaluations'
  const openItem = (item: DashboardSnapshot['sections'][number]['items'][number]) => onNavigate(routeFor(item.action), item.action === 'evaluation' ? {evaluationId:item.id} : item.action === 'skill' ? {skillId:item.skillId || item.id} : {})
  const reasonFor = (item: DashboardSnapshot['sections'][number]['items'][number]) => {
    if (item.status) return item.status
    const detail = item.detail.toLowerCase()
    return detail.includes('过期') ? 'stale' : detail.includes('失败') || detail.includes('阻断') ? 'blocked' : detail.includes('发布') ? 'published' : 'pending'
  }
  const lastUpdated = data.generatedAt ? `刷新于 ${formatTime(data.generatedAt)}` : query.loading ? '正在同步' : '等待首次同步'
  const openProduction = () => {
    const generated = Date.parse(data.generatedAt)
    const until = Number.isFinite(generated) ? generated : Date.now()
    onNavigate('traces', { traceSource: 'production', traceFrom: new Date(until - 86400000).toISOString(), traceTo: new Date(until).toISOString() })
  }
  const releaseChanges = releases.data.changes
  const openRelease = (release: NonNullable<DashboardSnapshot['releaseChanges']>[number]) => onNavigate('skills', { skillId: release.skillId, releaseId: release.releaseId, skillTab: 'versions' })
  const notificationLabel = { pending: '通知待发送', delivered: '通知已送达', failed: '通知失败', unknown: '通知状态未知' }
  return <div className="sm-page dashboard-page">
    <header className="dashboard-head"><div><h1>Dashboard</h1><p>先处理阻断发布、测评或运行健康的 Skill；每一项都保留可返回的下钻路径。</p></div><div className="dashboard-range"><span className="range-note">生产 24h · 发布 30d · {lastUpdated}</span><Button variant="primary" onClick={() => work.items[0] ? openItem(work.items[0]) : onNavigate('evaluations')} disabled={!api || query.loading}>{work.items[0] ? '处理首个待处理 Skill' : '进入测评中心'}</Button></div></header>
    {query.error ? <InlineError message={query.error} onRetry={query.reload} /> : null}
    <div className="dashboard-body"><section className="attention-panel" aria-labelledby="attention-title"><header className="section-head"><div><h2 id="attention-title">待处理 Skill</h2><p>按可行动原因分组，不按模糊的健康分数排序。</p></div><StatusPill status={work.items.length ? 'blocked' : 'empty'} /><span className="gate-count">{work.items.length} 项</span></header>{work.items.length ? <ul className="attention-list">{work.items.map(item => <li key={item.id}><button type="button" className="attention-item" onClick={() => openItem(item)}><span className="attention-reason"><StatusPill status={reasonFor(item)} /></span><span className="attention-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><span className="attention-context gate-mono">{item.id}</span><span className="attention-time gate-mono">{formatTime(data.generatedAt)}</span><span className="row-link">查看 →</span></button></li>)}</ul> : <div className="gate-empty"><div><h2>暂无待处理事项</h2><p>Host 当前没有待处理测评、过期快照或运行异常。</p></div></div>}<footer className="attention-foot"><span>点击任一行会带着对应对象和筛选进入下钻页。</span><button className="row-link" type="button" onClick={() => onNavigate('skills')}>查看所有 Skill →</button></footer></section></div>
    <section className="region-grid" aria-label="Dashboard 四个业务区域">
      <section className="region" aria-labelledby="skill-status-title"><header className="region-head"><div><h2 id="skill-status-title">Skill 状态</h2><p>{skills.items.length ? `${data.counts.activeSkills} 个活动 Skill · ${lastUpdated}` : '工作区还没有活动 Skill。'}</p></div><button type="button" className="row-link" onClick={() => onNavigate('skills')}>查看全部 →</button></header><div className="metric-strip"><Metric label="活动 Skill" value={data.counts.activeSkills} detail={skills.items.length ? skills.items[0].detail : '当前工作区'} /><Metric label="已发布" value={data.counts.publishedSkills} detail="不可变版本" /><Metric label="发布就绪" value={data.counts.publishReadySkills} detail="Host 发布门禁" /><Metric label="未测评" value={data.counts.unmeasuredSkills} detail="没有有效批次" /></div><div className="coverage-note"><h3>场景覆盖</h3><p>{data.coverage ? `${data.coverage.scenarioCount} 个场景引用 ${data.coverage.linkedSkillCount} / ${data.coverage.totalSkillCount} 个 Skill` : '场景覆盖等待同步。'}</p></div></section>
      <section className="region" aria-labelledby="quality-title"><header className="region-head"><div><h2 id="quality-title">测评质量</h2><p>每个 Skill 最新当前快照批次；质量达标不等于发布就绪。</p></div><button type="button" className="row-link" onClick={() => onNavigate('evaluations')}>进入测评中心 →</button></header>{quality.items.length ? <table className="quality-table"><thead><tr><th>Skill</th><th>准确率 / 门槛</th><th>主要问题</th><th>状态</th></tr></thead><tbody>{quality.items.slice(0, 5).map(item => <tr key={item.id}><td><button type="button" className="sm-link quality-skill" onClick={() => openItem(item)}><strong>{item.title}</strong><small>{item.id}</small></button></td><td className="quality-number" title={item.thresholds?.map(threshold => `${threshold.name}：准确率 ${Number((threshold.minimumAccuracy * 100).toFixed(1))}% · 最低标注 ${threshold.minimumLabels} 条`).join('；')}><div>{item.detail}</div><small>有效标注 {item.labeled ?? '—'} / {item.minimumLabels ?? '未配置'}</small>{(item.thresholds?.length ?? 0) > 1 ? <small> · {item.thresholds!.length} 个活动场景最高门槛</small> : null}</td><td>{item.majorIssue || '等待 Host 质量结论'}</td><td><StatusPill status={item.status || 'unknown'} /></td></tr>)}</tbody></table> : <div className="empty-region"><div><h3>尚无当前快照测评批次</h3><p>完成真实 Harness 测评后显示结果。过期批次可从待处理项查看；未生产对齐的真实结果不会被隐藏。</p><Button onClick={() => onNavigate('evaluations')}>创建测评</Button></div></div>}</section>
      <section className="region" aria-labelledby="production-title"><header className="region-head"><div><h2 id="production-title">生产表现</h2><p>最近 24 小时 · 只采用真实生产 Trace。</p></div><StatusPill status={production.items.length ? 'ready' : 'empty'} /></header>{production.items.length ? <><div className="metric-strip"><Metric label="调用量" value={data.productionMetrics?.count ?? data.counts.traces24h} detail="近 24 小时已关联生产 Trace" /><Metric label="成功率" value={data.productionMetrics?.successRate == null ? '—' : `${Math.round(data.productionMetrics.successRate * 100)}%`} detail="仅完整且状态已知调用" /><Metric label="P95" value={data.productionMetrics?.p95Ms == null ? '—' : `${data.productionMetrics.p95Ms} ms`} detail="排除残缺链路" /><Metric label="未知状态" value={data.productionMetrics?.unknownCount ?? '—'} detail="不计为成功" /></div><ul className="release-list">{production.items.map(item => <li key={item.id}><button type="button" className="release-item" onClick={openProduction}><StatusPill status="production" /><span className="release-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><span className="release-time">查看 →</span></button></li>)}</ul></> : <div className="empty-region"><div><StatusPill status="empty" /><h3>尚不能显示调用量、成功率或 P95</h3><p>工作台不会生成模拟趋势或把空数据解释为零错误。接入 LangChain OTLP / HTTP 契约后，可按真实日聚合下钻。</p><Button onClick={openProduction}>查看生产 Trace 说明</Button></div></div>}</section>
      <section className="region" aria-labelledby="release-title"><header className="region-head"><div><h2 id="release-title">发布变更</h2><p>最近 30 天真实发布与回滚事件。</p></div><button type="button" className="row-link" onClick={() => releaseChanges?.[0] ? openRelease(releaseChanges[0]) : onNavigate('skills')}>查看发布 →</button></header>{releases.error ? <InlineError message={releases.error} onRetry={releases.reload} /> : releases.loading && !releaseChanges ? <div className="empty-region" role="status">正在读取发布与回滚事件…</div> : releaseChanges === undefined ? <InlineError message="宿主尚未返回发布事件记录，请更新插件后重试；不能据此判断没有发布。" onRetry={releases.reload} /> : releaseChanges.length ? <ul className="release-list">{releaseChanges.slice(0, 5).map(release => <li key={release.eventId}><button type="button" className="release-item" onClick={() => openRelease(release)}><StatusPill status={release.action === 'rollback' ? 'rolled-back' : release.exceptionReason ? 'exception-release' : 'published'} /><span className="release-copy"><strong>{release.title} · {release.version}</strong><small>{release.action === 'rollback' ? '已回滚生效指针；草稿未改变' : release.exceptionReason ? `例外原因：${release.exceptionReason}` : '不可变版本已写入运行 SQLite'} · {notificationLabel[release.notificationStatus]} · 运行端加载未知</small></span><span className="release-time">{formatTime(release.createdAt)}</span></button></li>)}</ul> : <div className="empty-region"><div><h3>最近 30 天暂无发布变更</h3><p>已成功读取发布与回滚事件；当前时间范围内没有记录。</p></div></div>}<footer className="region-foot">管理端发布、回滚或通知成功不等于运行端已经加载。</footer></section>
    </section>
    {!data.counts.activeSkills && !query.loading ? <div className="dashboard-empty"><div><StatusPill status="empty" /><h2>先建立第一个 Skill</h2><p>从空白草稿、XMind 或原生 Skill 包开始。创建后 Dashboard 只显示 Host 的真实聚合，不生成示例指标。</p><Button variant="primary" onClick={createSkill} disabled={!api || create.busy}>创建 Skill 草稿</Button></div></div> : null}
  </div>
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail: string }): React.ReactElement { return <div className="metric"><small>{label}</small><strong>{value}</strong><span>{detail}</span></div> }

function SkillsPage({ api, refresh, initialSkillId, initialReleaseId, initialTab, onChanged, onNavigate, onNotice, onDirtyChange }: { api: RemoteApi; refresh: number; initialSkillId?: string; initialReleaseId?: string; initialTab?: 'versions'; onChanged: () => void; onNavigate: (route: NavId, target?: WorkbenchFocus) => void; onNotice: (message: string) => void; onDirtyChange: (dirty: boolean) => void }): React.ReactElement {
  const [selectedId, setSelectedId] = useState(initialSkillId || '')
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [leavePending, setLeavePending] = useState(false)
  useEffect(() => { setSelectedId(initialSkillId || '') }, [initialSkillId])
  const archiveInput = useRef<HTMLInputElement>(null)
  const xmindInput = useRef<HTMLInputElement>(null)
  const list = useRemoteQuery<{ skills: SkillDraft[] }>(api, 'skillList', [{ includeArchived: showArchived }], { skills: [] })
  const get = useRemoteQuery<{ skill?: SkillDraft }>(api, 'skillGet', [selectedId], {}, Boolean(selectedId))
  useEffect(() => { if (refresh > 0) list.reload() }, [refresh])
  const changed = () => { get.reload(); list.reload(); onChanged() }
  const create = useMutation(api, 'skillCreate', changed)
  const importer = useMutation(api, 'skillImport', changed)
  const copy = useMutation(api, 'skillCopy', changed)
  const setDraftDirty = useCallback((value: boolean) => { setDirty(value); onDirtyChange(value) }, [onDirtyChange])
  const visible = list.data.skills.filter(skill => !search.trim() || `${skill.title} ${skill.skillId}`.toLowerCase().includes(search.trim().toLowerCase()))
  const createBlank = async () => { try { const result = await create.run({ title: '未命名 Skill' }); setSelectedId(result.skill.skillId); onNotice('已创建工作草稿，请填写名称与规则') } catch (error) { onNotice(safeError(error)) } }
  const importFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('导入文件不能超过 8 MB')
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      const result = await importer.run({ input: btoa(binary), title: file.name.replace(/\.[^.]+$/, '') })
      setSelectedId(result.skill.skillId); onNotice(`已导入 ${file.name}`)
    } catch (error) { onNotice(safeError(error)) } finally { event.target.value = '' }
  }
  const copySkill = async () => { try { const result = await copy.run({ skillId: selectedId }); setSelectedId(result.skill.skillId); onNotice('已复制为新草稿') } catch (error) { onNotice(safeError(error)) } }
  const archiveSkill = async () => {
    if (!window.confirm('归档后从活动列表隐藏，保留历史版本与 Trace。归档此 Skill？')) return
    try { await callRemote(api, 'skillArchive', [randomOperation('archive'), selectedId]); setSelectedId(''); changed(); onNotice('Skill 已归档') } catch (error) { onNotice(safeError(error)) }
  }
  const deleteSkill = async () => {
    if (!window.confirm('永久删除此 Skill？仅允许删除没有引用和历史版本的草稿，删除不可恢复。')) return
    try { await callRemote(api, 'skillDelete', [randomOperation('delete'), selectedId]); setSelectedId(''); changed(); onNotice('Skill 已删除') } catch (error) { onNotice(safeError(error)) }
  }
  const backToList = () => { if (dirty) setLeavePending(true); else setSelectedId('') }
  const current = get.data.skill?.skillId === selectedId ? get.data.skill : undefined
  return <div className="sm-page">
    <header className="gate-page-head"><div className="gate-title-group"><div className="gate-title-line">{selectedId ? <button type="button" className="sm-link" onClick={backToList}>← Skill 列表</button> : null}<h1>{current?.title || 'Skill 管理'}</h1>{current ? <StatusPill status={current.status} /> : null}</div><div className="gate-title-meta">{current ? <><span className="gate-mono">{current.skillId}</span><span>规则权威：{current.authority}</span></> : <span>原生 Skill 包、来源知识、固定测评与版本发布</span>}</div></div><div className="gate-page-actions"><Button onClick={() => xmindInput.current?.click()} disabled={dirty || importer.busy || !api}>导入 XMind</Button><Button onClick={() => archiveInput.current?.click()} disabled={dirty || importer.busy || !api}>导入 Skill 包</Button><input ref={xmindInput} className="sm-upload-input" tabIndex={-1} type="file" aria-label="导入 XMind 文件" accept=".xmind" onChange={event => void importFile(event)} /><input ref={archiveInput} className="sm-upload-input" tabIndex={-1} type="file" aria-label="导入 Skill ZIP" accept=".zip,.skill" onChange={event => void importFile(event)} /><Button variant="primary" onClick={createBlank} disabled={dirty || create.busy || !api}>新建 Skill</Button></div></header>
    {leavePending ? <div className="gate-notice warning"><div><strong>这些更改还没有保存。</strong><p>放弃后恢复到最近保存的工作草稿。</p></div><Button onClick={() => setLeavePending(false)}>继续编辑</Button><Button variant="danger" onClick={() => { setLeavePending(false); setDraftDirty(false); setSelectedId('') }}>放弃未保存更改</Button></div> : null}
    {!selectedId ? <section className="gate-create"><div className="sm-card-heading"><div><h2>工作区 Skill</h2><p>{visible.length} 个对象</p></div><Button onClick={list.reload}>刷新</Button></div><div className="sm-list-tools"><input aria-label="搜索 Skill" placeholder="搜索名称或 Skill ID" value={search} onChange={e => setSearch(e.target.value)} /><label className="sm-check-label"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />显示归档</label></div>{list.error ? <InlineError message={list.error} onRetry={list.reload} /> : null}{visible.length ? <div className="sm-master-list">{visible.map(skill => <button type="button" className="sm-master-row" key={skill.skillId} onClick={() => setSelectedId(skill.skillId)}><span className="sm-avatar">✦</span><span><strong>{skill.title}</strong><small>{skill.skillId} · v{skill.draftVersion} · {formatTime(skill.updatedAt)}</small></span><StatusPill status={skill.status} /></button>)}</div> : <EmptyState title={list.loading ? '正在读取 Skill' : search ? '没有匹配的 Skill' : '还没有 Skill'} description="从空白、XMind 或原生 Skill 包建立第一份工作草稿。" action={<Button onClick={createBlank} disabled={!api || create.busy}>新建草稿</Button>} />}</section> : get.error ? <InlineError message={get.error} onRetry={get.reload} /> : current ? <SkillEditor key={current.skillId} initialReleaseId={current.skillId === initialSkillId ? initialReleaseId : undefined} initialTab={current.skillId === initialSkillId ? initialTab : undefined} api={api} skill={current} onChanged={changed} onNotice={onNotice} onNavigate={onNavigate} onDirtyChange={setDraftDirty} onCopy={copySkill} onArchive={archiveSkill} onDelete={deleteSkill} copyBusy={copy.busy} /> : <EmptyState title="正在读取工作草稿" description="正在同步文件、内容哈希与来源引用。" />}
  </div>
}

export function EvaluationsPage({ api, refresh, initialSkillId, initialEvaluationId, initialCaseId, onChanged, onNavigate, onNotice, onDirtyChange }: { api: RemoteApi; refresh: number; initialSkillId?: string; initialEvaluationId?: string; initialCaseId?: string; onChanged: () => void; onNavigate: (route: NavId, target?: WorkbenchFocus) => void; onNotice: (message: string) => void; onDirtyChange?: (dirty: boolean) => void }): React.ReactElement {
  const [filterSkillId, setFilterSkillId] = useState(initialSkillId || '')
  const list = useRemoteQuery<{ evaluations: EvaluationBatch[] }>(api, 'evaluationList', [{ skillId: filterSkillId || undefined }], { evaluations: [] })
  useEffect(() => { if (refresh > 0) list.reload() }, [refresh])
  const skills = useRemoteQuery<{ skills: SkillDraft[] }>(api, 'skillList', [{ includeArchived: false }], { skills: [] })
  const scenarios = useRemoteQuery<{ scenarios: Scenario[] }>(api, 'scenarioList', [{ includeArchived: false }], { scenarios: [] })
  const [selectedId, setSelectedId] = useState(initialEvaluationId || '')
  const filteredBatches = list.data.evaluations.filter(item => !filterSkillId || item.skillId === filterSkillId)
  const selected = selectedId || filteredBatches[0]?.evaluationId || ''
  const [selectedSkillId, setSelectedSkillId] = useState(initialSkillId || '')
  const [selectedScenarioId, setSelectedScenarioId] = useState('')
  const [caseInput, setCaseInput] = useState('{"sample":"manual"}')
  const [caseExpected, setCaseExpected] = useState('{"verdict":"pass"}')
  const [focusedCaseId, setFocusedCaseId] = useState(initialCaseId || '')
  const [suggestions, setSuggestions] = useState<AnyRecord[]>([])
  const [showBatches, setShowBatches] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [activeView, setActiveView] = useState<'overview' | 'annotation' | 'suggestions'>('annotation')
  const [actionError, setActionError] = useState('')
  const [annotationDirty, setAnnotationDirty] = useState(false)
  const [annotationRevision, setAnnotationRevision] = useState(0)
  const [pendingChange, setPendingChange] = useState<(() => void)>()
  const [lastOutcome, setLastOutcome] = useState<{ evaluation: EvaluationBatch; job?: AnyRecord }>()
  useEffect(() => { setFilterSkillId(initialSkillId || ''); if (initialSkillId) setSelectedSkillId(initialSkillId); setSelectedId(initialEvaluationId || ''); setFocusedCaseId(initialCaseId || '') }, [initialSkillId, initialEvaluationId, initialCaseId])
  const dirtyChanged = useCallback((dirty: boolean) => { setAnnotationDirty(dirty); onDirtyChange?.(dirty) }, [onDirtyChange])
  useEffect(() => () => { onDirtyChange?.(false) }, [onDirtyChange])
  useEffect(() => { if (!selectedSkillId && skills.data.skills[0]) setSelectedSkillId(skills.data.skills[0].skillId) }, [skills.data.skills, selectedSkillId])
  const availableScenarios = useMemo(() => scenarios.data.scenarios.filter(item => !selectedSkillId || item.skillIds.includes(selectedSkillId)), [scenarios.data.scenarios, selectedSkillId])
  useEffect(() => { if (selectedScenarioId && !availableScenarios.some(item => item.scenarioId === selectedScenarioId)) setSelectedScenarioId('') }, [availableScenarios, selectedScenarioId])
  const detail = useRemoteQuery<{ evaluation?: EvaluationBatch; job?: AnyRecord; progress?: AnyRecord }>(api, 'evaluationStatus', [selected], { evaluation: undefined }, Boolean(selected))
  const create = useMutation(api, 'evaluationCreate', () => { list.reload(); onChanged() })
  const run = useMutation(api, 'evaluationRun', () => { detail.reload(); list.reload(); onChanged() })
  const cancel = useMutation(api, 'evaluationCancel', () => { detail.reload(); list.reload(); onChanged() })
  const rerun = useMutation(api, 'evaluationRerunFailed', () => { detail.reload(); list.reload(); onChanged() })
  const annotate = useMutation(api, 'evaluationAnnotate', () => { detail.reload(); list.reload(); onChanged() })
  const optimize = useMutation(api, 'evaluationOptimize')
  const applySuggestion = useMutation(api, 'evaluationApplySuggestion', () => { detail.reload(); onChanged() })
  // Query hooks retain the previous value while loading a new key. Never
  // display or mutate that previous batch under the newly selected batch id.
  const fetched = detail.data.evaluation?.evaluationId === selected ? detail.data : undefined
  const acknowledged = lastOutcome?.evaluation.evaluationId === selected ? lastOutcome : undefined
  const currentOutcome = acknowledged && (!fetched?.evaluation || acknowledged.evaluation.updatedAt >= fetched.evaluation.updatedAt) ? acknowledged : fetched
  const batch = currentOutcome?.evaluation
  const job = currentOutcome?.job || (fetched?.job?.jobId === batch?.jobId ? fetched?.job : undefined)
  const currentCase = batch?.cases.find(item => item.caseId === focusedCaseId)
    || batch?.cases.find(item => item.grade === undefined && item.actual !== undefined && !item.systemError)
    || batch?.cases[0]
  useEffect(() => { if (currentCase && !focusedCaseId) setFocusedCaseId(currentCase.caseId) }, [currentCase?.caseId, focusedCaseId])
  useEffect(() => { document.getElementById('case-title')?.focus({ preventScroll: true }) }, [currentCase?.caseId])
  useEffect(() => {
    if (!batch || batch.status !== 'running') return
    const timer = window.setInterval(() => detail.reload(), 1000)
    return () => window.clearInterval(timer)
  }, [batch?.evaluationId, batch?.status])
  const reportError = (reason: unknown) => { const message = safeError(reason); setActionError(message); onNotice(message) }
  const acceptOutcome = (result: AnyRecord) => { if (result?.evaluation) setLastOutcome({ evaluation: result.evaluation, job: result.job }) }
  const requestSwitch = (action: () => void) => {
    if (annotate.busy || create.busy || optimize.busy || applySuggestion.busy || run.busy || rerun.busy) { onNotice('正在提交当前操作，请等待完成后再切换。'); return }
    if (annotationDirty) { setPendingChange(() => action); return }
    action()
  }
  const changeSkillFilter = (skillId: string) => requestSwitch(() => { setFilterSkillId(skillId); setSelectedId(''); setFocusedCaseId(''); setSuggestions([]); if (skillId) setSelectedSkillId(skillId) })
  const createBatch = async () => {
    setActionError('')
    const skillId = selectedSkillId || skills.data.skills[0]?.skillId
    if (!skillId) { onNavigate('skills'); onNotice('请先创建一份 Skill'); return }
    const request: AnyRecord = { skillId }
    if (selectedScenarioId) request.scenarioId = selectedScenarioId
    else {
      try { request.cases = [{ caseId: `case-${Date.now()}`, input: JSON.parse(caseInput), expected: JSON.parse(caseExpected) }] } catch { reportError(new Error('输入和期望必须是合法 JSON')); return }
    }
    try {
      const result = await create.run(request)
      if (!result?.evaluation?.evaluationId) throw new Error('Host 未返回新批次，未切换当前工作面。')
      acceptOutcome(result); setSelectedId(result.evaluation.evaluationId); setFilterSkillId(skillId); setFocusedCaseId(''); setSuggestions([]); setShowCreate(false); setActiveView('annotation'); dirtyChanged(false)
      onNotice(selectedScenarioId ? '已按场景样例创建固定测评批次' : '已创建固定测评批次；运行时将调用 Harness 模型通道')
    } catch (reason) { reportError(reason) }
  }
  const runBatch = async () => { if (!batch) return; setActionError(''); try { const result = await run.run({ evaluationId: batch.evaluationId }); acceptOutcome(result); onNotice(result.alreadyRunning ? '该批次已在后台运行' : '测评已进入后台任务队列') } catch (reason) { reportError(reason) } }
  const cancelBatch = async () => { if (!batch) return; setActionError(''); try { const result = await cancel.run({ evaluationId: batch.evaluationId }); acceptOutcome(result); onNotice(result.status === 'cancel-requested' ? '已请求取消；当前用例完成后停止分配' : '测评已停止，已完成结果会保留') } catch (reason) { reportError(reason) } }
  const rerunFailedCases = async () => { if (!batch) return; setActionError(''); try { const result = await rerun.run({ evaluationId: batch.evaluationId }); acceptOutcome(result); onNotice(result.status === 'empty' ? '没有可重跑的失败用例' : result.alreadyRunning ? '该批次已在后台运行' : '失败用例已重新排队') } catch (reason) { reportError(reason) } }
  const annotateCase = async (testCase: EvaluationCase, grade: string, issueLocation?: string, correction?: string, goNext = true) => {
    if (!batch || !grade) return false
    setActionError('')
    try {
      const result = await annotate.run({ evaluationId: batch.evaluationId, caseId: testCase.caseId, grade, issueLocation, correction })
      if (!result?.evaluation) throw new Error('Host 未确认保存，已保留当前标注。')
      acceptOutcome(result); dirtyChanged(false)
      const next = result.evaluation.cases?.find((item: EvaluationCase) => item.grade === undefined && item.actual !== undefined && !item.systemError && item.caseId !== testCase.caseId)
      if (goNext && next) setFocusedCaseId(next.caseId)
      onNotice(goNext && next ? '人工标注已保存，已定位下一条待标注用例' : '人工标注已保存')
      return true
    } catch (reason) { reportError(reason); return false }
  }
  const generateSuggestions = async () => { if (!batch) return; setActionError(''); try { const result = await optimize.run(batch.evaluationId, { direct: true }); setSuggestions(result.suggestions || []); setActiveView('suggestions'); onNotice(result.suggestions?.length ? `生成 ${result.suggestions.length} 条优化建议` : '当前没有可生成的优化建议') } catch (reason) { reportError(reason) } }
  const applyOneSuggestion = async (suggestion: AnyRecord) => { if (!batch) return; setActionError(''); try { await applySuggestion.run({ evaluationId: batch.evaluationId, suggestion }); setSuggestions(current => current.filter(item => item.suggestionId !== suggestion.suggestionId)); onNotice('优化建议已应用，旧测评已过期') } catch (reason) { reportError(reason) } }
  const chooseBatch = (id: string) => requestSwitch(() => { setSelectedId(id); setFocusedCaseId(''); setSuggestions([]); setShowBatches(false); setActionError('') })
  const executionBusy = Boolean(batch?.status === 'running' || ['queued', 'running', 'cancel-requested'].includes(job?.status))
  const failedCount = batch?.cases.filter(item => item.systemError || (item.actual === undefined && item.grade === 'unknown')).length || 0
  const finishedCount = batch?.cases.filter(item => item.actual !== undefined || item.systemError).length || 0
  const mutationBusy = run.busy || cancel.busy || rerun.busy || create.busy || annotate.busy || applySuggestion.busy
  const openTrace = (traceId?: string) => requestSwitch(() => onNavigate('traces', { skillId: batch?.skillId, evaluationId: batch?.evaluationId, caseId: currentCase?.caseId, traceId }))
  const batchStatus = batch?.status || 'pending'
  const batchNotice = batch?.status === 'stale'
    ? '该批次基于旧版 Skill 或解析规则，仍可补完历史标注，但不能支撑当前草稿发布。'
    : batch?.productionAligned === true
      ? '模型运行、人工标注和 Trace 都从 Host 返回；保存标注只写入人工事实。'
      : '该批次尚未证明与生产模型配置一致；完成标注后仍不能直接满足发布门禁。'
  return <div className="sm-page evaluation-page">
    <PageIntro eyebrow="EVALUATION" title={batch ? `批次 ${batch.evaluationId}` : '测评中心'} description="固定 Skill 快照、模型执行证据与人工标注。" actions={<><Button onClick={() => { list.reload(); detail.reload() }}>刷新批次</Button>{batch ? <Button onClick={() => setShowBatches(value => !value)}>{showBatches ? '收起批次' : '切换批次'}</Button> : null}<Button variant="primary" onClick={() => requestSwitch(() => setShowCreate(value => !value))} disabled={create.busy || !api}>{showCreate ? '收起创建' : '+ 创建测评'}</Button></>} />
    <section className="gate-batch-picker-panel" aria-label="测评筛选"><label>按 Skill 筛选 <select aria-label="按 Skill 筛选" value={filterSkillId} onChange={event => changeSkillFilter(event.target.value)}><option value="">全部 Skill</option>{skills.data.skills.map(skill => <option key={skill.skillId} value={skill.skillId}>{skill.title}</option>)}</select></label></section>
    {showBatches ? <section className="gate-batch-picker-panel" aria-label="测评批次选择">{filteredBatches.length ? filteredBatches.map(item => <button type="button" className={`batch-option ${item.evaluationId === selected ? 'is-selected' : ''}`} key={item.evaluationId} onClick={() => chooseBatch(item.evaluationId)}><span><strong>{item.evaluationId}</strong><small>{item.skillId} · {item.cases.length} 个用例</small></span><StatusPill status={item.status} /></button>) : <p>当前筛选下还没有固定测评批次。</p>}</section> : null}
    {showCreate || (!selected && !list.loading) ? <section className="gate-create evaluation-create"><div className="sm-card-heading"><div><h2>创建固定批次</h2><p>选择场景样例，或提供一条输入与期望 JSON；创建后快照不再随工作草稿改变。</p></div><StatusPill status={api ? 'ready' : 'blocked'} /></div><div className="sm-form-grid sm-eval-create-grid"><label>Skill<select value={selectedSkillId} onChange={event => setSelectedSkillId(event.target.value)}><option value="">选择 Skill</option>{skills.data.skills.map(skill => <option key={skill.skillId} value={skill.skillId}>{skill.title} · {skill.skillId}</option>)}</select></label><label>业务场景（可选）<select value={selectedScenarioId} onChange={event => setSelectedScenarioId(event.target.value)}><option value="">直接用例</option>{availableScenarios.map(scenario => <option key={scenario.scenarioId} value={scenario.scenarioId}>{scenario.name}</option>)}</select></label>{!selectedScenarioId ? <><label>输入 JSON<textarea value={caseInput} onChange={event => setCaseInput(event.target.value)} /></label><label>期望 JSON<textarea value={caseExpected} onChange={event => setCaseExpected(event.target.value)} /></label></> : <div className="sm-form-hint">将使用场景中全部样例和当前已确认解析规则生成业务记录；版式不唯一或零记录会阻止创建。</div>}</div><div className="sm-eval-create-action"><Button variant="primary" onClick={() => requestSwitch(() => void createBatch())} disabled={create.busy || !api}>{create.busy ? '创建中…' : '创建固定批次'}</Button></div></section> : null}
    {list.error ? <InlineError message={list.error} onRetry={list.reload} /> : null}
    {skills.error ? <InlineError message={skills.error} onRetry={skills.reload} /> : null}
    {scenarios.error ? <InlineError message={scenarios.error} onRetry={scenarios.reload} /> : null}
    {detail.error ? <InlineError message={detail.error} onRetry={detail.reload} /> : null}
    {actionError ? <div className="gate-notice error" role="alert"><strong>操作未完成。</strong> {actionError}</div> : null}
    {!batch ? <section className="gate-empty"><div><StatusPill status="empty" /><h2>没有选中的测评批次</h2><p>创建批次后，页面会显示固定快照、模型结果、Trace 摘要和逐条人工标注。</p><Button variant="primary" onClick={createBatch} disabled={!api}>创建第一批</Button></div></section> : <>
      <nav className="gate-tabs" aria-label="测评批次视图">{([['overview', '批次概览'], ['annotation', '用例标注'], ['suggestions', '优化建议']] as const).map(([id, label]) => <button key={id} className={`gate-tab ${activeView === id ? 'is-active' : ''}`} type="button" aria-current={activeView === id ? 'page' : undefined} onClick={() => requestSwitch(() => setActiveView(id))}>{label}</button>)}</nav>
      <section className="context-belt" aria-label="固定批次证据带"><article className="context-stage"><div className="context-kicker"><span>01 · 测试快照</span><StatusPill status="ready" /></div><h2>{batch.skillSnapshot?.title || batch.skillId}</h2><p className="gate-mono">sha256: {batch.snapshotHash.slice(0, 16)}… · {batch.cases.length} 个用例</p></article><article className="context-stage"><div className="context-kicker"><span>02 · 运行环境</span><StatusPill status={batch.productionAligned === true ? 'ready' : 'blocked'} /></div><h2>{String(batch.executionProfile?.model || 'Harness 模型')}</h2><p>{String(batch.executionProfile?.provider || 'Provider 未记录')} · {batch.productionAligned === true ? '生产对齐' : '尚未证明生产对齐'}</p></article><article className="context-stage"><div className="context-kicker"><span>03 · 标注进度</span><StatusPill status={batchStatus} /></div><h2>{progressLabel(batch)} 已处理</h2><p>{batch.accuracy && batch.accuracy.denominator > 0 ? `主准确率 ${Math.round(batch.accuracy.value * 100)}%` : '等待有效标注'} · {batch.status === 'stale' ? '旧快照' : '当前批次'}</p></article></section>
      <div className={`gate-notice ${batch.status === 'stale' ? 'warning' : batch.status === 'failed' ? 'error' : ''}`}><strong>{batch.status === 'failed' ? '模型运行失败。' : batch.status === 'stale' ? '批次已过期。' : '当前用例来自固定批次快照。'}</strong> {batchNotice}</div>
      <section className="gate-work-belt evaluation-run-toolbar" aria-label="测评运行操作"><div className="gate-belt-stage"><strong>{executionBusy ? '模型执行中' : batch.status === 'pending' ? '等待运行' : '模型执行进度'}</strong><span role="status">{finishedCount} / {batch.cases.length} 个用例已有执行结果{failedCount ? ` · ${failedCount} 个系统失败` : ''}</span><progress aria-label="测评执行进度" max={Math.max(1, batch.cases.length)} value={finishedCount} /><small>固定快照 {batch.snapshotHash.slice(0, 12)} · {String(batch.executionProfile?.provider || '使用 Harness 当前配置')} / {String(batch.executionProfile?.model || '运行时解析模型')}</small>{job ? <small>任务 {job.jobId} · {({ queued: '排队中', running: '运行中', 'cancel-requested': '等待取消', cancelled: '已取消', failed: '失败', completed: '已完成' } as AnyRecord)[job.status] || job.status}</small> : null}</div><div className="gate-page-actions"><Button variant="primary" onClick={() => requestSwitch(() => void runBatch())} disabled={!api || mutationBusy || executionBusy || batch.status === 'stale'}>{run.busy ? '提交中…' : batch.status === 'pending' ? '运行测评' : batch.status === 'cancelled' ? '继续运行' : '重新运行'}</Button><Button onClick={cancelBatch} disabled={!api || mutationBusy || !executionBusy || job?.status === 'cancel-requested'}>{cancel.busy || job?.status === 'cancel-requested' ? '正在取消…' : '取消运行'}</Button><Button onClick={() => requestSwitch(() => void rerunFailedCases())} disabled={!api || mutationBusy || executionBusy || batch.status === 'stale' || failedCount === 0}>{rerun.busy ? '重新排队中…' : '仅重跑失败用例'}</Button></div></section>
      {job?.error ? <div className="gate-notice error" role="alert"><strong>后台任务失败。</strong> {safeError(job.error)} {job.error.code ? <code>{job.error.code}</code> : null}</div> : null}
      {activeView === 'overview' ? <section className="gate-batch-picker-panel" aria-label="批次固定信息"><dl className="fact-list"><div><dt>Skill</dt><dd>{batch.skillSnapshot?.title || batch.skillId}</dd></div><div><dt>完整快照哈希</dt><dd className="gate-mono">{batch.snapshotHash}</dd></div><div><dt>解析规则</dt><dd>{batch.ruleSnapshot ? `${batch.ruleSnapshot.ruleId} · v${batch.ruleSnapshot.version}` : '直接固定用例，无解析规则'}</dd></div><div><dt>模型配置</dt><dd><pre>{prettyValue(batch.executionProfile)}</pre></dd></div><div><dt>创建时间</dt><dd>{batch.createdAt}</dd></div><div><dt>更新时间</dt><dd>{batch.updatedAt}</dd></div></dl></section> : null}
      {activeView === 'annotation' ? <div className="annotation-wrap"><section className="annotation-shell" aria-label="用例标注工作面">
        <aside className="case-rail" aria-label="批次用例"><header className="case-rail-head"><small>批次用例</small><h2>当前 {currentCase ? batch.cases.findIndex(item => item.caseId === currentCase.caseId) + 1 : 0} / {batch.cases.length}</h2><span className="gate-mono">{batch.evaluationId}</span></header>
          <ul className="case-list">{batch.cases.map((testCase, index) => <li key={testCase.caseId}><button type="button" className={`case-button ${testCase.caseId === currentCase?.caseId ? 'is-selected' : ''}`} aria-pressed={testCase.caseId === currentCase?.caseId} onClick={() => requestSwitch(() => { setFocusedCaseId(testCase.caseId); annotate.clear() })}><span className="case-index">{String(index + 1).padStart(2, '0')}</span><span className="case-copy"><strong>{testCase.source?.filename || testCase.caseId}</strong><small>{testCase.caseId} · {testCase.source?.region || '固定输入'}</small></span><StatusPill status={testCase.systemError ? 'blocked' : testCase.grade || (testCase.actual !== undefined ? 'candidate' : 'pending')} /></button></li>)}</ul>
        </aside>
        <div className="case-pane">{currentCase ? <>
          <header className="case-head"><div><small>用例 {currentCase.caseId} · Skill {batch.skillId}</small><h2 id="case-title" tabIndex={-1}>{currentCase.source?.filename ? `${currentCase.source.filename}${currentCase.source.row ? ` · 第 ${currentCase.source.row} 行` : ''}` : currentCase.caseId}</h2></div><div><StatusPill status={currentCase.systemError ? 'blocked' : currentCase.grade || (currentCase.actual !== undefined ? 'candidate' : 'pending')} /><StatusPill status={currentCase.traceId ? 'ready' : 'empty'} /></div></header>
          <EvaluationEvidence testCase={currentCase} onOpenTrace={() => currentCase.traceId ? openTrace(currentCase.traceId) : onNotice('当前用例还没有执行 Trace')} />
          <EvaluationWorkspace key={`${batch.evaluationId}:${currentCase.caseId}:${annotationRevision}`} testCase={currentCase} onAnnotate={(grade, issueLocation, correction, goNext) => annotateCase(currentCase, grade, issueLocation, correction, goNext)} onDirtyChange={dirtyChanged} busy={annotate.busy} disabled={executionBusy || !api || currentCase.actual === undefined || Boolean(currentCase.systemError)} error={annotate.error} />
        </> : <EmptyState title="没有可标注用例" description="尚未返回用例数据。" />}</div>
      </section></div> : null}
      <EvaluationAccuracy batch={batch} />
      {activeView === 'suggestions' ? <section className="sm-suggestions gate-suggestions"><header><div><h2>证据驱动优化建议</h2><p>依据已保存的错误标注与修正内容生成候选；应用后当前批次将过期。</p></div><Button variant="quiet" onClick={generateSuggestions} disabled={optimize.busy || executionBusy || !api || batch.status === 'stale'}>{optimize.busy ? '生成中…' : suggestions.length ? '重新生成' : '生成建议'}</Button></header>{suggestions.length ? suggestions.map(suggestion => <div className="sm-suggestion-row" key={suggestion.suggestionId}><div><strong>{suggestion.path}</strong><small>{String(suggestion.before)} → {String(suggestion.after)}</small></div><Button variant="quiet" onClick={() => requestSwitch(() => void applyOneSuggestion(suggestion))} disabled={applySuggestion.busy || executionBusy || batch.status === 'stale'}>应用并使批次过期</Button></div>) : <p>暂无优化建议。先完成错误用例的人工标注，再生成可审阅的文件修改。</p>}</section> : null}
      <footer className="sm-eval-footer gate-eval-footer"><Button variant="quiet" onClick={() => requestSwitch(() => void generateSuggestions())} disabled={optimize.busy || executionBusy || !api || batch.status === 'stale'}>{optimize.busy ? '生成中…' : '生成优化建议'}</Button><button type="button" className="sm-link" onClick={() => requestSwitch(() => onNavigate('skills', { skillId: batch.skillId }))}>回到 Skill 编辑 →</button><button type="button" className="sm-link" onClick={() => openTrace()}>查看测评 Trace →</button></footer>
    </>}
    {pendingChange ? <div className="sm-modal-backdrop"><section className="sm-modal" role="dialog" aria-modal="true" aria-labelledby="annotation-discard-title"><h2 id="annotation-discard-title">标注还未保存</h2><p>继续切换会丢弃当前用例的临时标注，已保存结果不会改变。</p><div><Button onClick={() => setPendingChange(undefined)}>继续标注</Button><Button variant="danger" onClick={() => { const action = pendingChange; setPendingChange(undefined); dirtyChanged(false); setAnnotationRevision(value => value + 1); action() }}>放弃修改并切换</Button></div></section></div> : null}
  </div>
}

function EvaluationEvidence({ testCase, onOpenTrace }: { testCase: EvaluationCase; onOpenTrace: () => void }): React.ReactElement {
  const input = prettyValue(testCase.input)
  const expected = testCase.expected === undefined ? '未提供期望值' : prettyValue(testCase.expected)
  const actual = testCase.systemError ? `系统失败：${testCase.systemError.message}` : testCase.actual === undefined ? '等待 Harness 模型运行' : prettyValue(testCase.actual)
  const actualTone = testCase.systemError ? 'error' : testCase.actual === undefined ? 'warning' : 'success'
  return <section className="evidence-ledger" aria-label="用例证据"><article className="evidence-column"><header><span className="evidence-index">01</span><div><small>固定输入</small><h2>原始业务记录</h2></div><span className="gate-status status info">Host</span></header><div className="result-body"><small>输入</small><pre className="code-evidence">{input}</pre></div><dl className="fact-list">{testCase.source ? <><div><dt>来源文件</dt><dd>{testCase.source.filename || '—'}</dd></div><div><dt>区域</dt><dd>{testCase.source.region || '—'}</dd></div><div><dt>行号</dt><dd>{testCase.source.row ?? '—'}</dd></div></> : <div><dt>来源</dt><dd>手工固定用例</dd></div>}</dl></article><article className="evidence-column model-result"><header><span className="evidence-index">02</span><div><small>模型结果</small><h2>{testCase.actualOrigin === 'harness' ? 'Harness 返回' : '尚未运行'}</h2></div><StatusPill status={actualTone === 'error' ? 'blocked' : actualTone === 'warning' ? 'pending' : 'completed'} /></header><div className="result-body"><small>实际值</small><pre className="code-evidence">{actual}</pre><small>期望值</small><pre className="code-evidence">{expected}</pre></div>{testCase.systemError ? <div className="result-rationale error"><small>{testCase.systemError.code}</small><p>{testCase.systemError.message}</p></div> : null}</article><article className="evidence-column trace-summary"><header><span className="evidence-index">03</span><div><small>Trace 摘要</small><h2>{testCase.traceId ? '已关联执行证据' : '尚无关联 Trace'}</h2></div><Button variant="quiet" onClick={onOpenTrace} disabled={!testCase.traceId}>打开顺序摘要</Button></header>{testCase.traceId ? <><dl className="fact-list"><div><dt>Trace ID</dt><dd className="gate-mono">{testCase.traceId}</dd></div><div><dt>来源</dt><dd>Host evaluation worker</dd></div><div><dt>正文</dt><dd>按采集策略展示</dd></div></dl><p className="evidence-foot">Trace 由 Host 在模型用例完成后写入运行 SQLite。</p></> : <div className="empty-region"><div><h3>运行后自动关联</h3><p>完成一次真实 Harness 模型调用后，Host 会把 traceId 写回当前用例。</p></div></div>}</article></section>
}

function EvaluationWorkspace({ testCase, onAnnotate, onDirtyChange, busy, disabled, error }: { testCase: EvaluationCase; onAnnotate: (grade: string, issueLocation?: string, correction?: string, goNext?: boolean) => Promise<boolean>; onDirtyChange: (dirty: boolean) => void; busy: boolean; disabled?: boolean; error?: string }): React.ReactElement {
  const [grade, setGrade] = useState(testCase.grade || '')
  const [issueLocation, setIssueLocation] = useState(testCase.issueLocation || '')
  const [correction, setCorrection] = useState(testCase.correction || '')
  const [formError, setFormError] = useState('')
  const serverValues = JSON.stringify([testCase.grade || '', testCase.issueLocation || '', testCase.correction || ''])
  const formValues = JSON.stringify([grade, issueLocation, correction])
  const baseline = useRef(serverValues)
  useEffect(() => {
    // Polling must not overwrite unsaved human facts. If the form was clean,
    // adopt newly returned server values; otherwise keep the user's input.
    if (baseline.current === formValues && baseline.current !== serverValues) {
      setGrade(testCase.grade || ''); setIssueLocation(testCase.issueLocation || ''); setCorrection(testCase.correction || '')
    }
    baseline.current = serverValues
  }, [serverValues])
  useEffect(() => { onDirtyChange(formValues !== baseline.current) }, [formValues, serverValues, onDirtyChange])
  const save = async (goNext: boolean) => {
    if (!grade) { setFormError('请选择正确、错误或无法判断。'); return }
    if (disabled || busy) return
    setFormError('')
    const saved = await onAnnotate(grade, issueLocation.trim() || undefined, correction.trim() || undefined, goNext)
    if (saved) {
      baseline.current = JSON.stringify([grade, issueLocation.trim(), correction.trim()])
      setIssueLocation(issueLocation.trim()); setCorrection(correction.trim()); onDirtyChange(false)
    }
  }
  return <section className="annotation-panel" aria-labelledby="annotation-title">
    <header className="annotation-head"><div><small>人工事实 · {testCase.caseId}</small><h2 id="annotation-title">整体标注</h2></div><p>正确数 /（正确数 + 错误数）为主准确率；无法判断单列。</p></header>
    <div className="annotation-form">
      {disabled ? <p className="gate-notice">{busy ? '正在保存。' : testCase.systemError ? '该用例为系统失败，重跑成功后再标注模型结果。' : testCase.actual === undefined ? '尚无模型结果，请先运行测评。' : '运行期间暂不能修改人工标注。'}</p> : null}
      <fieldset className="grade-fieldset" disabled={busy || disabled}><legend>选择模型结果的整体判断</legend><div className="grade-options">{[['correct', '正确', '计入准确率分子'], ['incorrect', '错误', '计入分母并补充证据'], ['unknown', '无法判断', '不进入准确率分母']].map(([value, label, helper]) => <label className="grade-option" key={value}><span className="radio-control"><input type="radio" name={`grade-${testCase.caseId}`} value={value} checked={grade === value} onChange={() => { setGrade(value); setFormError('') }} /><i aria-hidden="true" /></span><span><strong>{label}</strong><small>{helper}</small></span></label>)}</div></fieldset>
      {grade === 'incorrect' ? <section className="incorrect-details"><header><div><small>错误标注的后续优化依据</small><h3>问题位置与正确内容</h3></div><StatusPill status="blocked" /></header><label className="correction-field">问题位置<input value={issueLocation} disabled={busy || disabled} placeholder="例如 SKILL.md#规则分支；可填写多个位置" onChange={event => setIssueLocation(event.target.value)} /></label><label className="correction-field">正确内容<textarea value={correction} disabled={busy || disabled} rows={4} placeholder="填写可供后续优化核对的正确结论、规则或依据" onChange={event => setCorrection(event.target.value)} /></label><p>输入解析问题应转到业务场景的 Excel 解析规则修复。</p></section> : null}
      {formError || error ? <div className="form-error" role="alert"><strong>{formError ? '标注未保存。' : '写入失败。'}</strong><span>{formError || error}</span></div> : null}
      <div className="annotation-actions"><Button variant="quiet" onClick={() => void save(false)} disabled={busy || disabled || !grade}>{busy ? '保存中…' : '仅保存标注'}</Button><Button variant="primary" onClick={() => void save(true)} disabled={busy || disabled || !grade}>{busy ? '保存中…' : '保存并下一条'}</Button></div>
    </div>
  </section>
}

function EvaluationAccuracy({ batch }: { batch: EvaluationBatch }): React.ReactElement {
  const cases = batch.cases
  const correct = cases.filter(item => item.grade === 'correct').length
  const incorrect = cases.filter(item => item.grade === 'incorrect').length
  const unknown = cases.filter(item => item.grade === 'unknown').length
  const systemFailed = cases.filter(item => Boolean(item.systemError)).length
  const pending = cases.filter(item => item.grade === undefined && item.actual === undefined && !item.systemError).length
  const parsedPending = cases.filter(item => item.grade === undefined && item.actual !== undefined && !item.systemError).length
  const accuracy = batch.accuracy && batch.accuracy.denominator > 0 ? batch.accuracy.value : undefined
  const rows: Array<[string, number, string]> = [['正确', correct, '进入分子'], ['错误', incorrect, '进入分母'], ['无法判断', unknown, '不进分母'], ['系统失败', systemFailed, '单列'], ['待标注', parsedPending + pending, '继续处理']]
  return <section className="accuracy" aria-label="准确率口径"><header className="accuracy-head"><div><h2>批次标注口径</h2><StatusPill status={batch.status === 'completed' ? 'ready' : 'pending'} /></div><p><strong>{accuracy === undefined ? '—' : `${Math.round(accuracy * 100)}%`}</strong>{accuracy === undefined ? ' · 等待有效标注' : ` = ${batch.accuracy!.numerator} / ${batch.accuracy!.denominator}`}</p></header><div className="accuracy-grid">{rows.map(([label, value, helper]) => <div key={label}><small>{label}</small><strong>{value}</strong><p>{helper}</p></div>)}</div></section>
}

export function TracesPage({ api, refresh, initialSkillId, initialTraceId, initialEvaluationId, initialCaseId, initialSource, initialFrom, initialUntil, onChanged, onNotice, onNavigate }: { api: RemoteApi; refresh: number; initialSkillId?: string; initialTraceId?: string; initialEvaluationId?: string; initialCaseId?: string; initialSource?: string; initialFrom?: string; initialUntil?: string; onChanged: () => void; onNotice: (message: string) => void; onNavigate: (route: NavId, target?: WorkbenchFocus) => void }): React.ReactElement {
  const [source, setSource] = useState(initialSource || '')
  const [from, setFrom] = useState(initialFrom || '')
  const [until, setUntil] = useState(initialUntil || '')
  const [status, setStatus] = useState('')
  const [unlinked, setUnlinked] = useState(false)
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState('')
  const [view, setView] = useState<'overview' | 'full' | 'sequence'>('overview')
  const [nodeSearch, setNodeSearch] = useState('')
  const [nodeType, setNodeType] = useState('all')
  const [selectedId, setSelectedId] = useState(initialTraceId || '')
  const [selectedSpanId, setSelectedSpanId] = useState('')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const request = useMemo(() => ({ limit: 50, ...(initialSkillId ? { skillId: initialSkillId } : {}), ...(source ? { source } : {}), ...(from ? { from } : {}), ...(until ? { until } : {}), ...(status ? { status } : {}), ...(search.trim() ? { search: search.trim() } : {}), ...(unlinked ? { unlinked: true } : {}), ...(cursor ? { cursor } : {}) }), [source, from, until, status, unlinked, search, cursor, initialSkillId])
  const list = useRemoteQuery<{ traces: AnyRecord[]; nextCursor?: string; total?: number }>(api, 'traceList', [request], { traces: [] })
  const detail = useRemoteQuery<AnyRecord>(api, 'traceGet', [selectedId], {}, Boolean(selectedId))
  useEffect(() => { if (refresh > 0) list.reload() }, [refresh])
  useEffect(() => { setCursor('') }, [source, from, until, status, unlinked, search])
  useEffect(() => { setSource(initialSource || ''); setFrom(initialFrom || ''); setUntil(initialUntil || '') }, [initialSource, initialFrom, initialUntil])
  useEffect(() => { setSelectedId(initialTraceId || ''); setSelectedSpanId(''); setInspectorOpen(false) }, [initialTraceId])
  const trace = detail.data?.traceId === selectedId ? detail.data : undefined
  const allNodes = (trace?.nodes || trace?.ordered || []) as AnyRecord[]
  const attribute = (key: string) => allNodes.map(node => node.attributes?.[key]).find(value => typeof value === 'string' && value)
  // Resolve context from the selected trace. Never show the previous trace's
  // batch under a new selection while a Remote query is still loading.
  const evaluationId = String(attribute('evaluation.id') || (selectedId === initialTraceId ? initialEvaluationId : '') || '')
  const evaluation = useRemoteQuery<{ evaluation?: EvaluationBatch }>(api, 'evaluationStatus', [evaluationId], {}, Boolean(evaluationId))
  const batch = evaluation.data.evaluation?.evaluationId === evaluationId ? evaluation.data.evaluation : undefined
  const traceCase = batch?.cases.find(item => item.traceId === selectedId)
  const caseId = String(attribute('evaluation.case_id') || traceCase?.caseId || (selectedId === initialTraceId ? initialCaseId : '') || '')
  const returnContext = { skillId: batch?.skillId || trace?.skillId || initialSkillId, evaluationId, caseId }
  const returnToCase = () => onNavigate('evaluations', returnContext)
  const protect = useMutation(api, 'traceProtect', () => { detail.reload(); list.reload(); onChanged() })
  const retain = useMutation(api, 'traceRetain', () => { detail.reload(); list.reload(); onChanged() })
  const clear = useMutation(api, 'traceClear', () => { setSelectedId(''); setInspectorOpen(false); list.reload(); onChanged() })
  const act = async (mutation: ReturnType<typeof useMutation>, mutationRequest: AnyRecord, message: string) => { try { await mutation.run(mutationRequest); onNotice(message) } catch (error) { onNotice(safeError(error)) } }
  const clearFilters = () => { setSearch(''); setSource(''); setFrom(''); setUntil(''); setStatus(''); setUnlinked(false); setCursor('') }
  const openTrace = (id: string) => { setSelectedId(id); setSelectedSpanId(''); setInspectorOpen(false); setView('overview'); setNodeSearch(''); setNodeType('all') }
  const openNode = (id: string) => { setSelectedSpanId(id); setInspectorOpen(true) }
  const backToList = () => { setSelectedId(''); setInspectorOpen(false) }
  const writeSample = async () => { try { const sample = await callRemote<any>(api, 'traceSample'); await callRemote(api, 'traceIngest', [randomOperation('trace.sample'), sample.payload]); list.reload(); onNotice('已通过 Host 写入一条 workbench-test Trace') } catch (error) { onNotice(safeError(error)) } }
  const copyTraceId = async () => {
    if (!trace) return
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('clipboard-unavailable')
      await navigator.clipboard.writeText(trace.traceId)
      onNotice('Trace ID 已复制')
    } catch { onNotice('未能复制，请手动选择 Trace ID：' + trace.traceId) }
  }
  const filteredNodes = allNodes.filter(node => {
    const query = nodeSearch.trim().toLowerCase()
    return (!query || [node.name, node.kind, node.spanId].join(' ').toLowerCase().includes(query))
      && (nodeType === 'all' || traceSpanType(node) === nodeType)
  })
  const toneForTrace = trace?.status === 'error' ? 'blocked' : trace?.status === 'unset' ? 'pending' : 'ready'
  const busy = protect.busy || retain.busy || clear.busy
  if (!selectedId) return <div className="sm-page trace-page trace-list-page">
    <PageIntro eyebrow="OBSERVABILITY" title="Trace 追踪" description="按来源、状态和对象查找真实执行链路，选择后进入独立流程详情。" actions={<><Button onClick={list.reload} disabled={list.loading}>刷新 Trace</Button><Button onClick={writeSample} disabled={!api}>写入测试 Trace</Button>{initialEvaluationId && initialCaseId ? <Button variant="primary" onClick={() => onNavigate('evaluations', { skillId: initialSkillId, evaluationId: initialEvaluationId, caseId: initialCaseId })}>返回用例标注</Button> : null}</>} />
    <section className="trace-toolbar" aria-label="Trace 列表筛选"><div className="toolbar-tools">
      <label className="sm-visually-hidden" htmlFor="trace-search">搜索 Trace</label><input id="trace-search" className="search-field" type="search" placeholder="搜索 trace、span 名称或 Skill" value={search} onChange={event => setSearch(event.target.value)} />
      <select className="filter-select" aria-label="来源筛选" value={source} onChange={event => setSource(event.target.value)}><option value="">全部来源</option><option value="production">生产</option><option value="harness-native">Harness</option><option value="workbench-test">测试</option></select>
      <select className="filter-select" aria-label="状态筛选" value={status} onChange={event => setStatus(event.target.value)}><option value="">全部状态</option><option value="ok">正常</option><option value="unset">未设置</option><option value="error">异常</option></select>
      <label className="sm-check-label"><input type="checkbox" checked={unlinked} onChange={event => setUnlinked(event.target.checked)} />未关联 Skill</label>
      {from || until ? <span className="trace-time-filter">时间范围：{from ? formatTraceTime(from) : '不限开始'} — {until ? formatTraceTime(until) : '不限结束'}<Button variant="quiet" onClick={() => { setFrom(''); setUntil('') }}>清除时间范围</Button></span> : null}
      <Button variant="quiet" onClick={clearFilters}>清除筛选</Button>
    </div></section>
    <section className="trace-ledger" aria-label="Trace 列表"><header className="pane-head"><div><h2>执行链路台账</h2><p>{list.loading ? '正在读取 Host 记录…' : (list.data.total ?? list.data.traces.length) + ' 条 Host 记录'}{initialSkillId ? ' · Skill ' + initialSkillId : ''}</p></div></header>
      {list.error ? <InlineError message={list.error} onRetry={list.reload} /> : null}
      {list.data.traces.length ? <ul className="trace-list-items">{list.data.traces.map(item => <li key={item.traceId}><button type="button" className="trace-list-item" onClick={() => openTrace(item.traceId)}>
        <span className={'trace-list-dot ' + (item.status === 'error' ? 'is-error' : item.status === 'unset' ? 'is-unset' : '')} />
        <span className="trace-list-copy"><strong>{item.nodes?.[0]?.name || '未命名 Trace'}</strong><small>{item.traceId} · {item.skillId || '未关联 Skill'}</small></span>
        <span className="trace-list-meta"><StatusPill status={item.source || 'workbench-test'} /><small>{item.spanCount || item.nodes?.length || 0} spans · {item.durationMs == null ? '耗时未记录' : item.durationMs + 'ms'}</small></span><span className="row-link">查看流程 →</span>
      </button></li>)}</ul> : !list.loading && !list.error ? <EmptyState title={search || source || status || unlinked ? '没有匹配的 Trace' : '还没有 Trace'} description={search || source || status || unlinked ? '清除筛选后查看全部数据。' : '接入 loopback OTLP 或写入明确标识的测试 Trace。'} /> : null}
      {list.data.nextCursor || cursor ? <div className="sm-pagination"><Button disabled={!cursor} onClick={() => setCursor('')}>返回首页</Button><span>{list.data.total ?? list.data.traces.length} 条结果</span><Button disabled={!list.data.nextCursor} onClick={() => setCursor(list.data.nextCursor || '')}>下一页</Button></div> : null}
    </section>
  </div>
  return <div className="sm-page trace-page trace-detail-page">
    <PageIntro eyebrow="OBSERVABILITY" title={'Trace ' + selectedId} description="规范化 Span 的真实执行关系；节点详情按需打开，不补取未采集正文。" actions={<><Button onClick={backToList}>返回 Trace 列表</Button><Button variant="quiet" onClick={copyTraceId} disabled={!trace}>复制 Trace ID</Button>{evaluationId && caseId ? <Button variant="primary" onClick={returnToCase}>返回用例标注</Button> : null}</>} />
    {detail.error ? <InlineError message={detail.error} onRetry={detail.reload} /> : null}
    {!trace ? <p className="gate-notice" role="status">{detail.error ? '未能读取这条 Trace。可重试或返回列表，当前筛选仍保留。' : '正在读取所选 Trace…'}</p> : <>
      <section className="context-belt" aria-label="Trace 固定上下文">
        <article className="context-stage"><div className="context-kicker"><span>来源与根对象</span><StatusPill status={trace.source || 'workbench-test'} /></div><h2>{caseId ? '用例 ' + caseId : allNodes[0]?.name || '未记录根对象名称'}</h2><p>{evaluationId ? '批次 ' + evaluationId : formatTraceTime(trace.startTimeNs)}</p></article>
        <article className="context-stage"><div className="context-kicker"><span>Skill 快照</span><StatusPill status={batch ? 'ready' : 'empty'} /></div><h2>{batch?.skillSnapshot?.title || trace.skillId || '未关联 Skill'}{trace.version ? ' · ' + trace.version : ''}</h2><p className="gate-mono" title={batch?.snapshotHash}>{batch ? 'sha256: ' + batch.snapshotHash : evaluationId ? '正在核对固定批次快照' : '该 Trace 未记录包哈希'}</p><p>{batch ? '生产配置：' + String(batch.executionProfile.version || '未记录版本') + ' · ' + (batch.productionAligned ? '已对齐' : '未证明对齐') : '未提供生产配置证据'}</p></article>
        <article className="context-stage"><div className="context-kicker"><span>执行摘要</span><StatusPill status={toneForTrace} /></div><h2>{trace.spanCount || allNodes.length} 个节点 · {trace.durationMs == null ? '耗时未记录' : trace.durationMs + 'ms'}</h2><p>仅展示允许的结构与属性 · {evaluationId ? '随测评保留' : trace.protectedUntil ? '保护至 ' + formatTraceTime(trace.protectedUntil) : trace.retainedUntil ? '保留至 ' + formatTraceTime(trace.retainedUntil) : '默认保留策略'}</p></article>
      </section>
      {evaluation.error ? <InlineError message={'固定批次读取失败：' + evaluation.error} onRetry={evaluation.reload} /> : null}
      {batch ? <details className="trace-execution-profile"><summary>固定模型与生产执行配置 · {String(batch.executionProfile.provider || '未记录 Provider')} / {String(batch.executionProfile.model || '未记录模型')}</summary><pre className="code-evidence">{prettyValue(batch.executionProfile)}</pre></details> : null}
      <div className={'gate-notice ' + (trace.status === 'error' ? 'error' : trace.incomplete ? 'warning' : '')}><strong>{trace.status === 'error' ? '链路包含异常。' : trace.incomplete ? '链路仍在补齐。' : 'Trace 已从 Host 同步。'}</strong> {trace.incomplete ? '已保留缺父节点的孤立 Span，不猜测连接。' : '流程图与顺序列表来自同一份 Span；选择节点查看证据。'}</div>
      <section className="trace-toolbar" aria-label="Trace 视图与节点筛选"><div className="view-tabs" role="tablist" aria-label="Trace 视图">{(['overview', 'full', 'sequence'] as const).map((id, index) => <button className="view-tab" type="button" role="tab" key={id} aria-selected={view === id} onClick={() => setView(id)}>{['流程总览', '完整链路', '顺序列表'][index]}</button>)}</div>
        <div className="toolbar-tools"><label className="sm-visually-hidden" htmlFor="node-search">搜索节点</label><input className="search-field" id="node-search" type="search" placeholder="搜索节点名称" value={nodeSearch} onChange={event => setNodeSearch(event.target.value)} /><select className="filter-select" aria-label="节点类型筛选" value={nodeType} onChange={event => setNodeType(event.target.value)}><option value="all">全部类型</option>{[...new Set(allNodes.map(node => traceSpanType(node)))].map(type => <option key={type} value={type}>{type}</option>)}</select></div>
      </section>
      <p className="trace-narrow-notice">当前宽度使用等价顺序列表与只读节点摘要；桌面宽度可查看完整流程图。</p>
      <section className={'trace-workspace' + (inspectorOpen ? ' has-inspector' : '')} aria-label="Trace 流程与节点证据">
        <div className="trace-main-panel"><section className="graph-pane" hidden={view === 'sequence'}><GateTraceCanvas key={trace.traceId} view={view === 'full' ? 'full' : 'overview'} nodes={filteredNodes} edges={(trace.edges || []) as TraceGraphEdge[]} selectedSpanId={selectedSpanId} onSelect={openNode} /></section>
          <section className="sequence-section" aria-label="等价顺序列表" hidden={view !== 'sequence'}><header className="sequence-head"><div><h2>等价顺序列表</h2><p>与流程总览共享真实节点、层级和证据。</p></div></header><ol className="sequence-list">{filteredNodes.map((node, index) => <li key={node.spanId || node.id || index}><button type="button" className="sequence-button" aria-current={selectedSpanId === (node.spanId || node.id)} onClick={() => openNode(String(node.spanId || node.id || ''))}><span className="sequence-index">{String(index + 1).padStart(2, '0')}</span><span className="sequence-copy"><strong>{node.name || 'span'}</strong><small>{node.spanId || '—'}</small></span><span className="sequence-type">{traceSpanType(node)}</span><span className="sequence-parent">{node.parentSpanId || '根节点'}</span><span className="sequence-time">{spanDuration(node)}</span><span className="sequence-state"><StatusPill status={node.status === 'error' ? 'blocked' : node.status === 'unset' ? 'pending' : 'completed'} /></span><span className="sequence-action">查看证据</span></button></li>)}</ol>{!filteredNodes.length ? <p className="gate-notice">没有匹配节点，请调整节点搜索或类型筛选。</p> : null}</section>
        </div>
        {inspectorOpen ? <GateTraceDetail trace={trace} nodes={allNodes} selectedSpanId={selectedSpanId} onClose={() => setInspectorOpen(false)} onProtect={() => void act(protect, { traceId: selectedId }, 'Trace 已保护 180 天')} onRetain={() => void act(retain, { traceId: selectedId, days: 180 }, 'Trace 保留期已延长')} onClear={() => { if (window.confirm('清理会删除整条 Trace，且不可恢复。继续吗？')) void act(clear, { traceId: selectedId }, 'Trace 已清理') }} busy={busy} /> : null}
      </section>
    </>}
  </div>
}

function GateTraceDetail({ trace, nodes, selectedSpanId, onClose, onProtect, onRetain, onClear, busy }: { trace: AnyRecord; nodes: AnyRecord[]; selectedSpanId?: string; onClose: () => void; onProtect: () => void; onRetain: () => void; onClear: () => void; busy: boolean }): React.ReactElement {
  const node = nodes.find(item => (item.spanId || item.id) === selectedSpanId)
  const clearReason = trace.incomplete ? '父节点尚未补齐，不能删除不完整链路' : nodes.some(item => item.attributes?.['evaluation.id']) ? '测评 Trace 是审计证据，不可删除' : Date.parse(trace.protectedUntil || '') > Date.now() ? 'Trace 在保护期内' : Date.parse(trace.retainedUntil || '') > Date.now() ? 'Trace 在保留期内' : undefined
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [selectedSpanId])
  return <aside className="detail-pane" aria-label="节点详情">
    <header className="detail-head"><button type="button" className="mini-action trace-inspector-back" onClick={onClose}>返回流程 / 顺序列表</button><div className="detail-eyebrow"><span>{node ? traceSpanType(node) + ' · ' + (node.name || 'span') : 'TRACE'}</span></div><h2 ref={heading} tabIndex={-1}>{node?.name || '该节点已不可用'}</h2><p>Host 规范化 Span；只展示允许的结构字段和属性。</p></header>
    {node ? <div className="detail-sections"><section className="detail-section"><h3>执行事实</h3><dl className="detail-list"><div><dt>状态</dt><dd>{traceNodeStatus(node)}</dd></div><div><dt>耗时</dt><dd className="gate-mono">{spanDuration(node)}</dd></div><div><dt>父节点</dt><dd className="gate-mono">{node.parentSpanId || '根节点'}</dd></div><div><dt>Span ID</dt><dd className="gate-mono">{node.spanId || node.id || '—'}</dd></div><div><dt>Event ID</dt><dd className="gate-mono">{node.eventId || '—'}</dd></div></dl></section><section className="detail-section"><h3>允许的属性</h3><pre className="code-evidence">{prettyValue(node.attributes || {})}</pre></section><section className="detail-section"><h3>事件摘要</h3><pre className="code-evidence">{prettyValue(node.events || [])}</pre></section>{node.incomplete ? <section className="detail-section error-evidence"><h3>数据完整性</h3><p>父 Span {node.missingParentId || node.parentSpanId || '未知'} 尚未到达；页面不会生成猜测关系。</p></section> : null}</div> : null}
    <section className="detail-section trace-retention-actions" aria-label="Trace 保留操作"><h3>整条 Trace 保留</h3><div><button type="button" className="mini-action" onClick={onProtect} disabled={busy}>保护</button><button type="button" className="mini-action" onClick={onRetain} disabled={busy}>延长保留</button><button type="button" className="mini-action" onClick={onClear} disabled={busy || Boolean(clearReason)} title={clearReason}>清理</button></div></section>
    {clearReason ? <p className="detail-foot">{clearReason}</p> : null}<p className="detail-foot">Trace {trace.traceId} · {trace.spanCount || nodes.length} 个节点</p>
  </aside>
}


function traceNodeStatus(node: AnyRecord): string { return node.status === 'error' ? '异常' : node.incomplete ? '父节点缺失' : node.status === 'unset' ? '未设置' : '完成' }
function formatTraceTime(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '—'
  const milliseconds = typeof value === 'string' && /^\d{16,}$/.test(value) ? Number(BigInt(value) / 1000000n) : value
  const date = new Date(milliseconds)
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' })
}


function EmptyState({ title, description, action, compact = false }: { title: string; description: string; action?: React.ReactNode; compact?: boolean }): React.ReactElement { return <div className={`sm-empty-state ${compact ? 'is-compact' : ''}`}><div className="sm-empty-mark">{compact ? '＋' : '◌'}</div><h2>{title}</h2><p>{description}</p>{action ? <div className="sm-empty-action">{action}</div> : null}</div> }
function InlineError({ message, onRetry }: { message: string; onRetry: () => void }): React.ReactElement { return <div className="sm-inline-error" role="alert"><span>!</span><div><strong>读取失败</strong><p>{message}</p></div><button type="button" onClick={onRetry}>重试</button></div> }
function formatTime(value?: string): string { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function progressLabel(batch: EvaluationBatch): string { const total = batch.cases.length; const completed = batch.cases.filter(item => item.actual !== undefined || item.grade !== undefined).length; return `${completed}/${total}` }
