import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCHEMA_VERSION } from '../contracts/index.js'

interface Database {
  exec(sql: string): unknown
  prepare(sql: string): { get(...values: any[]): any; all(...values: any[]): any[]; run(...values: any[]): unknown }
}
interface Storage {
  managerDb: Database
  runtimeDb: Database
  config: { dataDir: string }
}

const MANAGER_TABLES = `
CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operations (operation_id TEXT PRIMARY KEY, result_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS entities (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, content_hash TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(entity_type, entity_id));
CREATE TABLE IF NOT EXISTS audit_events (event_id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, before_hash TEXT, after_hash TEXT, reason TEXT NOT NULL, payload_json TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, kind TEXT NOT NULL, target_id TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL, result_json TEXT, error_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS skill_drafts (draft_id TEXT PRIMARY KEY, title TEXT NOT NULL, payload_json TEXT NOT NULL, source_hash TEXT NOT NULL, updated_at TEXT NOT NULL);
`
const RUNTIME_TABLES = `
CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS storage_checks (operation_id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trace_spans (event_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, span_id TEXT NOT NULL, parent_span_id TEXT, name TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, start_time_ns INTEGER NOT NULL, end_time_ns INTEGER NOT NULL, content_hash TEXT NOT NULL, span_json TEXT NOT NULL, skill_id TEXT, version TEXT);
CREATE TABLE IF NOT EXISTS trace_records (trace_id TEXT PRIMARY KEY, source TEXT NOT NULL, skill_id TEXT, version TEXT, protected_until TEXT, retained_until TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runtime_entities (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(entity_type, entity_id));
CREATE TABLE IF NOT EXISTS notification_outbox (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, operation_id TEXT, release_id TEXT, skill_id TEXT, version TEXT, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
`
const RUNTIME_INDEXES = `
CREATE INDEX IF NOT EXISTS trace_spans_trace_id ON trace_spans(trace_id);
CREATE INDEX IF NOT EXISTS trace_spans_trace_span ON trace_spans(trace_id, span_id);
CREATE INDEX IF NOT EXISTS trace_spans_start_time ON trace_spans(start_time_ns DESC);
CREATE INDEX IF NOT EXISTS trace_spans_source_time ON trace_spans(source, start_time_ns DESC);
CREATE INDEX IF NOT EXISTS trace_spans_skill_time ON trace_spans(skill_id, start_time_ns DESC);
CREATE INDEX IF NOT EXISTS notification_outbox_status ON notification_outbox(status, updated_at);
`
const managerTables = ['schema_meta', 'operations', 'entities', 'audit_events', 'jobs', 'settings', 'skill_drafts']
const runtimeTables = ['schema_meta', 'storage_checks', 'trace_spans', 'trace_records', 'runtime_entities', 'notification_outbox']

function tableNames(db: Database): Set<string> {
  return new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => String(row.name)))
}
function traceColumns(db: Database): Set<string> {
  return new Set(db.prepare('PRAGMA table_info(trace_spans)').all().map(row => String(row.name)))
}
function version(db: Database, tables: Set<string>): number {
  if (!tables.has('schema_meta')) return 0
  const value = Number(db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get()?.value ?? 0)
  if (!Number.isInteger(value) || value < 0 || value > SCHEMA_VERSION) throw new Error(`Unsupported SQLite schema version ${value}; existing data was not changed.`)
  return value
}

/** VACUUM INTO snapshots committed WAL content without copying live WAL files. */
function snapshotBeforeUpgrade(storage: Storage, versions: number[]): void {
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
  const directory = join(storage.config.dataDir, 'schema-backups', id)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const files: Record<string, { sha256: string; bytes: number }> = {}
  for (const [filename, db] of [['manager.sqlite', storage.managerDb], ['runtime.sqlite', storage.runtimeDb]] as const) {
    const path = join(directory, filename)
    db.prepare('VACUUM INTO ?').run(path)
    const bytes = readFileSync(path)
    files[filename] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }
  }
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ kind: 'pre-schema-migration', createdAt: new Date().toISOString(), from: { manager: versions[0], runtime: versions[1] }, to: SCHEMA_VERSION, files }, null, 2), { mode: 0o600, flag: 'wx' })
}

