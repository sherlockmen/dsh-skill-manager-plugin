import React, { useEffect, useRef, useState } from 'react'
import MindElixir from 'mind-elixir'
import mindElixirCss from 'mind-elixir/style.css?inline'
import { ActionButton } from './action-button.js'
import { WorkbenchSelect } from './select.js'
import { mindMapToSource, sourceToMindMap, type SourceNode, type MindMapNode } from './mindmap-data.js'

const theme = { ...MindElixir.THEME, name: 'Skill Manager', palette: ['#2267c7'], cssVar: { ...MindElixir.THEME.cssVar, '--bgcolor': '#fbfaf7', '--color': '#30353a', '--main-color': '#30353a', '--main-bgcolor': '#ffffff', '--root-color': '#1f2329', '--root-bgcolor': '#eaf2ff', '--root-border-color': '#2267c7', '--selected': '#2267c7', '--root-radius': '5px', '--main-radius': '4px', '--topic-padding': '10px 14px' } }

/** Mind Elixir owns editing, layout, drag/drop and history; React owns source persistence. */
export function MindMapEditor({ nodes, selectedId, readOnly, onChange, onSelect }: { nodes: SourceNode[]; selectedId: string; readOnly: boolean; onChange: (nodes: SourceNode[]) => void; onSelect: (id: string) => void }) {
  const canvas = useRef<HTMLDivElement>(null)
  const instance = useRef<MindElixir | null>(null)
  const latest = useRef({ nodes, onChange, onSelect }); latest.current = { nodes, onChange, onSelect }
  const [zoom, setZoom] = useState(100)
  const [error, setError] = useState('')
  const active = nodes.find(node => node.id === selectedId)
  const sync = () => { const mind = instance.current; if (mind) latest.current.onChange(mindMapToSource(mind.getData(), latest.current.nodes)) }
  useEffect(() => {
    const el = canvas.current!
    const mind = new MindElixir({ el, direction: MindElixir.RIGHT, editable: !readOnly, contextMenu: false, toolBar: false, keypress: true, allowUndo: true, newTopicName: '新节点', theme, handleWheel: true, scaleMin: .25, scaleMax: 2 })
    instance.current = mind
    const error = mind.init(sourceToMindMap(latest.current.nodes))
    if (error) { setError(error.message); mind.destroy(); instance.current = null; return }
    mind.bus.addListener('operation', (operation: { name: string }) => { if (operation.name !== 'beginEdit') sync() })
    mind.bus.addListener('selectNodes', (selected: MindMapNode[]) => { if (selected[0]) latest.current.onSelect(selected[0].id) })
    mind.bus.addListener('selectNewNode', (node: MindMapNode) => latest.current.onSelect(node.id))
    mind.bus.addListener('scale', (scale: number) => setZoom(Math.round(scale * 100)))
    // The library's history keyboard handler refreshes data without an operation event.
    const historyKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) queueMicrotask(() => { sync(); mind.scaleFit() }) }
    el.addEventListener('keyup', historyKey)
    let wasVisible = false
    const fit = () => { if (!el.clientWidth || !el.clientHeight) { wasVisible = false; return }; mind.linkDiv(); if (!wasVisible) mind.scaleFit(); wasVisible = true }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fit)
    observer?.observe(el); fit()
    return () => { observer?.disconnect(); el.removeEventListener('keyup', historyKey); mind.destroy(); instance.current = null }
  }, [])
  useEffect(() => { const mind = instance.current; if (!mind) return; readOnly ? mind.disableEdit() : mind.enableEdit() }, [readOnly])
  useEffect(() => {
    const mind = instance.current; if (!mind) return
    const current = mindMapToSource(mind.getData(), nodes)
    if (JSON.stringify(current) !== JSON.stringify(nodes)) {
      // The external text editor changes a topic; keep Mind Elixir's undo history.
      const changed = nodes.filter(node => current.find(item => item.id === node.id)?.title !== node.title)
      if (current.length === nodes.length && changed.length === 1 && current.every(node => nodes.some(item => item.id === node.id && item.parentId === node.parentId))) {
        const node = changed[0]; void Promise.resolve(mind.reshapeNode(mind.findEle(node.id), { topic: node.title })).catch(reason => setError(String(reason)))
      } else { mind.refresh(sourceToMindMap(nodes)); mind.clearHistory?.() }
    }
  }, [nodes])
  useEffect(() => { const mind = instance.current; if (mind && selectedId && mind.currentNode?.nodeObj.id !== selectedId) { const el = mind.findEle(selectedId); if (el) { mind.selectNode(el); mind.scrollIntoView(el) } } }, [selectedId, nodes.length])
  const run = async (action: (mind: MindElixir) => void | Promise<void>) => { try { if (instance.current) { await action(instance.current); sync(); setError('') } } catch (reason) { setError((reason as Error).message) } }
  return <>
    <style data-mind-elixir>{mindElixirCss}</style>
    <div className="sm-source-tools" role="toolbar" aria-label="思维导图工具">
      <ActionButton disabled={readOnly || !active} onClick={() => run(mind => mind.addChild(mind.findEle(selectedId)))}>添加子节点</ActionButton>
      <ActionButton disabled={readOnly || !active?.parentId} onClick={() => run(mind => mind.insertSibling('after', mind.findEle(selectedId)))}>添加同级节点</ActionButton>
      <ActionButton disabled={readOnly || !active?.parentId} onClick={() => run(async mind => { if (window.confirm('删除选中分支及其子节点？可以撤销，保存来源后生效。')) { await mind.removeNodes([mind.findEle(selectedId)]); onSelect(active!.parentId!) } })}>删除分支</ActionButton>
      <ActionButton disabled={readOnly} onClick={() => run(mind => { mind.undo(); mind.scaleFit() })}>撤销</ActionButton><ActionButton disabled={readOnly} onClick={() => run(mind => { mind.redo(); mind.scaleFit() })}>重做</ActionButton>
      <div className="sm-map-view-tools"><WorkbenchSelect aria-label="思维导图缩放" value={zoom} onChange={event => instance.current?.scale(Number(event.target.value) / 100)}>{[...new Set([25, 50, 75, 100, 125, 150, 200, zoom])].sort((a,b)=>a-b).map(value => <option key={value} value={value}>{value}%</option>)}</WorkbenchSelect><ActionButton onClick={() => instance.current?.scaleFit()}>适应画布</ActionButton></div>
    </div>
    <div ref={canvas} className="sm-mind-elixir" aria-label="思维导图画布" />
    <p className="sm-map-help">双击节点编辑 · Tab 添加子节点 · Enter 添加同级节点 · 拖动节点调整层级 · 拖动画布平移</p>
    {error ? <p role="alert" className="gate-notice error">{error}</p> : null}
  </>
}
