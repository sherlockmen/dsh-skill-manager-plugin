import { describe, expect, it } from 'vitest'
import { createTraceFixture, createXmindSample, normalizeXmindXml, parseTracePayload, parseXmind, projectTraceSpans } from '../src/host/phase0.js'

describe('phase 0 adapters', () => {
  it('normalizes XMind JSON and nested legacy XML without flattening parents', () => {
    const json = parseXmind(createXmindSample())
    expect(json.nodes.map(node => node.title)).toEqual(['Invoice triage', 'Extract invoice fields', 'Validate totals'])
    const xml = normalizeXmindXml('<sheet><topic id="root"><title>Root</title><children><topic id="child"><title>Child</title><topic id="leaf"><title>Leaf</title></topic></topic></children></topic></sheet>')
    expect(xml.nodes.map(node => [node.id, node.parentId, node.level])).toEqual([['root', null, 0], ['child', 'root', 1], ['leaf', 'child', 2]])
  })

  it('parses OTLP fixture, projects P13 edges, and marks missing parents', () => {
    const parsed = parseTracePayload(createTraceFixture())
    expect(parsed.spans).toHaveLength(3)
    const [trace] = projectTraceSpans(parsed.spans)
    expect(trace.edges).toHaveLength(2)
    const incomplete = projectTraceSpans([{ ...parsed.spans[1], parentSpanId: 'bbbbbbbbbbbbbbbb' }])[0]
    expect(incomplete.incomplete).toBe(true)
  })

  it('rejects malformed timestamps and unsafe XMind topic graphs', () => {
    const parsed = parseTracePayload({ spans: [{ traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', spanId: '1111111111111111', name: 'bad', startTimeUnixNano: '9', endTimeUnixNano: '1', attributes: [{ key: 'trace.source', value: { stringValue: 'production' } }] }] })
    expect(parsed.spans).toHaveLength(0)
    expect(parsed.rejected[0]?.code).toBe('invalid-time')
    expect(() => parseXmind({ id: 'x', rootTopic: { id: 'same', title: 'x', children: { attached: [{ id: 'same', title: 'duplicate' }] } } })).toThrow(/duplicate/i)
  })

  it('accepts current epoch nanoseconds without unsafe Number coercion', () => {
    const started = BigInt(Date.now()) * 1_000_000n
    const parsed = parseTracePayload({ spans: [{ traceId: 'cccccccccccccccccccccccccccccccc', spanId: '4444444444444444', name: 'production.skill', startTimeUnixNano: started.toString(), endTimeUnixNano: (started + 12_000_000n).toString(), attributes: [{ key: 'trace.source', value: { stringValue: 'production' } }, { key: 'skill.id', value: { stringValue: 'skill-1' } }] }] })
    expect(parsed.spans).toHaveLength(1)
    expect(parsed.spans[0]?.startTimeNs).toBe(started)
  })
})
