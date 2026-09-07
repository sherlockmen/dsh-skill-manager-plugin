// @vitest-environment jsdom
import React, { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManifestView, DecisionTreeView, MarkdownPreview, decisionRows, isSimpleExpression } from '../src/client/native-file-views.js'
import { SkillEditor, Versions } from '../src/client/skill-workspace.js'
import { readPackageYaml } from '../src/domain/native-package.js'
import type { SkillDraft } from '../src/contracts/index.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
let host: HTMLDivElement
async function mount(element: React.ReactNode) {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  await act(async () => { root!.render(element) })
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === text || item.querySelector('.rail-text')?.textContent === text)
  expect(button, `button ${text}`).toBeTruthy()
  await act(async () => { button!.click() })
}
async function input(selector: string, value: string) {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)!
  expect(field, selector).toBeTruthy()
  const prototype = field.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) })
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove(); vi.restoreAllMocks() })

const manifest = '# package comment\nid: original # stable id\nname: 原始名称\nauthority: province\nrequired_facts:\n  - province # province note\n  - sales # sales note\noutputs:\n  - result\ncustom:\n  nested: keep # unknown comment\n'
const tree = 'root: scope\nnodes:\n  scope:\n    fact: province\n    equals: 江苏\n    next: ratio\n  ratio:\n    expression: (current_sales - previous_sales) / previous_sales # formula note\n    branches:\n      - when: value > 0.40 # threshold note\n        result: 环比突增\n        custom: keep\n      - otherwise: 正常\n'
function viewHarness(Component: typeof ManifestView, initial: string, capture: (value: string) => void, raw = vi.fn()) {
  return function Harness() {
    const [source, setSource] = useState(initial)
    return <Component source={source} onChange={value => { capture(value); setSource(value) }} onOpenRaw={raw} />
  }
}

describe('native file adapters and real DOM views', () => {
  it('writes Manifest fields and individual list items into the same YAML without losing comments or unknown fields', async () => {
    let source = manifest
    const Harness = viewHarness(ManifestView, source, value => { source = value })
    await mount(<Harness />)
    await input('input[aria-label="Manifest name"]', '新的名称')
    await input('input[aria-label="required_facts 1"]', 'region')
    await click('添加输出字段')
    await input('input[aria-label="outputs 2"]', 'change_ratio')
    expect(readPackageYaml(source)).toMatchObject({ id: 'original', name: '新的名称', required_facts: ['region', 'sales'], outputs: ['result', 'change_ratio'], custom: { nested: 'keep' } })
    for (const comment of ['# package comment', '# stable id', '# province note', '# sales note', '# unknown comment']) expect(source).toContain(comment)
    const remove = host.querySelector<HTMLButtonElement>('button[aria-label="移除 required_facts 1"]')!
    await act(async () => { remove.click() })
    expect(readPackageYaml(source).required_facts).toEqual(['sales'])
    expect(source).toContain('# sales note')
  })

  it('shows declared tree hierarchy and edits branch values while retaining extension fields and comments', async () => {
    let source = tree
    const Harness = viewHarness(DecisionTreeView, source, value => { source = value })
    await mount(<Harness />)
    expect(host.querySelector('li[data-depth="1"]')?.textContent).toContain('ratio')
    const ratio = host.querySelector<HTMLButtonElement>('.native-tree-outline li[data-depth="1"] button')!
    await act(async () => { ratio.click() })
    expect(host.querySelector<HTMLInputElement>('input[aria-label="节点 expression"]')!.readOnly).toBe(false)
    await input('input[aria-label="分支 1 when"]', 'value > 0.50')
    const value = readPackageYaml(source) as any
    expect(value.nodes.ratio.branches[0]).toEqual({ when: 'value > 0.50', result: '环比突增', custom: 'keep' })
    expect(source).toContain('# threshold note'); expect(source).toContain('# formula note')
    expect(decisionRows('a', { a: { next: 'b' }, b: { next: 'a' }, disconnected: { next: 'missing' } })).toEqual([
      { id: 'a', depth: 0, missing: false, reference: false, disconnected: false },
      { id: 'b', depth: 1, missing: false, reference: false, disconnected: false },
      { id: 'a', depth: 2, missing: false, reference: true, disconnected: false },
      { id: 'disconnected', depth: 0, missing: false, reference: false, disconnected: true },
      { id: 'missing', depth: 1, missing: true, reference: false, disconnected: false },
    ])
  })

  it('keeps unsupported expressions and invalid YAML read-only, with explicit raw-file access', async () => {
    const source = 'root: complex\nnodes:\n  complex:\n    expression: coalesce(previous_sales, rolling_median[6])\n'
    const onChange = vi.fn(), raw = vi.fn()
    await mount(<DecisionTreeView source={source} onChange={onChange} onOpenRaw={raw} />)
    expect(host.querySelector<HTMLInputElement>('input[aria-label="节点 expression"]')!.readOnly).toBe(true)
    expect(host.textContent).toContain('复杂表达式或结构只读')
    expect(onChange).not.toHaveBeenCalled()
    expect(isSimpleExpression('(a - b) / b')).toBe(true)
    expect(isSimpleExpression('coalesce(a, b[6])')).toBe(false)
    await act(async () => { root!.render(<ManifestView source="required_facts: [invalid" onChange={onChange} onOpenRaw={raw} />) })
    await click('打开高级原始文件')
    expect(raw).toHaveBeenCalledOnce(); expect(onChange).not.toHaveBeenCalled()
  })

  it('renders headings, lists and code without interpreting HTML, event handlers or script links', async () => {
    await mount(<MarkdownPreview source={'# 文档\n\n## 规则\n- **重点**\n- `字段`\n\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[恶意链接](javascript:alert(1))\n```html\n<button onclick="attack()">x</button>\n```'} />)
    expect(host.querySelector('h1')?.textContent).toBe('文档')
    expect(host.querySelector('strong')?.textContent).toBe('重点')
    expect(host.querySelectorAll('li')).toHaveLength(2)
    expect(host.querySelector('script, img, a, button, [onclick], [onerror]')).toBeNull()
    expect(host.textContent).toContain('<script>alert(1)</script>')
    expect(host.querySelector('pre code')?.textContent).toContain('<button onclick="attack()">')
  })
})

