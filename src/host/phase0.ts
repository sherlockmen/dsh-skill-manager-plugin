import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import type { MindMapDraft, MindMapNode, TraceSource } from '../contracts/index.js'

export const MAX_XMIND_BYTES = 8 * 1024 * 1024
export const MAX_TRACE_BYTES = 2 * 1024 * 1024
export const MAX_XMIND_ENTRIES = 256
export const MAX_TRACE_SPANS = 20_000
export const MAX_TRACE_ATTRIBUTES = 256
export const TRACE_SOURCES: readonly TraceSource[] = ['production', 'harness-native', 'workbench-test']
const MAX_INT64 = 9_223_372_036_854_775_807n

/**
 * OTLP timestamps are signed int64 nanoseconds. Keep values that fit in a
 * JavaScript safe integer as numbers for backwards compatibility with the
 * small fixtures, but retain real-world epoch nanoseconds as BigInt so they
 * are not rounded or rejected before reaching SQLite.
 */
export type TimestampNs = number | bigint

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export function parseXmind(input: unknown): MindMapDraft {
  const value = toXmindValue(input)
  if (value.kind === 'json') {
    const normalized = normalizeXmindJson(value.value)
    let encoded: string
    try { encoded = JSON.stringify(value.value) } catch { throw new Error('XMind JSON cannot be serialized') }
    const raw = Buffer.from(encoded, 'utf8')
    if (raw.length === 0 || raw.length > MAX_XMIND_BYTES) throw new Error(`XMind input exceeds ${MAX_XMIND_BYTES} bytes`)
    return { ...normalized, sourceFormat: 'json', sourceHash: sha256Hex(raw), sourceBase64: raw.toString('base64') }
  }
  const entries = extractZipEntries(value.buffer)
  const json = entries.get('content.json')
  const xml = entries.get('content.xml')
  if (!json && !xml) throw new Error('XMind archive has neither content.json nor content.xml')
  const raw = json ?? xml!
  const normalized = json ? normalizeXmindJson(JSON.parse(raw.toString('utf8'))) : normalizeXmindXml(raw.toString('utf8'))
  return { ...normalized, sourceFormat: json ? 'content.json' : 'content.xml', sourceHash: sha256Hex(value.buffer), sourceBase64: value.buffer.toString('base64') }
}

function toXmindValue(input: unknown): { kind: 'json'; value: unknown } | { kind: 'buffer'; buffer: Buffer } {
  if (input !== null && typeof input === 'object' && !Buffer.isBuffer(input) && !(input instanceof Uint8Array)) {
    let encoded: string
    try { encoded = JSON.stringify(input) } catch { throw new Error('XMind JSON cannot be serialized') }
    if (typeof encoded !== 'string' || Buffer.byteLength(encoded, 'utf8') > MAX_XMIND_BYTES) throw new Error(`XMind input exceeds ${MAX_XMIND_BYTES} bytes`)
    return { kind: 'json', value: input }
  }
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      if (Buffer.byteLength(trimmed, 'utf8') > MAX_XMIND_BYTES) throw new Error(`XMind input exceeds ${MAX_XMIND_BYTES} bytes`)
      return { kind: 'json', value: JSON.parse(trimmed) }
    }
    if (!/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) throw new Error('XMind string input must be JSON or base64')
    const buffer = Buffer.from(trimmed, 'base64')
    if (buffer.length === 0 || buffer.length > MAX_XMIND_BYTES) throw new Error(`XMind input exceeds ${MAX_XMIND_BYTES} bytes`)
    return { kind: 'buffer', buffer }
  }
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    const buffer = Buffer.from(input)
    if (buffer.length === 0 || buffer.length > MAX_XMIND_BYTES) throw new Error(`XMind input exceeds ${MAX_XMIND_BYTES} bytes`)
    return { kind: 'buffer', buffer }
  }
  throw new Error('XMind input must be JSON, base64 or bytes')
}

