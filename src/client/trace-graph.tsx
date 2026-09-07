import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'

export interface TraceGraphSpan {
  spanId?: string
  id?: string
  parentSpanId?: string
  missingParentId?: string
  incomplete?: boolean
  name?: string
  kind?: string
  status?: string
  durationMs?: number
  startTimeNs?: string | number | bigint
  endTimeNs?: string | number | bigint
  attributes?: Record<string, unknown>
}

export interface TraceGraphEdge { from: string; to: string }
export interface GateTraceGraphProps {
  nodes: TraceGraphSpan[]
  edges: TraceGraphEdge[]
  selectedSpanId?: string
  onSelect: (spanId: string) => void
  view?: 'overview' | 'full'
  scale?: number
}

/** Fit both dimensions without enlarging small graphs or clearing filters. */
export function traceFitScale(viewportWidth: number, viewportHeight: number, graphWidth: number, graphHeight: number): number {
  if (![viewportWidth, viewportHeight, graphWidth, graphHeight].every(value => Number.isFinite(value) && value > 0)) return 1
  return Math.min(1, Math.max(1, viewportWidth - 48) / graphWidth, Math.max(1, viewportHeight - 48) / graphHeight)
}

export function GateTraceCanvas(props: GateTraceGraphProps): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fitted, setFitted] = useState(false)
  const [scale, setScale] = useState(1)
  const fitGraph = () => {
    const scroll = scrollRef.current
    const graph = scroll?.querySelector<HTMLElement>('.gate-trace-topology')
    if (!scroll || !graph) return
    setScale(traceFitScale(scroll.clientWidth, scroll.clientHeight, graph.offsetWidth, graph.offsetHeight))
    scroll.scrollLeft = 0; scroll.scrollTop = 0
  }
  useLayoutEffect(() => {
    if (!fitted) return
    fitGraph()
    if (typeof ResizeObserver === 'undefined' || !scrollRef.current) return
    const observer = new ResizeObserver(fitGraph)
    observer.observe(scrollRef.current)
    return () => observer.disconnect()
  }, [fitted, props.nodes, props.edges, props.selectedSpanId, props.view])
  return <>
    <header className="pane-head"><div><h2>{props.view === 'full' ? '完整链路' : '流程总览'}</h2><p>左到右按真实父子关系排列；缺失父节点只标记，不补线。</p></div><div className="pane-head-actions">
      <button type="button" className="mini-action" onClick={() => { setFitted(true); fitGraph() }} disabled={!props.nodes.length}>适应画布</button>
      <button type="button" className="mini-action" onClick={() => { setFitted(false); setScale(1); if (scrollRef.current) { scrollRef.current.scrollLeft = 0; scrollRef.current.scrollTop = 0 } }} disabled={!fitted}>原始尺寸</button>
    </div></header>
    <div className="graph-scroll" ref={scrollRef}><div className={`graph-canvas${fitted ? ' is-fitted' : ''}`}><GateTraceGraph {...props} scale={scale} /></div></div>
  </>
}

const NODE_WIDTH = 160
const NODE_HEIGHT = 96
const COLUMN_PITCH = 220
const ROW_PITCH = 132

function spanId(node: TraceGraphSpan): string { return node.spanId || node.id || '' }

/** OTLP kind is usually a numeric transport kind, not a business node type. */
export function traceSpanType(node: TraceGraphSpan): 'turn' | 'skill' | 'model' | 'tool' | 'merge' {
  const semantics = [node.attributes?.['langchain.run_type'], node.attributes?.['gen_ai.operation.name'], node.kind, node.name]
    .filter(value => typeof value === 'string').join(' ').toLowerCase()
  if (/(^|[\s._/-])(model|llm|chat)([\s._/-]|$)/.test(semantics)) return 'model'
  if (/(^|[\s._/-])(tool|execute_tool)([\s._/-]|$)/.test(semantics)) return 'tool'
  if (/(^|[\s._/-])skill([\s._/-]|$)/.test(semantics)) return 'skill'
  if (/(^|[\s._/-])(merge|result)([\s._/-]|$)/.test(semantics)) return 'merge'
  return 'turn'
}

