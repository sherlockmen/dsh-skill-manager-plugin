// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { DashboardPage, SkillManagerApp } from '../src/client/index.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
let host: HTMLDivElement
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove() })

it('renders each real quality state and threshold without painting a 0% row ready', async () => {
  window.history.replaceState({}, '', '/#/dashboard')
  const api = {
    settingsHealth: vi.fn(async () => ({ status: 'healthy' })),
    releaseList: vi.fn(async () => ({ releases: [] })),
    dashboardGet: vi.fn(async () => ({
      status: 'ready', generatedAt: '2026-09-07T00:00:00Z', counts: { activeSkills: 2, publishedSkills: 0, publishReadySkills: 0, pendingEvaluations: 2, unmeasuredSkills: 0, traces24h: 0, releaseChanges30d: 0 },
      sections: [
        { id: 'work', title: '待处理工作', description: '', status: 'partial', items: [
          { id: 'eval-config', skillId: 'config', title: '测评已完成', detail: '100% · 未配置活动场景门槛', status: 'unconfigured', action: 'evaluation' },
        ] },
        { id: 'quality', title: '测评质量', description: '', status: 'partial', items: [
          { id: 'eval-zero', skillId: 'zero', title: '零准确率', detail: '0% / 95%', minimumLabels: 5, labeled: 1, majorIssue: '准确率未达门槛；规则分支 1 条', status: 'below-threshold', action: 'evaluation' },
          { id: 'eval-local', skillId: 'local', title: '真实本机测评', detail: '100% / 90%', minimumLabels: 1, labeled: 1, majorIssue: '未与生产配置对齐', status: 'unaligned', action: 'evaluation' },
        ] },
      ],
    })),
  }
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<SkillManagerApp api={api} onExit={vi.fn()} />) })
  const rows = [...host.querySelectorAll('.quality-table tbody tr')]
  expect(rows[0].textContent).toContain('0% / 95%')
  expect(rows[0].textContent).toContain('有效标注 1 / 5')
  expect(rows[0].textContent).toContain('规则分支')
  expect(rows[0].querySelector('.sm-pill')?.textContent).toBe('未达标')
  expect(rows[0].querySelector('.sm-pill-green')).toBeNull()
  expect(rows[1].querySelector('.sm-pill')?.textContent).toBe('未生产对齐')
  const workSummary = host.querySelector('[aria-labelledby="attention-title"] .section-head .sm-pill')!
  expect(workSummary.textContent).toBe('需处理')
  expect(workSummary.textContent).not.toBe('待运行')
  expect(host.querySelector('.attention-reason .sm-pill')?.textContent).toBe('门槛未配置')
  expect(host.querySelectorAll('.region-grid > .region')).toHaveLength(4)
})

it('keeps release-fetch errors distinct from an empty release history and retries that region', async () => {
  window.history.replaceState({}, '', '/#/dashboard')
  const releaseList = vi.fn().mockRejectedValueOnce(new Error('发布事件读取失败')).mockResolvedValue({ releases: [], changes: [] })
  const api = { settingsHealth: vi.fn(async () => ({ status: 'healthy' })), releaseList, dashboardGet: vi.fn(async () => ({ status: 'empty' })) }
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<SkillManagerApp api={api} onExit={vi.fn()} />) })
  const region = host.querySelector('[aria-labelledby="release-title"]')!
  expect(region.textContent).toContain('发布事件读取失败')
  expect(region.textContent).not.toContain('尚无发布变更')
  const retry = [...region.querySelectorAll('button')].find(button => button.textContent?.includes('重试'))!
  expect(retry).toBeTruthy()
  await act(async () => { retry.click() })
  expect(releaseList).toHaveBeenCalledTimes(2)
  expect(region.textContent).toContain('最近 30 天暂无发布变更')
})

it('preserves the production window and exact rollback release in Dashboard drilldowns', async () => {
  const onNavigate = vi.fn()
  const api = {
    dashboardGet: vi.fn(async () => ({ status: 'ready', generatedAt: '2026-09-07T04:00:00.000Z', counts: { activeSkills: 1, publishedSkills: 1, publishReadySkills: 0, pendingEvaluations: 0, unmeasuredSkills: 0, traces24h: 1, releaseChanges30d: 2 }, sections: [{ id: 'production', status: 'ready', items: [{ id: 'production-traces', title: '生产 Trace', detail: '1 条 · 24 小时', action: 'trace-list' }] }] })),
    releaseList: vi.fn(async () => ({ releases: [], changes: [
      { eventId: 'rollback-event', releaseId: 'older-release', skillId: 'skill-one', title: '历史版本规则', version: 'v1', action: 'rollback', createdAt: '2026-09-07T02:00:00Z', notificationStatus: 'pending', runtimeLoadStatus: 'unknown' },
    ] })),
  }
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<DashboardPage api={api} refresh={0} onNavigate={onNavigate} onChanged={vi.fn()} onNotice={vi.fn()} />) })
  const production = host.querySelector<HTMLButtonElement>('[aria-labelledby="production-title"] .release-item')!
  await act(async () => { production.click() })
  expect(onNavigate).toHaveBeenLastCalledWith('traces', { traceSource: 'production', traceFrom: '2026-09-06T04:00:00.000Z', traceTo: '2026-09-07T04:00:00.000Z' })
  const rollback = host.querySelector<HTMLButtonElement>('[aria-labelledby="release-title"] .release-item')!
  expect(rollback.textContent).toContain('已回滚')
  expect(rollback.textContent).toContain('运行端加载未知')
  await act(async () => { rollback.click() })
  expect(onNavigate).toHaveBeenLastCalledWith('skills', { skillId: 'skill-one', releaseId: 'older-release', skillTab: 'versions' })
})
