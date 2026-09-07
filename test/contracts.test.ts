import { describe, expect, it } from 'vitest'
import { TYPERT_HOST_V1 } from '../src/index.js'
import { CONTRACT_VERSION, PACKAGE_ID, V1_METHODS, createV1Descriptors, redact, stableStringify } from '../src/contracts/index.js'

describe('versioned contract registry', () => {
  it('keeps the public method roster unique and descriptor-complete', () => {
    expect(CONTRACT_VERSION).toBe(1)
    expect(new Set(V1_METHODS).size).toBe(V1_METHODS.length)
    const descriptors = createV1Descriptors(PACKAGE_ID)
    expect(descriptors).toHaveLength(V1_METHODS.length)
    expect(descriptors.every(item => item.service === 'skillManager' && item.result.mode === 'strict')).toBe(true)
    expect(descriptors.find(item => item.method === 'evaluationRun')?.cancellation).toEqual({ parameter: 'signal' })
    expect(descriptors.find(item => item.method === 'settingsAudit')?.parameters[0]?.acceptsUndefined).toBe(true)
    expect(descriptors.find(item => item.method === 'releaseList')?.parameters[0]?.acceptsUndefined).toBe(true)
    expect(descriptors.find(item => item.method === 'runtimeStatus')?.parameters[0]?.acceptsUndefined).toBe(true)
    expect(descriptors.find(item => item.method === 'settingsBackup')?.parameters[1]?.acceptsUndefined).toBe(true)
    expect(() => descriptors.find(item => item.method === 'settingsAudit')?.parameters[0]?.codec.schema?.parse(undefined)).not.toThrow()
    const hostIds = TYPERT_HOST_V1.invocations.map(item => item.id)
    expect(new Set(hostIds).size).toBe(hostIds.length)
  })

  it('sorts JSON keys and redacts credential-shaped values', () => {
    expect(stableStringify({ z: 1, a: { y: true, x: 2 } })).toBe('{"a":{"x":2,"y":true},"z":1}')
    expect(redact('authorization: Bearer abc123 token=secret')).toContain('[redacted]')
    expect(redact('authorization: Bearer abc123 token=secret')).not.toContain('abc123')
  })
})
