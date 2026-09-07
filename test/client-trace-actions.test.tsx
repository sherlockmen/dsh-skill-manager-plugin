// @vitest-environment jsdom
import { chooseOption } from './select-helpers.js'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillManagerApp } from '../src/client/index.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
let host: HTMLDivElement
const ok = (value: unknown) => ({ ok: true, value })
const traces = [
  { traceId: 'trace-model', source: 'workbench-test', status: 'ok', nodes: [
    { spanId: 'root', name: 'Request A', status: 'ok' },
    { spanId: 'model-a', parentSpanId: 'root', name: 'model.first', status: 'ok' },
    { spanId: 'model-b', parentSpanId: 'model-a', name: 'model.second', status: 'ok' },
  ], edges: [{ from: 'root', to: 'model-a' }, { from: 'model-a', to: 'model-b' }] },
  { traceId: 'trace-turn', source: 'workbench-test', status: 'ok', nodes: [{ spanId: 'turn', name: 'Request B', status: 'ok' }], edges: [] },
]
function api() {
  return {
    settingsHealth: vi.fn(async () => ok({ status: 'healthy' })),
    traceList: vi.fn(async () => ok({ traces })),
    traceGet: vi.fn(async (traceId: string) => ok(traces.find(trace => trace.traceId === traceId))),
  }
}
async function mount(service = api(), openFirst = true) {
  window.history.replaceState({}, '', '/#/traces')
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<SkillManagerApp api={service} onExit={vi.fn()} />) })
  if (openFirst) await click('Request A')
  return service
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === text || item.querySelector('strong')?.textContent === text)
  expect(button, `button ${text}`).toBeTruthy()
  await act(async () => { button!.click() })
}
async function filterModels() {
  await click('顺序列表')
  const select = host.querySelector<HTMLSelectElement>('[aria-label="节点类型筛选"]')!
  await chooseOption(select, 'model')
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined; host?.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

describe('real Trace page actions', () => {
  it('starts on a separate ledger and opens a single inspector only on demand', async () => {
    const service = await mount(api(), false)
    expect(service.traceGet).not.toHaveBeenCalled()
    expect(host.querySelector('.trace-ledger')).not.toBeNull()
    expect(host.querySelector('.trace-workspace')).toBeNull()
    await click('Request A')
    expect(host.querySelector('.trace-ledger')).toBeNull()
    expect(host.querySelector('.detail-pane')).toBeNull()
    await click('model.first')
    expect(host.querySelectorAll('.detail-pane')).toHaveLength(1)
    expect(host.querySelector('.trace-workspace')?.classList.contains('has-inspector')).toBe(true)
    await click('返回流程 / 顺序列表')
    expect(host.querySelector('.detail-pane')).toBeNull()
    expect(host.querySelector('.trace-node[aria-pressed="true"] strong')?.textContent).toBe('model.first')
    await click('返回 Trace 列表')
    expect(host.querySelector('.trace-ledger')).not.toBeNull()
  })
  it('never reports copied when the Clipboard API is unavailable or rejects', async () => {
    vi.stubGlobal('navigator', {})
    await mount()
    await click('复制 Trace ID')
    expect(host.querySelector('.sm-toast')?.textContent).not.toContain('已复制')
    expect(host.querySelector('.sm-toast')?.textContent).toContain('trace-model')
    const writeText = vi.fn(async () => { throw new Error('denied') })
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await click('复制 Trace ID')
    expect(writeText).toHaveBeenCalledWith('trace-model')
    expect(host.querySelector('.sm-toast')?.textContent).not.toContain('已复制')
  })

  it('copies only the matching selected detail and waits for an actual successful write', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const service = await mount()
    await click('返回 Trace 列表')
    let resolveDetail!: (value: ReturnType<typeof ok>) => void
    service.traceGet.mockImplementationOnce(() => new Promise(resolve => { resolveDetail = resolve }))
    await click('Request B')
    expect([...host.querySelectorAll('button')].find(button => button.textContent === '复制 Trace ID')?.disabled).toBe(true)
    expect(writeText).not.toHaveBeenCalled()
    await act(async () => { resolveDetail(ok(traces[1])) })
    await click('复制 Trace ID')
    expect(writeText).toHaveBeenCalledExactlyOnceWith('trace-turn')
    expect(host.querySelector('.sm-toast')?.textContent).toContain('已复制')
  })

  it('fits the actual graph into the viewport, preserves node filters and selection, and restores original size', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('graph-scroll') ? 320 : 0 })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('graph-scroll') ? 410 : 0 })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return Number.parseFloat(this.style.width) || 0 })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return Number.parseFloat(this.style.height) || 0 })
    await mount()
    await filterModels()
    await click('model.second')
    await click('完整链路')
    const scroll = host.querySelector<HTMLElement>('.graph-scroll')!
    scroll.scrollLeft = 90; scroll.scrollTop = 80
    await click('适应画布')
    const graph = host.querySelector<HTMLElement>('.gate-trace-topology')!
    expect(graph.style.transform).toMatch(/^scale\(0\./)
    const scale = Number(graph.style.transform.match(/scale\(([^)]+)\)/)?.[1])
    expect(graph.offsetWidth * scale).toBeLessThanOrEqual(320 - 48)
    expect(graph.offsetHeight * scale).toBeLessThanOrEqual(410 - 48)
    expect(scroll.scrollLeft).toBe(0); expect(scroll.scrollTop).toBe(0)
    expect(host.querySelector<HTMLSelectElement>('[aria-label="节点类型筛选"]')!.textContent).toBe('model')
    expect(host.querySelectorAll('.gate-trace-topology .trace-node')).toHaveLength(2)
    expect(host.querySelector('.detail-head h2')?.textContent).toBe('model.second')
    await click('model.first')
    expect(host.querySelector('.detail-head h2')?.textContent).toBe('model.first')
    await click('原始尺寸')
    expect(host.querySelector<HTMLElement>('.gate-trace-topology')!.style.transform).toBe('scale(1)')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="节点类型筛选"]')!.textContent).toBe('model')
  })

  it('resets hidden node filters when switching to a different Trace', async () => {
    await mount()
    await filterModels()
    await click('返回 Trace 列表')
    await click('Request B')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="节点类型筛选"]')!.textContent).toBe('全部类型')
    expect(host.querySelectorAll('.gate-trace-topology .trace-node')).toHaveLength(1)
    expect(host.querySelector('.gate-trace-topology .trace-node strong')?.textContent).toBe('Request B')
  })
})