export function normalizeXmindJson(document: any): MindMapDraft {
  const sheet = Array.isArray(document) ? document[0] : document
  const root = sheet?.rootTopic ?? sheet?.root_topic ?? sheet?.topic ?? sheet
  if (!root || typeof root !== 'object') throw new Error('XMind content has no root topic')
  const nodes: MindMapNode[] = []
  const unsupported: MindMapDraft['unsupported'] = []
  const ids = new Set<string>()
  const topics = new Set<object>()
  const visit = (topic: any, parentId: string | null, level: number): void => {
    if (!topic || typeof topic !== 'object') throw new Error('XMind topic must be an object')
    if (topics.has(topic)) throw new Error('XMind topic graph contains a cycle')
    topics.add(topic)
    if (nodes.length >= 20_000) throw new Error('XMind topic count exceeds limit')
    const id = String(topic.id ?? `node-${nodes.length + 1}`).trim()
    if (!id || ids.has(id)) throw new Error(`XMind contains duplicate topic id: ${id || '(empty)'}`)
    ids.add(id)
    nodes.push({ id, parentId, title: String(topic.title ?? topic.topicTitle ?? '未命名节点').trim() || '未命名节点', level })
    if (Array.isArray(topic.markers) && topic.markers.length > 0) unsupported.push({ kind: 'markers', count: topic.markers.length, detail: id })
    if (Array.isArray(topic.relationships) && topic.relationships.length > 0) unsupported.push({ kind: 'relationships', count: topic.relationships.length, detail: id })
    if (topic.notes !== undefined) unsupported.push({ kind: 'notes', count: 1, detail: id })
    const children = topic.children?.attached ?? topic.children?.topics ?? topic.children ?? []
    if (Array.isArray(children)) for (const child of children) visit(child, id, level + 1)
    topics.delete(topic)
  }
  visit(root, null, 0)
  if (Array.isArray(sheet?.relationships) && sheet.relationships.length > 0) unsupported.push({ kind: 'relationships', count: sheet.relationships.length })
  return { mindmapId: String(sheet?.id ?? 'mindmap'), title: String(sheet?.title ?? root.title ?? '未命名思维导图'), sourceFormat: 'json', sourceHash: '', nodes, unsupported, updatedAt: new Date().toISOString() }
}

export function normalizeXmindXml(xml: string): MindMapDraft {
  const nodes: MindMapNode[] = []
  const unsupported: MindMapDraft['unsupported'] = []
  const stack: Array<{ id: string; node: MindMapNode }> = []
  // XMind's legacy XML is intentionally parsed with a tiny streaming scanner
  // rather than a DOM dependency. Matching complete <topic> blocks fails as
  // soon as a topic contains another topic, because the first closing tag is
  // the child's. The stack keeps the same parent semantics as content.json.
  const topicPattern = /<topic\b([^>]*)\/?>|<\/topic\s*>|<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi
  let match: RegExpExecArray | null
  while ((match = topicPattern.exec(xml))) {
    if (match[0].startsWith('</')) { stack.pop(); continue }
    if (match[2] !== undefined) {
      const current = stack[stack.length - 1]
      if (current) current.node.title = decodeXml(match[2]).replace(/<[^>]+>/g, '').trim() || '未命名节点'
      continue
    }
    const attrs = match[1] ?? ''
    const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1] ?? `node-${nodes.length + 1}`
    const level = stack.length
    const node: MindMapNode = { id, parentId: stack[level - 1]?.id ?? null, title: '未命名节点', level }
    nodes.push(node)
    stack.push({ id, node })
    if (/\/\s*>$/.test(match[0])) stack.pop()
  }
  if (nodes.length === 0) throw new Error('XMind XML contains no topic')
  const relationshipCount = (xml.match(/<relationships?\b/gi) ?? []).length
  const notesCount = (xml.match(/<notes?\b/gi) ?? []).length
  if (relationshipCount) unsupported.push({ kind: 'relationships', count: relationshipCount })
  if (notesCount) unsupported.push({ kind: 'notes', count: notesCount })
  return { mindmapId: 'mindmap-xml', title: nodes[0].title, sourceFormat: 'content.xml', sourceHash: '', nodes, unsupported, updatedAt: new Date().toISOString() }
}

