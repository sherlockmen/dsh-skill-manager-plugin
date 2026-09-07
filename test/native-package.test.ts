import { expect, it } from 'vitest'
import { inspectNativeYaml, readPackageYaml, updatePackageYaml } from '../src/domain/native-package.js'

it('rejects malformed YAML and duplicate keys rather than marking the package valid', () => {
  expect(inspectNativeYaml({ 'manifest.yaml': 'required_facts: [foo' })[0].code).toBe('skill/yaml-invalid')
  expect(inspectNativeYaml({ 'manifest.yaml': 'name: a\nname: b' })[0].code).toBe('skill/yaml-invalid')
  expect(inspectNativeYaml({ 'manifest.yaml': 'required_facts: foo' })[0].code).toBe('skill/manifest-field-invalid')
})

it('preserves unknown fields and comments while changing a visual field', () => {
  const source = '# package note\nname: original # identity\nrequired_facts: [month]\ncustom:\n  expression: coalesce(previous, rolling[6])\n'
  const changed = updatePackageYaml(source, ['name'], 'changed')
  expect(changed).toContain('# package note')
  expect(changed).toContain('# identity')
  expect(readPackageYaml(changed)).toEqual({ name: 'changed', required_facts: ['month'], custom: { expression: 'coalesce(previous, rolling[6])' } })
})

it('detects missing targets, loops and unreachable nodes using actual references', () => {
  const source = 'root: start\nnodes:\n  start:\n    next: end\n  end:\n    next: start\n  orphan:\n    next: absent\n'
  const codes = inspectNativeYaml({ 'rules/decision-tree.yaml': source }).map(error => error.code)
  expect(codes).toEqual(expect.arrayContaining(['skill/tree-cycle', 'skill/tree-unreachable', 'skill/tree-target-missing']))
  expect(inspectNativeYaml({ 'rules/decision-tree.yaml': 'root: start\nnodes:\n  start:\n    result: pass' })).toEqual([])
})

it('rejects model-generated branch maps that the native tree editor cannot interpret', () => {
  expect(inspectNativeYaml({ 'rules/decision-tree.yaml': 'root: start\nnodes:\n  start:\n    branches:\n      when:\n        - result: review\n' })).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'skill/tree-branches-invalid' })]))
})
