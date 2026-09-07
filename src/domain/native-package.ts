import { parseDocument, isMap, isScalar, isSeq } from 'yaml'

export function parsePackageDocument(source: string) {
  const document = parseDocument(source, { uniqueKeys: true, prettyErrors: false, strict: true })
  if (document.errors.length) throw new Error(document.errors.map(error => error.message).join('；'))
  if (!isMap(document.contents)) throw new Error('文件根对象必须是 YAML 映射。')
  // Limit alias expansion; uploaded YAML is untrusted input.
  document.toJS({ maxAliasCount: 50 })
  return document
}

export function readPackageYaml(source: string): Record<string, unknown> {
  return parsePackageDocument(source).toJS({ maxAliasCount: 50 }) as Record<string, unknown>
}

/** Change one supported field in the YAML AST, preserving all other keys/comments. */
export function updatePackageYaml(source: string, path: (string | number)[], value: unknown): string {
  const document = parsePackageDocument(source)
  const existing = document.getIn(path, true)
  if (existing && !isScalar(existing) && !isSeq(existing)) throw new Error('该字段包含复杂结构，请在原始文件中编辑。')
  if (isScalar(existing) && (value === null || ['string', 'number', 'boolean'].includes(typeof value))) existing.value = value
  else document.setIn(path, value)
  return String(document)
}

export function inspectNativeYaml(files: Record<string, string>): { path: string; code: string; message: string }[] {
  const errors: { path: string; code: string; message: string }[] = []
  for (const path of ['manifest.yaml', 'rules/decision-tree.yaml']) {
    if (!files[path]?.trim()) continue
    let value: Record<string, unknown>
    try { value = readPackageYaml(files[path]) }
    catch (error) { errors.push({ path, code: 'skill/yaml-invalid', message: error instanceof Error ? error.message : 'YAML 无法解析。' }); continue }
    if (path === 'manifest.yaml') {
      for (const key of ['required_facts', 'outputs']) if (value[key] !== undefined && (!Array.isArray(value[key]) || (value[key] as unknown[]).some(item => typeof item !== 'string' || !item.trim()))) errors.push({ path, code: 'skill/manifest-field-invalid', message: `${key} 必须是非空字段名组成的数组。` })
      continue
    }
    if (typeof value.root !== 'string' || !value.root.trim()) errors.push({ path, code: 'skill/tree-root-invalid', message: '决策树必须声明 root 节点。' })
    // A root-only draft is editable. Once a node map exists, validate all declared edges.
    if (value.nodes === undefined) continue
    if (!value.nodes || typeof value.nodes !== 'object' || Array.isArray(value.nodes)) { errors.push({ path, code: 'skill/tree-nodes-invalid', message: 'nodes 必须是按节点 ID 索引的映射。' }); continue }
    const nodes = value.nodes as Record<string, unknown>
    const edges = new Map<string, string[]>()
    for (const [id, node] of Object.entries(nodes)) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) { errors.push({ path, code: 'skill/tree-node-invalid', message: `节点 ${id} 必须是映射。` }); continue }
      const record = node as Record<string, unknown>
      const targets: string[] = []
      if (typeof record.next === 'string') targets.push(record.next)
      if (Array.isArray(record.branches)) for (const branch of record.branches) if (branch && typeof branch === 'object' && typeof branch.next === 'string') targets.push(branch.next)
      edges.set(id, targets)
      for (const target of targets) if (!(target in nodes)) errors.push({ path, code: 'skill/tree-target-missing', message: `节点 ${id} 引用了不存在的 ${target}。` })
    }
    if (typeof value.root !== 'string' || !(value.root in nodes)) { errors.push({ path, code: 'skill/tree-root-missing', message: 'root 指向的节点不存在。' }); continue }
    const reached = new Set<string>(); const visiting = new Set<string>()
    const visit = (id: string) => {
      if (visiting.has(id)) { errors.push({ path, code: 'skill/tree-cycle', message: `节点 ${id} 存在循环路径。` }); return }
      if (reached.has(id)) return
      reached.add(id); visiting.add(id)
      for (const target of edges.get(id) || []) if (target in nodes) visit(target)
      visiting.delete(id)
    }
    visit(value.root)
    for (const id of Object.keys(nodes)) if (!reached.has(id)) errors.push({ path, code: 'skill/tree-unreachable', message: `节点 ${id} 从根节点不可达。` })
  }
  return errors
}
