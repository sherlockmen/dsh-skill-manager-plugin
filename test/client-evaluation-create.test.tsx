// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { EvaluationCreate } from '../src/client/evaluation-create.js'
import { chooseOption } from './select-helpers.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let host: HTMLDivElement; let root: Root
async function mount(api: any = {}) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const create = vi.fn(async () => false)
  await act(async () => root.render(<EvaluationCreate api={api} skills={[{ skillId: 'skill', title: '电仪及公用' } as any]} scenarios={[]} initialSkillId="skill" busy={false} onCreate={create} onDirtyChange={vi.fn()} />))
  return create
}
async function fill(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function submit() { await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))) }
afterEach(async () => { await act(async () => root?.unmount()); host?.remove() })
it('creates a named evaluation using plain text and preserves the form when creation fails', async () => {
  const create = await mount()
  await submit(); expect(host.textContent).toContain('请填写测评名称')
  await fill(host.querySelector('input[maxlength="120"]')!, '电仪-第1轮')
  await fill(host.querySelector('textarea')!, '检查记录：设备正常。')
  await submit()
  expect(create).toHaveBeenLastCalledWith({ name: '电仪-第1轮', skillId: 'skill', sourceInput: { kind: 'text', text: '检查记录：设备正常。', expected: '' } })
  expect(host.querySelector('textarea')?.value).toBe('检查记录：设备正常。')
})
it('previews Excel and sends the selected sheet and reference column to the Host', async () => {
  const api = { evaluationPreviewInput: vi.fn(async () => ({ sheets: [{ name: 'Sheet 1', count: 2, headers: ['业务', '答案'], preview: [{ 业务: '电仪', 答案: '通过' }] }] })) }
  const create = await mount(api)
  await fill(host.querySelector('input[maxlength="120"]')!, '导入验收')
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === '导入 Excel')!.click())
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
  const file = { name: '验收.xlsx', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }
  await act(async () => { Object.defineProperty(input, 'files', { configurable: true, value: [file] }); input.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(host.textContent).toContain('将导入 2 条记录')
  await chooseOption(host.querySelector<HTMLElement>('[aria-label="参考答案列"]')!, '答案')
  await submit()
  expect(create).toHaveBeenLastCalledWith({ skillId: 'skill', name: '导入验收', sourceInput: { kind: 'excel', filename: '验收.xlsx', input: 'AQID', sheet: 'Sheet 1', expectedColumn: '答案' } })
})
