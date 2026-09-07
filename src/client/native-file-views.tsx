import React, { useState } from 'react'
import { parsePackageDocument, readPackageYaml, updatePackageYaml } from '../domain/native-package.js'

type FileViewProps = { source: string; onChange: (source: string) => void; readOnly?: boolean; onOpenRaw: () => void }
type RecordValue = Record<string, unknown>
const isRecord = (value: unknown): value is RecordValue => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const scalar = (value: unknown) => value === undefined || value === null || ['string', 'number', 'boolean'].includes(typeof value)
const display = (value: unknown) => value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
const errorText = (error: unknown) => error instanceof Error ? error.message : '无法更新文件，请检查原始 YAML。'
function read(source: string): { value?: RecordValue; error?: string } {
  try { return { value: readPackageYaml(source) } } catch (error) { return { error: errorText(error) } }
}
function RawNotice({ children, onOpenRaw }: { children: React.ReactNode; onOpenRaw: () => void }) {
  return <div className="native-file-notice"><p>{children}</p><button type="button" className="gate-button sm-button sm-button-secondary" onClick={onOpenRaw}>打开高级原始文件</button></div>
}

/** Lists are edited by AST item path, so comments on unaffected items survive. */
export function ManifestView({ source, onChange, readOnly, onOpenRaw }: FileViewProps) {
  const { value, error } = read(source)
  const [editError, setEditError] = useState('')
  const write = (path: (string | number)[], next: unknown) => {
    try { onChange(updatePackageYaml(source, path, next)); setEditError('') } catch (error) { setEditError(errorText(error)) }
  }
  const remove = (key: string, index: number) => {
    try { const document = parsePackageDocument(source); document.deleteIn([key, index]); onChange(String(document)); setEditError('') } catch (error) { setEditError(errorText(error)) }
  }
  if (!value) return <RawNotice onOpenRaw={onOpenRaw}>{error} 文件尚未改动，请在高级原始文件中修复 YAML。</RawNotice>
  return <section className="native-file-view manifest-view" aria-label="Manifest 表单">
    <header className="native-view-heading"><h2>包声明</h2><p>表单与 manifest.yaml 使用同一份内容；未列出的字段和注释保留。</p></header>
    <div className="native-field-grid">{(['id', 'name', 'authority'] as const).map(key => <label key={key}>{key}<input aria-label={`Manifest ${key}`} value={display(value[key])} readOnly={readOnly || !scalar(value[key])} onChange={event => write([key], event.target.value)} />{!scalar(value[key]) ? <small>复杂结构只读，请使用高级原始文件。</small> : null}</label>)}</div>
    {(['required_facts', 'outputs'] as const).map(key => {
      const items = value[key]
      const supported = items === undefined || (Array.isArray(items) && items.every(item => typeof item === 'string'))
      return <section className="native-list-field" key={key} aria-label={key}><header><h3>{key === 'required_facts' ? '所需事实' : '输出字段'} <code>{key}</code></h3>{supported ? <button type="button" className="gate-button sm-button sm-button-secondary" disabled={readOnly} onClick={() => write(items === undefined ? [key] : [key, items.length], items === undefined ? [''] : '')}>{key === 'required_facts' ? '添加所需事实' : '添加输出字段'}</button> : null}</header>{supported ? <>{(Array.isArray(items) ? items : []).map((item, index) => <div className="native-list-item" key={index}><input aria-label={`${key} ${index + 1}`} value={item} readOnly={readOnly} onChange={event => write([key, index], event.target.value)} /><button type="button" className="gate-button sm-button sm-button-secondary" disabled={readOnly} aria-label={`移除 ${key} ${index + 1}`} onClick={() => remove(key, index)}>移除</button></div>)}{!Array.isArray(items) || !items.length ? <p className="native-field-hint">尚未声明字段。添加后会写入当前原生文件。</p> : null}</> : <RawNotice onOpenRaw={onOpenRaw}>该字段不是受支持的字符串列表，已保留原始结构，不可通过表单覆盖。</RawNotice>}</section>
    })}
    {editError ? <p className="native-file-error" role="alert">{editError}</p> : null}
  </section>
}

