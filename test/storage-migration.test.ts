import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createServiceClass } from '../src/host/service.js'
import { initializePluginSchema } from '../src/host/storage-migration.js'

class RemoteService { constructor(public ctx: any, public name: string) {} }
const Service = createServiceClass(RemoteService, Error)

const legacyTraceSql = `CREATE TABLE trace_spans (event_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, span_id TEXT NOT NULL, parent_span_id TEXT, name TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, start_time_ns INTEGER NOT NULL, end_time_ns INTEGER NOT NULL, content_hash TEXT NOT NULL, span_json TEXT NOT NULL)`
const payload = JSON.stringify({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), eventId: 'original-event', name: 'legacy.case', source: 'workbench-test', kind: '1', status: 'ok', startTimeNs: '1000000', endTimeNs: '2000000', attributes: { 'skill.id': 'legacy-skill', 'skill.version': 'v1' }, events: [] })

async function legacyDirectory(): Promise<string> {
  const dataDir = await mkdtemp(join(tmpdir(), 'skill-manager-schema-test-'))
  const manager = new DatabaseSync(join(dataDir, 'manager.sqlite'))
  manager.exec(`CREATE TABLE schema_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO schema_meta VALUES('schema_version','2'); CREATE TABLE operations(operation_id TEXT PRIMARY KEY,result_json TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE skill_drafts(draft_id TEXT PRIMARY KEY,title TEXT NOT NULL,payload_json TEXT NOT NULL,source_hash TEXT NOT NULL,updated_at TEXT NOT NULL)`)
  manager.prepare('INSERT INTO operations VALUES(?,?,?)').run('legacy-operation', '{"preserved":true}', '2026-09-01')
  manager.close()
  const runtime = new DatabaseSync(join(dataDir, 'runtime.sqlite'))
  runtime.exec(`CREATE TABLE schema_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO schema_meta VALUES('schema_version','1'); ${legacyTraceSql}`)
  runtime.prepare('INSERT INTO trace_spans VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('original-event', 'a'.repeat(32), 'b'.repeat(16), null, 'legacy.case', 'workbench-test', '1', 'ok', 1000000, 2000000, 'original-hash', payload)
  runtime.close()
  return dataDir
}

describe('legacy SQLite startup migration', () => {
  it('starts on a stage-0 trace table, preserves rows, and snapshots both databases before changing columns', async () => {
    const dataDir = await legacyDirectory()
    const service = new Service({ get: () => undefined }, { dataDir, otlpPort: false }, DatabaseSync)
    try {
      await expect(service.start()).resolves.toBeUndefined()
      const row = service.runtimeDb.prepare('SELECT span_json,content_hash,skill_id,version FROM trace_spans WHERE event_id=?').get('original-event')
      expect(row).toMatchObject({ span_json: payload, content_hash: 'original-hash', skill_id: 'legacy-skill', version: 'v1' })
      expect(service.managerDb.prepare('SELECT result_json FROM operations WHERE operation_id=?').get('legacy-operation').result_json).toBe('{"preserved":true}')
      expect(service.runtimeDb.prepare('SELECT name FROM sqlite_master WHERE name=?').get('trace_spans_skill_time')).toBeTruthy()
      expect(service.runtimeDb.prepare('SELECT skill_id,version FROM trace_records').get()).toMatchObject({ skill_id: 'legacy-skill', version: 'v1' })
      const backups = await readdir(join(dataDir, 'schema-backups'))
      expect(backups).toHaveLength(1)
      const snapshot = new DatabaseSync(join(dataDir, 'schema-backups', backups[0], 'runtime.sqlite'), { readOnly: true })
      expect(snapshot.prepare('PRAGMA table_info(trace_spans)').all().some(column => column.name === 'skill_id')).toBe(false)
      expect(snapshot.prepare('SELECT span_json FROM trace_spans').get().span_json).toBe(payload)
      snapshot.close()
    } finally { service.dispose(); await rm(dataDir, { recursive: true, force: true }) }
  })

  it('reopens the upgraded pair without modifying old rows or making repeated backups', async () => {
    const dataDir = await legacyDirectory()
    const first = new Service({ get: () => undefined }, { dataDir, otlpPort: false }, DatabaseSync)
    let second: InstanceType<typeof Service> | undefined
    try {
      await first.start(); first.dispose()
      second = new Service({ get: () => undefined }, { dataDir, otlpPort: false }, DatabaseSync)
      await second.start()
      expect(await readdir(join(dataDir, 'schema-backups'))).toHaveLength(1)
      expect(Number(second.runtimeDb.prepare('SELECT COUNT(*) AS count FROM trace_spans').get().count)).toBe(1)
      expect(second.runtimeDb.prepare('SELECT span_json FROM trace_spans').get().span_json).toBe(payload)
      expect(second.runtimeDb.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get().value).toBe('2')
    } finally { first.dispose(); second?.dispose(); await rm(dataDir, { recursive: true, force: true }) }
  })

  it('rolls both transactions back if a later index creation fails and retains the pre-upgrade backup', async () => {
    const dataDir = await legacyDirectory()
    const managerDb = new DatabaseSync(join(dataDir, 'manager.sqlite'))
    const runtimeDb = new DatabaseSync(join(dataDir, 'runtime.sqlite'))
    const failingRuntime = {
      prepare: runtimeDb.prepare.bind(runtimeDb),
      exec(sql: string) { if (sql.includes('CREATE INDEX')) throw new Error('injected index failure'); return runtimeDb.exec(sql) },
    }
    try {
      expect(() => initializePluginSchema({ managerDb, runtimeDb: failingRuntime, config: { dataDir } })).toThrow('injected index failure')
      expect(runtimeDb.prepare('PRAGMA table_info(trace_spans)').all().some(column => column.name === 'skill_id')).toBe(false)
      expect(runtimeDb.prepare('SELECT span_json FROM trace_spans').get()?.span_json).toBe(payload)
      expect(runtimeDb.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get()?.value).toBe('1')
      expect(managerDb.prepare("SELECT name FROM sqlite_master WHERE name='jobs'").get()).toBeUndefined()
      expect(await readdir(join(dataDir, 'schema-backups'))).toHaveLength(1)
    } finally { managerDb.close(); runtimeDb.close(); await rm(dataDir, { recursive: true, force: true }) }
  })
})