/**
 * The stage-0 runtime table predates skill_id/version. Detect the real schema
 * rather than trusting its version marker: an older failed startup could have
 * already stamped the manager database as v2. Indexes must follow ALTER TABLE.
 * Each database migrates transactionally; repeat startup completes safely if
 * a process stops between the two commits. The pre-upgrade pair is retained.
 */
export function initializePluginSchema(storage: Storage): void {
  const { managerDb, runtimeDb } = storage
  const manager = tableNames(managerDb); const runtime = tableNames(runtimeDb)
  const versions = [version(managerDb, manager), version(runtimeDb, runtime)]
  const columns = traceColumns(runtimeDb)
  const missingTraceColumns = !columns.has('skill_id') || !columns.has('version')
  const upgrading = versions.some(value => value !== SCHEMA_VERSION)
    || managerTables.some(table => !manager.has(table)) || runtimeTables.some(table => !runtime.has(table)) || missingTraceColumns
  if (upgrading && (manager.size || runtime.size)) snapshotBeforeUpgrade(storage, versions)
  let managerTransaction = false; let runtimeTransaction = false
  try {
    managerDb.exec('BEGIN IMMEDIATE'); managerTransaction = true
    runtimeDb.exec('BEGIN IMMEDIATE'); runtimeTransaction = true
    managerDb.exec(MANAGER_TABLES)
    runtimeDb.exec(RUNTIME_TABLES)
    const currentColumns = traceColumns(runtimeDb)
    if (!currentColumns.has('skill_id')) runtimeDb.exec('ALTER TABLE trace_spans ADD COLUMN skill_id TEXT')
    if (!currentColumns.has('version')) runtimeDb.exec('ALTER TABLE trace_spans ADD COLUMN version TEXT')
    if (missingTraceColumns && runtime.has('trace_spans')) {
      // Only add searchable projections. The original span_json/content_hash
      // remain byte-for-byte untouched, including older or unparseable rows.
      runtimeDb.exec(`UPDATE trace_spans SET
        skill_id=COALESCE(skill_id,CASE WHEN json_valid(span_json) THEN CASE WHEN json_type(span_json,'$.attributes."skill.id"')='text' THEN json_extract(span_json,'$.attributes."skill.id"') END END),
        version=COALESCE(version,CASE WHEN json_valid(span_json) THEN CASE WHEN json_type(span_json,'$.attributes."skill.version"')='text' THEN json_extract(span_json,'$.attributes."skill.version"') END END)`)
    }
    if (!runtime.has('trace_records')) {
      runtimeDb.prepare(`INSERT INTO trace_records(trace_id,source,skill_id,version,updated_at)
        SELECT span.trace_id,span.source,
          (SELECT skill_id FROM trace_spans linked WHERE linked.trace_id=span.trace_id AND linked.skill_id IS NOT NULL ORDER BY start_time_ns,event_id LIMIT 1),
          (SELECT version FROM trace_spans linked WHERE linked.trace_id=span.trace_id AND linked.version IS NOT NULL ORDER BY start_time_ns,event_id LIMIT 1), ?
        FROM trace_spans span WHERE span.event_id=(SELECT first.event_id FROM trace_spans first WHERE first.trace_id=span.trace_id ORDER BY first.start_time_ns,first.event_id LIMIT 1)
        ON CONFLICT(trace_id) DO NOTHING`).run(new Date().toISOString())
    }
    runtimeDb.exec(RUNTIME_INDEXES)
    for (const db of [managerDb, runtimeDb]) db.prepare("INSERT INTO schema_meta(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(SCHEMA_VERSION))
    managerDb.exec('COMMIT'); managerTransaction = false
    runtimeDb.exec('COMMIT'); runtimeTransaction = false
  } catch (error) {
    if (runtimeTransaction) { try { runtimeDb.exec('ROLLBACK') } catch {} }
    if (managerTransaction) { try { managerDb.exec('ROLLBACK') } catch {} }
    throw error
  }
}
