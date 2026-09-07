import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServiceClass } from '../src/host/service.js'
import { createTraceFixture } from '../src/host/phase0.js'

class Remote { constructor(public ctx: any) {} }
class RemoteError extends Error { constructor(public code: string, message: string) { super(message) } }
const Service = createServiceClass(Remote, RemoteError)

describe('runtime-authoritative durable operations', () => {
  let dataDir: string
  let service: InstanceType<typeof Service>
  let skillId: string
  const request = () => ({ skillId, exception: true, confirm: true, reason: 'Explicit acceptance exception' })
  const managerReleases = () => service.managerDb.prepare("SELECT entity_id FROM entities WHERE entity_type='release'").all()
  const auditCount = (action: string) => Number(service.managerDb.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE action=?').get(action).count)
  const failPersistence = (kind: string) => {
    const original = service.persistOperation.bind(service)
    service.persistOperation = (id: string, result: unknown, currentKind: string) => {
      if (kind === currentKind) throw new Error('injected manager operation persistence failure')
      return original(id, result, currentKind)
    }
    return () => { service.persistOperation = original }
  }

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'skill-runtime-operations-'))
    service = new Service({ get: () => undefined }, { dataDir, otlpPort: false }, DatabaseSync)
    await service.start()
    skillId = (await service.skillCreate('create', { title: 'Release acceptance' })).skill.skillId
  })
  afterEach(async () => { service.dispose(); await rm(dataDir, { recursive: true, force: true }) })

  it('retains normal and explicit-exception gates before touching runtime', async () => {
    await expect(service.releasePublish('normal', { skillId })).rejects.toMatchObject({ code: 'release/not-ready' })
    await expect(service.releasePublish('no-confirm', { skillId, exception: true, reason: 'reason' })).rejects.toMatchObject({ code: 'release/exception-confirm-required' })
    await expect(service.releasePublish('no-reason', { skillId, exception: true, confirm: true })).rejects.toMatchObject({ code: 'release/exception-reason-required' })
    expect((await service.runtimeStatus(skillId)).versions).toHaveLength(0)
  })

  it('returns committed publication, then replays its result and manager audit exactly once after persistence fails', async () => {
    const restore = failPersistence('release.publish')
    const first = await service.releasePublish('publish', request())
    expect(first).toMatchObject({ status: 'published', replayed: false, managerProjection: { status: 'pending' } })
    expect(managerReleases()).toHaveLength(0)
    expect(auditCount('publish')).toBe(0)
    expect((await service.releaseGet(first.release.releaseId)).release).toEqual(first.release)
    expect((await service.releaseList(skillId)).releases).toHaveLength(1)
    expect((await service.skillDiff(skillId)).release.releaseId).toBe(first.release.releaseId)
    await expect(service.skillDelete('cannot-delete-published', skillId)).rejects.toMatchObject({ code: 'skill/delete-protected' })
    expect((await service.runtimeStatus(skillId)).versions).toHaveLength(1)
    restore()
    for (let index = 0; index < 2; index++) {
      const retry = await service.releasePublish('publish', request())
      expect(retry).toMatchObject({ status: 'published', replayed: true, release: { releaseId: first.release.releaseId }, managerProjection: { status: 'ready' } })
    }
    expect(managerReleases()).toHaveLength(1)
    expect(auditCount('publish')).toBe(1)
    expect((await service.runtimeStatus(skillId)).versions.map((item: any) => item.version)).toEqual(['v1'])
    expect((await service.runtimeStatus(skillId)).notifications.pending).toBe(1)
  })

  it('recovers manager COMMIT failure with the same release ID, without pretending runtime rolled back', async () => {
    const original = service.managerDb.exec.bind(service.managerDb)
    let fail = true
    service.managerDb.exec = (sql: string) => {
      if (fail && sql === 'COMMIT') { fail = false; throw new Error('injected manager commit failure') }
      return original(sql)
    }
    const published = await service.releasePublish('commit-failure', request())
    expect(published.managerProjection.status).toBe('pending')
    expect(managerReleases()).toHaveLength(0)
    const retry = await service.releasePublish('commit-failure', request())
    expect(retry.release.releaseId).toBe(published.release.releaseId)
    expect(retry.managerProjection.status).toBe('ready')
    expect(auditCount('publish')).toBe(1)
    expect((await service.runtimeStatus(skillId)).versions).toHaveLength(1)
  })

  it('reconciles durable runtime evidence on restart, preserving audit identity and immutable packages', async () => {
    failPersistence('release.publish')
    const published = await service.releasePublish('restart-publish', request())
    expect(published.managerProjection.status).toBe('pending')
    service.dispose()
    service = new Service({ get: () => undefined }, { dataDir, otlpPort: false }, DatabaseSync)
    await service.start()
    expect(managerReleases()).toHaveLength(1)
    expect(auditCount('publish')).toBe(1)
    expect((await service.releasePublish('restart-publish', request())).release.releaseId).toBe(published.release.releaseId)
    expect(auditCount('publish')).toBe(1)
  })

  it('retries failed rollback projection without repeating the pointer change after a later publication', async () => {
    const a = await service.releasePublish('publish-a', request())
    const b = await service.releasePublish('publish-b', request())
    const restore = failPersistence('release.rollback')
    const rolledBack = await service.releaseRollback('rollback-a', { releaseId: a.release.releaseId })
    expect(rolledBack).toMatchObject({ status: 'rolled-back', managerProjection: { status: 'pending' } })
    expect((await service.runtimeStatus(skillId)).releases[0].releaseId).toBe(a.release.releaseId)
    restore()
    const c = await service.releasePublish('publish-c', request())
    const retry = await service.releaseRollback('rollback-a', { releaseId: b.release.releaseId })
    expect(retry).toMatchObject({ replayed: true, release: { releaseId: a.release.releaseId }, managerProjection: { status: 'ready' } })
    expect((await service.runtimeStatus(skillId)).releases[0].releaseId).toBe(c.release.releaseId)
    expect((await service.runtimeStatus(skillId)).versions.map((item: any) => item.version).sort()).toEqual(['v1', 'v2', 'v3'])
    expect(auditCount('rollback')).toBe(1)
  })

  it('does not write a version, pointer, durable result or notification when runtime commit fails', async () => {
    const original = service.runtimeDb.exec.bind(service.runtimeDb)
    let fail = true
    service.runtimeDb.exec = (sql: string) => {
      if (fail && sql === 'COMMIT') { fail = false; throw new Error('injected runtime commit failure') }
      return original(sql)
    }
    await expect(service.releasePublish('runtime-failure', request())).rejects.toThrow('injected runtime commit failure')
    expect((await service.runtimeStatus(skillId)).versions).toHaveLength(0)
    expect((await service.runtimeStatus(skillId)).releases).toHaveLength(0)
    expect((await service.runtimeStatus(skillId)).notifications.pending).toBe(0)
    expect(service.runtimeDb.prepare("SELECT entity_id FROM runtime_entities WHERE entity_type='operation'").all()).toHaveLength(0)
    expect(managerReleases()).toHaveLength(0)
  })

  it('makes cleanup replayable without clearing protected or evaluation audit evidence', async () => {
    const make = (letter: string, evaluation = false) => {
      const fixture: any = createTraceFixture()
      for (const span of fixture.resourceSpans[0].scopeSpans[0].spans) {
        span.traceId = letter.repeat(32)
        span.attributes.find((entry: any) => entry.key === 'event_id').value.stringValue += letter
        if (evaluation) span.attributes.push({ key: 'evaluation.id', value: { stringValue: 'evaluation-evidence' } })
      }
      return fixture
    }
    await service.traceIngest('trace-normal', make('a'))
    await service.traceIngest('trace-protected', make('b'))
    await service.traceIngest('trace-evaluation', make('c', true))
    await service.traceProtect('protect', { traceId: 'b'.repeat(32) })
    const restore = failPersistence('trace.cleanup')
    const cleaned = await service.traceCleanup('cleanup', { days: 1 })
    expect(cleaned).toMatchObject({ status: 'cleaned', deleted: 1, managerProjection: { status: 'pending' } })
    expect((await service.traceList({})).traces.map((trace: any) => trace.traceId).sort()).toEqual(['b'.repeat(32), 'c'.repeat(32)])
    restore()
    expect(await service.traceCleanup('cleanup', { days: 1 })).toMatchObject({ status: 'cleaned', deleted: 1, replayed: true, managerProjection: { status: 'ready' } })
    expect(auditCount('cleanup')).toBe(1)
    await expect(service.traceClear('protected-clear', { traceId: 'b'.repeat(32) })).rejects.toMatchObject({ code: 'trace/protected' })
    await expect(service.traceClear('evaluation-clear', { traceId: 'c'.repeat(32) })).rejects.toMatchObject({ code: 'trace/evaluation-protected' })
  })

  it('replays an already cleared Trace as cleared instead of reporting not-found after audit failure', async () => {
    await service.traceIngest('trace', createTraceFixture())
    const traceId = 'a'.repeat(32)
    const restore = failPersistence('trace.clear')
    expect(await service.traceClear('clear', { traceId })).toMatchObject({ status: 'cleared', managerProjection: { status: 'pending' } })
    restore()
    expect(await service.traceClear('clear', { traceId })).toMatchObject({ status: 'cleared', replayed: true, managerProjection: { status: 'ready' } })
    expect(auditCount('clear')).toBe(1)
  })
})
