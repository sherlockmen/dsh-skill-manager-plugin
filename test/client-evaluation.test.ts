/** @vitest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EvaluationsPage } from '../src/client/index.js'
import type { EvaluationBatch, SkillDraft } from '../src/contracts/index.js'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

function skill(id: string): SkillDraft {
  return { skillId: id, title: `Skill ${id}`, description: '', authority: 'province', files: { 'SKILL.md': '# Test', 'manifest.yaml': '', 'rules/decision-tree.yaml': '' }, draftVersion: 1, contentHash: 'a'.repeat(64), status: 'draft', createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z' }
}

function batch(id = 'eval-1', skillId = 'skill-1', status: EvaluationBatch['status'] = 'completed'): EvaluationBatch {
  return { evaluationId: id, skillId, snapshotHash: 'a'.repeat(64), skillSnapshot: skill(skillId), executionProfile: { provider: 'local-qwen', model: 'qwen-model' }, cases: [{ caseId: 'case-1', input: { amount: 1 }, actual: { ok: true }, actualOrigin: 'harness', traceId: 'trace-1' }, { caseId: 'case-2', input: { amount: 2 }, actual: { ok: false }, actualOrigin: 'harness' }], status, productionAligned: true, createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z' }
}

function bench(batches = [batch()]) {
  let revision = 0
  const jobs = new Map<string, Record<string, unknown>>()
  const envelope = (value: unknown) => ({ ok: true, value: structuredClone(value) })
  const update = (id: string, patch: Partial<EvaluationBatch>, job?: Record<string, unknown>) => {
    const value = batches.find(item => item.evaluationId === id)!
    Object.assign(value, patch, { updatedAt: `2026-09-07T00:00:${String(++revision).padStart(2, '0')}Z` })
    if (job) jobs.set(id, job)
    return envelope({ evaluation: value, job: jobs.get(id) })
  }
  const api = {
    evaluationList: vi.fn(async (request: { skillId?: string }) => envelope({ evaluations: batches.filter(item => !request.skillId || item.skillId === request.skillId) })),
    skillList: vi.fn(async () => envelope({ skills: [skill('skill-1'), skill('skill-2')] })),
    scenarioList: vi.fn(async () => envelope({ scenarios: [] })),
    evaluationStatus: vi.fn(async (id: string) => envelope({ evaluation: batches.find(item => item.evaluationId === id), job: jobs.get(id) })),
    evaluationRun: vi.fn(async (_operation: string, request: { evaluationId: string }) => update(request.evaluationId, { status: 'running', jobId: 'job-1' }, { jobId: 'job-1', status: 'running' })),
    evaluationCancel: vi.fn(async (_operation: string, request: { evaluationId: string }) => {
      const result = update(request.evaluationId, { status: 'running' }, { jobId: 'job-1', status: 'cancel-requested' })
      return envelope({ ...result.value as object, status: 'cancel-requested' })
    }),
    evaluationRerunFailed: vi.fn(async (_operation: string, request: { evaluationId: string }) => update(request.evaluationId, { status: 'running', jobId: 'job-2' }, { jobId: 'job-2', status: 'queued' })),
    evaluationAnnotate: vi.fn(async (_operation: string, request: { evaluationId: string; caseId: string; grade: string }) => {
      const value = batches.find(item => item.evaluationId === request.evaluationId)!
      const next = value.cases.map(item => item.caseId === request.caseId ? { ...item, grade: request.grade as 'correct' } : item)
      return update(request.evaluationId, { cases: next })
    }),
    evaluationCreate: vi.fn(),
    evaluationOptimize: vi.fn(),
    evaluationApplySuggestion: vi.fn(),
  }
  const onNavigate = vi.fn()
  const onNotice = vi.fn()
  const onDirtyChange = vi.fn()
  const render = async (initialSkillId = 'skill-1', initialEvaluationId = batches[0].evaluationId) => {
    await act(async () => root.render(React.createElement(EvaluationsPage, { api, refresh: 0, initialSkillId, initialEvaluationId, onChanged: vi.fn(), onNavigate, onNotice, onDirtyChange })))
  }
  return { api, render, onNavigate, onNotice, onDirtyChange, jobs }
}

function button(text: string): HTMLButtonElement {
  const value = [...container.querySelectorAll('button')].find(item => item.textContent === text)
  if (!value) throw new Error(`Missing button: ${text}`)
  return value
}

async function click(text: string) { await act(async () => button(text).click()) }

describe('live evaluation controls', () => {
  it('does not turn zero valid human labels into a zero-percent quality claim', async () => {
    const unlabelled = batch()
    unlabelled.accuracy = { value: 0, numerator: 0, denominator: 0 }
    const { render } = bench([unlabelled])
    await render()
    expect(container.querySelector('.context-belt')?.textContent).toContain('等待有效标注')
    expect(container.querySelector('.accuracy-head')?.textContent).toContain('— · 等待有效标注')
    expect(container.querySelector('.context-belt')?.textContent).not.toContain('主准确率 0%')
    expect(container.querySelector('.accuracy-head')?.textContent).not.toContain('0 / 0')
  })
  it('runs a fixed batch through Remote and can request cancellation', async () => {
    const pending = batch('eval-1', 'skill-1', 'pending')
    pending.cases = pending.cases.map(({ actual, actualOrigin, traceId, ...item }) => item)
    const { api, render } = bench([pending])
    await render()
    expect(container.textContent).toContain('local-qwen / qwen-model')
    expect(button('取消运行').disabled).toBe(true)

    await click('运行测评')
    expect(api.evaluationRun).toHaveBeenCalledWith(expect.stringContaining('evaluationRun:'), { evaluationId: 'eval-1' }, undefined)
    expect(button('取消运行').disabled).toBe(false)
    expect(container.textContent).toContain('任务 job-1 · 运行中')

    await click('取消运行')
    expect(api.evaluationCancel).toHaveBeenCalledOnce()
    expect(button('正在取消…').disabled).toBe(true)
    expect(container.textContent).toContain('等待取消')
  })

  it('shows backend failures and wires failed-case reruns', async () => {
    const failed = batch('eval-1', 'skill-1', 'failed')
    failed.jobId = 'job-failed'
    failed.cases[0] = { caseId: 'case-1', input: {}, grade: 'unknown', systemError: { code: 'model/unavailable', message: '本地模型未启动' } }
    const { api, render, jobs } = bench([failed])
    jobs.set('eval-1', { jobId: 'job-failed', status: 'failed', error: { code: 'job/failed', message: '本地模型未启动' } })
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('本地模型未启动')
    await click('仅重跑失败用例')
    expect(api.evaluationRerunFailed).toHaveBeenCalledWith(expect.stringContaining('evaluationRerunFailed:'), { evaluationId: 'eval-1' }, undefined)
    expect(container.textContent).toContain('任务 job-2 · 排队中')
  })

  it('keeps failed annotations and advances only after Host confirms a save', async () => {
    const { api, render, onDirtyChange } = bench()
    await render()
    await act(async () => container.querySelector<HTMLInputElement>('input[value="correct"]')!.click())
    expect(onDirtyChange).toHaveBeenLastCalledWith(true)
    api.evaluationAnnotate.mockRejectedValueOnce(new Error('SQLite 写入失败'))

    await click('保存并下一条')
    expect(container.querySelector('.case-head h2')?.textContent).toBe('case-1')
    expect(container.querySelector<HTMLInputElement>('input[value="correct"]')?.checked).toBe(true)
    expect(container.textContent).toContain('SQLite 写入失败')

    await click('保存并下一条')
    expect(container.querySelector('.case-head h2')?.textContent).toBe('case-2')
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })

  it('save-only stays on the case and protects case and batch changes with unsaved labels', async () => {
    const { render } = bench([batch(), batch('eval-2')])
    await render()
    await act(async () => container.querySelector<HTMLInputElement>('input[value="correct"]')!.click())
    await click('仅保存标注')
    expect(container.querySelector('.case-head h2')?.textContent).toBe('case-1')
    await act(async () => container.querySelector<HTMLInputElement>('input[value="incorrect"]')!.click())
    await act(async () => container.querySelectorAll<HTMLButtonElement>('.case-button')[1].click())
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('标注还未保存')
    await click('继续标注')
    expect(container.querySelector('.case-head h2')?.textContent).toBe('case-1')
    await click('切换批次')
    await act(async () => container.querySelectorAll<HTMLButtonElement>('.batch-option')[1].click())
    expect(container.querySelector('h1')?.textContent).toContain('eval-1')
    await click('放弃修改并切换')
    expect(container.querySelector('h1')?.textContent).toContain('eval-2')
  })

  it('filters by Skill and passes the exact Trace and Skill navigation targets', async () => {
    const { api, render, onNavigate } = bench([batch(), batch('eval-other', 'skill-2')])
    await render()
    expect(api.evaluationList).toHaveBeenCalledWith({ skillId: 'skill-1' })
    await click('打开顺序摘要')
    expect(onNavigate).toHaveBeenLastCalledWith('traces', { skillId: 'skill-1', evaluationId: 'eval-1', caseId: 'case-1', traceId: 'trace-1' })
    await click('回到 Skill 编辑 →')
    expect(onNavigate).toHaveBeenLastCalledWith('skills', { skillId: 'skill-1' })
    const filter = container.querySelector<HTMLSelectElement>('select[aria-label="按 Skill 筛选"]')!
    await act(async () => { filter.value = 'skill-2'; filter.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(api.evaluationList).toHaveBeenLastCalledWith({ skillId: 'skill-2' })
    expect(container.querySelector('h1')?.textContent).toContain('eval-other')
  })
})
