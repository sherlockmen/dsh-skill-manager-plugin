// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillEditor } from '../src/client/skill-workspace.js'
import { SkillManagerApp } from '../src/client/index.js'
import type { SkillDraft } from '../src/contracts/index.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
let host: HTMLDivElement
const ok = (value: unknown) => ({ ok: true, value })
const skill: SkillDraft = { skillId: 'skill-history', title: '历史核对', description: '', authority: 'province', contentHash: 'current-draft-hash', draftVersion: 4, status: 'draft', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z', files: { 'SKILL.md': '# Current draft', 'manifest.yaml': 'name: history', 'rules/decision-tree.yaml': 'root: start' } }
const releases = [
  { releaseId: 'release-latest', skillId: skill.skillId, version: 'v3', contentHash: 'hash-latest', createdAt: skill.updatedAt, files: { 'SKILL.md': '# Latest release' } },
  { releaseId: 'release-original', skillId: skill.skillId, version: 'v1', contentHash: 'hash-original', createdAt: skill.createdAt, files: { 'SKILL.md': '# Original release' } },
]
function api() {
  return {
    releaseCheck: vi.fn(async () => ok({ status: 'blocked', checks: {} })),
    releaseList: vi.fn(async () => ok({ releases })),
    releaseGet: vi.fn(async (id: string) => ok({ release: releases.find(item => item.releaseId === id), active: false })),
    runtimeStatus: vi.fn(async () => ok({ versions: [] })),
    releaseRollback: vi.fn(),
  }
}
async function mount(service: ReturnType<typeof api>, releaseId: string) {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => root!.render(<SkillEditor api={service} skill={skill} initialReleaseId={releaseId} initialTab="versions" onChanged={vi.fn()} onNotice={vi.fn()} onNavigate={vi.fn()} onDirtyChange={vi.fn()} onCopy={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()} />))
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove(); vi.restoreAllMocks() })

describe('immutable release deep links', () => {
  it('carries Dashboard production and historical release targets through the actual App boundary', async () => {
    window.history.replaceState({}, '', '/#/dashboard')
    const service = {
      ...api(),
      settingsHealth: vi.fn(async () => ok({ status: 'healthy' })),
      skillList: vi.fn(async () => ok({ skills: [skill] })),
      skillGet: vi.fn(async () => ok({ skill })),
      traceList: vi.fn(async () => ok({ traces: [], total: 0 })),
      dashboardGet: vi.fn(async () => ok({
        status: 'ready', generatedAt: '2026-09-07T04:00:00.000Z',
        counts: { activeSkills: 1, publishedSkills: 1, publishReadySkills: 0, pendingEvaluations: 0, unmeasuredSkills: 0, traces24h: 1, releaseChanges30d: 2 },
        sections: [{ id: 'production', title: '生产表现', description: '', status: 'ready', items: [{ id: 'production-traces', title: '生产 Trace', detail: '1 条 · 24 小时', action: 'trace-list' }] }],
      })),
      releaseList: vi.fn(async () => ok({ releases, changes: [{ eventId: 'rollback-event', releaseId: 'release-original', skillId: skill.skillId, title: skill.title, version: 'v1', action: 'rollback', createdAt: skill.updatedAt, notificationStatus: 'pending', runtimeLoadStatus: 'unknown' }] })),
    }
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
    await act(async () => root!.render(<SkillManagerApp api={service} onExit={vi.fn()} />))
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-labelledby="production-title"] .release-item')!.click())
    expect(service.traceList).toHaveBeenLastCalledWith({ limit: 50, source: 'production', from: '2026-09-06T04:00:00.000Z', until: '2026-09-07T04:00:00.000Z' })
    expect(host.querySelector<HTMLSelectElement>('[aria-label="来源筛选"]')?.value).toBe('production')
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('.sm-nav-item')].find(button => button.textContent?.includes('Dashboard'))!.click() })
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-labelledby="release-title"] .release-item')!.click())
    expect(service.skillGet).toHaveBeenLastCalledWith(skill.skillId)
    expect(service.releaseGet).toHaveBeenCalledExactlyOnceWith('release-original')
    expect(host.querySelector('.gate-tab.is-active')?.textContent).toBe('版本')
    expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe('release-original')
    expect(host.textContent).toContain('# Original release')
    expect(host.querySelector('textarea')).toBeNull()
  })
  it('opens the clicked historical version instead of the first/latest release or current editor', async () => {
    const service = api()
    await mount(service, 'release-original')
    expect(host.querySelector('.gate-tab.is-active')?.textContent).toBe('版本')
    expect(service.releaseGet).toHaveBeenCalledExactlyOnceWith('release-original')
    expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe('release-original')
    expect(host.textContent).toContain('# Original release')
    expect(host.textContent).toContain('hash-original')
    expect(host.textContent).not.toContain('# Latest release')
    expect(host.querySelector('textarea')).toBeNull()
    expect(service.releaseRollback).not.toHaveBeenCalled()
  })

  it('does not silently substitute a different release when the target is missing', async () => {
    const service = api()
    await mount(service, 'missing-release')
    expect(service.releaseGet).toHaveBeenCalledExactlyOnceWith('missing-release')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('不属于当前 Skill')
    expect(host.textContent).not.toContain('# Latest release')
    expect(host.textContent).not.toContain('# Original release')
    expect([...host.querySelectorAll('button')].some(button => button.textContent?.startsWith('回滚到'))).toBe(false)
  })
})