function usableEdges(nodes: TraceGraphSpan[], edges: TraceGraphEdge[]): TraceGraphEdge[] {
  const ids = new Set(nodes.map(spanId).filter(Boolean))
  const seen = new Set<string>()
  return edges.filter(edge => {
    const key = `${edge.from}\0${edge.to}`
    if (!ids.has(edge.from) || !ids.has(edge.to) || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Overview only hides successful terminal tools that have siblings. Their
 * actual parent carries the hidden count. No replacement edge is introduced;
 * intermediate spans, failures, orphans, and the selection are always kept.
 */
export function selectTraceOverview(nodes: TraceGraphSpan[], edges: TraceGraphEdge[], selectedSpanId?: string): {
  nodes: TraceGraphSpan[]; edges: TraceGraphEdge[]; hiddenByParent: Map<string, number>
} {
  const valid = usableEdges(nodes, edges)
  const children = new Map<string, string[]>()
  const parents = new Map<string, string[]>()
  for (const edge of valid) {
    children.set(edge.from, [...(children.get(edge.from) || []), edge.to])
    parents.set(edge.to, [...(parents.get(edge.to) || []), edge.from])
  }
  const hiddenByParent = new Map<string, number>()
  const visible = nodes.filter(node => {
    const id = spanId(node)
    const incoming = parents.get(id) || []
    const collapsible = traceSpanType(node) === 'tool' && node.status === 'ok' && !node.incomplete && !node.missingParentId
      && id !== selectedSpanId && !children.has(id) && incoming.length === 1 && (children.get(incoming[0])?.length || 0) > 1
    if (!collapsible) return true
    hiddenByParent.set(incoming[0], (hiddenByParent.get(incoming[0]) || 0) + 1)
    return false
  })
  return { nodes: visible, edges: usableEdges(visible, valid), hiddenByParent }
}

export interface PositionedTraceSpan {
  id: string; span: TraceGraphSpan; x: number; y: number; component: number
  missingParent?: string; outsideParent?: string
}
export interface TraceGraphLayout {
  nodes: PositionedTraceSpan[]
  edges: Array<TraceGraphEdge & { path: string; backward: boolean }>
  groups: Array<{ index: number; top: number; height: number; missingParent: boolean }>
  width: number
  height: number
}

/**
 * Each connected component gets its own vertical band. Within a component,
 * topological depth determines the column, and siblings share the column on
 * distinct rows. For malformed cycles we break only the layout dependency;
 * the original backward edge stays visible. Array adjacency never adds edges.
 */
export function layoutTraceGraph(nodes: TraceGraphSpan[], edges: TraceGraphEdge[]): TraceGraphLayout {
  const byId = new Map(nodes.filter(node => spanId(node)).map(node => [spanId(node), node]))
  const valid = usableEdges([...byId.values()], edges)
  const children = new Map<string, string[]>()
  const parents = new Map<string, string[]>()
  for (const edge of valid) {
    children.set(edge.from, [...(children.get(edge.from) || []), edge.to])
    parents.set(edge.to, [...(parents.get(edge.to) || []), edge.from])
  }
  const remaining = new Set(byId.keys())
  const placed: PositionedTraceSpan[] = []
  const groups: TraceGraphLayout['groups'] = []
  let top = 0
  let maxRank = 0
  while (remaining.size) {
    const component: string[] = []
    const queue = [remaining.values().next().value!]
    remaining.delete(queue[0])
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index]
      component.push(id)
      for (const neighbor of [...(children.get(id) || []), ...(parents.get(id) || [])]) {
        if (remaining.delete(neighbor)) queue.push(neighbor)
      }
    }
    const pending = new Set(component)
    const rank = new Map<string, number>()
    const degree = new Map(component.map(id => [id, (parents.get(id) || []).length]))
    const ready = component.filter(id => !degree.get(id))
    let offset = 0
    while (pending.size) {
      if (offset === ready.length) ready.push(pending.values().next().value!)
      const id = ready[offset++]
      if (!pending.delete(id)) continue
      const depth = rank.get(id) || 0
      for (const child of children.get(id) || []) {
        if (!pending.has(child)) continue
        rank.set(child, Math.max(rank.get(child) || 0, depth + 1))
        degree.set(child, (degree.get(child) || 0) - 1)
        if (!degree.get(child)) ready.push(child)
      }
    }
    const layers = new Map<number, string[]>()
    for (const id of component) {
      const depth = rank.get(id) || 0
      layers.set(depth, [...(layers.get(depth) || []), id])
      maxRank = Math.max(maxRank, depth)
    }
    const rows = Math.max(...[...layers.values()].map(layer => layer.length))
    const height = rows * ROW_PITCH + 56
    const groupIndex = groups.length
    groups.push({ index: groupIndex, top, height, missingParent: component.some(id => Boolean(byId.get(id)?.incomplete)) })
    for (const [depth, layer] of layers) layer.forEach((id, row) => {
      const span = byId.get(id)!
      const missingParent = span.missingParentId || (span.incomplete ? span.parentSpanId || '未知' : undefined)
      const outsideParent = !missingParent && span.parentSpanId && !byId.has(span.parentSpanId) ? span.parentSpanId : undefined
      placed.push({ id, span, x: 8 + depth * COLUMN_PITCH, y: top + 32 + (rows - layer.length) * ROW_PITCH / 2 + row * ROW_PITCH, component: groupIndex, missingParent, outsideParent })
    })
    top += height
  }
  // Keep keyboard reading order equal to the Host order, independently of the
  // graph's column placement or connected-component traversal.
  const order = new Map([...byId.keys()].map((id, index) => [id, index]))
  placed.sort((a, b) => order.get(a.id)! - order.get(b.id)!)
  const positions = new Map(placed.map(node => [node.id, node]))
  return {
    nodes: placed,
    edges: valid.map(edge => {
      const from = positions.get(edge.from)!
      const to = positions.get(edge.to)!
      const x1 = from.x + NODE_WIDTH; const y1 = from.y + NODE_HEIGHT / 2
      const x2 = to.x; const y2 = to.y + NODE_HEIGHT / 2
      const backward = to.x <= from.x
      const mid = (x1 + x2) / 2
      const lane = groups[from.component].top + 14
      const path = backward
        ? `M ${x1} ${y1} H ${x1 + 20} V ${lane} H ${x2 - 6} V ${y2} H ${x2}`
        : `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`
      return { ...edge, path, backward }
    }),
    groups,
    // Include the 20px return lane of a real backward edge inside the viewport.
    width: 32 + NODE_WIDTH + maxRank * COLUMN_PITCH,
    height: Math.max(NODE_HEIGHT + 64, top),
  }
}

export function spanDuration(node: TraceGraphSpan): string {
  let duration = node.durationMs
  if (duration === undefined && node.startTimeNs !== undefined && node.endTimeNs !== undefined) {
    try { duration = Number(BigInt(node.endTimeNs) - BigInt(node.startTimeNs)) / 1e6 } catch {}
  }
  if (duration === undefined || !Number.isFinite(duration) || duration < 0) return '耗时未知'
  return duration >= 1000 ? `${(duration / 1000).toFixed(2)}s` : `${Number(duration.toFixed(2))}ms`
}

const TYPE_LABELS = { turn: 'Turn', skill: 'Skill', model: 'Model', tool: 'Tool', merge: 'Merge' }

export function GateTraceGraph({ nodes, edges, selectedSpanId, onSelect, view = 'full', scale = 1 }: GateTraceGraphProps): React.ReactElement {
  const markerId = `trace-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const projection = useMemo(() => view === 'overview'
    ? selectTraceOverview(nodes, edges, selectedSpanId)
    : { nodes, edges, hiddenByParent: new Map<string, number>() }, [nodes, edges, selectedSpanId, view])
  const graph = useMemo(() => layoutTraceGraph(projection.nodes, projection.edges), [projection])
  const incoming = new Set(graph.edges.map(edge => edge.to))
  const outgoing = new Set(graph.edges.map(edge => edge.from))
  const errors = new Set(nodes.filter(node => node.status === 'error').map(spanId))
  if (!graph.nodes.length) return <div className="graph-empty">当前筛选没有可投影的节点</div>
  return <div className="gate-trace-scaled-size" style={{ width: graph.width * scale, height: graph.height * scale }}><div className="gate-trace-topology" role="group" aria-label={view === 'overview' ? 'Trace 流程总览' : 'Trace 完整链路'} style={{ width: graph.width, height: graph.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
    {graph.groups.length > 1 ? graph.groups.map(group => <span className="trace-component-label" style={{ top: group.top }} key={group.index}>{group.missingParent ? '父节点未到达' : '独立链路'}</span>) : null}
    <svg className="trace-topology-links" width={graph.width} height={graph.height} aria-hidden="true" focusable="false">
      <defs><marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M 0 0 L 6 3 L 0 6" fill="none" stroke="context-stroke" /></marker></defs>
      {graph.edges.map(edge => <path key={`${edge.from}:${edge.to}`} data-trace-edge={`${edge.from}:${edge.to}`} className={errors.has(edge.to) ? 'trace-link failed' : 'trace-link'} d={edge.path} markerEnd={`url(#${markerId})`}><title>{`${edge.from} → ${edge.to}${edge.backward ? '（环路）' : ''}`}</title></path>)}
    </svg>
    {graph.nodes.map(node => {
      const type = traceSpanType(node.span)
      const state = node.span.status === 'error' ? '异常' : node.missingParent ? '父节点缺失' : node.span.status === 'ok' ? '已完成' : '状态未设置'
      const hidden = projection.hiddenByParent.get(node.id) || 0
      return <button className={`trace-node ${type} ${node.span.status === 'error' ? 'failed' : ''} ${node.missingParent ? 'partial' : ''}`} key={node.id} type="button" aria-label={`${TYPE_LABELS[type]} ${node.span.name || 'Span'}，${state}${hidden ? `，收起 ${hidden} 个成功工具调用` : ''}`} aria-pressed={selectedSpanId === node.id} style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT }} onClick={() => onSelect(node.id)}>
        <span className="node-type"><span>{TYPE_LABELS[type]}</span><span title={hidden ? '切换完整链路查看所有工具调用' : node.outsideParent ? `父节点 ${node.outsideParent} 不在当前视图` : undefined}>{hidden ? `+${hidden} 工具` : node.outsideParent ? '父节点已筛除' : ''}</span></span>
        <span className="node-copy"><strong title={node.span.name || 'Span'}>{node.span.name || 'Span'}</strong><span className="node-meta"><span>{spanDuration(node.span)}</span><span className="node-state">{state}</span></span></span>
        {incoming.has(node.id) ? <i className="port in" aria-hidden="true" /> : null}
        {outgoing.has(node.id) ? <i className="port out" aria-hidden="true" /> : null}
      </button>
    })}
  </div></div>
}
