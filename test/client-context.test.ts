import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, requestNativeExit, unwrapRemoteResult } from '../src/client/index.js'

const previousDocument = globalThis.document
const previousWindow = globalThis.window

function installDomStub(): void {
  const noop = () => {}
  const classList = { add: noop, remove: noop }
  const style = { removeProperty: noop }
  globalThis.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ dataset: {}, style: {}, classList: { add: noop, remove: noop } }),
    head: { appendChild: noop },
    documentElement: { classList, style, dataset: {} },
    body: { classList, dataset: {}, appendChild: noop, removeAttribute: noop },
  } as unknown as Document
  globalThis.window = {
    dispatchEvent: noop,
    history: { length: 1, back: noop },
  } as unknown as Window & typeof globalThis
}

function guardedContext(services: Record<string, unknown>, rejected: ReturnType<typeof vi.fn>): Record<string, any> {
  // Mirrors dynamicCordisContext: unknown property probes report a plugin
  // failure even when the caller catches the thrown error. `has` is safe.
  return new Proxy({}, {
    get(_target, property) {
      if (property === 'get') return (name: string) => services[name]
      if (property === 'slots' || property === 'remote') return services[property]
      rejected(property)
      throw new Error(`dynamic ctx does not expose "${String(property)}"`)
    },
    has: (_target, property) => ['get', 'slots', 'remote'].includes(String(property)),
  })
}

afterEach(() => {
  globalThis.document = previousDocument
  globalThis.window = previousWindow
})

