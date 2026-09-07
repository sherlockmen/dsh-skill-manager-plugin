import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServiceClass } from '../src/host/service.js'

class RemoteService { constructor(public ctx: unknown, public name: string) {} }
class RemoteError extends Error { constructor(public code: string, message: string) { super(message) } }
const Service = createServiceClass(RemoteService, RemoteError)

describe('Dashboard facts and actionable quality', () => {
  let service: InstanceType<typeof Service>
  let directory: string
  let redis: { publish: () => Promise<void> } | undefined
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'skill-manager-dashboard-'))
    redis = undefined
    const llm = { listProviders: () => [{ id: 'provider' }], listModels: async () => [{ id: 'model' }], async *stream() { yield { type: 'text-delta', text: '"actual"' }; yield { type: 'finish', reason: { kind: 'stop' } } } }
    service = new Service({ get: (key: string) => key === 'llm' ? llm : key === 'redis' ? redis : undefined }, { dataDir: directory, otlpPort: false, provider: 'provider', model: 'model' }, DatabaseSync)
    await service.start()
  })
  afterEach(async () => { service.dispose(); await rm(directory, { recursive: true, force: true }) })
  async function evaluated(grade?: string, productionAligned?: boolean) {
    const { skill } = await service.skillCreate('skill', { title: '质量真实值' })
    await service.scenarioCreate('scenario', { scenarioId: 'strict', name: '严格场景', status: 'active', skillIds: [skill.skillId], minimumLabeledCases: 1, minimumAccuracy: 0.95 })
    const { evaluation } = await service.evaluationCreate('eval', { skillId: skill.skillId, productionAligned, cases: [{ caseId: 'one', input: { a: 1 } }] })
    await service.evaluationRun('run', { evaluationId: evaluation.evaluationId })
    await expect.poll(async () => (await service.evaluationGet(evaluation.evaluationId)).evaluation.status).toBe('completed')
    if (grade) await service.evaluationAnnotate('label', { evaluationId: evaluation.evaluationId, caseId: 'one', grade, issueLocation: '规则分支' })
    return { skill, evaluation }
  }

  it('keeps a manually incorrect 0% result in both quality and actionable work with the real threshold', async () => {
    const { evaluation } = await evaluated('incorrect')
    const dashboard = await service.dashboardGet()
    const quality = dashboard.sections.find(section => section.id === 'quality').items[0]
    expect(quality).toMatchObject({ id: evaluation.evaluationId, status: 'below-threshold', minimumAccuracy: 0.95, minimumLabels: 1, labeled: 1 })
    expect(quality.detail).toContain('0% / 95%')
    expect(quality.majorIssue).toContain('规则分支')
    expect(dashboard.sections.find(section => section.id === 'work').items).toContainEqual(expect.objectContaining({ id: evaluation.evaluationId, status: 'below-threshold' }))
    expect(dashboard.counts.unmeasuredSkills).toBe(0)
    expect((await service.releaseCheck(quality.skillId)).status).toBe('blocked')
  })

  it('keeps real non-production-aligned evidence visible without marking it release-ready', async () => {
    await evaluated('correct', false)
    const dashboard = await service.dashboardGet()
    expect(dashboard.sections.find(section => section.id === 'quality').items[0]).toMatchObject({ status: 'unaligned', productionAligned: false })
    expect(dashboard.counts).toMatchObject({ unmeasuredSkills: 0, publishReadySkills: 0 })
  })

  it('distinguishes missing labels and stale evidence, excluding stale batches only from current quality', async () => {
    const { skill } = await evaluated()
    expect((await service.dashboardGet()).sections.find(section => section.id === 'quality').items[0]).toMatchObject({ status: 'unannotated', labeled: 0, actionLabel: '继续标注' })
    await service.skillSave('save', { skillId: skill.skillId, expectedHash: skill.contentHash, files: { ...skill.files, 'SKILL.md': '# changed' } })
    const stale = await service.dashboardGet()
    expect(stale.sections.find(section => section.id === 'quality').items).toEqual([])
    expect(stale.sections.find(section => section.id === 'work').items[0]).toMatchObject({ status: 'stale', actionLabel: '用最新版重新测评', createEvaluation: true })
  })

  it('surfaces active exception releases and unknown loading but never invents failed Redis delivery', async () => {
    const { skill } = await evaluated('incorrect')
    await service.releasePublish('exception', { skillId: skill.skillId, exception: true, reason: 'test exception', confirm: true })
    const work = (await service.dashboardGet()).sections.find(section => section.id === 'work').items
    expect(work).toContainEqual(expect.objectContaining({ skillId: skill.skillId, status: 'exception-release', action: 'skill' }))
    expect(work).toContainEqual(expect.objectContaining({ skillId: skill.skillId, status: 'load-unknown', action: 'skill' }))
    expect(work.some(item => item.status === 'notification-failed')).toBe(false)
  })

  it('uses only active scenario thresholds and reports unknown judgments as insufficient, never 0% correct', async () => {
    const { skill } = await evaluated('unknown')
    await service.scenarioCreate('stricter', { name: '更多标注', status: 'active', skillIds: [skill.skillId], minimumLabeledCases: 5, minimumAccuracy: 0.99 })
    await service.scenarioCreate('draft', { name: '未启用场景', status: 'draft', skillIds: [skill.skillId], minimumLabeledCases: 100, minimumAccuracy: 1 })
    const quality = (await service.dashboardGet()).sections.find(section => section.id === 'quality').items[0]
    expect(quality).toMatchObject({ status: 'insufficient-labels', labeled: 0, minimumLabels: 5, minimumAccuracy: 0.99, detail: '— / 99%' })
    expect(quality.thresholds).toHaveLength(2)
  })

  it('adds a notification failure only after an actual outbox dispatch failed', async () => {
    const { skill } = await evaluated('incorrect')
    redis = { publish: async () => { throw new Error('test unavailable') } }
    await service.releasePublish('exception', { skillId: skill.skillId, exception: true, reason: 'test exception', confirm: true })
    await expect.poll(async () => (await service.runtimeStatus(skill.skillId)).notifications.failed).toBe(1)
    const work = (await service.dashboardGet()).sections.find(section => section.id === 'work').items
    expect(work).toContainEqual(expect.objectContaining({ skillId: skill.skillId, status: 'notification-failed', action: 'settings' }))
    expect(new Set(work.map(item => item.id)).size).toBe(work.length)
  })

  it('counts immutable publish and rollback events separately and preserves the selected release target', async () => {
    const { skill } = await evaluated('incorrect')
    const first = await service.releasePublish('publish-one', { skillId: skill.skillId, exception: true, reason: 'first', confirm: true })
    await service.releasePublish('publish-two', { skillId: skill.skillId, exception: true, reason: 'second', confirm: true })
    await service.releaseRollback('rollback-one', { releaseId: first.release.releaseId })
    await service.releaseRollback('rollback-one', { releaseId: first.release.releaseId })
    const listed = await service.releaseList(skill.skillId)
    expect(listed.releases).toHaveLength(2)
    expect(listed.changes).toHaveLength(3)
    expect(listed.changes).toContainEqual(expect.objectContaining({ action: 'rollback', releaseId: first.release.releaseId, skillId: skill.skillId, version: 'v1', runtimeLoadStatus: 'unknown' }))
    const dashboard = await service.dashboardGet()
    expect(dashboard.counts.releaseChanges30d).toBe(3)
    expect(dashboard.releaseChanges).toHaveLength(3)
  })
})
