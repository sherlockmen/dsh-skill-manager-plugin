import { isRecord, redact } from '../contracts/index.js'

type Route = { provider: string; model: string; reasoningEffort?: string }
export type ModelPreference = { mode: 'dsh-default' } | ({ mode: 'selected' } & Route)
type Host = { ctx: { get: (key: string) => any }; config: Record<string, any>; managerDb: any }
function route(value: unknown): Route | undefined {
  if (!isRecord(value) || typeof value.provider !== 'string' || !value.provider.trim() || typeof value.model !== 'string' || !value.model.trim()) return undefined
  return { provider: value.provider, model: value.model, ...(typeof value.reasoningEffort === 'string' ? { reasoningEffort: value.reasoningEffort } : {}) }
}
export function readModelPreference(host: Host): ModelPreference | undefined {
  const row = host.managerDb.prepare("SELECT value_json FROM settings WHERE key = 'modelSelection'").get()
  return row ? JSON.parse(row.value_json) : undefined
}
/** Reads DSH's live service; never copies provider credentials or settings documents. */
export function currentModelSelection(host: Host) {
  const preference = readModelPreference(host)
  if (preference?.mode === 'selected') return { source: 'selected', preference, selection: route(preference) }
  const dsh = route(host.ctx.get('agentDefaultModel')?.currentSelection?.())
  if (dsh) return { source: 'dsh-default', preference: { mode: 'dsh-default' } as ModelPreference, selection: dsh }
  // Preserve explicitly configured older deployments until the user chooses DSH.
  // Never guess a model by taking the first catalog entry.
  const legacy = !preference ? route({ ...host.config.productionProfile, ...(host.config.provider ? { provider: host.config.provider } : {}), ...(host.config.model ? { model: host.config.model } : {}) }) : undefined
  return { source: legacy ? 'legacy' : 'dsh-default', preference: preference ?? { mode: 'dsh-default' } as ModelPreference, selection: legacy }
}
export async function modelSettingsSnapshot(host: Host) {
  let current: ReturnType<typeof currentModelSelection>
  try { current = currentModelSelection(host) } catch { return { status: 'failure', message: '读取 DSH 默认模型失败，请检查 DSH 模型设置。', providers: [] } }
  const llm = host.ctx.get('llm')
  if (!llm?.listProviders) return { ...current, status: 'missing-config', message: 'DSH 模型服务尚未就绪，请返回 DSH 配置模型。', providers: [] }
  try {
    const providers = await Promise.all(llm.listProviders().map(async (provider: any) => {
      try {
        const models = await llm.listModels(provider.id)
        return { id: provider.id, name: provider.name || provider.id, models: models.map((model: any) => ({ id: model.id, name: model.name || model.id })) }
      } catch { return { id: provider.id, name: provider.name || provider.id, models: [], error: '模型列表读取失败，请刷新或检查 DSH 配置。' } }
    }))
    const registered = current.selection && providers.some(provider => provider.id === current.selection?.provider)
    return { ...current, providers, status: registered ? 'ready' : 'missing-config', ...(!registered ? { message: current.selection ? '当前模型的 Provider 已不可用，请在 DSH 中修复或重新选择。' : 'DSH 尚未提供默认模型，请在 DSH 中设置默认模型，或从下方列表选择。' } : {}) }
  } catch (error) { return { ...current, status: 'failure', message: redact(error instanceof Error ? error.message : '读取 DSH 模型列表失败。'), providers: [] } }
}
export async function validateModelPreference(host: Host, value: unknown): Promise<ModelPreference> {
  if (isRecord(value) && value.mode === 'dsh-default') return { mode: 'dsh-default' }
  const selected = route(value)
  if (!isRecord(value) || value.mode !== 'selected' || !selected) throw new Error('请选择 DSH 默认模型或已注册的模型。')
  const llm = host.ctx.get('llm')
  if (!llm?.listProviders?.().some((provider: any) => provider.id === selected.provider)) throw new Error('所选 Provider 已不在 DSH 中，请刷新模型列表。')
  const models = await llm.listModels(selected.provider)
  if (!models.some((model: any) => model.id === selected.model)) throw new Error('所选模型已不在 DSH 模型列表中，请刷新后重新选择。')
  return { mode: 'selected', provider: selected.provider, model: selected.model }
}
export function resolveModelRoute(host: Host, frozen: unknown): Route | undefined {
  // A frozen evaluation must never silently switch model when settings change.
  if (isRecord(frozen) && (frozen.provider !== undefined || frozen.model !== undefined)) {
    const explicit = route(frozen)
    if (!explicit) throw new Error('测评执行配置需要完整的 Provider 和模型。')
    return explicit
  }
  return currentModelSelection(host).selection
}
