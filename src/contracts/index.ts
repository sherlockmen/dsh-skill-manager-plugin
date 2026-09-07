/** Public, transport-neutral contracts shared by Host and Browser. */

export const PACKAGE_ID = '@deepseek-ai/dsh-skill-manager-plugin' as const
export const CONTRACT_VERSION = 1 as const
export const SCHEMA_VERSION = 2 as const

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type SkillAuthority = 'miit' | 'group' | 'province'
export type SkillStatus = 'draft' | 'archived'
export type EvaluationGrade = 'correct' | 'incorrect' | 'unknown'
export type TraceSource = 'production' | 'harness-native' | 'workbench-test'

export interface SkillFiles {
  'SKILL.md': string
  'manifest.yaml': string
  'rules/decision-tree.yaml': string
  [path: string]: string
}

export interface SkillDraft {
  skillId: string
  title: string
  description: string
  authority: SkillAuthority
  files: SkillFiles
  source?: { kind: 'xmind' | 'archive' | 'copy' | 'blank'; id?: string; mindmapId?: string; hash?: string }
  draftVersion: number
  contentHash: string
  status: SkillStatus
  createdAt: string
  updatedAt: string
}

export interface ValidationError {
  code: string
  path: string
  message: string
}

export interface SkillValidation {
  status: 'passed' | 'blocked'
  errors: ValidationError[]
  checkedAt: string
  contentHash: string
}

export interface MindMapNode {
  id: string
  parentId: string | null
  title: string
  level: number
  children?: string[]
}

export interface MindMapDraft {
  mindmapId: string
  title: string
  sourceFormat: 'content.json' | 'content.xml' | 'json'
  sourceHash: string
  sourceBase64?: string
  nodes: MindMapNode[]
  unsupported: Array<{ kind: string; count: number; detail?: string }>
  updatedAt: string
}

export interface ScenarioSample {
  sampleId: string
  filename: string
  headers: string[]
  rows: Array<Record<string, JsonValue>>
  sourceRegions: string[]
  createdAt: string
}

export interface ExcelLayout {
  layoutId: string
  sheet?: string
  headers: string[]
  mapping: Record<string, string>
}

export interface ExcelRule {
  ruleId: string
  version: number
  region: string
  scenarioId: string
  canonicalFields: string[]
  requiredFacts: string[]
  layouts: ExcelLayout[]
  status: 'candidate' | 'confirmed' | 'published'
  createdAt: string
  updatedAt: string
}

export interface Scenario {
  scenarioId: string
  name: string
  region: string
  description: string
  skillIds: string[]
  samples: ScenarioSample[]
  rules: ExcelRule[]
  status: 'draft' | 'active' | 'archived'
  updatedAt: string
}

export interface EvaluationCase {
  caseId: string
  input: JsonValue
  expected?: JsonValue
  actual?: JsonValue
  /** Host-generated provenance; caller-supplied model results are not trusted. */
  actualOrigin?: 'harness'
  grade?: EvaluationGrade
  issueLocation?: string
  correction?: string
  traceId?: string
  source?: { filename?: string; region?: string; row?: number; [key: string]: JsonValue | undefined }
  systemError?: { code: string; message: string; retryable?: boolean }
}

export interface EvaluationBatch {
  evaluationId: string
  skillId: string
  scenarioId?: string
  snapshotHash: string
  skillSnapshot?: SkillDraft
  scenarioSnapshot?: Scenario
  ruleSnapshot?: ExcelRule
  executionProfile: Record<string, JsonValue>
  /** False when the evaluation model/profile is intentionally not production-aligned. */
  productionAligned?: boolean
  cases: EvaluationCase[]
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'stale'
  accuracy?: { numerator: number; denominator: number; value: number }
  jobId?: string
  createdAt: string
  updatedAt: string
}

export interface ReleaseVersion {
  releaseId: string
  skillId: string
  version: string
  contentHash: string
  files: SkillFiles
  exceptionReason?: string
  createdAt: string
}

export interface TraceRecord {
  traceId: string
  source: TraceSource
  skillId?: string
  version?: string
  spanCount: number
  incomplete: boolean
  protectedUntil?: string
  retainedUntil?: string
  updatedAt: string
}

