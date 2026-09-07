// Mind Elixir 5 ships extensionless declaration exports; keep the persisted tree face explicit.
export type MindMapNode = { id: string; topic: string; root?: boolean; children?: MindMapNode[] }
export type MindMapData = { nodeData: MindMapNode; direction?: number }
export type SourceNode = { id: string; parentId?: string | null; title: string; [key: string]: unknown }

/** Keep source identities and provenance when the editor moves, renames or deletes nodes. */
export function sourceToMindMap(nodes: SourceNode[]): MindMapData {
  const build = (node: SourceNode): MindMapNode => ({ id: node.id, topic: node.title, children: nodes.filter(child => child.parentId === node.id).map(build) })
  const root = nodes.find(node => !node.parentId)
  if (!root) throw new Error('来源缺少根节点。')
  return { nodeData: { ...build(root), root: true }, direction: 1 }
}
export function mindMapToSource(data: MindMapData, previous: SourceNode[]): SourceNode[] {
  const byId = new Map(previous.map(node => [node.id, node]))
  const result: SourceNode[] = []
  const visit = (node: MindMapNode, parentId: string | null) => {
    const old = byId.get(node.id)
    result.push({ ...old, id: node.id, title: node.topic, parentId: parentId ?? old?.parentId ?? null })
    node.children?.forEach(child => visit(child, node.id))
  }
  visit(data.nodeData, null)
  return result
}
