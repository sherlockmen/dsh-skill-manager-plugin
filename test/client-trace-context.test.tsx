// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillManagerApp, TracesPage } from '../src/client/index.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
let host: HTMLDivElement
const ok = (value: unknown) => ({ ok: true, value })
const skill = { skillId: 'skill-1', title: '核对 Skill', contentHash: 'fixed-snapshot-hash' }
const batch = {
  evaluationId: 'eval-1', skillId: 'skill-1', skillSnapshot: skill,
  snapshotHash: 'fixed-snapshot-hash', productionAligned: true, status: 'completed',
  executionProfile: { provider: 'configured-provider', model: 'configured-model', version: 'prod-config-v3' },
  cases: [
    { caseId: 'case-first', input: {}, actual: 'first', actualOrigin: 'harness', traceId: 'trace-first' },
    { caseId: 'case-second', input: {}, actual: 'second', actualOrigin: 'harness', traceId: 'trace-second' },
  ], createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z',
}
const traces = batch.cases.map(item => ({
  traceId: item.traceId, skillId: 'skill-1', source: 'workbench-test', status: 'ok', durationMs: 12,
  nodes: [{ spanId: item.caseId, name: item.caseId, status: 'ok', attributes: { 'evaluation.id': 'eval-1', 'evaluation.case_id': item.caseId } }], edges: [],
}))
function api() {
  return {
    settingsHealth: vi.fn(async () => ok({ status: 'healthy' })),
    skillList: vi.fn(async () => ok({ skills: [skill] })),
    scenarioList: vi.fn(async () => ok({ scenarios: [] })),
    evaluationList: vi.fn(async () => ok({ evaluations: [batch] })),
    evaluationStatus: vi.fn(async () => ok({ evaluation: batch })),
    traceList: vi.fn(async () => ok({ traces, total: traces.length })),
    traceGet: vi.fn(async (id: string) => ok(traces.find(item => item.traceId === id))),
  }
}
async function mount(element: React.ReactElement) {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(element) })
}
async function click(text: string) {
  const target = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === text)
  expect(target, 'button ' + text).toBeTruthy()
  await act(async () => { target!.click() })
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove(); vi.restoreAllMocks() })

describe('Trace object continuity', () => {
  it('sends the Dashboard production time window to Host and clears filters explicitly', async () => {
    const service = api()
    const from = '2026-09-06T04:00:00.000Z', until = '2026-09-07T04:00:00.000Z'
    await mount(<TracesPage api={service} refresh={0} initialSource="production" initialFrom={from} initialUntil={until} onChanged={vi.fn()} onNavigate={vi.fn()} onNotice={vi.fn()} />)
    expect(service.traceList).toHaveBeenLastCalledWith({ limit: 50, source: 'production', from, until })
    expect(host.querySelector<HTMLSelectElement>('[aria-label="来源筛选"]')?.value).toBe('production')
    expect(host.querySelector('.trace-time-filter')?.textContent).toContain('时间范围')
    await act(async () => { host.querySelectorAll<HTMLButtonElement>('.trace-list-item')[0].click() })
    await click('返回 Trace 列表')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="来源筛选"]')?.value).toBe('production')
    expect(host.querySelector('.trace-time-filter')).not.toBeNull()
    await click('清除时间范围')
    expect(service.traceList).toHaveBeenLastCalledWith({ limit: 50, source: 'production' })
    expect(host.querySelector('.trace-time-filter')).toBeNull()
    await click('清除筛选')
    expect(service.traceList).toHaveBeenLastCalledWith({ limit: 50 })
  })
  it('round-trips from the second evaluation case through Trace and restores that exact case', async () => {
    window.history.replaceState({}, '', '/#/evaluations')
    const service = api()
    await mount(<SkillManagerApp api={service} onExit={vi.fn()} />)
    await act(async () => { host.querySelectorAll<HTMLButtonElement>('.case-button')[1].click() })
    expect(host.querySelector('#case-title')?.textContent).toBe('case-second')
    await click('打开顺序摘要')
    expect(service.traceGet).toHaveBeenLastCalledWith('trace-second')
    expect(host.querySelector('.trace-ledger')).toBeNull()
    expect(host.querySelector('.context-belt')?.textContent).toContain('case-second')
    expect(host.querySelector('.context-belt')?.textContent).toContain('eval-1')
    expect(host.querySelector('.context-belt')?.textContent).toContain('fixed-snapshot-hash')
    expect(host.querySelector('.context-belt')?.textContent).toContain('prod-config-v3')
    expect(host.querySelector('.trace-execution-profile')?.textContent).toContain('configured-model')
    await click('返回用例标注')
    expect(service.evaluationStatus).toHaveBeenLastCalledWith('eval-1')
    expect(host.querySelector('#case-title')?.textContent).toBe('case-second')
    expect(document.activeElement).toBe(host.querySelector('#case-title'))
    await click('打开顺序摘要')
    expect(service.traceGet).toHaveBeenLastCalledWith('trace-second')
  })

  it('preserves the list filter when opening and returning from detail', async () => {
    const service = api()
    await mount(<TracesPage api={service} refresh={0} onChanged={vi.fn()} onNavigate={vi.fn()} onNotice={vi.fn()} />)
    const source = host.querySelector<HTMLSelectElement>('[aria-label="来源筛选"]')!
    await act(async () => { source.value = 'workbench-test'; source.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => { host.querySelectorAll<HTMLButtonElement>('.trace-list-item')[1].click() })
    expect(host.querySelector('.trace-ledger')).toBeNull()
    await click('返回 Trace 列表')
    expect(host.querySelector<HTMLSelectElement>('[aria-label="来源筛选"]')?.value).toBe('workbench-test')
    expect(service.traceList).toHaveBeenLastCalledWith({ limit: 50, source: 'workbench-test' })
  })

  it('keeps prior batch evidence out of a newly selected Trace while its context is loading', async () => {
    const service = api()
    const other = { ...traces[1], traceId: 'trace-other', nodes: [{ ...traces[1].nodes[0], attributes: { 'evaluation.id': 'eval-other', 'evaluation.case_id': 'case-other' } }] }
    service.traceList.mockResolvedValue(ok({ traces: [traces[0], other], total: 2 }))
    service.traceGet.mockImplementation(async id => ok(id === 'trace-other' ? other : traces[0]))
    await mount(<TracesPage api={service} refresh={0} onChanged={vi.fn()} onNavigate={vi.fn()} onNotice={vi.fn()} />)
    await act(async () => { host.querySelectorAll<HTMLButtonElement>('.trace-list-item')[0].click() })
    expect(host.querySelector('.context-belt')?.textContent).toContain('fixed-snapshot-hash')
    await click('返回 Trace 列表')
    let resolveBatch!: (value: ReturnType<typeof ok>) => void
    service.evaluationStatus.mockImplementationOnce(() => new Promise(resolve => { resolveBatch = resolve }))
    await act(async () => { host.querySelectorAll<HTMLButtonElement>('.trace-list-item')[1].click() })
    expect(host.querySelector('.context-belt')?.textContent).toContain('eval-other')
    expect(host.querySelector('.context-belt')?.textContent).not.toContain('fixed-snapshot-hash')
    expect(host.querySelector('.trace-execution-profile')).toBeNull()
    await act(async () => resolveBatch(ok({ evaluation: { ...batch, evaluationId: 'eval-other', snapshotHash: 'other-snapshot-hash' } })))
    expect(host.querySelector('.context-belt')?.textContent).toContain('other-snapshot-hash')
  })
})
