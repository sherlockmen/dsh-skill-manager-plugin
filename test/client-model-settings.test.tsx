// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ModelSettings } from '../src/client/model-settings.js'
import { chooseOption } from './select-helpers.js'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root; let host: HTMLDivElement
const value = { source: 'dsh-default', selection: { provider: 'dsh', model: 'preferred' }, providers: [{ id: 'dsh', name: 'DSH', models: [{ id: 'preferred', name: 'Preferred' }, { id: 'other', name: 'Other' }] }] }
async function mount(api: any, data: any = value) {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  const dirty = vi.fn()
  await act(async () => root.render(<ModelSettings api={api} value={data} loading={false} reload={vi.fn()} onNotice={vi.fn()} onDirtyChange={dirty} />))
  return dirty
}
function submit() { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }
afterEach(async () => { await act(async () => root?.unmount()); host?.remove() })
it('selects from the DSH catalog and saves only the route reference with persistent feedback', async () => {
  const save = vi.fn(async (..._args: any[]) => ({ ok: true, value: { status: 'saved' } })); const dirty = await mount({ settingsSave: save })
  await chooseOption(host.querySelector<HTMLElement>('[role="combobox"]')!, 'DSH / Other')
  expect(dirty).toHaveBeenLastCalledWith(true)
  await act(async () => submit())
  expect(save.mock.calls[0][1]).toEqual({ modelSelection: { mode: 'selected', provider: 'dsh', model: 'other' } })
  expect(host.querySelector('[role="status"]')?.textContent).toContain('模型选择已保存')
  expect(dirty).toHaveBeenLastCalledWith(false)
})
it('preserves an unsaved selection after a save error and lets the user retry', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('模型已移除')).mockResolvedValue({ ok: true, value: {} })
  await mount({ settingsSave: save })
  await chooseOption(host.querySelector<HTMLElement>('[role="combobox"]')!, 'DSH / Other')
  await act(async () => submit())
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('模型已移除')
  await act(async () => submit())
  expect(save).toHaveBeenCalledTimes(2)
})
