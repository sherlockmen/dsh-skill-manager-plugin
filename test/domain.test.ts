import { describe, expect, it } from 'vitest'
import { calculateAccuracy, evaluateCase, matchExcelLayout, missingSkillRefs, sanitizeSettings, validateSkillDraft } from '../src/domain/index.js'

const skill = (files: Record<string, string>) => ({
  skillId: 'skill-1', title: '报表判断', description: '', authority: 'province' as const, files,
  draftVersion: 1, contentHash: 'hash', status: 'draft' as const, createdAt: '', updatedAt: '',
})

describe('pure domain rules', () => {
  it('blocks missing package files and passes a complete package', () => {
    expect(validateSkillDraft(skill({ 'SKILL.md': '# x' })).status).toBe('blocked')
    expect(validateSkillDraft(skill({ 'SKILL.md': '# x', 'manifest.yaml': 'required_facts: []', 'rules/decision-tree.yaml': 'root: start' })).status).toBe('passed')
  })

  it('calculates human accuracy from judged cases only', () => {
    const cases = [
      { caseId: '1', input: null, grade: 'correct' as const },
      { caseId: '2', input: null, grade: 'incorrect' as const },
      { caseId: '3', input: null, grade: 'unknown' as const },
    ]
    expect(calculateAccuracy(cases)).toEqual({ numerator: 1, denominator: 2, value: 0.5 })
  })

  it('grades deterministic cases and matches one Excel layout', () => {
    expect(evaluateCase({ caseId: '1', input: { a: 1 }, expected: { ok: true }, actual: { ok: true } }).grade).toBe('correct')
    const layout = { layoutId: 'l1', headers: ['Province', 'Cycle'], mapping: { Province: 'province', Cycle: 'cycle' } }
    expect(matchExcelLayout([layout], ['province', 'cycle']).layout).toEqual(layout)
    expect(matchExcelLayout([], ['province']).reason).toBe('excel/no-layout-match')
  })

  it('reports missing scenario references and drops secrets recursively', () => {
    expect(missingSkillRefs({ skillIds: ['a', 'b'] } as never, new Set(['a']))).toEqual(['b'])
    expect(sanitizeSettings({ token: 'x', nested: { password: 'y', visible: true } })).toEqual({ nested: { visible: true } })
  })
})