function decodeXml(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

export function extractZipEntries(buffer: Buffer): Map<string, Buffer> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_XMIND_BYTES) throw new Error(`XMind archive exceeds ${MAX_XMIND_BYTES} bytes`)
  const result = new Map<string, Buffer>()
  const central = findSignatureBackwards(buffer, 0x06054b50)
  if (central < 0) throw new Error('XMind archive has no central directory')
  if (central + 22 > buffer.length) throw new Error('Invalid ZIP end-of-central-directory record')
  const count = buffer.readUInt16LE(central + 10)
  const offset = buffer.readUInt32LE(central + 16)
  const centralSize = buffer.readUInt32LE(central + 12)
  if (count > MAX_XMIND_ENTRIES || offset > buffer.length || centralSize > buffer.length - offset || offset + centralSize > central) throw new Error('Invalid ZIP central directory bounds')
  let cursor = offset
  let totalUncompressed = 0
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > buffer.length || cursor + 46 > central) throw new Error('Invalid ZIP central directory')
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP central directory')
    const method = buffer.readUInt16LE(cursor + 10)
    const expectedCrc = buffer.readUInt32LE(cursor + 16)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const uncompressedSize = buffer.readUInt32LE(cursor + 24)
    const nameSize = buffer.readUInt16LE(cursor + 28)
    const extraSize = buffer.readUInt16LE(cursor + 30)
    const commentSize = buffer.readUInt16LE(cursor + 32)
    const localOffset = buffer.readUInt32LE(cursor + 42)
    const recordEnd = cursor + 46 + nameSize + extraSize + commentSize
    if (recordEnd > central || recordEnd > buffer.length) throw new Error('Invalid ZIP central directory bounds')
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameSize)
    if (!name || name.length > 512 || name.startsWith('/') || name.startsWith('\\') || name.split(/[\\/]/).includes('..')) throw new Error(`XMind ZIP entry ${name || '(empty)'} has an unsafe path`)
    if (name.endsWith('/')) { cursor = recordEnd; continue }
    if (result.has(name)) throw new Error(`XMind ZIP contains duplicate entry ${name}`)
    cursor = recordEnd
    if (cursor > central || compressedSize > buffer.length || uncompressedSize > MAX_XMIND_BYTES || compressedSize > MAX_XMIND_BYTES) throw new Error(`XMind ZIP entry ${name} exceeds limit`)
    totalUncompressed += uncompressedSize
    if (totalUncompressed > MAX_XMIND_BYTES || (compressedSize > 0 && uncompressedSize / compressedSize > 200)) throw new Error(`XMind ZIP entry ${name} has an unsafe compression ratio`)
    if (localOffset + 30 > buffer.length) throw new Error(`XMind ZIP entry ${name} has invalid local header`)
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`XMind ZIP entry ${name} has invalid local header`)
    const localNameSize = buffer.readUInt16LE(localOffset + 26)
    const localExtraSize = buffer.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localNameSize + localExtraSize
    if (start > buffer.length || compressedSize > buffer.length - start) throw new Error(`XMind ZIP entry ${name} exceeds archive bounds`)
    const compressed = buffer.subarray(start, start + compressedSize)
    // `uncompressedSize` is attacker-controlled metadata. The ratio and total
    // checks above bound honest archives, but zlib must also receive an output
    // ceiling so a forged header cannot make inflate allocate unbounded memory.
    const value = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed, { maxOutputLength: MAX_XMIND_BYTES }) : undefined
    if (!value || value.length !== uncompressedSize || crc32(value) !== expectedCrc) throw new Error(`XMind ZIP entry ${name} failed validation`)
    result.set(name, value)
  }
  return result
}

function findSignatureBackwards(buffer: Buffer, signature: number): number {
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65_557); index -= 1) if (buffer.readUInt32LE(index) === signature) return index
  return -1
}

export function createXmindSample(): Buffer {
  const content = [{ id: 'sheet-stage0', title: 'Invoice triage', rootTopic: { id: 'root', title: 'Invoice triage', children: { attached: [{ id: 'extract', title: 'Extract invoice fields' }, { id: 'validate', title: 'Validate totals', markers: ['priority-1'] }] } }, relationships: [{ id: 'rel-1', end1: 'extract', end2: 'validate' }] }]
  return createStoredZip({ 'content.json': Buffer.from(JSON.stringify(content)), 'metadata.json': Buffer.from('{}') })
}

/** Small native Skill package fixture used by Host/package smoke tests. */
export function createSkillArchiveSample(): Buffer {
  return createStoredZip({
    'SKILL.md': Buffer.from('# Invoice triage\n\nUse the report_cycle fact to classify the record.\n'),
    'manifest.yaml': Buffer.from('name: invoice-triage\nrequired_facts: [report_cycle]\n'),
    'rules/decision-tree.yaml': Buffer.from('version: 1\nroot: start\n'),
    'references/README.md': Buffer.from('Reference material is optional.\n'),
  })
}

function createStoredZip(entries: Record<string, Buffer>): Buffer {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name)
    const crc = crc32(value)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc, 14); header.writeUInt32LE(value.length, 18); header.writeUInt32LE(value.length, 22); header.writeUInt16LE(filename.length, 26)
    local.push(header, filename, value)
    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt32LE(crc, 16); record.writeUInt32LE(value.length, 20); record.writeUInt32LE(value.length, 24); record.writeUInt16LE(filename.length, 28); record.writeUInt32LE(offset, 42)
    central.push(record, filename)
    offset += header.length + filename.length + value.length
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(entries).length, 8); eocd.writeUInt16LE(Object.keys(entries).length, 10); eocd.writeUInt32LE(centralSize, 12); eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, ...central, eocd])
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
  return (crc ^ 0xffffffff) >>> 0
}

