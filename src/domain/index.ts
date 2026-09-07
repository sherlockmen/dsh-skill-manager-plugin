import type { EvaluationBatch, EvaluationCase, SkillDraft, SkillValidation, Scenario } from '../contracts/index.js'
import { cloneJson, stableStringify } from '../contracts/index.js'
import { inspectNativeYaml } from './native-package.js'

export function contentHash(value: unknown, hash: (input: string) => string): string {
  return hash(stableStringify(value))
}

export function validateSkillDraft(draft: SkillDraft, now = new Date().toISOString()): SkillValidation {
  const errors: SkillValidation['errors'] = []
  const files = draft.files ?? ({} as SkillDraft['files'])
  const requiredFiles = ['SKILL.md', 'manifest.yaml', 'rules/decision-tree.yaml'] as const
  for (const path of requiredFiles) {
    if (typeof files[path] !== 'string' || files[path].trim().length === 0) errors.push({ code: 'skill/missing-file', path, message: `缺少必需文件 ${path}。` })
  }
  // Native packages may carry reference documents, but an arbitrary extra
  // file is not part of the runtime contract. Keeping this check in the
  // domain layer makes imports preserve unknown content while preventing it
  // from silently reaching a release.
  for (const path of Object.keys(files)) {
    if (!requiredFiles.includes(path as typeof requiredFiles[number]) && !path.startsWith('references/')) {
      errors.push({ code: 'skill/unknown-file', path, message: `文件 ${path} 不在 Skill 包契约中；请移除或移动到 references/。` })
    }
  }
  const manifest = files['manifest.yaml'] ?? ''
  const facts = [
    ...[...manifest.matchAll(/(?:required_facts|facts)\s*:\s*\[([^\]]*)\]/gi)]
      .flatMap(match => (match[1] ?? '').split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)),
    ...[...manifest.matchAll(/(?:required_facts|facts)\s*:\s*\n((?:\s*-\s*[^\n]+\n?)+)/gi)]
      .flatMap(match => [...(match[1] ?? '').matchAll(/^\s*-\s*([^#\n]+)$/gm)].map(item => item[1].trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)),
  ]
  for (const token of [...(files['SKILL.md'] ?? '').matchAll(/\b[a-z][a-z0-9_]{2,}\b/gi)].map(match => match[0])) {
    if ((token.endsWith('_cycle') || token.endsWith('_days')) && facts.length > 0 && !facts.includes(token)) {
      errors.push({ code: 'skill/required-fact-missing', path: 'manifest.yaml', message: `正文使用 ${token}，但 manifest 未声明 required_fact。` })
    }
  }
  if (draft.title.trim().length === 0) errors.push({ code: 'skill/title-empty', path: 'title', message: 'Skill 名称不能为空。' })
  errors.push(...inspectNativeYaml(files))
  return { status: errors.length === 0 ? 'passed' : 'blocked', errors, checkedAt: now, contentHash: draft.contentHash }
}

export function calculateAccuracy(cases: EvaluationCase[]): EvaluationBatch['accuracy'] {
  const judged = cases.filter(item => item.grade === 'correct' || item.grade === 'incorrect')
  const numerator = judged.filter(item => item.grade === 'correct').length
  return { numerator, denominator: judged.length, value: judged.length === 0 ? 0 : numerator / judged.length }
}

export function evaluateCase(input: EvaluationCase): EvaluationCase {
  if (input.expected === undefined || input.actual === undefined) return cloneJson(input)
  return { ...cloneJson(input), grade: stableStringify(input.expected) === stableStringify(input.actual) ? 'correct' : 'incorrect' }
}

export function markEvaluationStale(batch: EvaluationBatch, currentHash: string): EvaluationBatch {
  return batch.snapshotHash === currentHash ? batch : { ...batch, status: 'stale', updatedAt: new Date().toISOString() }
}

export function missingSkillRefs(scenario: Scenario, available: Set<string>): string[] {
  return scenario.skillIds.filter(id => !available.has(id))
}

export function matchExcelLayout(layouts: Scenario['rules'][number]['layouts'], headers: string[]): { layout?: Scenario['rules'][number]['layouts'][number]; reason?: string } {
  const normalizedHeaders = headers.map(header => header.trim().toLowerCase()).filter(Boolean)
  if (!normalizedHeaders.length || new Set(normalizedHeaders).size !== normalizedHeaders.length) return { reason: 'excel/invalid-headers' }
  const normalized = new Set(normalizedHeaders)
  const matches = layouts.filter(layout => {
    const required = layout.headers.map(header => header.trim().toLowerCase()).filter(Boolean)
    return required.length > 0 && new Set(required).size === required.length && required.every(header => normalized.has(header))
  })
  if (matches.length === 1) return { layout: matches[0] }
  return matches.length === 0 ? { reason: 'excel/no-layout-match' } : { reason: 'excel/multiple-layout-match' }
}

export function sanitizeSettings(input: Record<string, unknown>): Record<string, unknown> {
  const visit = (value: unknown, key = ''): unknown => {
    if (/(token|secret|password|api[_-]?key|authorization|cookie|credential)/i.test(key)) return undefined
    if (Array.isArray(value)) return value.map(item => visit(item)).filter(item => item !== undefined)
    if (value && typeof value === 'object') {
      const output: Record<string, unknown> = {}
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        const safe = visit(childValue, childKey)
        if (safe !== undefined) output[childKey] = safe
      }
      return output
    }
    if (typeof value === 'string') {
      // Values are retained for non-sensitive settings, but inline bearer
      // material is still removed when it appears in a free-form field.
      return value
        .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
        .replace(/((?:api[_-]?key|token|authorization|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    }
    return value
  }
  return visit(input) as Record<string, unknown>
}
