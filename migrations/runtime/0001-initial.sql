-- Reference migration for the runtime SQLite. The runtime database is kept
-- separate so production readers never need the manager draft tables.
CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS storage_checks (operation_id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trace_spans (event_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, span_id TEXT NOT NULL, parent_span_id TEXT, name TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, start_time_ns INTEGER NOT NULL, end_time_ns INTEGER NOT NULL, content_hash TEXT NOT NULL, span_json TEXT NOT NULL, skill_id TEXT, version TEXT);
CREATE INDEX IF NOT EXISTS trace_spans_trace_span ON trace_spans(trace_id, span_id);
CREATE INDEX IF NOT EXISTS trace_spans_start_time ON trace_spans(start_time_ns DESC);
CREATE TABLE IF NOT EXISTS trace_records (trace_id TEXT PRIMARY KEY, source TEXT NOT NULL, skill_id TEXT, version TEXT, protected_until TEXT, retained_until TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS runtime_entities (entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(entity_type, entity_id));
CREATE TABLE IF NOT EXISTS notification_outbox (event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, operation_id TEXT, release_id TEXT, skill_id TEXT, version TEXT, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS notification_outbox_status ON notification_outbox(status, updated_at);
