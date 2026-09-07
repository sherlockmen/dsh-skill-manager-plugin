// @vitest-environment jsdom
import React, { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { SourceEditor } from '../src/client/source-editor.js'
import { mindMapToSource, sourceToMindMap, type SourceNode } from '../src/client/mindmap-data.js'
import { chooseOption } from './select-helpers.js'
import { WorkbenchSelect } from '../src/client/select.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
const source: SourceNode[] = [{ id: 'root', parentId: null, title: '规则' }, { id: 'a', parentId: 'root', title: '条件 A', origin: { sheetId: 'sheet-1' } }, { id: 'b', parentId: 'root', title: '条件 B' }]

describe('open source editor integration', () => {
  it('retains provenance and identity when a node is moved and renamed', () => {
    const data = sourceToMindMap(source)
    const [a, b] = data.nodeData.children!
    a.topic = '改写条件'; b.children = [a]; data.nodeData.children = [b]
    expect(mindMapToSource(data, source)).toEqual([source[0], source[2], { ...source[1], parentId: 'b', title: '改写条件' }])
  })
  it('undoes an external topic edit with the library history and saves the restored source', async () => {
    const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
    const save = vi.fn(async () => {})
    try {
      await act(async () => root.render(<SourceEditor nodes={source} selectedId="a" textMode={false} readOnly={false} onDirtyChange={() => {}} onSave={save} onGenerate={async () => {}} generating={false} />))
      const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="节点内容"]')!
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '新条件'); input.dispatchEvent(new Event('input', { bubbles: true })) })
      expect(host.querySelector('me-tpc[data-nodeid="mea"]')?.textContent).toContain('新条件')
      const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent === label)!
      await act(async () => button('撤销').click())
      expect(input.value).toBe('条件 A'); expect(button('保存来源').disabled).toBe(true)
      await act(async () => button('重做').click())
      expect(input.value).toBe('新条件')
      await act(async () => button('保存来源').click())
      expect(save).toHaveBeenCalledWith([source[0], { ...source[1], title: '新条件' }, source[2]])
    } finally { await act(async () => root.unmount()); host.remove() }
  })
  it('selects custom popup options by keyboard and preserves an empty filter value', async () => {
    const changed = vi.fn(); const host = document.body.appendChild(document.createElement('div')); const root = createRoot(host)
    function Filter() { const [value, setValue] = useState(''); return <WorkbenchSelect aria-label="筛选" value={value} onChange={e => { changed(e.target.value); setValue(e.target.value) }}><option value="">全部</option><option value="a">一个很长的 Skill 名称</option><option value="b" disabled>不可用</option></WorkbenchSelect> }
    try {
      await act(async () => root.render(<Filter />))
      const trigger = host.querySelector<HTMLElement>('[role="combobox"]')!
      await chooseOption(trigger, '一个很长的 Skill 名称'); expect(changed).toHaveBeenLastCalledWith('a')
      await chooseOption(trigger, '全部'); expect(changed).toHaveBeenLastCalledWith('')
      expect(document.querySelector('[role="listbox"]')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    } finally { await act(async () => root.unmount()); host.remove() }
  })
})
