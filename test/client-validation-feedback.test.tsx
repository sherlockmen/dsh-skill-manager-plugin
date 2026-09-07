// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { SkillEditor } from '../src/client/skill-workspace.js'
import { validateSkillDraft } from '../src/domain/index.js'
import type { SkillDraft } from '../src/contracts/index.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root; let host: HTMLDivElement
const skill: SkillDraft = { skillId: 'feedback', title: '流程测试', description: '', authority: 'province', contentHash: 'current', draftVersion: 1, status: 'draft', createdAt: '2026-09-07', updatedAt: '2026-09-07', source: { kind: 'text', mindmapId: 'source' }, files: { 'SKILL.md': '# 流程测试', 'manifest.yaml': 'name: test', 'rules/decision-tree.yaml': 'root: start' } }
const ok = (value: unknown) => ({ ok: true, value })
function api() {
  return {
    releaseCheck: vi.fn(async () => ok({ status: 'blocked', checks: { validation: validateSkillDraft(skill) } })),
    skillValidate: vi.fn(async () => ok({ validation: validateSkillDraft(skill) })),
    mindmapGet: vi.fn(async () => ok({ mindmap: { nodes: [{ id: 'root', title: '输出鼠鼠大王' }] } })),
    mindmapGenerateCandidate: vi.fn(), mindmapApplyCandidate: vi.fn(async () => ok({ skill })),
  }
}
async function mount(service: ReturnType<typeof api>) {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  const navigate = vi.fn(); const notice = vi.fn()
  await act(async () => root.render(<SkillEditor api={service} skill={skill} onChanged={vi.fn()} onNotice={notice} onNavigate={navigate} onDirtyChange={vi.fn()} onCopy={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()} />))
  return { navigate, notice }
}
function button(label: string) { const item = [...host.querySelectorAll('button')].find(node => node.textContent?.trim() === label); expect(item, label).toBeTruthy(); return item! }
async function click(label: string) { await act(async () => button(label).click()) }
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); vi.restoreAllMocks() })

it('keeps a completed check result and offers the next action after the request finishes', async () => {
  const service = api(); let finish!: (value: any) => void
  service.skillValidate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const { navigate } = await mount(service)
  await click('运行校验')
  expect(button('正在校验…').disabled).toBe(true)
  await act(async () => finish(ok({ validation: validateSkillDraft(skill) })))
  const result = host.querySelector('.sm-validation-feedback')!
  expect(result.textContent).toContain('本次结构校验通过')
  expect(result.textContent).toContain('不运行模型')
  expect(document.activeElement).toBe(result)
  await click('前往测评中心')
  expect(navigate).toHaveBeenCalledWith('evaluations', { skillId: skill.skillId })
  expect(service.skillValidate).toHaveBeenCalledWith(skill.skillId)
})

it('distinguishes a request failure from a failed validation and supports retry', async () => {
  const service = api(); service.skillValidate.mockRejectedValueOnce(new Error('连接中断'))
  await mount(service); await click('运行校验')
  expect(host.querySelector('.sm-validation-feedback')?.textContent).toContain('本次校验未完成')
  expect(host.querySelector('.sm-validation-feedback')?.textContent).toContain('连接中断')
  await click('重试校验')
  expect(host.querySelector('.sm-validation-feedback')?.textContent).toContain('本次结构校验通过')
})

it('shows invalid selected changes before apply and lets the model repair the persisted candidate', async () => {
  const service = api(); const path = 'rules/decision-tree.yaml'
  const changes = [{ path, before: skill.files[path], after: 'root: start\nnodes:\n  start: {branches: [{otherwise: output}]}\n  output: {result: 鼠鼠大王}', reason: '固定输出' }]
  service.mindmapGenerateCandidate.mockResolvedValueOnce(ok({ candidate: { candidateId: 'invalid', changes } }))
  service.mindmapGenerateCandidate.mockResolvedValueOnce(ok({ candidate: { candidateId: 'repaired', changes: [{ ...changes[0], after: 'root: start\nnodes:\n  start: {result: 鼠鼠大王}' }] } }))
  await mount(service); await click('生成候选差异')
  expect(host.querySelector('.sm-candidate-feedback')?.textContent).toContain('节点 output 从根节点不可达')
  expect(button('应用所选差异').disabled).toBe(true)
  expect(service.mindmapApplyCandidate).not.toHaveBeenCalled()
  await click('运行校验')
  expect(host.querySelector('.sm-validation-feedback')?.textContent).toContain('本次结果不包含这些候选内容')
  await click('让模型修复候选')
  expect(service.mindmapGenerateCandidate.mock.calls[1][1]).toMatchObject({ repairCandidateId: 'invalid' })
  expect(button('应用所选差异').disabled).toBe(false)
  await click('应用所选差异')
  expect(service.mindmapApplyCandidate.mock.calls[0][1]).toMatchObject({ candidateId: 'repaired', selected: [0] })
})

it('does not leave a successful check visible after editing the draft', async () => {
  const service = api(); await mount(service); await click('运行校验'); await act(async () => (host.querySelector('button.file-button[title="SKILL.md"]') as HTMLButtonElement).click())
  const input = host.querySelector('textarea[aria-label="SKILL.md 编辑器"]')!
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '# 新内容'); input.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(host.querySelector('.sm-validation-feedback')).toBeNull()
})