export interface DashboardSnapshot {
  status: 'ready' | 'empty' | 'partial' | 'error'
  coverage?: { scenarioCount: number; linkedSkillCount: number; totalSkillCount: number }
  productionMetrics?: { count: number; completeCount: number; assessedCount: number; unknownCount: number; successRate: number | null; p95Ms: number | null; windowHours: number }
  releaseChanges?: Array<{
    eventId: string; action: 'publish' | 'rollback'; releaseId: string; skillId: string; title: string; version: string; createdAt: string
    exceptionReason?: string; notificationStatus: 'pending' | 'delivered' | 'failed' | 'unknown'; runtimeLoadStatus: 'unknown'
  }>
  counts: {
    activeSkills: number
    publishedSkills: number
    publishReadySkills: number
    pendingEvaluations: number
    unmeasuredSkills: number
    traces24h: number
    releaseChanges30d: number
  }
  sections: Array<{
    id: 'work' | 'skills' | 'quality' | 'production'
    status: 'ready' | 'empty' | 'partial' | 'error'
    title: string
    description: string
    items: Array<{
      id: string; title: string; detail: string; action: string; status?: string; scenarioCount?: number; skillId?: string
      majorIssue?: string; labeled?: number; minimumLabels?: number | null; minimumAccuracy?: number | null; productionAligned?: boolean
      thresholds?: Array<{ scenarioId: string; name: string; minimumLabels: number; minimumAccuracy: number }>
    }>
  }>
  generatedAt: string
}

export interface RpcMethodDescriptor {
  id: string
  service: 'skillManager'
  namespace: 'skillManager'
  method: string
  invocation: { kind: 'direct' }
  parameters: Array<{ name: string; wire: string; source: 'json'; acceptsUndefined?: true; codec: { mode: 'src-json' | 'strict'; typeSymbol?: string; schema?: { parse(value: unknown): unknown } } }>
  cancellation?: { parameter: 'signal' }
  result: { mode: 'src-json' | 'strict'; typeSymbol?: string; schema?: { parse(value: unknown): unknown } }
}

export const V1_METHODS = [
  'dashboardGet',
  // Small deterministic fixtures are part of the browser contract so the
  // built-in import/trace walkthroughs exercise the same Remote path as
  // production data. They never replace real Host data; they only create an
  // explicitly labelled workbench sample when the user asks for one.
  'xmindSample', 'traceSample',
  'skillList', 'skillGet', 'skillCreate', 'skillImport', 'skillCopy', 'skillSave', 'skillValidate', 'skillDiff', 'skillArchive', 'skillDelete',
  'mindmapList', 'mindmapGet', 'mindmapCreate', 'mindmapImport', 'mindmapUpdate', 'mindmapGenerateCandidate', 'mindmapApplyCandidate',
  'scenarioList', 'scenarioGet', 'scenarioCreate', 'scenarioUpdate', 'scenarioSave', 'scenarioAttachSkill', 'scenarioRemoveSkill', 'scenarioAddSample',
  'excelRuleGet', 'excelRuleGenerate', 'excelRuleUploadSample', 'excelRuleAnalyze', 'excelRuleApplyDraft', 'excelRuleConfirm', 'excelRulePublish', 'excelRuleRegression',
  'evaluationList', 'evaluationCreate', 'evaluationRun', 'evaluationStart', 'evaluationGet', 'evaluationStatus', 'evaluationCancel', 'evaluationRerunFailed', 'evaluationCaseGet', 'evaluationAnnotate', 'evaluationMetrics', 'evaluationOptimize', 'evaluationSuggestions', 'evaluationApplySuggestion', 'jobGet',
  'releaseCheck', 'releasePublish', 'releaseList', 'releaseGet', 'releaseRollback', 'runtimeStatus',
  'traceIngest', 'traceList', 'traceGet', 'traceRetentionPreview', 'traceProtect', 'traceRetain', 'traceClear', 'traceCleanup',
  'settingsGet', 'settingsSave', 'settingsUpdate', 'settingsHealth', 'settingsBackup', 'settingsRestore', 'settingsAudit', 'settingsAuditExport',
] as const

