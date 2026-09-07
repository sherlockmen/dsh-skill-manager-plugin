import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Usage: node scripts/verify-installed.mjs [package-directory] [harness-directory]
// Uses a temporary local Gateway and SQLite directory; starts no server/Profile.
const packageRoot = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
const harnessRoot = resolve(process.argv[3] ?? process.env.DSH_HARNESS_ROOT ?? join(packageRoot, '../../myself/deepseek-harness'))
const require = createRequire(join(harnessRoot, 'packages/api/gateway/package.json'))
const load = file => import(pathToFileURL(file).href)
const hostFile = join(packageRoot, 'lib/index.js')
const [host, remote, { Context, symbols }, { TypertRemoteService, RemoteError }, { default: Registry }, { default: Gateway }] = await Promise.all([
  load(hostFile), load(join(packageRoot, 'lib/remote.js')),
  load(require.resolve('@deepseek-ai/cordis')),
  load(join(harnessRoot, 'packages/typert/protocol/lib/index.js')),
  load(join(harnessRoot, 'packages/typert/registry/lib/index.js')),
  load(join(harnessRoot, 'packages/api/gateway/lib/index.js')),
])
const dataDir = await mkdtemp(join(tmpdir(), 'skill-manager-built-verification-'))
const ctx = new Context()
let service
try {
  await ctx.plugin(Registry)
  await ctx.plugin(Gateway)
  const Service = host.createServiceClass(TypertRemoteService, RemoteError)
  service = new Service(ctx, { dataDir, otlpPort: false }, DatabaseSync)
  await service.start()
  const gateway = ctx.get('typertGateway')
  const rawGateway = gateway[symbols.original] ?? gateway
  const descriptors = host.TYPERT_HOST_V1.invocations
  const byMethod = new Map(descriptors.map(descriptor => [descriptor.method, descriptor]))
  assert(host.inject.includes('typert'), 'Host must wait for the strict registry')
  for (const descriptor of descriptors) {
    const derived = rawGateway.resolveSrcDescriptor('skillManager', descriptor.method, `skillManager/${descriptor.method}`)
    assert.deepEqual(derived.parameters.map(parameter => parameter.wire), descriptor.parameters.map(parameter => parameter.wire), `Built SRC signature: ${descriptor.method}`)
    assert.deepEqual(derived.cancellation, descriptor.cancellation, `Built cancellation: ${descriptor.method}`)
  }
  for (const descriptor of remote.TYPERT_REMOTE.descriptors) {
    const server = byMethod.get(descriptor.method)
    assert(server, `Browser method missing in Host: ${descriptor.method}`)
    assert.deepEqual(descriptor.parameters.map(parameter => parameter.wire), server.parameters.map(parameter => parameter.wire), `Built Browser/Host wire: ${descriptor.method}`)
  }
  const invoke = (method, args) => gateway.invoke({ namespace: 'skillManager', method, args })
  assert.deepEqual((await invoke('skillList', { request: {} })).skills, [])
  const disposeStrict = ctx.get('typert').register(host.TYPERT_HOST_V1)
  try {
    assert.equal(ctx.get('typert').local.get('skillManager/skillList').parameters[0].codec.mode, 'strict')
    const created = await invoke('skillCreate', { operationId: 'verify-create', request: { title: '构建包验收 Skill' } })
    const scenario = await invoke('scenarioCreate', { operationId: 'verify-scenario', request: { name: '构建包验收场景', skillIds: [created.skill.skillId] } })
    assert.equal((await invoke('scenarioGet', { scenarioId: scenario.scenario.scenarioId })).scenario.name, '构建包验收场景')
    const files = { ...created.skill.files, 'SKILL.md': '# 构建包验收\n真实保存内容。' }
    const saved = await invoke('skillSave', { operationId: 'verify-save', request: { skillId: created.skill.skillId, expectedHash: created.skill.contentHash, files } })
    assert.notEqual(saved.skill.contentHash, created.skill.contentHash)
    assert.equal((await invoke('skillGet', { skillId: created.skill.skillId })).skill.files['SKILL.md'], files['SKILL.md'])
    const trace = await invoke('traceSample', {})
    assert.equal((await invoke('traceIngest', { operationId: 'verify-trace', request: trace.payload })).accepted, 3)
    assert.equal((await invoke('traceList', { request: {} })).traces.length, 1)
    // Deterministic acceptance workbook, parsed by the built Host over the real
    // Gateway. The rule is explicitly user-authored here, never a fake model.
    const packageRequire = createRequire(join(packageRoot, 'package.json'))
    const { default: ExcelJS } = await load(packageRequire.resolve('exceljs'))
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('验收记录').addRows([['订单号', '金额'], ['ORDER-1', 20], ['ORDER-1', 35], ['ORDER-2', 90]])
    const input = Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64')
    const uploaded = await invoke('scenarioAddSample', { operationId: 'verify-xlsx', request: { scenarioId: scenario.scenario.scenarioId, filename: 'acceptance.xlsx', input } })
    assert.equal(uploaded.samples[0].rows.length, 3)
    assert.deepEqual(uploaded.samples[0].sourceRegions, ['验收记录!A2:B2', '验收记录!A3:B3', '验收记录!A4:B4'])
    const rule = { ruleId: 'verify-rule', version: 1, canonicalFields: ['order', 'amount'], requiredFacts: ['order', 'amount'], status: 'candidate', layouts: [{ layoutId: 'verify-layout', headers: ['订单号', '金额'], mapping: { '订单号': 'order', '金额': 'amount' }, recordMode: 'group', groupBy: ['order'] }] }
    await invoke('scenarioSave', { operationId: 'verify-rule-save', request: { scenarioId: scenario.scenario.scenarioId, rules: [rule] } })
    assert.equal((await invoke('excelRulePublish', { operationId: 'verify-rule-publish', request: { scenarioId: scenario.scenario.scenarioId, ruleId: rule.ruleId } })).status, 'published')
    assert.equal((await invoke('excelRuleRegression', { scenarioId: scenario.scenario.scenarioId })).status, 'passed')
    const batch = await invoke('evaluationCreate', { operationId: 'verify-eval-create', request: { scenarioId: scenario.scenario.scenarioId, skillId: saved.skill.skillId } })
    assert.equal(batch.evaluation.cases.length, 2)
    assert.equal(batch.evaluation.cases[0].input.records.length, 2)
    assert.equal(batch.evaluation.snapshotHash, saved.skill.contentHash)
    // No model is installed in this isolated context. Verify that the built
    // service exposes that failure rather than manufacturing output or labels.
    const queued = await invoke('evaluationRun', { operationId: 'verify-eval-run', request: { evaluationId: batch.evaluation.evaluationId } })
    const deadline = Date.now() + 5000
    let job
    do { job = (await invoke('jobGet', { jobId: queued.job.jobId })).job; if (['completed', 'failed', 'cancelled'].includes(job.status)) break; await delay(10) } while (Date.now() < deadline)
    assert.equal(job.status, 'completed', 'Missing-model evaluation must finish with explicit per-case errors')
    const failed = (await invoke('evaluationGet', { evaluationId: batch.evaluation.evaluationId })).evaluation
    for (const testCase of failed.cases) {
      assert.equal(testCase.systemError?.code, 'evaluation/model-not-configured', 'Missing model must remain an explicit system failure')
      assert.equal(testCase.actual, undefined, 'Missing model cannot produce a synthetic result')
      assert.equal(testCase.grade, undefined, 'Missing model cannot write a human grade; rebuild if the artifact still auto-labels unknown')
    }
    assert.equal(failed.accuracy.denominator, 0)
    assert.equal((await invoke('releaseCheck', { skillId: saved.skill.skillId })).status, 'blocked')
    await assert.rejects(invoke('evaluationAnnotate', { operationId: 'verify-no-label', request: { evaluationId: batch.evaluation.evaluationId, caseId: failed.cases[0].caseId, grade: 'correct' } }), error => error.code === 'evaluation/no-result')
    // Fault injection runs only against this temporary database. The real SRC
    // must return the committed runtime fact, even when its manager projection
    // cannot persist; retries cannot create another v1 or duplicate the audit.
    const exceptionRequest = { skillId: saved.skill.skillId, exception: true, confirm: true, reason: 'Explicit isolated build acceptance exception' }
    const persistOperation = service.persistOperation.bind(service)
    service.persistOperation = (id, result, kind) => {
      if (kind === 'release.publish') throw new Error('verify manager persistence failure')
      return persistOperation(id, result, kind)
    }
    let committed
    try {
      committed = await invoke('releasePublish', { operationId: 'verify-runtime-publish', request: exceptionRequest })
      assert.equal(committed.status, 'published')
      assert.equal(committed.managerProjection.status, 'pending')
      assert.equal(Number(service.managerDb.prepare("SELECT COUNT(*) AS count FROM entities WHERE entity_type='release'").get().count), 0)
      assert.equal((await invoke('releaseGet', { releaseId: committed.release.releaseId })).release.releaseId, committed.release.releaseId)
      assert.equal((await invoke('releaseList', { skillId: saved.skill.skillId })).releases.length, 1)
      assert.equal((await invoke('skillDiff', { skillId: saved.skill.skillId })).release.releaseId, committed.release.releaseId)
      await assert.rejects(invoke('skillDelete', { operationId: 'verify-delete-protected', skillId: saved.skill.skillId }), error => error.code === 'skill/delete-protected')
    } finally { service.persistOperation = persistOperation }
    const replayed = await invoke('releasePublish', { operationId: 'verify-runtime-publish', request: exceptionRequest })
    assert.equal(replayed.replayed, true)
    assert.equal(replayed.release.releaseId, committed.release.releaseId)
    assert.equal(replayed.managerProjection.status, 'ready')
    const runtime = await invoke('runtimeStatus', { skillId: saved.skill.skillId })
    assert.equal(runtime.versions.length, 1)
    assert.equal(runtime.versions[0].loadStatus, 'unknown')
    assert.equal(Number(service.managerDb.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE entity_type='release' AND entity_id=? AND action='publish'").get(committed.release.releaseId).count), 1)
    await invoke('releasePublish', { operationId: 'verify-runtime-next', request: exceptionRequest })
    const managerExec = service.managerDb.exec.bind(service.managerDb)
    let failCommit = true
    service.managerDb.exec = sql => {
      if (failCommit && sql === 'COMMIT') { failCommit = false; throw new Error('verify manager commit failure') }
      return managerExec(sql)
    }
    try {
      const rollback = await invoke('releaseRollback', { operationId: 'verify-runtime-rollback', request: { releaseId: committed.release.releaseId } })
      assert.equal(rollback.status, 'rolled-back')
      assert.equal(rollback.managerProjection.status, 'pending')
    } finally { service.managerDb.exec = managerExec }
    const rollbackReplay = await invoke('releaseRollback', { operationId: 'verify-runtime-rollback', request: { releaseId: committed.release.releaseId } })
    assert.equal(rollbackReplay.replayed, true)
    assert.equal(rollbackReplay.managerProjection.status, 'ready')
    assert.equal((await invoke('runtimeStatus', { skillId: saved.skill.skillId })).releases[0].releaseId, committed.release.releaseId)
    assert.equal(Number(service.managerDb.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE entity_type='release' AND entity_id=? AND action='rollback'").get(committed.release.releaseId).count), 1)
    service.dispose(); service = undefined
    const db = new DatabaseSync(join(dataDir, 'manager.sqlite'), { readOnly: true })
    try {
      const persisted = JSON.parse(db.prepare("SELECT payload_json FROM entities WHERE entity_type='skill' AND entity_id=?").get(saved.skill.skillId).payload_json)
      assert.equal(persisted.files['SKILL.md'], files['SKILL.md'])
    } finally { db.close() }
  } finally { await disposeStrict() }
  console.log(JSON.stringify({ status: 'passed', packageRoot, harnessRoot, hostSha256: createHash('sha256').update(await readFile(hostFile)).digest('hex'), hostMethods: descriptors.length, browserMethods: remote.TYPERT_REMOTE.descriptors.length, modelNetworkCall: false, checks: ['built-signatures', 'browser-host-wire', 'real-src-gateway', 'real-strict-gateway', 'skill-create-save-read', 'scenario-reference', 'trace-ingest-read', 'xlsx-import-provenance', 'manual-parser-rule-publish-regression', 'grouped-frozen-evaluation', 'missing-model-cannot-grade-or-publish', 'runtime-publish-projection-replay', 'runtime-rollback-commit-replay', 'runtime-authoritative-release-read-and-delete-protection', 'sqlite-reopen'] }, null, 2))
} finally {
  service?.dispose()
  await ctx.fiber.dispose()
  await rm(dataDir, { recursive: true, force: true })
}
