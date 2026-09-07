import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createServiceClass } from '../src/host/service.js'
class Remote { constructor(public ctx: any) {} }
const Service = createServiceClass(Remote, Error)
let service: InstanceType<typeof Service>; let dir: string
let selection: any; let models: any[]; let requests: any[]
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sm-model-selection-')); selection = { provider: 'dsh', model: 'preferred', reasoningEffort: 'high' }; models = [{ id: 'first', name: 'First' }, { id: 'preferred', name: 'Preferred' }]; requests = []
  const llm = { listProviders: () => [{ id: 'dsh', name: 'DSH', apiKey: 'never-expose' }], listModels: async () => models, async *stream(request: any) { requests.push(request); yield { type: 'text-delta', text: '{"changes":[]}' }; yield { type: 'finish', reason: { kind: 'stop' } } } }
  const loader = { internal: { import: async () => ({ createUserMessage: (v: unknown) => v }) } }
  service = new Service({ get: (key: string) => ({ llm, loader, agentDefaultModel: { currentSelection: () => selection } })[key] }, { dataDir: dir, otlpPort: false, provider: 'legacy', model: 'old' }, DatabaseSync)
  await service.start()
})
afterEach(async () => { service.dispose(); await rm(dir, { recursive: true, force: true }) })
it('reads the live DSH default and a public catalog without copying credentials', async () => {
  const first = await service.settingsGet()
  expect(first.models.selection).toEqual(selection)
  expect(first.models.source).toBe('dsh-default')
  expect(JSON.stringify(first.models)).not.toContain('never-expose')
  selection = { provider: 'dsh', model: 'first' }
  expect((await service.settingsGet()).models.selection).toEqual(selection)
  expect((await service.settingsGet()).settings.modelSelection).toBeUndefined()
})
it('uses one DSH model route for generation, probe and new evaluations; freezes old batches', async () => {
  const { skill } = await service.skillCreate('skill', { title: 'Model test', sourceInput: { kind: 'text', text: 'Return OK' } })
  const { evaluation } = await service.evaluationCreate('batch', { skillId: skill.skillId, cases: [{ input: {} }] })
  expect(evaluation.executionProfile).toMatchObject(selection)
  await service.mindmapGenerateCandidate('generate', { skillId: skill.skillId, mindmapId: skill.source.mindmapId })
  await service.probeModel()
  expect(requests.map(request => request.model)).toEqual(['preferred', 'preferred'])
  await service.settingsSave('choose', { modelSelection: { mode: 'selected', provider: 'dsh', model: 'first' } })
  selection = { provider: 'dsh', model: 'changed-default' }
  expect((await service.settingsGet()).models.selection.model).toBe('first')
  const next = await service.evaluationCreate('next', { skillId: skill.skillId, cases: [{ input: {} }] })
  expect(next.evaluation.executionProfile.model).toBe('first')
  const old = await service.evaluationGet(evaluation.evaluationId)
  expect(old.evaluation.executionProfile.model).toBe('preferred')
  await service.settingsSave('follow', { modelSelection: { mode: 'dsh-default' } })
  expect((await service.settingsGet()).models.selection.model).toBe('changed-default')
})
it('rejects stale catalog selections and does not save unrelated fields on validation failure', async () => {
  await expect(service.settingsSave('bad', { traceRetentionDays: 7, modelSelection: { mode: 'selected', provider: 'dsh', model: 'missing' } })).rejects.toThrow('模型列表')
  expect((await service.settingsGet()).settings.traceRetentionDays).toBe(30)
  models = []
  await expect(service.settingsSave('removed', { modelSelection: { mode: 'selected', provider: 'dsh', model: 'preferred' } })).rejects.toThrow('模型列表')
  await service.settingsSave('follow', { modelSelection: { mode: 'dsh-default' } })
  selection = undefined
  const settings = await service.settingsGet()
  expect(settings.models.status).toBe('missing-config')
  expect(settings.models.selection).toBeUndefined()
  expect((await service.probeModel()).status).toBe('missing-config')
})
