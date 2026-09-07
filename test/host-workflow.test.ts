import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServiceClass } from '../src/host/service.js'
import { createSkillArchiveSample, createTraceFixture, createXmindSample } from '../src/host/phase0.js'
import { normalizeConfig } from '../src/host/service.js'

class FakeRemoteService { constructor(public readonly ctx: any, public readonly name: string) {} }
class FakeRemoteError extends Error { code: string; details: unknown; constructor(code: string, message: string, details: unknown) { super(message); this.code = code; this.details = details } }

const Service = createServiceClass(FakeRemoteService, FakeRemoteError)

describe('Host v1 workflow', () => {
  let dataDir = ''
  let service: InstanceType<typeof Service>

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'skill-manager-test-'))
    const llm = {
      listProviders: () => [{ id: 'test-provider', name: 'Test provider' }],
      listModels: async () => [{ id: 'test-model', name: 'Test model' }],
      async *stream() {
        yield { type: 'text-delta', text: '{"ok":true}' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
    service = new Service({ get: (key: string) => key === 'llm' ? llm : undefined }, {
      dataDir,
      otlpPort: false,
      provider: 'test-provider',
      model: 'test-model',
      productionProfile: { provider: 'test-provider', model: 'test-model' },
    }, DatabaseSync)
    await service.start()
  })

  afterEach(async () => {
    service.dispose()
    await rm(dataDir, { recursive: true, force: true })
  })

  it('persists a Skill, imports XMind semantics, and replays mutations idempotently', async () => {
    const created = await service.skillCreate('create-1', { title: '报表判断' })
    expect(created.skill.skillId).toMatch(/^skill_/)
    expect((await service.skillCreate('create-1', { title: 'ignored' })).replayed).toBe(true)
    const xmind = await service.skillImport('import-1', { input: (await service.xmindSample()).base64 })
    expect(xmind.skill.source.kind).toBe('xmind')
    expect((await service.mindmapList()).mindmaps.length).toBe(1)
    expect((await service.dashboardGet()).counts.activeSkills).toBe(2)
  })

  it('imports a native Skill ZIP and keeps optional reference files', async () => {
    const archive = createSkillArchiveSample()
    const imported = await service.skillImport('native-archive-1', { input: archive.toString('base64'), title: 'Native archive' })
    expect(imported.skill.source.kind).toBe('archive')
    expect(imported.skill.files['SKILL.md']).toContain('Invoice triage')
    expect(imported.skill.files['references/README.md']).toContain('Reference material')
    expect((await service.skillValidate(imported.skill.skillId)).validation.status).toBe('passed')
  })

  it('serializes concurrent operation ids and persists non-default authority', async () => {
    const [first, second] = await Promise.all([service.storageCheck('same-operation'), service.storageCheck('same-operation')])
    expect([first.replayed, second.replayed].sort()).toEqual([false, true])
    const created = await service.skillCreate('authority-create', { title: '部级规则', authority: 'miit' })
    const saved = await service.skillSave('authority-save', { skillId: created.skill.skillId, expectedHash: created.skill.contentHash, patch: { authority: 'group' } })
    expect(saved.skill.authority).toBe('group')
    expect(normalizeConfig({ dataDir, otlpPort: 'false' }).otlpPort).toBe(false)
  })

  it('runs a background evaluation, enforces publish readiness, and writes an immutable runtime version', async () => {
    const { skill } = await service.skillCreate('create-2', { title: '可发布 Skill', files: { 'SKILL.md': '# Skill', 'manifest.yaml': 'required_facts: []', 'rules/decision-tree.yaml': 'root: start' } })
    await service.scenarioCreate('scenario-1', {
      scenarioId: 'scenario-1', name: '省级报表场景', region: 'province', status: 'active', skillIds: [skill.skillId],
      samples: [{ sampleId: 'sample-1', filename: 'report.json', headers: ['a'], rows: [{ a: 1 }], sourceRegions: [], createdAt: new Date().toISOString() }],
      rules: [{ ruleId: 'rule-1', version: 1, region: 'province', scenarioId: 'scenario-1', canonicalFields: ['a'], requiredFacts: ['a'], layouts: [{ layoutId: 'layout-1', headers: ['a'], mapping: { a: 'a' } }], status: 'published', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    })
    const created = await service.evaluationCreate('eval-1', { scenarioId: 'scenario-1', skillId: skill.skillId, executionProfile: { provider: 'test-provider', model: 'test-model' }, cases: [{ caseId: 'case-1', input: { a: 1 }, expected: { ok: true }, actual: { ok: true } }] })
    const queued = await service.evaluationRun('run-1', { evaluationId: created.evaluation.evaluationId })
    expect(queued.status).toBe('queued')
    await expect.poll(async () => (await service.jobGet(queued.job.jobId)).job.status, { timeout: 3000, interval: 10 }).toBe('completed')
    const evaluation = (await service.evaluationGet(created.evaluation.evaluationId)).evaluation
    expect(evaluation.status).toBe('completed')
    expect(evaluation.cases[0].grade).toBeUndefined()
    expect(evaluation.cases[0].comparison.status).toBe('match')
    expect(evaluation.accuracy.denominator).toBe(0)
    expect((await service.releaseCheck(skill.skillId)).status).toBe('blocked')
    await service.evaluationAnnotate('human-label', { evaluationId: created.evaluation.evaluationId, caseId: 'case-1', grade: 'correct' })
    expect((await service.releaseCheck(skill.skillId)).status).toBe('ready')
    const published = await service.releasePublish('publish-1', { skillId: skill.skillId })
    expect(published.release.version).toBe('v1')
    expect((await service.runtimeStatus(skill.skillId)).releases[0].version).toBe('v1')
    expect((await service.releaseList(skill.skillId)).releases).toHaveLength(1)
    expect((await service.runtimeStatus(skill.skillId)).notifications.pending).toBe(1)
    expect((await service.settingsHealth()).notifications.pending).toBe(1)
  })

  it('keeps traces idempotent, protects complete traces, and creates paired backups', async () => {
    const fixture = createTraceFixture()
    const first = await service.traceIngest('trace-1', fixture)
    expect(first.accepted).toBe(3)
    expect((await service.traceIngest('trace-1', fixture)).replayed).toBe(true)
    const trace = (await service.traceList({})).traces[0]
    expect(trace.spanCount).toBe(3)
    await service.traceProtect('protect-1', { traceId: trace.traceId })
    await expect(service.traceClear('clear-1', { traceId: trace.traceId })).rejects.toMatchObject({ code: 'trace/protected' })
    expect((await service.settingsBackup('backup-1', {})).files).toEqual(['manager.sqlite', 'runtime.sqlite'])
  })

  it('returns trace pages newest-first and requires confirmation before restore', async () => {
    await service.traceIngest('trace-page-1', createTraceFixture())
    const second = createTraceFixture() as any
    for (const span of second.resourceSpans[0].scopeSpans[0].spans) {
      span.traceId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      const event = span.attributes.find((item: any) => item.key === 'event_id')
      if (event) event.value.stringValue = `second-${event.value.stringValue}`
    }
    await service.traceIngest('trace-page-2', second)
    const listed = await service.traceList({ limit: 1 })
    expect(listed.traces).toHaveLength(1)
    expect(typeof listed.nextCursor).toBe('string')
    const next = await service.traceList({ limit: 1, cursor: listed.nextCursor })
    expect(next.traces).toHaveLength(1)
    expect(next.nextCursor).toBeUndefined()
    const backup = await service.settingsBackup('backup-restore', {})
    const pending = await service.settingsRestore('restore-preview', { backupId: backup.backupId })
    expect(pending.status).toBe('confirmation-required')
    const restored = await service.settingsRestore('restore-confirm', { backupId: backup.backupId, confirm: true })
    expect(restored.status).toBe('restored')
  })

  it('persists real epoch-nanosecond OTLP timestamps and exposes wire-safe values', async () => {
    const started = BigInt(Date.now()) * 1_000_000n
    const payload = { spans: [{ traceId: 'cccccccccccccccccccccccccccccccc', spanId: '4444444444444444', name: 'production.skill', startTimeUnixNano: started.toString(), endTimeUnixNano: (started + 12_000_000n).toString(), attributes: [{ key: 'trace.source', value: { stringValue: 'production' } }, { key: 'skill.id', value: { stringValue: 'skill-epoch' } }] }] }
    expect((await service.traceIngest('trace-epoch', payload)).accepted).toBe(1)
    const listed = (await service.traceList({ skillId: 'skill-epoch' })).traces[0]
    expect(listed.startTimeNs).toBe(started.toString())
    expect(listed.durationMs).toBe(12)
  })

  it('does not trust caller-supplied evaluation output or alignment claims', async () => {
    const { skill } = await service.skillCreate('untrusted-skill', { title: '不可伪造测评', files: { 'SKILL.md': '# Skill', 'manifest.yaml': 'required_facts: []', 'rules/decision-tree.yaml': 'root: start' } })
    const created = await service.evaluationCreate('untrusted-eval', {
      skillId: skill.skillId,
      productionAligned: true,
      executionProfile: { provider: 'test-provider', model: 'test-model' },
      cases: [{ caseId: 'case-1', input: { a: 1 }, expected: { ok: true }, actual: { ok: false }, grade: 'correct', systemError: { code: 'forged', message: 'forged' } }],
    })
    expect(created.evaluation.cases[0]).not.toHaveProperty('actual')
    expect(created.evaluation.cases[0]).not.toHaveProperty('grade')
    expect(created.evaluation.cases[0]).not.toHaveProperty('systemError')
    expect(created.evaluation.productionAligned).toBeUndefined()
    const queued = await service.evaluationRun('untrusted-run', { evaluationId: created.evaluation.evaluationId })
    expect(queued.status).toBe('queued')
    await expect.poll(async () => (await service.jobGet(queued.job.jobId)).job.status, { timeout: 3000, interval: 10 }).toBe('completed')
    const finished = (await service.evaluationGet(created.evaluation.evaluationId)).evaluation
    expect(finished.cases[0]?.actualOrigin).toBe('harness')
    expect(finished.productionAligned).toBe(true)
  })

  it('marks frozen evaluations stale when the active Excel rule changes', async () => {
    const { skill } = await service.skillCreate('rule-stale-skill', { title: '规则过期', files: { 'SKILL.md': '# Skill', 'manifest.yaml': 'required_facts: []', 'rules/decision-tree.yaml': 'root: start' } })
    const scenario = (await service.scenarioCreate('rule-stale-scenario', {
      scenarioId: 'rule-stale-scenario', name: '规则场景', region: 'province', status: 'active', skillIds: [skill.skillId],
      samples: [{ sampleId: 'sample-1', filename: 'report.json', headers: ['a'], rows: [{ a: 1 }], sourceRegions: [], createdAt: new Date().toISOString() }],
      rules: [{ ruleId: 'rule-1', version: 1, region: 'province', scenarioId: 'rule-stale-scenario', canonicalFields: ['a'], requiredFacts: ['a'], layouts: [{ layoutId: 'layout-1', headers: ['a'], mapping: { a: 'a' } }], status: 'published', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
    })).scenario
    const created = await service.evaluationCreate('rule-stale-eval', { scenarioId: scenario.scenarioId, skillId: skill.skillId, cases: [{ caseId: 'case-1', input: { a: 1 }, expected: { ok: true } }] })
    const queued = await service.evaluationRun('rule-stale-run', { evaluationId: created.evaluation.evaluationId })
    await expect.poll(async () => (await service.jobGet(queued.job.jobId)).job.status, { timeout: 3000, interval: 10 }).toBe('completed')
    expect((await service.evaluationGet(created.evaluation.evaluationId)).evaluation.status).toBe('completed')
    await service.scenarioSave('rule-stale-save', { ...scenario, rules: [{ ...scenario.rules[0], ruleId: 'rule-2', version: 2, status: 'published' }] })
    expect((await service.evaluationGet(created.evaluation.evaluationId)).evaluation.status).toBe('stale')
  })

  it('rejects a duplicate span identity even when the operation id changes', async () => {
    const first = createTraceFixture()
    expect((await service.traceIngest('trace-duplicate-a', first)).accepted).toBe(3)
    const second = createTraceFixture() as any
    for (const span of second.resourceSpans[0].scopeSpans[0].spans) {
      const event = span.attributes.find((item: any) => item.key === 'event_id')
      if (event) event.value.stringValue = `changed-${event.value.stringValue}`
    }
    const result = await service.traceIngest('trace-duplicate-b', second)
    expect(result.accepted).toBe(0)
    expect(result.rejected.every((item: any) => item.code === 'duplicate-span-id')).toBe(true)
  })
})
