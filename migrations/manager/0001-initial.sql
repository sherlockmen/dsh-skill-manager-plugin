-- Reference migration for the manager SQLite. Runtime bootstrap applies the
-- same statements inline so an installed Harness profile has no migration
-- runner dependency; this file is shipped for inspection and future upgrades.
CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operations (operation_id TEXT PRIMARY KEY, result_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS entities (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, content_hash TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(entity_type, entity_id));
CREATE TABLE IF NOT EXISTS audit_events (event_id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL, before_hash TEXT, after_hash TEXT, reason TEXT NOT NULL, payload_json TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (job_id TEXT PRIMARY KEY, kind TEXT NOT NULL, target_id TEXT NOT NULL, status TEXT NOT NULL, payload_json TEXT NOT NULL, result_json TEXT, error_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS skill_drafts (draft_id TEXT PRIMARY KEY, title TEXT NOT NULL, payload_json TEXT NOT NULL, source_hash TEXT NOT NULL, updated_at TEXT NOT NULL);
