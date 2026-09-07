// Harness Host entry. The protocol and node:sqlite modules are lazy-loaded so
// package inspection and Browser-only tests do not need a live Harness.
import type { RpcMethodDescriptor } from './contracts/index.js'
import { createV1Descriptors, PACKAGE_ID, V1_METHODS } from './contracts/index.js'
import { createServiceClass, LEGACY_METHODS } from './host/service.js'

const legacyCodec = Object.freeze({ mode: 'src-json' as const })
const direct = Object.freeze({ kind: 'direct' as const })
const legacyInvocation = (method: string, parameters: unknown[] = [], cancellation = false) => Object.freeze({ id: `${PACKAGE_ID}#skillManager/${method}`, service: 'skillManager' as const, namespace: 'skillManager' as const, method, invocation: direct, parameters, ...(cancellation ? { cancellation: Object.freeze({ parameter: 'signal' as const }) } : {}), result: legacyCodec })

export const name = PACKAGE_ID
export const version = '1.0.5'
// Register the strict Host descriptors only after the registry exists. Without
// this dependency an early startup silently fell back to SRC reflection.
export const inject: string[] = ['typert']

/** Backward-compatible Stage-0 descriptor kept for existing Profiles. */
export const TYPERT_HOST = Object.freeze({ package: PACKAGE_ID, face: 'host' as const, schemas: Object.freeze([]), model: Object.freeze({ services: Object.freeze([]), events: Object.freeze([]), objects: Object.freeze([]) }), invocations: Object.freeze([
  legacyInvocation('snapshot'), legacyInvocation('probeModel', [], true), legacyInvocation('storageCheck', [{ name: 'operationId', wire: 'operationId', source: 'json', codec: legacyCodec }], true), legacyInvocation('xmindSample'), legacyInvocation('xmindImport', [{ name: 'operationId', wire: 'operationId', source: 'json', codec: legacyCodec }, { name: 'input', wire: 'input', source: 'json', codec: legacyCodec }], true), legacyInvocation('xmindRead'), legacyInvocation('xmindUpdate', [{ name: 'operationId', wire: 'operationId', source: 'json', codec: legacyCodec }, { name: 'request', wire: 'request', source: 'json', codec: legacyCodec }], true), legacyInvocation('traceSample'), legacyInvocation('traceIngest', [{ name: 'operationId', wire: 'operationId', source: 'json', codec: legacyCodec }, { name: 'payload', wire: 'payload', source: 'json', codec: legacyCodec }], true), legacyInvocation('traceList'), legacyInvocation('traceGet', [{ name: 'traceId', wire: 'traceId', source: 'json', codec: legacyCodec }]),
]) })

/** Runtime descriptor includes v1 methods; TYPERT_HOST remains the old 11-method API for compatibility. */
export const TYPERT_HOST_V1 = Object.freeze({
  ...TYPERT_HOST,
  // The v1 descriptors supersede the two legacy Trace list/detail methods.
  // Keeping both entries would make Typert reject the contribution as a
  // duplicate endpoint during Profile startup.
  invocations: Object.freeze([
    ...TYPERT_HOST.invocations.filter(invocation => !V1_METHODS.includes(invocation.method as typeof V1_METHODS[number])),
    ...createV1Descriptors(PACKAGE_ID),
  ]),
})

export async function apply(ctx: any, config: Record<string, unknown> = {}) {
  if (ctx === undefined || ctx === null) return undefined
  const [{ TypertRemoteService, RemoteError }, { DatabaseSync }] = await Promise.all([importHostModule(ctx, '@deepseek-ai/dsh-typert-protocol'), import('node:sqlite')])
  const ServiceClass = createServiceClass(TypertRemoteService, RemoteError)
  const service = new ServiceClass(ctx, config, DatabaseSync)
  const typert = typeof ctx.get === 'function' ? ctx.get('typert') : undefined
  let disposeRegistration: (() => unknown) | undefined
  try {
    await service.start()
    if (!typert || typeof typert.register !== 'function') throw new Error('Skill Manager requires the Harness Typert registry before Host startup.')
    disposeRegistration = typert.register(TYPERT_HOST_V1)
  } catch (error) {
    try { disposeRegistration?.() } catch {}
    service.dispose()
    throw error
  }
  ctx.effect(() => async () => { try { disposeRegistration?.() } finally { service.dispose() } }, 'skill-manager: host resources')
}

async function importHostModule(ctx: any, specifier: string) {
  const internal = typeof ctx.get === 'function' ? ctx.get('loader')?.internal : undefined
  const baseUrl = typeof ctx.get === 'function' ? ctx.get('baseUrl') : ctx?.baseUrl
  if (internal?.import) { try { return await internal.import(specifier, typeof baseUrl === 'string' ? baseUrl : import.meta.url, {}) } catch {} }
  return import(specifier)
}

export { createSkillArchiveSample, createTraceFixture, createXmindSample, parseTracePayload, parseXmind, projectTraceSpans, sha256Hex } from './host/phase0.js'
export { createV1Descriptors, LEGACY_METHODS }
export { createServiceClass, initializeStorage, normalizeConfig } from './host/service.js'
export { CONTRACT_VERSION, PACKAGE_ID, SCHEMA_VERSION, V1_METHODS } from './contracts/index.js'
export type { RpcMethodDescriptor }
