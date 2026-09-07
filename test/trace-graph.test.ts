import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GateTraceGraph, layoutTraceGraph, selectTraceOverview, traceFitScale, traceSpanType } from '../src/client/trace-graph.js'

describe('Trace topology projection', () => {
  it('fits both dimensions with fixed padding without enlarging small graphs', () => {
    expect(traceFitScale(448, 348, 800, 400)).toBe(0.5)
    expect(traceFitScale(448, 348, 200, 600)).toBe(0.5)
    expect(traceFitScale(448, 348, 200, 100)).toBe(1)
    expect(traceFitScale(0, 348, 800, 400)).toBe(1)
  })

  it('places branches in parallel and draws only the supplied edges', () => {
    const nodes = [{ spanId: 'root' }, { spanId: 'tool-a' }, { spanId: 'tool-b' }, { spanId: 'result' }]
    const edges = [{ from: 'root', to: 'tool-a' }, { from: 'root', to: 'tool-b' }, { from: 'tool-b', to: 'result' }]
    const graph = layoutTraceGraph(nodes, edges)
    const positions = new Map(graph.nodes.map(node => [node.id, node]))
    expect(graph.edges.map(edge => [edge.from, edge.to])).toEqual(edges.map(edge => [edge.from, edge.to]))
    expect(positions.get('tool-a')?.x).toBe(positions.get('tool-b')?.x)
    expect(positions.get('tool-a')?.y).not.toBe(positions.get('tool-b')?.y)
    expect(positions.get('root')!.x).toBeLessThan(positions.get('tool-a')!.x)
    expect(positions.get('result')!.x).toBeGreaterThan(positions.get('tool-b')!.x)
  })

  it('keeps disconnected and missing-parent spans visible without joining neighboring rows', () => {
    const nodes = [{ spanId: 'root', name: 'Root' }, { spanId: 'child' }, { spanId: 'isolated', parentSpanId: 'missing', incomplete: true }, { spanId: 'other-root' }]
    const edges = [{ from: 'root', to: 'child' }, { from: 'missing', to: 'isolated' }]
    const graph = layoutTraceGraph(nodes, edges)
    expect(graph.nodes).toHaveLength(4)
    expect(graph.edges.map(edge => [edge.from, edge.to])).toEqual([['root', 'child']])
    expect(graph.nodes.find(node => node.id === 'isolated')?.missingParent).toBe('missing')
    expect(graph.nodes.find(node => node.id === 'other-root')?.component).not.toBe(graph.nodes.find(node => node.id === 'root')?.component)
    const html = renderToStaticMarkup(React.createElement(GateTraceGraph, { nodes, edges, onSelect: () => {} }))
    expect(html.match(/data-trace-edge=/g)).toHaveLength(1)
    expect(html).toContain('父节点缺失')
    expect(html).not.toContain('child:isolated')
  })

  it('does not infer a relationship just because parentSpanId or array order suggests one', () => {
    const graph = layoutTraceGraph([{ spanId: 'a' }, { spanId: 'b', parentSpanId: 'a' }], [])
    expect(graph.edges).toEqual([])
    expect(graph.nodes.map(node => node.component)).toEqual([0, 1])
  })

  it('renders a diamond once per span and remains finite for cyclic input', () => {
    const nodes = ['a', 'b', 'c', 'd'].map(spanId => ({ spanId }))
    const edges = [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }]
    const diamond = layoutTraceGraph(nodes, edges)
    expect(diamond.nodes).toHaveLength(4)
    expect(diamond.edges).toHaveLength(4)
    const cyclic = layoutTraceGraph(nodes, [...edges, { from: 'd', to: 'a' }])
    expect(cyclic.nodes).toHaveLength(4)
    expect(cyclic.edges).toHaveLength(5)
    expect(cyclic.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true)
  })

  it('overview collapses successful tool leaves while preserving errors, selection, and the real connecting skeleton', () => {
    const nodes = [{ spanId: 'root', kind: 'model' }, { spanId: 'a', kind: 'tool', status: 'ok' }, { spanId: 'b', kind: 'tool', status: 'error' }, { spanId: 'c', kind: 'tool', status: 'ok' }, { spanId: 'orphan', kind: 'tool', status: 'ok', incomplete: true }]
    const edges = ['a', 'b', 'c'].map(to => ({ from: 'root', to }))
    const overview = selectTraceOverview(nodes, edges, 'c')
    expect(overview.nodes.map(node => node.spanId)).toEqual(['root', 'b', 'c', 'orphan'])
    expect(overview.edges).toEqual(edges.slice(1))
    expect(overview.hiddenByParent.get('root')).toBe(1)
    expect(layoutTraceGraph(overview.nodes, overview.edges).edges).toHaveLength(2)
  })

  it('recognizes model and tool semantics when OTLP kind is a numeric transport kind', () => {
    expect(traceSpanType({ kind: '2', name: 'model.probe' })).toBe('model')
    expect(traceSpanType({ kind: '3', name: 'tool.sqlite' })).toBe('tool')
    expect(traceSpanType({ kind: '1', name: 'skill.run' })).toBe('skill')
    expect(traceSpanType({ kind: '2', name: 'database query' })).toBe('turn')
  })
})