export function createTraceFixture(): Record<string, unknown> {
  const attrs = (source: string, eventId: string, extra: Record<string, string> = {}) => [{ key: 'trace.source', value: { stringValue: source } }, { key: 'event_id', value: { stringValue: eventId } }, ...Object.entries(extra).map(([key, value]) => ({ key, value: { stringValue: value } }))]
  return { resourceSpans: [{ resource: { attributes: [{ key: 'service.name', value: { stringValue: 'skill-manager-fixture' } }] }, scopeSpans: [{ scope: { name: 'stage0' }, spans: [{ traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: '1111111111111111', name: 'skill.run', startTimeUnixNano: '1000000000', endTimeUnixNano: '1900000000', kind: 1, status: { code: 1 }, attributes: attrs('workbench-test', 'fixture-root', { 'skill.name': 'invoice-triage' }) }, { traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: '2222222222222222', parentSpanId: '1111111111111111', name: 'model.probe', startTimeUnixNano: '1100000000', endTimeUnixNano: '1400000000', kind: 2, status: { code: 1 }, attributes: attrs('workbench-test', 'fixture-model') }, { traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: '3333333333333333', parentSpanId: '1111111111111111', name: 'tool.sqlite', startTimeUnixNano: '1450000000', endTimeUnixNano: '1800000000', kind: 3, status: { code: 2, message: 'simulated warning' }, attributes: attrs('workbench-test', 'fixture-tool'), events: [{ name: 'storage.check', timeUnixNano: '1500000000', attributes: [{ key: 'rows', value: { intValue: '1' } }] }] }] }] }] }
}

export interface NormalizedSpan { traceId: string; spanId: string; parentSpanId?: string; eventId: string; name: string; source: TraceSource; kind: string; status: 'ok' | 'error' | 'unset'; startTimeNs: TimestampNs; endTimeNs: TimestampNs; attributes: Record<string, string>; events: unknown[] }

export function parseTracePayload(payload: unknown): { spans: NormalizedSpan[]; rejected: Array<Record<string, unknown>> } {
  let value: any = payload
  if (typeof payload === 'string' || Buffer.isBuffer(payload)) { const text = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload; if (Buffer.byteLength(text) > MAX_TRACE_BYTES) throw new Error(`OTLP payload exceeds ${MAX_TRACE_BYTES} bytes`); try { value = JSON.parse(text) } catch { throw new Error('OTLP payload is not valid JSON') } }
  if (!value || typeof value !== 'object') throw new Error('OTLP payload must be a JSON object')
  let encoded: string
  try { encoded = JSON.stringify(value) } catch { throw new Error('OTLP payload cannot be serialized') }
  if (typeof encoded !== 'string' || Buffer.byteLength(encoded, 'utf8') > MAX_TRACE_BYTES) throw new Error(`OTLP payload exceeds ${MAX_TRACE_BYTES} bytes`)
  const batches: Array<{ span: any; resource: Record<string, string> }> = []
  if (Array.isArray(value.resourceSpans)) for (const resourceSpan of value.resourceSpans) { const resource = attributesToObject(resourceSpan?.resource?.attributes); for (const scope of resourceSpan?.scopeSpans ?? resourceSpan?.scope_spans ?? []) for (const span of scope?.spans ?? []) { if (batches.length >= MAX_TRACE_SPANS) throw new Error(`OTLP payload contains more than ${MAX_TRACE_SPANS} spans`); batches.push({ span, resource }) } }
  else if (Array.isArray(value.spans)) {
    if (value.spans.length > MAX_TRACE_SPANS) throw new Error(`OTLP payload contains more than ${MAX_TRACE_SPANS} spans`)
    for (const span of value.spans) batches.push({ span, resource: {} })
  }
  else throw new Error('OTLP payload must contain spans')
  const spans: NormalizedSpan[] = []; const rejected: Array<Record<string, unknown>> = []
  for (const [index, item] of batches.entries()) {
    const span = item.span; const attributes = { ...item.resource, ...attributesToObject(span?.attributes) }; const traceId = String(span?.traceId ?? span?.trace_id ?? '').toLowerCase(); const spanId = String(span?.spanId ?? span?.span_id ?? '').toLowerCase(); const parentSpanId = span?.parentSpanId ?? span?.parent_span_id; const eventId = String(attributes.event_id ?? `${traceId}:${spanId}`)
    if (!/^[0-9a-f]{16,32}$/.test(traceId) || !/^[0-9a-f]{16}$/.test(spanId) || (parentSpanId !== undefined && parentSpanId !== null && !/^[0-9a-f]{16}$/.test(String(parentSpanId)))) { rejected.push({ index, code: 'invalid-id' }); continue }
    if (!eventId || eventId.length > 240 || /[\u0000-\u001f]/.test(eventId)) { rejected.push({ index, traceId, spanId, code: 'invalid-event-id' }); continue }
    const source = attributes['trace.source'] as TraceSource
    if (!TRACE_SOURCES.includes(source)) { rejected.push({ index, traceId, spanId, code: 'invalid-source' }); continue }
    const startTimeNs = parseTimestampNs(span?.startTimeUnixNano ?? span?.start_time_unix_nano ?? 0); const endTimeNs = parseTimestampNs(span?.endTimeUnixNano ?? span?.end_time_unix_nano ?? 0)
    if (startTimeNs === undefined || endTimeNs === undefined || compareTimestamp(startTimeNs, 0) < 0 || compareTimestamp(endTimeNs, startTimeNs) < 0) { rejected.push({ index, traceId, spanId, code: 'invalid-time' }); continue }
    const name = String(span?.name ?? 'unnamed').trim(); if (!name || name.length > 512) { rejected.push({ index, traceId, spanId, code: 'invalid-name' }); continue }
    if (Object.keys(attributes).length > MAX_TRACE_ATTRIBUTES) { rejected.push({ index, traceId, spanId, code: 'too-many-attributes' }); continue }
    spans.push({ traceId, spanId, parentSpanId: parentSpanId === undefined || parentSpanId === null ? undefined : String(parentSpanId).toLowerCase(), eventId, name, source, kind: String(span?.kind ?? 'internal').slice(0, 64), status: Number(span?.status?.code ?? 0) === 2 ? 'error' : Number(span?.status?.code ?? 0) === 1 ? 'ok' : 'unset', startTimeNs, endTimeNs, attributes, events: Array.isArray(span?.events) ? span.events.slice(0, 128) : [] })
  }
  return { spans, rejected }
}