export type V1Method = typeof V1_METHODS[number]

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`)
  return value
}

export function asString(value: unknown, label: string, max = 500): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    throw new TypeError(`${label} must be a non-empty string of at most ${max} characters`)
  }
  return value.trim()
}

export function optionalString(value: unknown, label: string, max = 500): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : asString(value, label, max)
}

export function asOperationId(value: unknown): string {
  return asString(value, 'operationId', 200)
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
  if (typeof value === 'bigint') return `${value}n`
  return JSON.stringify(value)
}

export function redact(value: unknown): string {
  return String(value)
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/((?:api[_-]?key|token|authorization|bearer|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .slice(0, 360)
}

export function createV1Descriptors(packageId: string): RpcMethodDescriptor[] {
  /**
   * Typert's strict registry requires a runtime parser even when the package
   * keeps the public contract transport-neutral. These small parsers enforce
   * the wire primitives and deliberately leave feature payloads to the Host
   * service's domain validation, so the bundle has no Zod/Ajv runtime edge.
   */
  const anySchema = Object.freeze({ parse(value: unknown) { return value } })
  const objectSchema = Object.freeze({ parse(value: unknown) { if (value === null || typeof value !== 'object') throw new TypeError('request must be a JSON object'); return value } })
  const optionalObjectSchema = Object.freeze({ parse(value: unknown) { return value === undefined ? undefined : objectSchema.parse(value) } })
  const stringSchema = Object.freeze({ parse(value: unknown) { if (typeof value !== 'string' || value.trim().length === 0) throw new TypeError('identifier must be a non-empty string'); return value.trim() } })
  const optionalStringSchema = Object.freeze({ parse(value: unknown) { return value === undefined ? undefined : stringSchema.parse(value) } })
  const operationSchema = Object.freeze({ parse(value: unknown) { if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) throw new TypeError('operationId must be a non-empty string of at most 200 characters'); return value.trim() } })
  const parameter = (name: string, typeSymbol: string, schema: { parse(value: unknown): unknown } = anySchema, acceptsUndefined = false) => ({ name, wire: name, source: 'json' as const, ...(acceptsUndefined ? { acceptsUndefined: true as const } : {}), codec: { mode: 'strict' as const, typeSymbol, schema } })
  const noArgs = new Set(['dashboardGet', 'xmindSample', 'traceSample', 'mindmapList', 'traceRetentionPreview', 'settingsGet', 'settingsHealth'])
  const optionalRequest = new Set(['skillList', 'scenarioList', 'evaluationList', 'traceList', 'settingsAudit', 'settingsAuditExport'])
  const optionalIdQueries = new Set(['releaseList', 'runtimeStatus'])
  const optionalRequestMutations = new Set(['settingsBackup'])
  const idQueries = new Set([
    'skillGet', 'skillValidate', 'skillDiff', 'mindmapGet', 'scenarioGet', 'excelRuleGet', 'excelRuleRegression',
    'evaluationGet', 'evaluationStatus', 'evaluationCaseGet', 'evaluationMetrics', 'evaluationOptimize', 'evaluationSuggestions', 'jobGet',
    'releaseCheck', 'releaseList', 'releaseGet', 'runtimeStatus', 'traceGet',
  ])
  const idMutations = new Set(['skillArchive', 'skillDelete'])
  const cancellable = new Set(V1_METHODS.filter(method => !noArgs.has(method) && !optionalRequest.has(method) && !idQueries.has(method)))
  const parametersFor = (method: V1Method) => {
    if (noArgs.has(method)) return []
    if (optionalRequest.has(method)) return [parameter('request', `${packageId}#${method}Request`, optionalObjectSchema, true)]
    if (optionalIdQueries.has(method)) return [parameter('skillId', `${packageId}#Identifier`, optionalStringSchema, true)]
    if (idQueries.has(method)) {
      const name = method === 'jobGet' ? 'jobId'
        : method === 'traceGet' ? 'traceId'
          : method === 'scenarioGet' ? 'scenarioId'
            : method === 'excelRuleRegression' ? 'scenarioId'
              : method === 'excelRuleGet' ? 'ruleId'
                : method === 'evaluationCaseGet' ? 'evaluationId'
                  : ['evaluationGet', 'evaluationStatus', 'evaluationMetrics', 'evaluationOptimize', 'evaluationSuggestions'].includes(method) ? 'evaluationId'
                    : method === 'releaseGet' ? 'releaseId'
                      : ['releaseList', 'runtimeStatus', 'releaseCheck'].includes(method) ? 'skillId'
                        : method === 'mindmapGet' ? 'mindmapId' : 'skillId'
      return [parameter(name, `${packageId}#Identifier`, stringSchema)]
    }
    if (idMutations.has(method)) return [parameter('operationId', `${packageId}#OperationId`, operationSchema), parameter('skillId', `${packageId}#SkillId`, stringSchema)]
    if (optionalRequestMutations.has(method)) return [parameter('operationId', `${packageId}#OperationId`, operationSchema), parameter('request', `${packageId}#${method}Request`, optionalObjectSchema, true)]
    return [parameter('operationId', `${packageId}#OperationId`, operationSchema), parameter('request', `${packageId}#${method}Request`, objectSchema)]
  }
  return V1_METHODS.map(method => ({
    id: `${packageId}#skillManager/${method}`,
    service: 'skillManager' as const,
    namespace: 'skillManager' as const,
    method,
    invocation: { kind: 'direct' as const },
    parameters: parametersFor(method),
    ...(cancellable.has(method)
      ? { cancellation: { parameter: 'signal' as const } }
      : {}),
    result: { mode: 'strict' as const, typeSymbol: `${packageId}#${method}Result`, schema: anySchema },
  }))
}
