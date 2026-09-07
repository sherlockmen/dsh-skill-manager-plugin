import React, { useEffect, useState } from 'react'
import { MindMapEditor } from './mindmap-editor.js'
import { ActionButton } from './action-button.js'

type Node = { id: string; parentId?: string | null; title: string; [key: string]: unknown }
export function SourceEditor({ nodes, selectedId, textMode, readOnly, onDirtyChange, onSave, onGenerate, generating }: { nodes: Node[]; selectedId?: string; textMode: boolean; readOnly: boolean; onDirtyChange: (dirty: boolean) => void; onSave: (nodes: Node[]) => Promise<void>; onGenerate: () => Promise<void>; generating: boolean }) {
  const [draft, setDraft] = useState(nodes)
  const [selected, setSelected] = useState(nodes[0]?.id || '')
  useEffect(() => { if (selectedId) setSelected(selectedId) }, [selectedId])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [baseline, setBaseline] = useState(JSON.stringify(nodes))
  const dirty = JSON.stringify(draft) !== baseline
  useEffect(() => { if (!dirty) { setDraft(nodes); setBaseline(JSON.stringify(nodes)) } }, [nodes])
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  const active = draft.find(node => node.id === selected) || draft[0]
  const change = (next: Node[]) => { setDraft(next); setSaved(''); setError('') }
  const save = async () => { try { if (draft.some(node => !node.title.trim())) throw new Error('节点内容不能为空。'); await onSave(draft); setBaseline(JSON.stringify(draft)); setSaved('来源已保存，可以生成候选。') } catch (reason) { setError((reason as Error).message) } }
  return <section className="sm-source-workspace" aria-label={textMode ? '文字描述编辑' : '思维导图编辑'}>
    <header className="sm-source-tools"><strong>{textMode ? '描述业务规则' : '编辑思维导图'}</strong></header>
    {!textMode ? <MindMapEditor nodes={draft} selectedId={active?.id || ''} readOnly={readOnly} onChange={change} onSelect={setSelected} /> : null}
    <label className="sm-source-content">{textMode ? '输入规则、判断条件、例外情况和期望输出' : '选中节点内容'}<textarea aria-label={textMode ? '业务文字描述' : '节点内容'} rows={textMode ? 12 : 3} value={active?.title || ''} disabled={readOnly || !active} onChange={event => change(draft.map(node => node.id === active.id ? { ...node, title: event.target.value } : node))} /></label>
    {error ? <p className="gate-notice error" role="alert">{error}</p> : null}<p className="save-status" role="status">{dirty ? '来源有未保存修改。' : saved || '来源保存后，通过模型生成候选，审查后再应用。'}</p>
    <div className="sm-source-tools"><ActionButton className="gate-button" disabled={readOnly || !dirty} onClick={save}>保存来源</ActionButton><ActionButton className="gate-button sm-button-primary" loading={generating} disabled={readOnly || dirty} onClick={onGenerate}>{generating ? '模型生成中…' : '生成候选差异'}</ActionButton></div>
  </section>
}
