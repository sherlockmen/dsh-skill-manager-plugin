import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

// Exercise the shipped ModuleLoader artifact, not TS source. Re-indenting the
// compiled code can alter multiline template literals even when tsc/tests pass.
const artifact = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const dom = new JSDOM('<!doctype html><html><body><div id="test-root"></div></body></html>', {
  url: 'http://127.0.0.1/#/skills',
})
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? dom.window : dom.window[key] })
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true
// Vite sets NODE_ENV=production in its parent process. The shipped bundle is
// still production code; only React's test renderer needs its act export.
process.env.NODE_ENV = 'test'
const { default: React, act } = await import('react')
const { createRoot } = await import('react-dom/client')
const require = createRequire(import.meta.url)
let client
window.__ModuleLoader__ = { load(entry) { client = entry.factory(require) } }
vm.runInThisContext(await readFile(artifact, 'utf8'), { filename: artifact })
assert.equal(typeof client?.SkillManagerApp, 'function', 'Artifact must export the real app')

const source = '# First heading\n\nThird line\n\n## Fifth heading'
const skill = {
  skillId: 'bundle-newlines', title: 'Bundle newline regression', description: '', authority: 'province',
  files: { 'SKILL.md': source, 'manifest.yaml': 'required_facts: []', 'rules/decision-tree.yaml': 'root: start' },
  draftVersion: 1, contentHash: 'bundle-hash', status: 'draft', source: { kind: 'blank' },
  createdAt: '2026-09-07T00:00:00Z', updatedAt: '2026-09-07T00:00:00Z',
}
const ok = value => ({ ok: true, value })
const api = {
  settingsHealth: async () => ok({ status: 'healthy' }),
  skillList: async () => ok({ skills: [skill] }),
  skillGet: async id => { assert.equal(id, skill.skillId); return ok({ skill }) },
  releaseCheck: async () => ok({ status: 'blocked', checks: {} }),
}
const host = document.getElementById('test-root')
const root = createRoot(host)
const failures = []
function verify(label, action) {
  try { action(); console.log(`PASS ${label}`) } catch (error) { failures.push(error); console.error(`FAIL ${label}: ${error.message}`) }
}
async function click(label) {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent.trim() === label || item.querySelector('strong')?.textContent === label)
  assert.ok(button, `Expected button: ${label}`)
  await act(async () => { button.click() })
}
try {
  await act(async () => { root.render(React.createElement(client.SkillManagerApp, { api, onExit() {} })) })
  await click(skill.title)
  verify('source content survives ModuleLoader factory', () => {
    assert.equal(host.querySelector('textarea[aria-label="SKILL.md 编辑器"]')?.value, source)
  })
  verify('five-line source is counted as five lines', () => {
    assert.equal(host.querySelector('.editor-foot span:last-child')?.textContent, 'SKILL.md · 5 行')
  })
  await click('预览正文')
  verify('Markdown preview respects original line boundaries', () => {
    const preview = host.querySelector('[aria-label="SKILL.md 正文预览"]')
    assert.ok(preview, 'Markdown preview must be present')
    assert.deepEqual([...preview.children].map(node => [node.tagName, node.textContent]), [
      ['H1', 'First heading'], ['P', 'Third line'], ['H2', 'Fifth heading'],
    ])
  })
} finally {
  await act(async () => { root.unmount() })
  dom.window.close()
}
if (failures.length) throw new AggregateError(failures, `${failures.length} shipped client regression(s)`)
