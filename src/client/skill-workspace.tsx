import React, { useEffect, useRef, useState } from 'react'
import type { SkillDraft, SkillValidation } from '../contracts/index.js'
import { callRemote, useMutation, useRemoteQuery, safeError, type RemoteApi, type AnyRecord } from './api.js'

import { DecisionTreeView, ManifestView, MarkdownPreview, SourceNodeTree } from './native-file-views.js'

type Focus = { skillId?: string; evaluationId?: string; traceId?: string }
type Props = {
  api: RemoteApi; skill: SkillDraft; onChanged: () => void; onNotice: (message: string) => void
  onNavigate: (route: 'skills' | 'evaluations' | 'traces', target?: Focus) => void
  onDirtyChange: (dirty: boolean) => void; onCopy: () => void; onArchive: () => void; onDelete: () => void
  copyBusy?: boolean; archiveBusy?: boolean; deleteBusy?: boolean
  initialTab?: 'versions'; initialReleaseId?: string
}
const format = (value?: string) => value ? new Date(value).toLocaleString('zh-CN') : '—'
function publicationNotice(result: AnyRecord | undefined, success: string) {
  if (result?.managerProjection?.status !== 'pending') return success
  const message = result.managerProjection.message
  return `运行端已提交，管理台审计待对账${message ? `：${message}` : '；运行端加载状态仍待确认'}`
}
function Action({ children, primary, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return <button type="button" className={`gate-button sm-button sm-button-${primary ? 'primary' : 'secondary'}`} {...props}>{children}</button>
}
function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function SkillEditor({ api, skill, initialTab, initialReleaseId, onChanged, onNotice, onNavigate, onDirtyChange, onCopy, onArchive, onDelete, copyBusy, archiveBusy, deleteBusy }: Props) {
  const [files, setFiles] = useState(skill.files)
  const [title, setTitle] = useState(skill.title)
  const [description, setDescription] = useState(skill.description)
  const [authority, setAuthority] = useState(skill.authority)
  const [tab, setTab] = useState<'overview' | 'edit' | 'versions'>(initialTab || (initialReleaseId ? 'versions' : 'edit'))
  useEffect(() => { setTab(initialTab || (initialReleaseId ? 'versions' : 'edit')) }, [skill.skillId, initialTab, initialReleaseId])
  const [activeFile, setActiveFile] = useState('SKILL.md')
  const [dirty, setDirty] = useState(false)
  const [validation, setValidation] = useState<SkillValidation>()
  const [candidate, setCandidate] = useState<AnyRecord>()
  const [chosen, setChosen] = useState<number[]>([])
  const [showDiff, setShowDiff] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [rawFile, setRawFile] = useState(false)
  const currentSkillId = useRef(skill.skillId)
  const [exceptionReason, setExceptionReason] = useState('')
  const [showException, setShowException] = useState(false)
  const [nodeId, setNodeId] = useState('')
  const [nodeTitle, setNodeTitle] = useState('')
  const [sourceDirty, setSourceDirty] = useState(false)
  useEffect(() => { onDirtyChange(dirty || sourceDirty) }, [dirty, sourceDirty, onDirtyChange])
  const sourceId = String(skill.source?.mindmapId || skill.source?.id || '')
  const source = useRemoteQuery<AnyRecord>(api, 'mindmapGet', [sourceId], {}, skill.source?.kind === 'xmind' && Boolean(sourceId))
  const gate = useRemoteQuery<AnyRecord>(api, 'releaseCheck', [skill.skillId], {})
  const diff = useRemoteQuery<AnyRecord>(api, 'skillDiff', [skill.skillId], {}, showDiff)
  const nodes: AnyRecord[] = source.data.mindmap?.nodes || []
  const save = useMutation(api, 'skillSave', onChanged)
  const publish = useMutation(api, 'releasePublish', () => { onChanged(); gate.reload() })
  const generate = useMutation(api, 'mindmapGenerateCandidate')
  const apply = useMutation(api, 'mindmapApplyCandidate', onChanged)
  const updateSource = useMutation(api, 'mindmapUpdate', source.reload)
  useEffect(() => {
    const switchedSkill = currentSkillId.current !== skill.skillId
    currentSkillId.current = skill.skillId
    if (switchedSkill || !dirty) {
      setFiles(skill.files); setTitle(skill.title); setDescription(skill.description); setAuthority(skill.authority)
      setDirty(false); setValidation(undefined); setCandidate(undefined)
    }
    if (switchedSkill) { setSourceDirty(false); setNodeId(''); setNodeTitle(''); setActiveFile('SKILL.md'); setRawFile(false); setShowPreview(false) }
    gate.reload()
  }, [skill.skillId, skill.updatedAt])
  const markDirty = () => { setDirty(true) }
  const updateFile = (content: string) => { setFiles(previous => ({ ...previous, [activeFile]: content })); markDirty() }
  const selectFile = (file: string) => { setActiveFile(file); setRawFile(false); setShowPreview(false) }
  const saveDraft = async () => {
    try {
      const result = await save.run({ skillId: skill.skillId, expectedHash: skill.contentHash, patch: { files, title, description, authority } })
      setValidation(result.validation); setDirty(false); gate.reload(); onNotice('工作草稿已保存')
    } catch (error) { onNotice(safeError(error)) }
  }
  const validate = async () => { try { const result = await callRemote<any>(api, 'skillValidate', [skill.skillId]); setValidation(result.validation); gate.reload() } catch (error) { onNotice(safeError(error)) } }
  const release = async (exception = false) => {
    try {
      if (exception && !exceptionReason.trim()) throw new Error('请填写例外发布原因')
      const result = await publish.run({ skillId: skill.skillId, ...(exception ? { exception: true, confirm: true, reason: exceptionReason.trim() } : {}) })
      setShowException(false); setTab('versions'); onNotice(publicationNotice(result, '发布版本已保存，运行端加载状态等待确认'))
    } catch (error) { onNotice(safeError(error)) }
  }
  const generateCandidate = async () => {
    try {
      const result = await generate.run({ mindmapId: sourceId, skillId: skill.skillId })
      if (!result.candidate) throw new Error(result.message || '未生成候选，请检查模型通道')
      setCandidate(result.candidate); setChosen(result.candidate.changes.map((_: unknown, i: number) => i))
    } catch (error) { onNotice(safeError(error)) }
  }
  const applyCandidate = async () => {
    try { await apply.run({ skillId: skill.skillId, candidateId: candidate?.candidateId, selected: chosen, expectedHash: skill.contentHash }); setCandidate(undefined); onNotice('已应用所选差异，旧快照测评已失效') } catch (error) { onNotice(safeError(error)) }
  }
  const validationResult = validation || gate.data.checks?.validation
  const fileNames = Object.keys(files)
  const readOnly = skill.status === 'archived'
  const structuredFile = activeFile === 'manifest.yaml' || activeFile === 'rules/decision-tree.yaml'
  return <section className="skill-editor-page">
    <nav className="gate-tabs" aria-label="Skill 对象视图">{(['overview', 'edit'] as const).map(id => <button key={id} className={`gate-tab ${tab === id ? 'is-active' : ''}`} type="button" onClick={() => setTab(id)}>{id === 'overview' ? '概览' : '编辑'}</button>)}<button className="gate-tab" type="button" onClick={() => onNavigate('evaluations', { skillId: skill.skillId })}>测评</button><button className={`gate-tab ${tab === 'versions' ? 'is-active' : ''}`} type="button" onClick={() => setTab('versions')}>版本</button><button className="gate-tab" type="button" onClick={() => onNavigate('traces', { skillId: skill.skillId })}>生产表现</button></nav>
    <section className="gate-work-belt" aria-label="来源到校验的连续工作带"><article className="gate-belt-stage"><div className="gate-belt-kicker">来源知识</div><h2>{source.data.mindmap?.title || (sourceId ? '原生包来源' : '空白草稿')}</h2><p>{nodes.length ? `${nodes.length} 个来源节点` : '可直接编辑原生文件'}</p></article><article className="gate-belt-stage active"><div className="gate-belt-kicker">原生 Skill 包</div><h2>工作草稿 · v{skill.draftVersion}</h2><p className="gate-mono">{dirty ? '未保存' : `sha256: ${skill.contentHash.slice(0, 16)}`}</p></article><article className={`gate-belt-stage ${gate.data.status === 'ready' ? 'active' : ''}`}><div className="gate-belt-kicker">校验与测评</div><h2>{gate.data.status === 'ready' ? '发布就绪' : validationResult?.status === 'passed' ? '结构校验通过' : '待完成校验'}</h2><p>发布需通过有效测评和场景回归</p></article></section>
    <div className={`gate-notice ${dirty || sourceDirty ? 'warning' : ''}`}><strong>{readOnly ? '归档 Skill 只读。' : sourceDirty ? '来源节点有未保存更改。' : dirty ? '有未保存更改。' : '当前编辑工作草稿。'}</strong> {readOnly ? '可复制为新草稿后继续修改。' : '文件、来源、测评和版本保持同一对象上下文；历史版本不会随草稿改变。'}</div>
    {tab === 'overview' ? <section className="gate-create"><div className="sm-form-grid"><label>名称<input value={title} disabled={readOnly} onChange={e => { setTitle(e.target.value); markDirty() }} /></label><label>说明<input value={description} disabled={readOnly} onChange={e => { setDescription(e.target.value); markDirty() }} /></label><label>权威级别<select value={authority} disabled={readOnly} onChange={e => { setAuthority(e.target.value as SkillDraft['authority']); markDirty() }}><option value="province">省级</option><option value="group">集团</option><option value="miit">部级</option></select></label></div><div className="gate-notice"><span>创建于 {format(skill.createdAt)} · 更新于 {format(skill.updatedAt)}</span></div><GateChecks value={gate.data} error={gate.error} /></section> : tab === 'versions' ? <Versions api={api} skill={skill} initialReleaseId={initialReleaseId} onChanged={onChanged} onNotice={onNotice} /> : <>
      {candidate ? <section className="review-section" aria-label="候选差异审查"><header className="review-head"><div><small>逐项审查 · 草稿尚未改变</small><h2>候选差异审查</h2></div><span>已选 {chosen.length} / {candidate.changes.length}</span></header>{candidate.changes.map((change: AnyRecord, i: number) => <article className="review-row" key={i}><div className="review-scope"><strong>{change.path}</strong><p>{change.reason}</p></div><div className="diff-block before"><small>当前草稿</small><pre>{change.before}</pre></div><div className="diff-block after"><small>候选内容</small><pre>{change.after}</pre></div><Action aria-pressed={chosen.includes(i)} onClick={() => setChosen(current => current.includes(i) ? current.filter(n => n !== i) : [...current, i])}>{chosen.includes(i) ? '已包含' : '不包含'}</Action></article>)}<div className="gate-editor-actions"><Action onClick={() => setCandidate(undefined)}>放弃候选</Action><Action primary onClick={applyCandidate} disabled={dirty || apply.busy || !chosen.length || readOnly}>应用所选差异</Action></div></section> : null}
      <div className="editor-wrap"><div className="editor-shell"><aside className="file-rail"><section className="rail-section"><div className="rail-heading"><h2>来源节点</h2><span>{nodes.length}</span></div>{nodes.length ? <SourceNodeTree nodes={nodes.map(node => ({ id: String(node.id), title: String(node.title), parentId: node.parentId }))} activeId={activeFile === '@source' ? nodeId : ''} lockedId={sourceDirty ? nodeId : undefined} onSelect={node => { setNodeId(node.id); if (!sourceDirty) setNodeTitle(node.title); selectFile('@source') }} /> : <div className="rail-empty">{source.error || '尚未导入来源节点'}</div>}</section><section className="rail-section"><div className="rail-heading"><h2>原生包视图</h2><span>{fileNames.length}</span></div><ul className="rail-list is-scrollable">{fileNames.map(file => <li key={file}><button type="button" className="file-button" aria-pressed={activeFile === file} onClick={() => selectFile(file)}><span className="rail-index">{file.endsWith('.md') ? 'MD' : 'YM'}</span><span className="rail-text">{file}</span></button></li>)}</ul></section></aside>
      <div className="editor-pane"><header className="editor-toolbar"><div className="editor-file"><strong>{activeFile === '@source' ? '来源思维导图' : activeFile}</strong><small>同一工作草稿 · 原生文件内容完整保留</small></div><div className="editor-toolbar-actions">{activeFile.endsWith('.md') ? <Action onClick={() => setShowPreview(v => !v)}>{showPreview ? '返回编辑' : '预览正文'}</Action> : structuredFile ? <Action onClick={() => setRawFile(v => !v)}>{rawFile ? '返回结构化视图' : '高级原始文件'}</Action> : null}<Action onClick={() => setShowDiff(v => !v)}>{showDiff ? '收起差异' : '查看包差异'}</Action></div></header>
      <div className="editor-work"><div className="document-surface"><div className="document-ruler"><span>{dirty ? '草稿未保存' : '原生文件 · UTF-8'}</span><span>{(files[activeFile] || '').length} 字符</span></div>{activeFile === '@source' ? <div className="source-editor"><h2>编辑来源节点</h2><label>节点标题<input value={nodeTitle} onChange={e => { setNodeTitle(e.target.value); setSourceDirty(true) }} disabled={readOnly} /></label><Action disabled={updateSource.busy || readOnly || !nodeTitle.trim()} onClick={async () => { try { await updateSource.run({ mindmapId: sourceId, nodeId, title: nodeTitle }); setSourceDirty(false); onNotice('来源节点已保存；生成候选后可审查包内容变更') } catch (e) { onNotice(safeError(e)) } }}>保存来源节点</Action><p>来源保存不会自动覆盖原生包。生成并审查候选后，才能应用到工作草稿。</p><Action primary disabled={dirty || sourceDirty || readOnly || generate.busy} onClick={generateCandidate}>{generate.busy ? '模型生成中…' : '生成候选差异'}</Action></div> : showPreview && activeFile.endsWith('.md') ? <MarkdownPreview source={files[activeFile] || ''} /> : !rawFile && activeFile === 'manifest.yaml' ? <ManifestView source={files[activeFile] || ''} readOnly={readOnly} onChange={updateFile} onOpenRaw={() => setRawFile(true)} /> : !rawFile && activeFile === 'rules/decision-tree.yaml' ? <DecisionTreeView source={files[activeFile] || ''} readOnly={readOnly} onChange={updateFile} onOpenRaw={() => setRawFile(true)} /> : <textarea className={`document-editor ${activeFile.endsWith('.md') ? '' : 'mono-editor'}`} aria-label={`${activeFile} 编辑器`} spellCheck={false} readOnly={readOnly} value={files[activeFile] || ''} onChange={e => updateFile(e.target.value)} />}</div><aside className="source-notes"><h3>来源映射</h3>{nodes.length ? nodes.filter(node => files[activeFile]?.includes(node.title)).slice(0, 12).map(node => <div className="source-note" key={node.id}><b>{node.title}</b><span>{node.id}</span></div>) : <div className="source-note"><b>无关联来源</b><span>直接编辑原生文件；导入 XMind 后可以查看来源节点。</span></div>}<div className="source-note"><b>修改边界</b><span>仅保存显式编辑的文件。无法安全可视化的 YAML 保留原文，可在高级包文件中修复。</span></div></aside></div><footer className="editor-foot"><span>{dirty ? '有未保存修改' : '工作草稿已同步'}</span><span>{activeFile} · {files[activeFile]?.split('\n').length || 0} 行</span></footer></div></div></div>
      {showDiff ? <section className="review-section"><header className="review-head"><h2>当前草稿与最近发布版本</h2></header>{diff.error ? <p role="alert">{diff.error}</p> : fileNames.map(file => <article className="review-row" key={file}><strong>{file}</strong><div className="diff-block before"><small>最近发布</small><pre>{diff.data.release?.files?.[file] || '无历史内容'}</pre></div><div className="diff-block after"><small>当前草稿</small><pre>{files[file]}</pre></div></article>)}</section> : null}
    </>}
    <section className="validation"><header className="validation-head"><div className="validation-title"><h2>包校验与发布</h2><span>{validationResult?.status === 'passed' ? '结构通过' : '等待校验'}</span></div><div className="gate-editor-actions"><Action primary disabled={!dirty || readOnly || save.busy} onClick={saveDraft}>保存草稿</Action><Action disabled={dirty || readOnly} onClick={validate}>运行校验</Action><Action disabled={dirty || readOnly || publish.busy || gate.data.status !== 'ready'} onClick={() => void release()}>发布</Action><Action disabled={dirty || readOnly || publish.busy} onClick={() => setShowException(v => !v)}>例外发布</Action><Action disabled={dirty || copyBusy} onClick={onCopy}>复制</Action><Action disabled={dirty || readOnly || archiveBusy} onClick={onArchive}>归档</Action><Action disabled={dirty || deleteBusy} onClick={onDelete}>删除</Action></div></header>{save.error ? <p className="gate-notice error" role="alert">{save.error}</p> : null}<GateChecks value={gate.data} error={gate.error} />{validationResult?.errors?.map((error: AnyRecord, i: number) => <div className="validation-error" key={i}><div><span className="error-code">{error.path} · {error.code}</span><h3>{error.message}</h3></div><Action onClick={() => { setTab('edit'); setActiveFile(error.path.split('#')[0]) }}>定位文件</Action></div>)}{showException ? <div className="sm-exception-panel"><label>例外原因<input value={exceptionReason} onChange={e => setExceptionReason(e.target.value)} /></label><Action disabled={publish.busy || !exceptionReason.trim()} onClick={() => void release(true)}>按所填原因例外发布</Action></div> : null}</section>
  </section>
}

function GateChecks({ value, error }: { value: AnyRecord; error?: string }) {
  if (error) return <p className="gate-notice error" role="alert">{error}</p>
  const checks = value.checks || {}
  return <div className="validation-grid"><div className="validation-item"><small>原生包结构</small><strong>{checks.validation?.status === 'passed' ? '通过' : '待修复或校验'}</strong><p>三个原生文件与字段契约</p></div><div className="validation-item"><small>测评证据</small><strong>{checks.evaluation?.evaluationId || '没有可用批次'}</strong><p>只认当前包哈希的有效测评</p></div><div className="validation-item"><small>发布门禁</small><strong>{value.status === 'ready' ? '全部通过' : '尚未通过'}</strong><p>需满足准确率、标注量、生产对齐和场景回归</p></div></div>
}

export function Versions({ api, skill, initialReleaseId, onChanged, onNotice }: Pick<Props, 'api' | 'skill' | 'initialReleaseId' | 'onChanged' | 'onNotice'>) {
  const versions = useRemoteQuery<AnyRecord>(api, 'releaseList', [skill.skillId], { releases: [] })
  const runtime = useRemoteQuery<AnyRecord>(api, 'runtimeStatus', [skill.skillId], {})
  const [selected, setSelected] = useState(initialReleaseId || '')
  const [compareId, setCompareId] = useState('')
  const [confirm, setConfirm] = useState<{ releaseId: string; version: string }>()
  useEffect(() => { setSelected(initialReleaseId || ''); setCompareId(''); setConfirm(undefined) }, [skill.skillId, initialReleaseId])
  const detail = useRemoteQuery<AnyRecord>(api, 'releaseGet', [selected], {}, Boolean(selected))
  const comparison = useRemoteQuery<AnyRecord>(api, 'releaseGet', [compareId], {}, Boolean(compareId))
  const rollback = useMutation(api, 'releaseRollback', () => { versions.reload(); runtime.reload(); detail.reload(); onChanged() })
  useEffect(() => { if (!selected && versions.data.releases[0]) setSelected(versions.data.releases[0].releaseId) }, [versions.data.releases, selected])
  const selectedExists = versions.data.releases.some((item: AnyRecord) => item.releaseId === selected)
  const detailReady = selectedExists && !detail.loading && !detail.error && detail.data.release?.releaseId === selected
  const release = detailReady ? detail.data.release : undefined
  const comparedRelease = !comparison.loading && !comparison.error && comparison.data.release?.releaseId === compareId ? comparison.data.release : undefined
  const runtimeRelease = !runtime.loading && !runtime.error ? [...(runtime.data.releases || []), ...(runtime.data.versions || [])].find(item => item.releaseId === selected) : undefined
  const loadStatus = ({ loaded: '已加载', failed: '加载失败', unknown: '未知' } as Record<string, string>)[runtimeRelease?.loadStatus] || '未知'
  return <section className="gate-create">
    <header className="sm-card-heading"><div><h2>不可变发布版本</h2><p>回滚仅切换生效指针，当前草稿保持不变。</p></div><Action onClick={() => { versions.reload(); runtime.reload(); detail.reload() }}>刷新版本</Action></header>
    {versions.error || detail.error || runtime.error ? <p role="alert">{versions.error || detail.error || runtime.error}</p> : null}
    {!versions.loading && !versions.error && selected && !selectedExists ? <p className="gate-notice warning" role="alert">所选发布版本 {selected} 不属于当前 Skill 的版本列表；未跳转到其他版本，也未提供回滚动作。</p> : null}
    {!versions.data.releases.length ? <div className="gate-empty"><p>{versions.loading ? '正在读取发布版本…' : '还没有历史版本。完成有效测评并发布后，版本将在这里显示。'}</p></div> : <>
      <div className="sm-form-grid"><label>查看版本<select value={selected} disabled={rollback.busy} onChange={e => { setSelected(e.target.value); setConfirm(undefined) }}>{versions.data.releases.map((r: AnyRecord) => <option key={r.releaseId} value={r.releaseId}>{r.version} · {format(r.createdAt)}{r.exceptionReason ? ' · 例外' : ''}</option>)}</select></label><label>对比版本<select value={compareId} onChange={e => setCompareId(e.target.value)}><option value="">不对比</option>{versions.data.releases.map((r: AnyRecord) => <option key={r.releaseId} value={r.releaseId}>{r.version}</option>)}</select></label></div>
      {release ? <>
        <div className="gate-notice"><span>{detail.data.active ? '当前生效版本' : '历史只读版本'} · {release.contentHash} · 运行端加载：{loadStatus}</span></div>
        {Object.entries(release.files || {}).map(([file, content]) => <div className="review-row" key={file}><div><strong>{file}</strong><Action onClick={() => download(file.split('/').pop()!, String(content))}>下载文件</Action></div><div className="diff-block before"><pre>{String(content)}</pre></div>{compareId ? <div className="diff-block after"><pre>{comparedRelease?.files?.[file] || (comparison.error ? comparison.error : comparison.loading ? '正在读取对比版本…' : '无此文件')}</pre></div> : null}</div>)}
        <div className="gate-editor-actions"><Action disabled={detail.data.active || rollback.busy} onClick={() => setConfirm({ releaseId: release.releaseId, version: release.version })}>回滚到 {release.version}</Action></div>
        {confirm && confirm.releaseId === selected ? <div className="gate-notice warning"><div><strong>将此 Skill 的生效版本切换到 {confirm.version}</strong><p>引用该 Skill 的场景将在运行端重新加载后使用此版本；不会覆盖工作草稿。</p></div><Action disabled={rollback.busy} onClick={() => setConfirm(undefined)}>取消</Action><Action disabled={rollback.busy || !detailReady || detail.data.active} onClick={async () => { const target = confirm; try { const result = await rollback.run({ releaseId: target.releaseId }); setConfirm(undefined); onNotice(publicationNotice(result, '已切换生效版本，运行端加载状态等待确认')) } catch (e) { onNotice(safeError(e)) } }}>切换生效版本</Action></div> : null}
      </> : <p role="status">{detail.error ? '未能读取所选版本，刷新后再试。' : '正在读取所选版本…'}</p>}
    </>}
  </section>
}
