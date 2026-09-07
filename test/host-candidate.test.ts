import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import ExcelJS from 'exceljs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServiceClass } from '../src/host/service.js'

class RemoteService { constructor(public ctx: unknown, public name: string) {} }
class RemoteError extends Error { constructor(public code: string, message: string, public details: unknown) { super(message) } }
const Service = createServiceClass(RemoteService, RemoteError)

describe('real Host model candidate flow', () => {
  let service: InstanceType<typeof Service>
  let dataDir = ''
  let response: unknown
  let failure = false
  let requests: any[]
  let pauseStream: ((request: any) => Promise<void>) | undefined
  let usage: Record<string, number> | undefined
  let modelInfo: any
  let modelInfoCalls: any[]
  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'skill-manager-candidates-'))
    requests = []
    failure = false
    pauseStream = undefined
    usage = undefined
    modelInfo = undefined
    modelInfoCalls = []
    const llm = {
      listProviders: () => [{ id: 'provider' }], listModels: async () => [{ id: 'model' }],
      async resolveModelInfo(provider: string, model: string, signal: AbortSignal) { modelInfoCalls.push({ provider, model, signal }); return modelInfo },
      async *stream(request: unknown) {
        requests.push(request)
        await pauseStream?.(request)
        if (failure) throw Object.assign(new Error('Provider unavailable'), { code: 'model/unavailable' })
        yield { type: 'text-delta', text: JSON.stringify(response) }
        if (usage) yield { type: 'usage', usage }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
    const loader = { internal: { import: async () => ({ createUserMessage: (value: unknown) => value }) } }
    service = new Service({ get: (key: string) => ({ llm, loader })[key] }, { dataDir, otlpPort: false, provider: 'provider', model: 'model' }, DatabaseSync)
    await service.start()
  })
  afterEach(async () => { vi.useRealTimers(); service.dispose(); await rm(dataDir, { recursive: true, force: true }) })

  it.each(['mindmap', 'text'])('creates a %s source, edits branches and generates a Markdown-only candidate', async kind => {
    const { skill } = await service.skillCreate('new-source', { title: '规则', format: 'markdown', sourceInput: { kind, text: '金额超过200升级' } })
    expect(Object.keys(skill.files)).toEqual(['SKILL.md'])
    const mapId = skill.source.mindmapId
    const nodes = [{ id: 'root', parentId: null, title: '金额判断' }, { id: 'branch', parentId: 'root', title: '金额超过200升级' }]
    await service.mindmapUpdate('edit-tree', { mindmapId: mapId, nodes })
    await expect(service.mindmapUpdate('cycle', { mindmapId: mapId, nodes: [{ ...nodes[0], parentId: 'branch' }, nodes[1]] })).rejects.toThrow()
    expect((await service.mindmapGet(mapId)).mindmap.nodes).toEqual(nodes)
    response = { changes: [{ path: 'SKILL.md', before: skill.files['SKILL.md'], after: '# 规则\n金额超过200升级', reason: '来自来源分支' }] }
    const { candidate } = await service.mindmapGenerateCandidate('generate-md', { mindmapId: mapId, skillId: skill.skillId })
    expect(JSON.stringify(requests)).toContain('独立 Markdown Skill')
    const applied = await service.mindmapApplyCandidate('apply-md', { candidateId: candidate.candidateId, skillId: skill.skillId, selected: [0], expectedHash: skill.contentHash })
    expect((await service.skillGet(skill.skillId)).skill.files).toEqual({ 'SKILL.md': '# 规则\n金额超过200升级' })
    response = { changes: [{ path: 'manifest.yaml', before: '', after: 'name: invalid', reason: 'invalid' }] }
    await expect(service.mindmapGenerateCandidate('bad-md', { mindmapId: mapId, skillId: skill.skillId })).rejects.toThrow('Markdown')
  })

  async function source() {
    const { skill } = await service.skillCreate('skill', { title: '真实规则', files: { 'SKILL.md': '# 真实规则\n金额超过100才升级。' } })
    const { mindmap } = await service.mindmapCreate('map', { title: '来源', nodes: [{ id: 'root', parentId: null, title: '金额超过200才升级' }] })
    response = { changes: [{ path: 'SKILL.md', before: skill.files['SKILL.md'], after: '# 真实规则\n金额超过200才升级。', reason: '按来源节点调整阈值' }] }
    return { skill, mindmap }
  }

  it('calls Harness with the actual draft and source, then applies only the reviewed file change', async () => {
    const { skill, mindmap } = await source()
    const generated = await service.mindmapGenerateCandidate('generate', { mindmapId: mindmap.mindmapId, skillId: skill.skillId })
    expect(requests).toHaveLength(1)
    expect(JSON.stringify(requests[0])).toContain('金额超过100')
    expect(JSON.stringify(requests[0])).toContain('金额超过200')
    expect((await service.skillGet(skill.skillId)).skill.contentHash).toBe(skill.contentHash)
    const saved = await service.mindmapApplyCandidate('apply', { candidateId: generated.candidate.candidateId, skillId: skill.skillId, selected: [0] })
    expect(saved.skill.files['SKILL.md']).toBe('# 真实规则\n金额超过200才升级。')
    expect(saved.skill.files['manifest.yaml']).toBe(skill.files['manifest.yaml'])
    expect(saved.skill.contentHash).not.toBe(skill.contentHash)
    expect((await service.mindmapApplyCandidate('apply', { candidateId: generated.candidate.candidateId, skillId: skill.skillId, selected: [0] })).replayed).toBe(true)
  })

  it('repairs unreachable generated nodes before returning a reviewable candidate', async () => {
    const { skill, mindmap } = await source()
    const path = 'rules/decision-tree.yaml'
    response = { changes: [{ path, before: skill.files[path], after: 'root: start\nnodes:\n  start:\n    branches: [{otherwise: output}]\n  output:\n    branches: [{otherwise: end}]\n  end:\n    branches: [{otherwise: end}]', reason: '固定输出' }] }
    pauseStream = async () => { if (requests.length === 2) response = { changes: [{ path, before: skill.files[path], after: 'root: start\nnodes:\n  start:\n    result: 鼠鼠大王', reason: '固定结果直接终止' }] } }
    const { candidate, status } = await service.mindmapGenerateCandidate('repair-tree', { mindmapId: mindmap.mindmapId, skillId: skill.skillId })
    expect(requests).toHaveLength(2)
    expect(JSON.stringify(requests[1])).toContain('从根节点不可达')
    expect(status).toBe('ready'); expect(candidate.validation.errors).toEqual([])
    expect((await service.skillGet(skill.skillId)).skill.contentHash).toBe(skill.contentHash)
    await service.mindmapApplyCandidate('apply-repaired', { candidateId: candidate.candidateId, skillId: skill.skillId, selected: [0] })
    expect((await service.skillValidate(skill.skillId)).status).toBe('passed')
  })

  it('retains a blocked candidate with exact errors when repair fails, then permits explicit repair', async () => {
    const { skill, mindmap } = await source()
    const path = 'rules/decision-tree.yaml'
    response = { changes: [{ path, before: skill.files[path], after: 'root: start\nnodes:\n  start: {next: missing}' }] }
    pauseStream = async () => { if (requests.length === 2) failure = true }
    const generated = await service.mindmapGenerateCandidate('bad-tree', { mindmapId: mindmap.mindmapId, skillId: skill.skillId })
    expect(generated.status).toBe('blocked')
    expect(generated.candidate.repairMessage).toContain('原候选已保留')
    await expect(service.mindmapApplyCandidate('bad-apply', { candidateId: generated.candidate.candidateId, skillId: skill.skillId, selected: [0] })).rejects.toThrow('不存在的 missing')
    expect((await service.skillGet(skill.skillId)).skill.contentHash).toBe(skill.contentHash)
    failure = false; pauseStream = undefined
    response = { changes: [{ path, before: skill.files[path], after: 'root: start\nnodes:\n  start: {result: 鼠鼠大王}' }] }
    const repaired = await service.mindmapGenerateCandidate('manual-repair', { mindmapId: mindmap.mindmapId, skillId: skill.skillId, repairCandidateId: generated.candidate.candidateId })
    expect(repaired.candidate.validation.status).toBe('passed')
    expect(JSON.stringify(requests.at(-1))).toContain('待修复候选')
    await expect(service.mindmapGenerateCandidate('forged-repair', { mindmapId: mindmap.mindmapId, skillId: skill.skillId, repairCandidateId: 'unknown' })).rejects.toMatchObject({ code: 'candidate/stale' })
  })

  it('rejects stale drafts and invalid or empty selections without writing', async () => {
    const { skill, mindmap } = await source()
    const { candidate } = await service.mindmapGenerateCandidate('generate', { mindmapId: mindmap.mindmapId, skillId: skill.skillId })
    await expect(service.mindmapApplyCandidate('empty', { candidateId: candidate.candidateId, skillId: skill.skillId, selected: [] })).rejects.toMatchObject({ code: 'candidate/invalid-selection' })
    await expect(service.mindmapApplyCandidate('bad', { candidateId: candidate.candidateId, skillId: skill.skillId, selected: [99] })).rejects.toMatchObject({ code: 'candidate/invalid-selection' })
    await service.skillSave('edit', { skillId: skill.skillId, expectedHash: skill.contentHash, files: { ...skill.files, 'SKILL.md': '# 手动编辑' } })
    await expect(service.mindmapApplyCandidate('stale', { candidateId: candidate.candidateId, skillId: skill.skillId, selected: [0] })).rejects.toMatchObject({ code: 'candidate/stale' })
  })

  it('preserves the source and draft on model failure or invalid output', async () => {
    const { skill, mindmap } = await source()
    failure = true
    await expect(service.mindmapGenerateCandidate('failure', { mindmapId: mindmap.mindmapId, skillId: skill.skillId })).rejects.toMatchObject({ code: 'model/unavailable' })
    failure = false
    response = { changes: [{ path: '../escape', before: '', after: 'invalid' }] }
    await expect(service.mindmapGenerateCandidate('invalid', { mindmapId: mindmap.mindmapId, skillId: skill.skillId })).rejects.toMatchObject({ code: 'model/invalid-output' })
    expect((await service.skillGet(skill.skillId)).skill.contentHash).toBe(skill.contentHash)
    expect((await service.mindmapGet(mindmap.mindmapId)).mindmap.nodes).toEqual(mindmap.nodes)
  })

  it('executes the frozen Skill files and uses persisted model suggestions, rejecting forged client content', async () => {
    const { skill } = await source()
    response = { decision: '升级' }
    const { evaluation } = await service.evaluationCreate('eval', { skillId: skill.skillId, cases: [{ input: { amount: 150 } }] })
    expect(evaluation.executionProfile).toMatchObject({ provider: 'provider', model: 'model' })
    await service.evaluationRun('run', { evaluationId: evaluation.evaluationId })
    await expect.poll(async () => (await service.evaluationGet(evaluation.evaluationId)).evaluation.status).toBe('completed')
    const completed = (await service.evaluationGet(evaluation.evaluationId)).evaluation
    expect(completed.cases[0].traceId).toMatch(/^[a-f0-9]{32}$/)
    expect((await service.traceGet(completed.cases[0].traceId)).traceId).toBe(completed.cases[0].traceId)
    expect(JSON.stringify(requests[0])).toContain('金额超过100')
    await service.evaluationAnnotate('label', { evaluationId: evaluation.evaluationId, caseId: evaluation.cases[0].caseId, grade: 'incorrect', correction: '应该无需升级' })
    response = { changes: [{ path: 'SKILL.md', before: skill.files['SKILL.md'], after: '# 修正规则\n金额超过200才升级。', caseId: evaluation.cases[0].caseId, reason: '人工错误标注' }] }
    const optimized = await service.evaluationOptimize(evaluation.evaluationId)
    expect(requests).toHaveLength(2)
    expect(JSON.stringify(requests[1])).toContain('应该无需升级')
    await expect(service.evaluationApplySuggestion('forged', { evaluationId: evaluation.evaluationId, suggestion: { suggestionId: 'forged', after: '恶意覆盖' } })).rejects.toMatchObject({ code: 'suggestion/not-found' })
    const result = await service.evaluationApplySuggestion('suggestion', { evaluationId: evaluation.evaluationId, suggestion: { ...optimized.suggestions[0], after: '客户端伪造' } })
    expect(result.skill.files['SKILL.md']).toBe('# 修正规则\n金额超过200才升级。')
    expect((await service.evaluationGet(evaluation.evaluationId)).evaluation.status).toBe('stale')
  })

  it('imports a real workbook, persists worksheet provenance, and generates grouped records through a model rule', async () => {
    const { skill } = await source()
    const { scenario } = await service.scenarioCreate('scenario', { name: '订单', region: 'province', skillIds: [skill.skillId] })
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('订单明细')
    sheet.addRows([['订单号', '金额'], ['A', 30], ['A', 40], ['B', 90]])
    const input = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')
    const imported = await service.scenarioAddSample('xlsx', { scenarioId: scenario.scenarioId, filename: '订单.xlsx', input })
    expect(imported.samples[0]).toMatchObject({ sheet: '订单明细', headers: ['订单号', '金额'], rows: [{ '订单号': 'A', '金额': 30 }, { '订单号': 'A', '金额': 40 }, { '订单号': 'B', '金额': 90 }] })
    expect(imported.samples[0].sourceRegions).toEqual(['订单明细!A2:B2', '订单明细!A3:B3', '订单明细!A4:B4'])
    expect((await service.scenarioGet(scenario.scenarioId)).scenario.samples[0].sheet).toBe('订单明细')
    expect((await service.scenarioAddSample('xlsx', { scenarioId: scenario.scenarioId, filename: '订单.xlsx', input })).replayed).toBe(true)
    response = { canonicalFields: ['order', 'amount'], requiredFacts: ['order', 'amount'], layouts: [{ headers: ['订单号', '金额'], mapping: { '订单号': 'order', '金额': 'amount' }, recordMode: 'group', groupBy: ['order'] }] }
    const generated = await service.excelRuleGenerate('rule', { scenarioId: scenario.scenarioId })
    expect(requests).toHaveLength(1)
    expect(generated.preview).toHaveLength(2)
    expect(generated.preview[0].input).toEqual({ order: 'A', records: [{ order: 'A', amount: 30 }, { order: 'A', amount: 40 }] })
    await service.excelRuleConfirm('confirm-rule', { scenarioId: scenario.scenarioId, ruleId: generated.rule.ruleId, publish: true })
    expect((await service.excelRuleRegression(scenario.scenarioId)).status).toBe('passed')
    const batch = await service.evaluationCreate('sheet-eval', { scenarioId: scenario.scenarioId, skillId: skill.skillId })
    expect(batch.evaluation.cases).toHaveLength(2)
    expect(batch.evaluation.cases[0].source.regions).toEqual(['订单明细!A2:B2', '订单明细!A3:B3'])
  })

  it('rejects unreadable Excel data without changing samples and isolates edits to their source map', async () => {
    const { scenario } = await service.scenarioCreate('scenario', { name: '订单', region: 'province' })
    await expect(service.scenarioAddSample('bad-xlsx', { scenarioId: scenario.scenarioId, filename: '订单.xlsx', input: Buffer.from('not Excel').toString('base64') })).rejects.toMatchObject({ code: 'excel/invalid-sample' })
    expect((await service.scenarioGet(scenario.scenarioId)).scenario.samples).toEqual([])
    const a = (await service.mindmapCreate('a', { title: '甲' })).mindmap
    const b = (await service.mindmapCreate('b', { title: '乙' })).mindmap
    await service.mindmapUpdate('edit-a', { mindmapId: a.mindmapId, nodeId: 'root', title: '甲更新' })
    expect((await service.mindmapGet(a.mindmapId)).mindmap.nodes[0].title).toBe('甲更新')
    expect((await service.mindmapGet(b.mindmapId)).mindmap.nodes[0].title).toBe('乙')
  })

  it('uses the saved Trace retention setting as the actual cleanup default', async () => {
    expect((await service.settingsGet()).settings.traceRetentionDays).toBe(30)
    await service.settingsSave('retention', { traceRetentionDays: 7 })
    const before = Date.now()
    const result = await service.traceCleanup('cleanup', {})
    const cutoffMs = Number(BigInt(result.cutoff) / 1_000_000n)
    expect(cutoffMs).toBeGreaterThanOrEqual(before - 7 * 86400000)
    expect(cutoffMs).toBeLessThanOrEqual(Date.now() - 7 * 86400000)
    await expect(service.settingsSave('bad-retention', { traceRetentionDays: 0 })).rejects.toThrow()
    expect((await service.settingsGet()).settings.traceRetentionDays).toBe(7)
  })

  it('reports real Skill titles and scenario coverage and excludes stale quality evidence', async () => {
    const { skill } = await source()
    await service.scenarioCreate('coverage', { name: '覆盖场景', skillIds: [skill.skillId] })
    response = { decision: '升级' }
    const { evaluation } = await service.evaluationCreate('quality', { skillId: skill.skillId, cases: [{ input: { amount: 150 }, expected: { decision: '升级' } }] })
    const pending = await service.dashboardGet()
    expect(pending.coverage).toEqual({ scenarioCount: 1, linkedSkillCount: 1, totalSkillCount: 1 })
    expect(pending.sections.find(section => section.id === 'work').items[0]).toMatchObject({ title: '真实规则', status: 'pending' })
    expect(pending.sections.find(section => section.id === 'skills').items[0].detail).toContain('1 个场景引用')
    await service.evaluationRun('quality-run', { evaluationId: evaluation.evaluationId })
    await expect.poll(async () => (await service.evaluationGet(evaluation.evaluationId)).evaluation.status).toBe('completed')
    const quality = await service.dashboardGet()
    expect(quality.sections.find(section => section.id === 'quality').items[0].title).toBe('真实规则')
    await service.skillSave('make-stale', { skillId: skill.skillId, expectedHash: skill.contentHash, files: { ...skill.files, 'SKILL.md': '# 已修改' } })
    const stale = await service.dashboardGet()
    expect(stale.sections.find(section => section.id === 'quality').items).toEqual([])
    expect(stale.sections.find(section => section.id === 'work').items[0].detail).toContain('旧测评不能用于发布')
  })

  it('aggregates production success and P95 from complete linked traces only and preserves unknown metrics', async () => {
    const { skill } = await source()
    expect((await service.dashboardGet()).productionMetrics).toMatchObject({ count: 0, successRate: null, p95Ms: null })
    const nowNs = BigInt(Date.now()) * 1_000_000n
    const span = (id: string, code: number, duration: number, linked = true, parent?: string) => ({
      traceId: id.repeat(32), spanId: id.repeat(16), ...(parent ? { parentSpanId: parent.repeat(16) } : {}), name: 'skill.run', kind: 1,
      startTimeUnixNano: nowNs.toString(), endTimeUnixNano: (nowNs + BigInt(duration) * 1_000_000n).toString(), status: { code },
      attributes: [{ key: 'trace.source', value: { stringValue: 'production' } }, { key: 'event_id', value: { stringValue: `production-${id}` } }, ...(linked ? [{ key: 'skill.id', value: { stringValue: skill.skillId } }] : [])],
    })
    await service.traceIngest('prod', { resourceSpans: [{ scopeSpans: [{ spans: [span('1', 1, 100), span('2', 2, 900), span('3', 0, 300), span('4', 1, 800, false), span('5', 1, 5000, true, '9')] }] }] })
    const metrics = (await service.dashboardGet()).productionMetrics
    expect(metrics).toMatchObject({ count: 4, completeCount: 3, assessedCount: 2, unknownCount: 2, successRate: 0.5, p95Ms: 900 })
  })

  it('aborts the active Harness stream and cannot overwrite cancellation with completed', async () => {
    const { skill } = await source()
    pauseStream = request => new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true }))
    const { evaluation } = await service.evaluationCreate('cancel-create', { skillId: skill.skillId, cases: [{ input: { amount: 1 } }] })
    const running = await service.evaluationRun('cancel-run', { evaluationId: evaluation.evaluationId })
    await expect.poll(() => requests.length).toBe(1)
    await service.evaluationCancel('cancel-active', { evaluationId: evaluation.evaluationId })
    expect(requests[0].signal.aborted).toBe(true)
    await expect.poll(async () => (await service.evaluationGet(evaluation.evaluationId)).evaluation.status).toBe('cancelled')
    expect((await service.jobGet(running.job.jobId)).job.status).toBe('cancelled')
    expect((await service.evaluationMetrics(evaluation.evaluationId)).metrics).toMatchObject({ systemFailed: 0, notExecuted: 1, executionPending: 0, pendingAnnotations: 0 })
  })

  it('preserves a concurrent manual annotation and stale snapshot while saving an in-flight result', async () => {
    const { skill } = await source()
    let release: () => void = () => {}
    pauseStream = () => requests.length === 1 ? Promise.resolve() : new Promise<void>(resolve => { release = resolve })
    response = { amount: 1 }
    const { evaluation } = await service.evaluationCreate('concurrent-create', { skillId: skill.skillId, cases: [{ input: { amount: 1 } }, { input: { amount: 2 } }] })
    const running = await service.evaluationRun('concurrent-run', { evaluationId: evaluation.evaluationId })
    await expect.poll(() => requests.length).toBe(2)
    await service.evaluationAnnotate('concurrent-label', { evaluationId: evaluation.evaluationId, caseId: evaluation.cases[0].caseId, grade: 'incorrect', correction: '保留人工修正' })
    await service.skillSave('concurrent-draft', { skillId: skill.skillId, expectedHash: skill.contentHash, files: { ...skill.files, 'SKILL.md': '# 新规则' } })
    release()
    await expect.poll(async () => (await service.jobGet(running.job.jobId)).job.status).toBe('cancelled')
    const saved = (await service.evaluationGet(evaluation.evaluationId)).evaluation
    expect(saved.status).toBe('stale')
    expect(saved.cases[0]).toMatchObject({ actual: { amount: 1 }, grade: 'incorrect', correction: '保留人工修正' })
  })

  it('records only real model attempts, their usage and parent edges, without exposing model content', async () => {
    const { skill } = await source()
    response = { privateText: '模型输出正文不进入公开Span' }
    usage = { inputTokens: 11, outputTokens: 7, cacheReadTokens: 3, totalTokens: 21 }
    pauseStream = async () => { if (requests.length === 1) throw Object.assign(new Error('Rate limited'), { code: 'model/429' }) }
    const { evaluation } = await service.evaluationCreate('attempts-create', { skillId: skill.skillId, cases: [{ input: { amount: 1 } }] })
    await service.evaluationRun('attempts-run', { evaluationId: evaluation.evaluationId })
    await expect.poll(async () => (await service.evaluationGet(evaluation.evaluationId)).evaluation.status).toBe('completed')
    const finished = (await service.evaluationGet(evaluation.evaluationId)).evaluation
    const trace = await service.traceGet(finished.cases[0].traceId)
    expect(requests).toHaveLength(2)
    expect(trace.nodes).toHaveLength(3)
    expect(trace.edges).toHaveLength(2)
    const attempts = trace.nodes.filter(node => node.name === 'model.invoke')
    expect(attempts.map(node => node.status)).toEqual(['error', 'ok'])
    expect(attempts[1].attributes).toMatchObject({ 'gen_ai.provider.name': 'provider', 'gen_ai.request.model': 'model', 'dsh.usage.input_tokens': '11', 'dsh.usage.output_tokens': '7', 'dsh.usage.cache_read_tokens': '3', 'dsh.usage.total_tokens': '21' })
    expect(attempts[0].attributes).not.toHaveProperty('dsh.usage.total_tokens')
    expect(JSON.stringify(trace)).not.toContain('模型输出正文不进入公开Span')
  })

  it('preserves legacy automatic grades as review evidence, not human accuracy', async () => {
    const { skill } = await source()
    const { evaluation } = await service.evaluationCreate('legacy', { skillId: skill.skillId, cases: [{ input: { amount: 1 }, expected: { ok: true } }] })
    const legacy = { ...evaluation, status: 'completed', cases: [{ ...evaluation.cases[0], actual: { ok: true }, grade: 'correct' }], accuracy: { numerator: 1, denominator: 1, value: 1 } }
    service.managerDb.prepare("UPDATE entities SET payload_json=? WHERE entity_type='evaluation' AND entity_id=?").run(JSON.stringify(legacy), evaluation.evaluationId)
    const context = service.ctx
    const config = service.config
    service.dispose()
    service = new Service(context, config, DatabaseSync)
    await service.start()
    const restored = (await service.evaluationGet(evaluation.evaluationId)).evaluation
    expect(restored.cases[0]).toMatchObject({ previousJudgment: { grade: 'correct' }, comparison: { status: 'match' } })
    expect(restored.cases[0].grade).toBeUndefined()
    expect(restored.accuracy.denominator).toBe(0)
    const labeled = await service.evaluationAnnotate('legacy-human', { evaluationId: evaluation.evaluationId, caseId: evaluation.cases[0].caseId, grade: 'correct' })
    expect(labeled.evaluation.accuracy).toEqual({ numerator: 1, denominator: 1, value: 1 })
    expect(labeled.evaluation.cases[0].annotationOrigin).toBe('human')
  })

  it('bounds candidate generation even when a model stream ignores abort and releases the write queue', async () => {
    const { skill, mindmap } = await source()
    pauseStream = () => new Promise<void>(() => {})
    vi.useFakeTimers()
    const generated = service.mindmapGenerateCandidate('deadline', { skillId: skill.skillId, mindmapId: mindmap.mindmapId })
    const rejected = expect(generated).rejects.toMatchObject({ code: 'model/timeout' })
    await vi.advanceTimersByTimeAsync(0)
    expect(requests).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(120_000)
    await rejected
    expect(requests[0].signal.aborted).toBe(true)
    expect((await service.skillGet(skill.skillId)).skill.contentHash).toBe(skill.contentHash)
    expect((await service.mindmapGet(mindmap.mindmapId)).mindmap.nodes).toEqual(mindmap.nodes)
    expect((await service.skillSave('after-timeout', { skillId: skill.skillId, expectedHash: skill.contentHash, files: skill.files })).status).toBe('saved')
  })

  it('distinguishes unexecuted cases, returned unannotated results and actual system failures', async () => {
    const { skill } = await source()
    response = { actual: 1 }
    const { evaluation } = await service.evaluationCreate('metrics', { skillId: skill.skillId, cases: [{ input: { value: 1 } }, { input: { value: 2 } }] })
    expect((await service.evaluationMetrics(evaluation.evaluationId)).metrics).toMatchObject({ executionPending: 2, systemFailed: 0, pendingAnnotations: 0, notExecuted: 2 })
    const run = await service.evaluationRun('metrics-run', { evaluationId: evaluation.evaluationId })
    await expect.poll(async () => (await service.jobGet(run.job.jobId)).job.status).toBe('completed')
    expect((await service.evaluationMetrics(evaluation.evaluationId)).metrics).toMatchObject({ executionPending: 0, executed: 2, systemFailed: 0, pendingAnnotations: 2, denominator: 0 })
    expect((await service.evaluationStatus(evaluation.evaluationId)).progress).toMatchObject({ completed: 2, pending: 0, pendingAnnotations: 2 })
    const noModel = (await service.evaluationCreate('metrics-failed', { skillId: skill.skillId, cases: [{ input: { value: 3 } }] })).evaluation
    const get = service.ctx.get
    service.ctx.get = key => key === 'llm' ? undefined : get(key)
    const failed = await service.evaluationRun('metrics-failed-run', { evaluationId: noModel.evaluationId })
    await expect.poll(async () => (await service.jobGet(failed.job.jobId)).job.status).toBe('completed')
    expect((await service.evaluationMetrics(noModel.evaluationId)).metrics).toMatchObject({ executionPending: 0, systemFailed: 1, pendingAnnotations: 0, notExecuted: 0, denominator: 0 })
  })

  it('selects advertised off effort for candidate JSON only and forwards frozen evaluation reasoning unchanged', async () => {
    const { skill, mindmap } = await source()
    modelInfo = { provider: 'provider', id: 'model', reasoning: { efforts: [{ id: 'off' }, { id: 'high' }], defaultEffort: 'high' } }
    await service.mindmapGenerateCandidate('reasoning-candidate', { skillId: skill.skillId, mindmapId: mindmap.mindmapId })
    expect(modelInfoCalls[0]).toMatchObject({ provider: 'provider', model: 'model' })
    expect(modelInfoCalls[0].signal).toBeInstanceOf(AbortSignal)
    expect(requests[0].reasoningEffort).toBe('off')
    expect(modelInfo.reasoning.defaultEffort).toBe('high')
    response = { ok: true }
    const { evaluation } = await service.evaluationCreate('reasoning-eval', { skillId: skill.skillId, executionProfile: { provider: 'provider', model: 'model', reasoningEffort: 'high' }, cases: [{ input: { amount: 1 } }] })
    expect(evaluation.executionProfile.reasoningEffort).toBe('high')
    const running = await service.evaluationRun('reasoning-run', { evaluationId: evaluation.evaluationId })
    await expect.poll(async () => (await service.jobGet(running.job.jobId)).job.status).toBe('completed')
    expect(requests[1].reasoningEffort).toBe('high')
    expect(modelInfoCalls).toHaveLength(1)
  })

  it('keeps Host reasoning defaults when the exact candidate route does not advertise off', async () => {
    const { skill, mindmap } = await source()
    modelInfo = { reasoning: { efforts: [{ id: 'low' }, { id: 'high' }], defaultEffort: 'high' } }
    await service.mindmapGenerateCandidate('reasoning-default', { skillId: skill.skillId, mindmapId: mindmap.mindmapId })
    expect(requests[0]).not.toHaveProperty('reasoningEffort')
    const { evaluation } = await service.evaluationCreate('default-eval', { skillId: skill.skillId, cases: [{ input: { amount: 1 } }] })
    response = { ok: true }
    const running = await service.evaluationRun('default-run', { evaluationId: evaluation.evaluationId })
    await expect.poll(async () => (await service.jobGet(running.job.jobId)).job.status).toBe('completed')
    expect(requests[1]).not.toHaveProperty('reasoningEffort')
  })
})