describe('client context contract', () => {
  it('does not read optional Desktop or native layout services as undeclared properties', async () => {
    installDomStub()
    const registrations: unknown[] = []
    const base = {
      get: () => undefined,
      effect: (factory: () => unknown) => factory(),
      slots: { register: (...args: unknown[]) => { registrations.push(args); return () => {} } },
    }
    const ctx = new Proxy(base, {
      get(target, property, receiver) {
        if (['desktop', 'platform', 'titlebarInset', 'layout', 'uiLayout', 'events'].includes(String(property))) {
          throw new Error(`cannot get property "${String(property)}" without inject`)
        }
        return Reflect.get(target, property, receiver)
      },
    })

    await expect(apply(ctx)).resolves.toBeTypeOf('function')
    expect(registrations).toHaveLength(1)
    expect(() => requestNativeExit(ctx)).not.toThrow()
  })

  it('mounts the plugin Remote before registering the full-page root', async () => {
    installDomStub()
    const disposeRemote = vi.fn(async () => {})
    const remote: Record<string, any> = {
      $mount: vi.fn(async (contribution: any) => {
        remote.skillManager = { dashboardGet: vi.fn(async () => ({ ok: true, value: { status: 'empty' } })) }
        expect(contribution.package).toBe('@deepseek-ai/dsh-skill-manager-plugin')
        expect(contribution.descriptors.length).toBeGreaterThan(10)
        return disposeRemote
      }),
    }
    const register = vi.fn(() => vi.fn())
    const ctx = { remote, get: () => undefined, slots: { register } }

    const dispose = await apply(ctx)

    expect(remote.$mount).toHaveBeenCalledOnce()
    expect(register).toHaveBeenCalledOnce()
    const inject = register.mock.calls[0]?.[0] as { inject?: () => { api?: unknown } }
    expect(inject.inject?.().api).toBe(remote.skillManager)
    await dispose()
    expect(disposeRemote).toHaveBeenCalledOnce()
  })

  it('unwraps Gateway outcomes and preserves a useful failure', () => {
    expect(unwrapRemoteResult<{ id: string }>({ ok: true, value: { id: 'skill-1' } }, 'skillGet')).toEqual({ id: 'skill-1' })
    expect(() => unwrapRemoteResult({ ok: false, error: { code: 'skill/not-found', message: '未找到 Skill' } }, 'skillGet')).toThrow('未找到 Skill')
    expect(unwrapRemoteResult({ status: 'ready' }, 'preview')).toEqual({ status: 'ready' })
  })

  it('does not navigate the browser history when returning to native Harness', () => {
    installDomStub()
    const back = vi.fn()
    globalThis.window = { dispatchEvent: () => true, history: { length: 2, back } } as unknown as Window & typeof globalThis
    const disposeRoot = vi.fn()
    requestNativeExit({ get: () => undefined }, disposeRoot)
    expect(disposeRoot).toHaveBeenCalledOnce()
    expect(back).not.toHaveBeenCalled()
  })

  it.each(['web', 'desktop'])('mounts and leaves %s creator mode without rejected Context probes', async (surface) => {
    installDomStub()
    const rejected = vi.fn()
    const nativeRoot = { id: 'native', priority: 0 }
    const roots = [nativeRoot]
    const disposeRemote = vi.fn(async () => {})
    const api = { dashboardGet: vi.fn() }
    const services: Record<string, any> = {
      remote: { $mount: vi.fn(async () => { services['remote.skillManager'] = api; return disposeRemote }) },
      slots: { register: vi.fn((options: any) => {
        roots.unshift(options)
        return () => { roots.splice(roots.indexOf(options), 1) }
      }) },
    }
    services.remote = new Proxy(services.remote, {
      get(target, property) {
        if (property === '$mount') return target[property]
        rejected(`remote.${String(property)}`)
        throw new Error(`undeclared Remote member ${String(property)}`)
      },
    })
    if (surface === 'desktop') services.desktop = { titlebarInset: 28 }
    document.documentElement.style.setProperty = vi.fn()
    const ctx = guardedContext(services, rejected)
    const cleanup = await apply(ctx)
    expect(roots[0].id).toBe('skill-manager-root')
    const props = services.slots.register.mock.calls[0][0].inject()
    expect(props.api).toBe(api)

    props.onExit()
    await cleanup()

    expect(roots).toEqual([nativeRoot])
    expect(rejected).not.toHaveBeenCalled()
    expect(disposeRemote).toHaveBeenCalledOnce()
  })

  it('lets React remove its own tree when the root slot changes', async () => {
    installDomStub()
    const removeReactNode = vi.fn()
    document.querySelectorAll = vi.fn((selector: string) => selector.includes('data-sm-owner')
      ? [{ remove: removeReactNode }]
      : []) as unknown as Document['querySelectorAll']
    const unregister = vi.fn()
    const register = vi.fn(() => unregister)
    const cleanup = await apply({ get: () => undefined, slots: { register } })

    await cleanup()

    expect(unregister).toHaveBeenCalledOnce()
    expect(removeReactNode).not.toHaveBeenCalled()
  })

  it('disposes a failed UI child before unmounting the Remote', async () => {
    installDomStub()
    const events: string[] = []
    const disposeChild = vi.fn(async () => { events.push('child') })
    const disposeRemote = vi.fn(async () => { events.push('remote') })
    const ctx = {
      get: () => undefined,
      remote: { $mount: vi.fn(async () => disposeRemote) },
      slots: { register: vi.fn() },
      inject: vi.fn(() => Object.assign(Promise.reject(new Error('UI child failed')), { dispose: disposeChild })),
    }

    await expect(apply(ctx)).rejects.toThrow('UI child failed')

    expect(events).toEqual(['child', 'remote'])
    expect(disposeChild).toHaveBeenCalledOnce()
    expect(disposeRemote).toHaveBeenCalledOnce()
  })

  it.each([
    { surface: 'web', service: undefined, marker: '', rootTop: 0, inset: undefined, reserved: undefined },
    { surface: 'advanced desktop', service: { safeAreaInsets: { top: 20 }, dragRegion: { height: 32 } }, marker: '', rootTop: 0, inset: '32px', reserved: '0px' },
    { surface: 'framed desktop', service: { safeAreaInsets: { top: 36 }, dragRegion: { height: 36 } }, marker: '', rootTop: 36, inset: '0px', reserved: '36px' },
    { surface: 'desktop before its service loads', service: undefined, marker: '?dsh-desktop-mode=advanced&dsh-desktop-platform=darwin', rootTop: 0, inset: '32px', reserved: '0px' },
  ])('reserves only the missing native chrome for $surface', async ({ service, marker, rootTop, inset, reserved }) => {
    installDomStub()
    const setProperty = vi.fn()
    document.documentElement.style.setProperty = setProperty
    document.getElementById = vi.fn(() => ({ getBoundingClientRect: () => ({ top: rootTop }) })) as unknown as Document['getElementById']
    globalThis.window = { location: { search: marker } } as unknown as Window & typeof globalThis
    const cleanup = await apply({ get: (name: string) => name === 'desktopWindow' ? service : undefined, slots: { register: () => () => {} } })
    if (inset === undefined) expect(setProperty).not.toHaveBeenCalled()
    else {
      expect(setProperty).toHaveBeenCalledWith('--sm-desktop-titlebar', inset)
      expect(setProperty).toHaveBeenCalledWith('--sm-host-top', reserved)
    }
    await cleanup()
  })
})