const skill: SkillDraft = { skillId: 'skill-1', title: '真实文件', description: '', authority: 'province', files: { 'SKILL.md': '# 标题\n\n正文', 'manifest.yaml': manifest, 'rules/decision-tree.yaml': tree }, source: { kind: 'xmind', mindmapId: 'map-1' }, draftVersion: 1, contentHash: 'hash1', status: 'draft', createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z' }
const ok = (value: unknown) => ({ ok: true, value })
describe('Skill editor integration and version identity', () => {
  it('saves structured files through Host, keeps source hierarchy and unsaved source through file saves/refreshes', async () => {
    const nodes = [{ id: 'root', title: '来源根', parentId: null }, { id: 'child', title: '来源子节点', parentId: 'root' }, { id: 'leaf', title: '来源叶子', parentId: 'child' }]
    const api = { mindmapGet: vi.fn(async () => ok({ mindmap: { nodes } })), releaseCheck: vi.fn(async () => ok({ status: 'blocked', checks: {} })), skillSave: vi.fn(async () => ok({ validation: { status: 'passed' } })), mindmapUpdate: vi.fn(async () => ok({ status: 'ready' })) }
    const dirty = vi.fn(), notice = vi.fn()
    const props = { api, skill, onChanged: vi.fn(), onNotice: notice, onNavigate: vi.fn(), onDirtyChange: dirty, onCopy: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn() }
    await mount(<SkillEditor {...props} />)
    expect(host.querySelector('.editor-foot')?.textContent).toContain('3 行')
    expect(host.querySelector('[data-source-node="root"] > ul > [data-source-node="child"] > ul > [data-source-node="leaf"]')).toBeTruthy()
    await click('来源子节点')
    await input('.source-editor input', '尚未保存的源节点')
    expect(host.querySelector<HTMLButtonElement>('[data-source-node="leaf"] > button')!.disabled).toBe(true)
    await click('manifest.yaml')
    await input('input[aria-label="Manifest name"]', '表单修改')
    await click('高级原始文件')
    expect(host.querySelector<HTMLTextAreaElement>('textarea[aria-label="manifest.yaml 编辑器"]')!.value).toContain('name: 表单修改')
    await click('保存草稿')
    expect(api.skillSave).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ patch: expect.objectContaining({ files: expect.objectContaining({ 'manifest.yaml': expect.stringContaining('name: 表单修改') }) }) }), undefined)
    expect(dirty.mock.lastCall).toEqual([true])
    await act(async () => { root!.render(<SkillEditor {...props} skill={{ ...skill, updatedAt: '2026-09-07T00:01:00Z' }} />) })
    await click('来源子节点')
    expect(host.querySelector<HTMLInputElement>('.source-editor input')!.value).toBe('尚未保存的源节点')
    expect(dirty.mock.lastCall).toEqual([true])
    await click('保存来源节点')
    expect(api.mindmapUpdate).toHaveBeenCalledWith(expect.any(String), { mindmapId: 'map-1', nodeId: 'child', title: '尚未保存的源节点' }, undefined)
    expect(dirty.mock.lastCall).toEqual([false])
  })

  it.each([
    { projection: { status: 'ready' }, expected: '已切换生效版本，运行端加载状态等待确认' },
    { projection: { status: 'pending', message: '审计库暂时不可用' }, expected: '运行端已提交，管理台审计待对账：审计库暂时不可用' },
    { projection: { status: 'pending' }, expected: '运行端已提交，管理台审计待对账；运行端加载状态仍待确认' },
  ])('uses the confirmed release identity and accurately reports projection $projection.status', async ({ projection, expected }) => {
    const releases = [{ releaseId: 'A', version: 'v1', createdAt: skill.createdAt, files: { 'SKILL.md': 'version A' } }, { releaseId: 'B', version: 'v2', createdAt: skill.createdAt, files: { 'SKILL.md': 'version B' } }]
    let resolveB!: (value: unknown) => void
    const pendingB = new Promise(resolve => { resolveB = resolve })
    const api = { releaseList: vi.fn(async () => ok({ releases })), runtimeStatus: vi.fn(async () => ok({ status: 'ready', versions: [{ releaseId: 'A', loadStatus: 'unknown' }, { releaseId: 'B', loadStatus: 'loaded' }] })), releaseGet: vi.fn(async (id: string) => id === 'B' ? pendingB : ok({ release: releases[0], active: false })), releaseRollback: vi.fn(async () => ok({ status: 'rolled-back', managerProjection: projection })) }
    const notice = vi.fn()
    await mount(<Versions api={api} skill={skill} onChanged={vi.fn()} onNotice={notice} />)
    expect(host.textContent).toContain('运行端加载：未知')
    expect(host.textContent).not.toContain('运行端加载：ready')
    await click('回滚到 v1')
    await input('select', 'B')
    expect(host.textContent).toContain('正在读取所选版本')
    expect(host.textContent).not.toContain('version A')
    expect([...host.querySelectorAll('button')].some(button => button.textContent === '切换生效版本')).toBe(false)
    expect(api.releaseRollback).not.toHaveBeenCalled()
    await act(async () => { resolveB(ok({ release: releases[1], active: false })); await pendingB })
    expect(host.textContent).toContain('运行端加载：已加载')
    await click('回滚到 v2'); await click('切换生效版本')
    expect(api.releaseRollback).toHaveBeenCalledWith(expect.any(String), { releaseId: 'B' }, undefined)
    expect(notice).toHaveBeenLastCalledWith(expected)
  })

  it.each([
    { projection: { status: 'ready' }, expected: '发布版本已保存，运行端加载状态等待确认' },
    { projection: { status: 'pending', message: '审计库暂时不可用' }, expected: '运行端已提交，管理台审计待对账：审计库暂时不可用' },
  ])('reports the committed publish without overstating projection $projection.status', async ({ projection, expected }) => {
    const notice = vi.fn()
    const api = { releaseCheck: vi.fn(async () => ok({ status: 'ready', checks: {} })), releasePublish: vi.fn(async () => ok({ status: 'published', managerProjection: projection })), releaseList: vi.fn(async () => ok({ releases: [] })), runtimeStatus: vi.fn(async () => ok({ status: 'ready', versions: [] })) }
    await mount(<SkillEditor api={api} skill={{ ...skill, source: { kind: 'blank' } }} onChanged={vi.fn()} onNotice={notice} onNavigate={vi.fn()} onDirtyChange={vi.fn()} onCopy={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()} />)
    await click('发布')
    expect(api.releasePublish).toHaveBeenCalledWith(expect.any(String), { skillId: skill.skillId }, undefined)
    expect(notice).toHaveBeenLastCalledWith(expected)
    expect(host.textContent).toContain('不可变发布版本')
  })
})