function attributesToObject(attributes: any): Record<string, string> { const result: Record<string, string> = {}; for (const item of attributes ?? []) { const value = item?.value ?? {}; const raw = value.stringValue ?? value.string_value ?? value.intValue ?? value.int_value ?? value.boolValue ?? value.bool_value; if (item?.key && raw !== undefined) result[String(item.key)] = String(raw) } return result }

export interface ProjectedTrace { traceId: string; source?: TraceSource; nodes: Array<NormalizedSpan & { incomplete?: boolean; missingParentId?: string }>; edges: Array<{ from: string; to: string }>; ordered: Array<NormalizedSpan & { incomplete?: boolean; missingParentId?: string }>; incomplete: boolean; spanCount: number }

export function projectTraceSpans(spans: NormalizedSpan[]): ProjectedTrace[] {
  const groups = new Map<string, NormalizedSpan[]>(); for (const span of spans) groups.set(span.traceId, [...(groups.get(span.traceId) ?? []), span])
  return [...groups.entries()].map(([traceId, group]) => { const byId = new Set(group.map(span => span.spanId)); const nodes = group.slice().sort((a, b) => compareTimestamp(a.startTimeNs, b.startTimeNs) || a.eventId.localeCompare(b.eventId)).map(span => ({ ...span, ...(span.parentSpanId && !byId.has(span.parentSpanId) ? { incomplete: true, missingParentId: span.parentSpanId } : {}) })); const edges = nodes.filter(span => span.parentSpanId && byId.has(span.parentSpanId)).map(span => ({ from: span.parentSpanId!, to: span.spanId })); return { traceId, source: group[0]?.source, nodes, edges, ordered: nodes, incomplete: nodes.some(node => node.incomplete), spanCount: nodes.length } })
}

function parseTimestampNs(value: unknown): TimestampNs | undefined {
  let raw: bigint
  if (typeof value === 'bigint') raw = value
  else if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return undefined
    // Number inputs above MAX_SAFE_INTEGER have already lost a few low bits,
    // but preserving their integer magnitude is still safer than rejecting
    // every current epoch timestamp supplied by a JS producer.
    try { raw = BigInt(value) } catch { return undefined }
  } else if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    try { raw = BigInt(value.trim()) } catch { return undefined }
  } else return undefined
  if (raw < 0n || raw > MAX_INT64) return undefined
  return raw <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(raw) : raw
}

export function compareTimestamp(left: TimestampNs, right: TimestampNs): number {
  const a = typeof left === 'bigint' ? left : BigInt(left)
  const b = typeof right === 'bigint' ? right : BigInt(right)
  return a < b ? -1 : a > b ? 1 : 0
}
