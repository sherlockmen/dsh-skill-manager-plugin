import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { createServiceClass } from '../src/host/service.js'
import { TYPERT_HOST_V1, inject as hostInject } from '../src/index.js'

// This integration suite exercises the installed Harness dispatcher, not a
// duplicated approximation of its reflection or argument codec behavior.
const harnessRoot = process.env.DSH_HARNESS_ROOT ?? resolve(process.cwd(), '../../myself/deepseek-harness')
const gatewayPackage = join(harnessRoot, 'packages/api/gateway/package.json')
const installed = existsSync(gatewayPackage)
const importFile = (file: string) => import(/* @vite-ignore */ pathToFileURL(file).href)
const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })

describe.skipIf(!installed)('installed Harness Gateway integration', () => {
  async function setup() {
    const require = createRequire(gatewayPackage)
    const [{ Context, symbols }, { TypertRemoteService, RemoteError }, { default: Registry }, { default: Gateway }] = await Promise.all([
      importFile(require.resolve('@deepseek-ai/cordis')),
      importFile(join(harnessRoot, 'packages/typert/protocol/lib/index.js')),
      importFile(join(harnessRoot, 'packages/typert/registry/lib/index.js')),
      importFile(join(harnessRoot, 'packages/api/gateway/lib/index.js')),
    ])
    const ctx = new Context()
    await ctx.plugin(Registry)
    await ctx.plugin(Gateway)
    const dataDir = await mkdtemp(join(tmpdir(), 'skill-manager-gateway-'))
    cleanup.push(async () => { await ctx.fiber.dispose(); await rm(dataDir, { recursive: true, force: true }) })
    const Service = createServiceClass(TypertRemoteService, RemoteError)
    const service = new Service(ctx, { dataDir, otlpPort: false }, DatabaseSync)
    await service.start()
    cleanup.push(async () => service.dispose())
    const gateway = ctx.get('typertGateway')
    const rawGateway = gateway[symbols.original] ?? gateway
    return { ctx, service, gateway, rawGateway }
  }

  it('derives every SRC method using the same names as the Browser wire descriptors', async () => {
    const { rawGateway } = await setup()
    for (const descriptor of TYPERT_HOST_V1.invocations) {
      const reflected = rawGateway.resolveSrcDescriptor('skillManager', descriptor.method, `skillManager/${descriptor.method}`)
      expect(reflected.parameters.map((item: any) => item.wire), descriptor.method).toEqual(descriptor.parameters.map(item => item.wire))
      expect(reflected.cancellation, descriptor.method).toEqual(descriptor.cancellation)
    }
  })

  it('supports real SRC list, mutation, and cancellation argument routing', async () => {
    const { gateway } = await setup()
    expect(await gateway.invoke({ namespace: 'skillManager', method: 'skillList', args: { request: {} } })).toMatchObject({ status: 'ready', skills: [] })
    const created = await gateway.invoke({ namespace: 'skillManager', method: 'skillCreate', args: { operationId: 'gateway-create', request: { title: 'Gateway真实调用' } } })
    expect(created.skill.title).toBe('Gateway真实调用')
    const scenario = await gateway.invoke({ namespace: 'skillManager', method: 'scenarioCreate', args: { operationId: 'gateway-scenario', request: { name: '真实场景', skillIds: [created.skill.skillId] } } })
    expect((await gateway.invoke({ namespace: 'skillManager', method: 'scenarioGet', args: { scenarioId: scenario.scenario.scenarioId } })).scenario.name).toBe('真实场景')
    const controller = new AbortController(); controller.abort()
    await expect(gateway.invoke({ namespace: 'skillManager', method: 'skillCreate', args: { operationId: 'cancelled', request: {} }, signal: controller.signal })).rejects.toMatchObject({ code: 'gateway/cancelled' })
  })

  it('registers strict Host definitions and dispatches Browser-style request envelopes', async () => {
    const { ctx, gateway } = await setup()
    expect(hostInject).toContain('typert')
    const dispose = ctx.get('typert').register(TYPERT_HOST_V1)
    cleanup.push(async () => { await dispose() })
    expect(ctx.get('typert').local.get('skillManager/skillList').parameters[0].codec.mode).toBe('strict')
    expect((await gateway.invoke({ namespace: 'skillManager', method: 'skillList', args: { request: {} } })).skills).toEqual([])
    expect((await gateway.invoke({ namespace: 'skillManager', method: 'releaseList', args: {} })).releases).toEqual([])
    const created = await gateway.invoke({ namespace: 'skillManager', method: 'skillCreate', args: { operationId: 'strict-create', request: { title: 'Strict真实调用' } } })
    expect(created.skill.title).toBe('Strict真实调用')
  })
})