type TreeRow = { id: string; depth: number; reference?: boolean; missing?: boolean; disconnected?: boolean }
/** Reflect declared next/branch.next edges; never invent connections for unreachable nodes. */
export function decisionRows(root: unknown, nodes: RecordValue): TreeRow[] {
  const rows: TreeRow[] = [], visited = new Set<string>()
  const visit = (id: string, depth: number, disconnected = false) => {
    const missing = !Object.hasOwn(nodes, id), reference = visited.has(id)
    rows.push({ id, depth, missing, reference, disconnected })
    if (missing || reference) return
    visited.add(id)
    const node = nodes[id]
    if (!isRecord(node)) return
    if (typeof node.next === 'string' && node.next) visit(node.next, depth + 1)
    if (Array.isArray(node.branches)) for (const branch of node.branches) if (isRecord(branch) && typeof branch.next === 'string' && branch.next) visit(branch.next, depth + 1)
  }
  if (typeof root === 'string' && root) visit(root, 0)
  for (const id of Object.keys(nodes)) if (!visited.has(id)) visit(id, 0, true)
  return rows
}

/** Visual editing supports plain arithmetic/comparisons only, and never evaluates code. */
export function isSimpleExpression(value: unknown): boolean {
  return typeof value === 'string' && !/[\[\]{},;"'`?:]/.test(value) && !/[A-Za-z_$][\w$]*\s*\(/.test(value) && /^[\w\s.+\-*/%()<>!=&|]*$/.test(value)
}

export function DecisionTreeView({ source, onChange, readOnly, onOpenRaw }: FileViewProps) {
  const { value, error } = read(source)
  const [selected, setSelected] = useState('')
  const [editError, setEditError] = useState('')
  if (!value) return <RawNotice onOpenRaw={onOpenRaw}>{error} 决策树原文已保留。</RawNotice>
  if (!isRecord(value.nodes)) return <RawNotice onOpenRaw={onOpenRaw}>当前文件未声明受支持的 root / nodes 映射。请在高级原始文件中补充节点，不会自动生成规则。</RawNotice>
  const nodes = value.nodes
  const rows = decisionRows(value.root, nodes)
  const selectedId = Object.hasOwn(nodes, selected) ? selected : typeof value.root === 'string' && Object.hasOwn(nodes, value.root) ? value.root : Object.keys(nodes)[0] || ''
  const node = nodes[selectedId]
  const write = (path: (string | number)[], next: unknown) => {
    try { onChange(updatePackageYaml(source, path, next)); setEditError('') } catch (error) { setEditError(errorText(error)) }
  }
  const field = (record: RecordValue, key: string, path: (string | number)[], label = key) => {
    const current = record[key]
    const supported = scalar(current) && (!['expression', 'when'].includes(key) || current === undefined || isSimpleExpression(current))
    return <label key={path.join('/')} className={key === 'expression' || key === 'when' ? 'native-field-wide' : ''}>{label}<input aria-label={label} value={display(current)} readOnly={readOnly || !supported} onChange={event => {
      const input = event.target.value
      if (typeof current === 'number') { if (input.trim() && Number.isFinite(Number(input))) write(path, Number(input)); else setEditError(`${label} 需要数值；如需改变字段类型，请使用高级原始文件。`) }
      else if (typeof current === 'boolean') { if (input === 'true' || input === 'false') write(path, input === 'true'); else setEditError(`${label} 需要 true 或 false。`) }
      else write(path, input)
    }} />{!supported ? <small>复杂表达式或结构只读；可切换高级原始文件编辑。</small> : null}</label>
  }
  return <section className="native-file-view decision-view" aria-label="决策树可视化">
    <header className="native-view-heading"><h2>决策树</h2><p>按 root、next 与分支引用展示真实路径。这里只编辑声明，不执行表达式。</p></header>
    <div className="native-root-field">{field(value, 'root', ['root'], '根节点 root')}</div>
    <div className="native-tree-workspace"><nav className="native-tree-outline" aria-label="决策路径"><ul>{rows.map((row, index) => <li key={`${row.id}-${index}`} style={{ '--native-depth': Math.min(row.depth, 12) } as React.CSSProperties} data-depth={row.depth}><button type="button" className="file-button" aria-pressed={row.id === selectedId} disabled={row.missing} onClick={() => setSelected(row.id)}><span aria-hidden="true">{row.depth ? '↳' : '◇'}</span><span>{row.id}<small>{row.missing ? '引用不存在' : row.reference ? '共享或循环引用' : row.disconnected ? '从根节点不可达' : row.depth === 0 ? '根节点' : '后继节点'}</small></span></button></li>)}</ul></nav>
    <section className="native-node-fields" aria-label={`节点 ${selectedId}`}><h3>{selectedId || '没有节点'}</h3>{isRecord(node) ? <><div className="native-field-grid">{['fact', 'equals', 'next', 'expression'].filter(key => Object.hasOwn(node, key) || ['fact', 'equals', 'next'].includes(key)).map(key => field(node, key, ['nodes', selectedId, key], `节点 ${key}`))}</div>{Object.hasOwn(node, 'branches') ? Array.isArray(node.branches) ? <section className="native-branches" aria-label="节点分支"><h3>分支</h3>{node.branches.map((branch, index) => <section className="native-branch" key={index}><h4>分支 {index + 1}</h4>{isRecord(branch) ? <><div className="native-field-grid">{['when', 'result', 'otherwise', 'next'].filter(key => Object.hasOwn(branch, key)).map(key => field(branch, key, ['nodes', selectedId, 'branches', index, key], `分支 ${index + 1} ${key}`))}</div>{Object.keys(branch).some(key => !['when', 'result', 'otherwise', 'next'].includes(key)) ? <RawNotice onOpenRaw={onOpenRaw}>包含未识别的分支字段，已原样保留；请在高级原始文件中查看和编辑。</RawNotice> : null}</> : <RawNotice onOpenRaw={onOpenRaw}>此分支不是受支持的映射，原文只读。</RawNotice>}</section>)}</section> : <RawNotice onOpenRaw={onOpenRaw}>branches 不是受支持的列表，已保留原始结构。</RawNotice> : null}{Object.keys(node).some(key => !['fact', 'equals', 'next', 'expression', 'branches'].includes(key)) ? <RawNotice onOpenRaw={onOpenRaw}>该节点包含未识别字段，已保留；高级原始文件中可查看完整规则。</RawNotice> : null}</> : <RawNotice onOpenRaw={onOpenRaw}>此节点不是受支持的映射，无法安全编辑。</RawNotice>}</section></div>
    {Object.keys(value).some(key => !['root', 'nodes'].includes(key)) ? <p className="native-field-hint">文件的其他顶层字段已保留，完整内容可在高级原始文件中查看。</p> : null}
    {editError ? <p className="native-file-error" role="alert">{editError}</p> : null}
  </section>
}

type SourceNode = { id: string; title: string; parentId?: string | null }
export function SourceNodeTree({ nodes, activeId, lockedId, onSelect }: { nodes: SourceNode[]; activeId: string; lockedId?: string; onSelect: (node: SourceNode) => void }) {
  const ids = new Set(nodes.map(node => node.id)), visited = new Set<string>()
  const children = (parent: string) => nodes.filter(node => node.parentId === parent)
  const renderNode = (node: SourceNode): React.ReactNode => {
    if (visited.has(node.id)) return null
    visited.add(node.id)
    const descendants = children(node.id)
    return <li key={node.id} data-source-node={node.id}><button type="button" className="file-button" aria-pressed={node.id === activeId} disabled={Boolean(lockedId && lockedId !== node.id)} onClick={() => onSelect(node)}><span className="rail-index">◇</span><span className="rail-text">{node.title}</span></button>{descendants.length ? <ul>{descendants.map(renderNode)}</ul> : null}</li>
  }
  const roots = nodes.filter(node => !node.parentId || !ids.has(node.parentId))
  const rootViews = roots.map(renderNode)
  const disconnected = nodes.filter(node => !visited.has(node.id))
  return <div className="source-tree is-scrollable"><ul className="rail-list">{rootViews}</ul>{disconnected.length ? <><p className="native-field-hint">以下节点存在循环或独立的来源关系</p><ul className="rail-list">{disconnected.map(renderNode)}</ul></> : null}</div>
}

function inlineMarkdown(text: string): React.ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part)
}
/** Small non-HTML Markdown renderer. Raw HTML and links remain escaped text. */
export function MarkdownPreview({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n'), blocks: React.ReactNode[] = []
  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    if (!line.trim()) { index++; continue }
    if (/^\s*```/.test(line)) {
      const code: string[] = []; index++
      while (index < lines.length && !/^\s*```/.test(lines[index])) code.push(lines[index++])
      if (index < lines.length) index++
      blocks.push(<pre key={`code-${index}`}><code>{code.join('\n')}</code></pre>); continue
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) { blocks.push(React.createElement(`h${heading[1].length}`, { key: index }, inlineMarkdown(heading[2]))); index++; continue }
    if (/^\s*(?:[-*+] |\d+\. )/.test(line)) {
      const ordered = /^\s*\d+\. /.test(line), items: React.ReactNode[] = [], pattern = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*+]\s+/
      while (index < lines.length && pattern.test(lines[index])) { items.push(<li key={index}>{inlineMarkdown(lines[index].replace(pattern, ''))}</li>); index++ }
      blocks.push(ordered ? <ol key={`list-${index}`}>{items}</ol> : <ul key={`list-${index}`}>{items}</ul>); continue
    }
    blocks.push(<p key={index}>{inlineMarkdown(line)}</p>); index++
  }
  return <article className="document-preview markdown-preview" aria-label="SKILL.md 正文预览">{blocks}</article>
}
