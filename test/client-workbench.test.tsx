// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SkillManagerApp } from '../src/client/index.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
let host: HTMLDivElement
const skill = (id: string) => ({ skillId: id, title: `测试 ${id}`, description: '', authority: 'province', files: { 'SKILL.md': `# ${id}`, 'manifest.yaml': 'required_facts: []', 'rules/decision-tree.yaml': 'root: start' }, draftVersion: 1, contentHash: `hash-${id}`, status: 'draft', source: { kind: 'blank' }, createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z' })
const ok = (value: unknown) => ({ ok: true, value })
function api() {
  const skills = [skill('one'), skill('two')]
  return {
    settingsHealth: vi.fn(async () => ok({ status: 'healthy' })),
    skillList: vi.fn(async () => ok({ skills })),
    skillGet: vi.fn(async (id: string) => ok({ skill: skills.find(item => item.skillId === id) })),
    releaseCheck: vi.fn(async () => ok({ status: 'blocked', checks: {} })),
    skillSave: vi.fn(async () => ({ ok: false, error: { code: 'skill/conflict', message: '草稿冲突，请重新读取' } })),
    skillImport: vi.fn(async (_op: string, request: any) => { const imported = { ...skill('imported'), title: request.title }; skills.push(imported); return ok({ skill: imported }) }),
    xmindSample: vi.fn(async () => { throw new Error('Import must read the selected file, never a sample') }),
  }
}
async function mount(service: ReturnType<typeof api>, onExit = vi.fn()) {
  window.history.replaceState({}, '', '/#/skills')
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(<SkillManagerApp api={service} onExit={onExit} />) })
  return onExit
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === text || (text.startsWith('测试 ') && item.querySelector('strong')?.textContent === text))
  expect(button, `button ${text}`).toBeTruthy()
  await act(async () => { button!.click() })
}
async function edit(value: string) {
  const textarea = host.querySelector('textarea[aria-label="SKILL.md 编辑器"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove(); vi.restoreAllMocks() })

describe('usable Skill workbench', () => {
  it('keeps multiple Skills reachable and guards unsaved navigation and native exit', async () => {
    const service = api(); const exit = await mount(service)
    await click('测试 one')
    await edit('# unsaved user content')
    await click('保存草稿')
    expect(service.skillSave).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('草稿冲突，请重新读取')
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('# unsaved user content')
    await click('▦Dashboard')
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('还有未保存修改')
    await click('继续编辑')
    await click('↩ 返回原生 Harness')
    expect(exit).not.toHaveBeenCalled()
    await click('继续编辑')
    await click('← Skill 列表')
    expect(host.textContent).toContain('这些更改还没有保存')
    await click('放弃未保存更改')
    await click('测试 two')
    expect(service.skillGet).toHaveBeenCalledWith('two')
    expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('# two')
  })

  it('imports the chosen XMind bytes through the real mutation contract', async () => {
    const service = api(); await mount(service)
    const file = new File(['user file'], '用户规则.xmind')
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([80, 75, 3, 4, 7]).buffer })
    const input = host.querySelector<HTMLInputElement>('input[aria-label="导入 XMind 文件"]')!
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(service.xmindSample).not.toHaveBeenCalled()
    expect(service.skillImport).toHaveBeenCalledWith(expect.any(String), { input: 'UEsDBAc=', title: '用户规则' }, undefined)
    expect(host.querySelector('h1')?.textContent).toBe('用户规则')
  })
})
