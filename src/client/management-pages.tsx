import React, { useEffect, useRef, useState } from 'react'
import type { Scenario, SkillDraft } from '../contracts/index.js'
import { callRemote, safeError, useMutation, useRemoteQuery, type AnyRecord, type RemoteApi } from './api.js'

type ScenarioRecord = Scenario & { minimumLabeledCases?: number; minimumAccuracy?: number }
type Notice = (message: string) => void
const NEW_SCENARIO = '@new'
const regionLabel: Record<string, string> = { province: '省级', group: '集团', miit: '部级' }
const labels: Record<string, string> = { draft: '草稿', active: '活动', archived: '已归档', candidate: '待确认', confirmed: '已确认', published: '已发布', healthy: '正常', ready: '正常', ok: '正常', passed: '通过', blocked: '未通过', degraded: '部分异常', failure: '失败', 'missing-config': '未配置模型', 'not-configured': '未配置', pending: '待处理', running: '运行中', disabled: '已关闭', warning: '需关注' }
const pretty = (value: unknown) => JSON.stringify(value, null, 2)
const splitFields = (value: string) => [...new Set(value.split(/[,，\n]/).map(field => field.trim()).filter(Boolean))]

function Action({ children, primary, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }): React.ReactElement {
  return <button type="button" className={`sm-button gate-button ${primary ? 'sm-button-primary' : 'sm-button-secondary'}`} {...props}>{children}</button>
}
function Badge({ value }: { value?: string }): React.ReactElement {
  const tone = ['failure', 'blocked', 'degraded'].includes(value || '') ? 'red' : ['ready', 'ok', 'healthy', 'passed', 'active', 'published'].includes(value || '') ? 'green' : 'amber'
  return <span className={`sm-pill sm-pill-${tone} gate-status status ${tone === 'red' ? 'error' : tone === 'green' ? 'success' : 'warning'}`}><i />{labels[value || ''] || value || '尚无数据'}</span>
}
function ErrorBox({ message, onRetry }: { message?: string; onRetry?: () => void }): React.ReactElement | null {
  return message ? <div className="gate-notice error management-error" role="alert"><strong>操作未完成</strong><span>{message}</span>{onRetry ? <Action onClick={onRetry}>重试</Action> : null}</div> : null
}
function PageHead({ title, description, children }: { title: string; description: string; children?: React.ReactNode }): React.ReactElement {
  return <header className="gate-page-head"><div className="gate-title-group"><h1>{title}</h1><p>{description}</p></div><div className="gate-page-actions">{children}</div></header>
}
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }): React.ReactElement { return <label className={wide ? 'management-field wide' : 'management-field'}><span>{label}</span>{children}</label> }
function useDirtyProtection(dirty: boolean, onDirtyChange?: (dirty: boolean) => void): void {
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false) }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
}

export interface ScenarioForm {
  scenarioId?: string; name: string; description: string; region: string; status: string
  minimumLabeledCases: string; minimumAccuracy: string; skillIds: string[]
}
function scenarioForm(scenario?: ScenarioRecord): ScenarioForm {
  return { scenarioId: scenario?.scenarioId, name: scenario?.name || '', description: scenario?.description || '', region: scenario?.region || 'province', status: scenario?.status || 'draft', minimumLabeledCases: String(scenario?.minimumLabeledCases ?? 1), minimumAccuracy: String((scenario?.minimumAccuracy ?? .9) * 100), skillIds: [...(scenario?.skillIds || [])] }
}
export function scenarioFormRequest(form: ScenarioForm): AnyRecord {
  const cases = Number(form.minimumLabeledCases); const accuracy = Number(form.minimumAccuracy)
  if (!form.name.trim()) throw new Error('请填写场景名称。')
  if (!['province', 'group', 'miit'].includes(form.region)) throw new Error('请选择有效区域口径。')
  if (!Number.isInteger(cases) || cases < 1 || cases > 100000) throw new Error('最低有效标注数必须是 1 至 100000 的整数。')
  if (!form.minimumAccuracy.trim() || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) throw new Error('最低准确率必须在 0% 至 100% 之间。')
  return { ...(form.scenarioId ? { scenarioId: form.scenarioId } : {}), name: form.name.trim(), description: form.description, region: form.region, status: form.status, minimumLabeledCases: cases, minimumAccuracy: accuracy / 100, skillIds: [...new Set(form.skillIds)] }
}

export async function sampleUploadRequest(file: File, scenarioId: string): Promise<AnyRecord> {
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('请选择非空且不超过 8 MiB 的文件。')
  if (/\.json$/i.test(file.name)) {
    const parsed = JSON.parse(await file.text())
    const rows = Array.isArray(parsed) ? parsed : parsed?.rows
    if (!Array.isArray(rows) || !rows.length || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('JSON 必须是业务记录对象数组，或包含 rows 数组的对象。')
    return { scenarioId, filename: file.name, rows }
  }
  if (!/\.xlsx$/i.test(file.name)) throw new Error('支持 .xlsx 和 .json；旧版 .xls 请先另存为 .xlsx。')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 8192) binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
  return { scenarioId, filename: file.name, input: btoa(binary) }
}

export function ScenariosPage({ api, refresh, onChanged, onNotice, onDirtyChange }: { api: RemoteApi; refresh: number; onChanged: () => void; onNotice: Notice; onDirtyChange?: (dirty: boolean) => void }): React.ReactElement {
  const [includeArchived, setIncludeArchived] = useState(false)
  const list = useRemoteQuery<{ scenarios: ScenarioRecord[] }>(api, 'scenarioList', [{ includeArchived }], { scenarios: [] })
  const skills = useRemoteQuery<{ skills: SkillDraft[] }>(api, 'skillList', [{ includeArchived: false }], { skills: [] })
  const [selectedId, setSelectedId] = useState('')
  const detail = useRemoteQuery<{ scenario?: ScenarioRecord }>(api, 'scenarioGet', [selectedId], {}, Boolean(selectedId && selectedId !== NEW_SCENARIO))
  const current = detail.data.scenario?.scenarioId === selectedId ? detail.data.scenario : undefined
  const [form, setForm] = useState<ScenarioForm | null>(null)
  const [baseline, setBaseline] = useState('')
  const [error, setError] = useState<string>()
  const [search, setSearch] = useState('')
  const [skillSearch, setSkillSearch] = useState('')
  const [ruleDraft, setRuleDraft] = useState<AnyRecord>()
  const [ruleBaseline, setRuleBaseline] = useState('')
  const [canonicalText, setCanonicalText] = useState('')
  const [requiredText, setRequiredText] = useState('')
  const [groupTexts, setGroupTexts] = useState<Record<string, string>>({})
  const [regression, setRegression] = useState<AnyRecord>()
  const [uploading, setUploading] = useState(false)
  const upload = useRef<HTMLInputElement>(null)
  const formDirty = Boolean(form && pretty(form) !== baseline)
  const ruleDirty = Boolean(ruleDraft && pretty(ruleDraft) !== ruleBaseline)
  const dirty = formDirty || ruleDirty
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty
  useDirtyProtection(dirty, onDirtyChange)
  const changed = () => { list.reload(); detail.reload(); onChanged() }
  const save = useMutation(api, 'scenarioSave')
  const addSample = useMutation(api, 'scenarioAddSample', changed)
  const generate = useMutation(api, 'excelRuleGenerate', changed)
  const confirmRule = useMutation(api, 'excelRuleConfirm', changed)
  const regress = useMutation(api, 'excelRuleRegression')
  const busy = save.busy || uploading || addSample.busy || generate.busy || confirmRule.busy || regress.busy
  useEffect(() => { if (refresh > 0) list.reload() }, [refresh])
  useEffect(() => { if (!selectedId && list.data.scenarios.length) setSelectedId(list.data.scenarios[0].scenarioId) }, [list.data.scenarios, selectedId])
  useEffect(() => {
    if (!current || dirtyRef.current) return
    const next = scenarioForm(current); setForm(next); setBaseline(pretty(next))
  }, [current?.scenarioId, current?.updatedAt])
  useEffect(() => {
    if (!ruleDraft) return
    setCanonicalText(ruleDraft.canonicalFields.join(', ')); setRequiredText(ruleDraft.requiredFacts.join(', '))
    setGroupTexts(Object.fromEntries(ruleDraft.layouts.map((layout: AnyRecord) => [layout.layoutId, (layout.groupBy || []).join(', ')])))
  }, [ruleBaseline])
  const choose = (id: string) => {
    if (busy || (dirty && !window.confirm('有未保存的场景或规则修改，放弃后切换吗？'))) return
    dirtyRef.current = false; setSelectedId(id); setError(undefined); setRuleDraft(undefined); setRuleBaseline(''); setRegression(undefined)
    const next = id === NEW_SCENARIO ? scenarioForm() : null
    setForm(next); setBaseline(next ? pretty(next) : '')
  }
  const update = <K extends keyof ScenarioForm>(key: K, value: ScenarioForm[K]) => setForm(previous => previous ? { ...previous, [key]: value } : previous)
  const storeForm = async (event?: React.FormEvent) => {
    event?.preventDefault(); if (!form) return; setError(undefined)
    try {
      const result = await save.run(scenarioFormRequest(form)); const next = scenarioForm(result.scenario)
      setForm(next); setBaseline(pretty(next)); setSelectedId(result.scenario.scenarioId); changed(); onNotice('场景已保存')
    } catch (reason) { setError(safeError(reason)) }
  }
  const toggleSkill = (id: string, checked: boolean) => {
    if (!form) return
    if (!checked && current?.skillIds.includes(id) && !window.confirm('移除引用后，此场景不再参与该 Skill 的发布门禁，后续测评组合也会改变。继续移除吗？')) return
    update('skillIds', checked ? [...new Set([...form.skillIds, id])] : form.skillIds.filter(value => value !== id))
  }
  const importSample = async (file?: File) => {
    if (!file || !current) return; setUploading(true); setError(undefined)
    try { await addSample.run(await sampleUploadRequest(file, current.scenarioId)); onNotice(`已导入 ${file.name}`) }
    catch (reason) { setError(safeError(reason)) }
    finally { setUploading(false); if (upload.current) upload.current.value = '' }
  }
  const openRule = (rule: AnyRecord) => {
    if (ruleDirty && !window.confirm('规则映射尚未保存，放弃后查看其他版本吗？')) return
    const copy = structuredClone(rule); setRuleDraft(copy); setRuleBaseline(pretty(copy)); setRegression(undefined)
  }
  const createRule = async () => {
    if (!current) return; setError(undefined)
    try { const result = await generate.run({ scenarioId: current.scenarioId }); openRule(result.rule); onNotice('模型已生成解析规则候选，请检查字段映射后确认') }
    catch (reason) { setError(safeError(reason)) }
  }
  const saveRule = async () => {
    if (!current || !ruleDraft) return; setError(undefined)
    try {
      if (!ruleDraft.canonicalFields.length) throw new Error('至少保留一个 Canonical 字段。')
      if (ruleDraft.requiredFacts.some((field: string) => !ruleDraft.canonicalFields.includes(field))) throw new Error('必需字段必须包含在 Canonical 字段中。')
      for (const layout of ruleDraft.layouts) {
        if (layout.headers.some((header: string) => !ruleDraft.canonicalFields.includes(layout.mapping[header]))) throw new Error(`版式 ${layout.layoutId} 存在未映射或无效的字段，请逐项检查。`)
        if (layout.recordMode === 'group' && (!layout.groupBy?.length || layout.groupBy.some((field: string) => !ruleDraft.canonicalFields.includes(field)))) throw new Error('按字段分组时，请指定有效的 Canonical 分组字段。')
      }
      const next: AnyRecord = { ...ruleDraft, status: 'candidate', updatedAt: new Date().toISOString() }
      const isCandidate = ruleDraft.status === 'candidate'
      if (!isCandidate) { delete next.ruleId; next.version = Math.max(0, ...current.rules.map(rule => rule.version)) + 1; delete next.createdAt }
      const rules = isCandidate ? current.rules.map(rule => rule.ruleId === next.ruleId ? next : rule) : [...current.rules, next]
      const result = await save.run({ scenarioId: current.scenarioId, rules })
      const saved = isCandidate ? result.scenario.rules.find((rule: AnyRecord) => rule.ruleId === next.ruleId) : result.scenario.rules.at(-1)
      setRuleDraft(saved); setRuleBaseline(pretty(saved)); changed(); onNotice('字段映射已保存为候选；已发布版本保持原样')
    } catch (reason) { setError(safeError(reason)) }
  }
  const confirm = async (publish: boolean) => {
    if (!current || !ruleDraft) return; setError(undefined)
    if (publish && !window.confirm('发布前将回归所有已保存样例，通过后切换生效规则；已有冻结测评不会重新执行。确认发布？')) return
    try { const result = await confirmRule.run({ scenarioId: current.scenarioId, ruleId: ruleDraft.ruleId, publish }); setRuleDraft(result.rule); setRuleBaseline(pretty(result.rule)); onNotice(publish ? '解析规则已通过回归并发布' : '规则已确认') }
    catch (reason) { setError(safeError(reason)) }
  }
  const runRegression = async () => {
    if (!current) return; setError(undefined)
    try { const result = await regress.run(current.scenarioId, { direct: true }); setRegression(result); onNotice(result.status === 'passed' ? '已保存样例回归通过' : '样例回归存在阻断，请查看明细') }
    catch (reason) { setError(safeError(reason)) }
  }
  const patchLayout = (index: number, patch: AnyRecord) => setRuleDraft(previous => previous ? { ...previous, layouts: previous.layouts.map((layout: AnyRecord, at: number) => at === index ? { ...layout, ...patch } : layout) } : previous)
  return <div className="sm-page management-page">
    <PageHead title="业务场景" description="维护业务上下文、Skill 组合、发布门槛和 Excel 解析规则。"><Action disabled={busy} onClick={list.reload}>刷新</Action><Action primary disabled={!api || busy} onClick={() => choose(NEW_SCENARIO)}>新建场景</Action></PageHead>
    <ErrorBox message={error} />
    <fieldset className="management-form-guard" disabled={busy}><div className="management-workspace">
      <aside className="management-directory"><div className="management-directory-tools"><input aria-label="搜索场景" placeholder="搜索场景名称" value={search} onChange={event => setSearch(event.target.value)} /><label className="sm-check-label"><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} />显示已归档</label></div><ErrorBox message={list.error} onRetry={list.reload} />{list.loading ? <p className="management-empty">读取场景…</p> : null}{list.data.scenarios.filter(item => item.name.toLowerCase().includes(search.toLowerCase())).map(item => <button type="button" className={`management-directory-row ${selectedId === item.scenarioId ? 'selected' : ''}`} key={item.scenarioId} disabled={busy} onClick={() => choose(item.scenarioId)}><strong>{item.name}</strong><small>{regionLabel[item.region]} · {item.skillIds.length} 个 Skill</small><Badge value={item.status} /></button>)}{!list.loading && !list.data.scenarios.length ? <p className="management-empty">尚未创建场景。</p> : null}</aside>
      <main className="management-content"><ErrorBox message={detail.error} onRetry={detail.reload} />{detail.loading && selectedId !== NEW_SCENARIO ? <p className="management-empty">读取场景详情…</p> : null}{form ? <>
        <form onSubmit={storeForm}><section className="management-section"><div className="management-section-head"><div><h2>{form.scenarioId ? '场景设置' : '创建场景'}</h2><p>{formDirty ? '尚有未保存修改' : '已保存的设置用于后续测评与发布门禁。'}</p></div><Action type="submit" primary disabled={!api || busy || (!formDirty && Boolean(form.scenarioId))}>{save.busy ? '保存中…' : '保存场景'}</Action></div><div className="management-form-grid"><Field label="场景名称"><input required maxLength={500} value={form.name} onChange={event => update('name', event.target.value)} /></Field><Field label="区域口径"><select value={form.region} disabled={Boolean(current?.rules.length)} onChange={event => update('region', event.target.value)}>{Object.entries(regionLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="状态"><select value={form.status} onChange={event => update('status', event.target.value)}><option value="draft">草稿</option><option value="active">活动</option><option value="archived">已归档</option></select></Field><Field label="最低有效标注数"><input required type="number" min="1" max="100000" step="1" value={form.minimumLabeledCases} onChange={event => update('minimumLabeledCases', event.target.value)} /></Field><Field label="最低准确率（%）"><input required type="number" min="0" max="100" step="0.1" value={form.minimumAccuracy} onChange={event => update('minimumAccuracy', event.target.value)} /></Field><Field label="场景说明" wide><textarea rows={3} value={form.description} onChange={event => update('description', event.target.value)} /></Field></div></section>
        <section className="management-section"><div className="management-section-head"><div><h2>Skill 组合</h2><p>活动场景中的全部门槛都会参与共享 Skill 的正常发布判定。</p></div><input aria-label="搜索可关联 Skill" placeholder="搜索 Skill" value={skillSearch} onChange={event => setSkillSearch(event.target.value)} /></div><ErrorBox message={skills.error} onRetry={skills.reload} /><div className="management-skill-list">{skills.data.skills.filter(skill => `${skill.title} ${skill.skillId}`.toLowerCase().includes(skillSearch.toLowerCase())).map(skill => <div className="management-skill-row" key={skill.skillId}><label className="sm-check-label"><input type="checkbox" checked={form.skillIds.includes(skill.skillId)} onChange={event => toggleSkill(skill.skillId, event.target.checked)} /><span><strong>{skill.title}</strong><small>{skill.skillId}</small></span></label><details><summary>查看字段声明</summary><pre>{skill.files['manifest.yaml'] || '尚未填写 manifest.yaml'}</pre></details></div>)}{!skills.data.skills.length ? <p className="management-empty">尚无可关联的 Skill。</p> : null}</div></section></form>
        {current ? <><section className="management-section"><div className="management-section-head"><div><h2>业务样例</h2><p>上传 .xlsx 或业务记录 .json，最多 8 MiB。保存场景修改后可导入。</p></div><input ref={upload} type="file" accept=".xlsx,.json" hidden onChange={event => void importSample(event.target.files?.[0])} /><Action disabled={!api || busy || dirty} onClick={() => upload.current?.click()}>{uploading ? '导入中…' : '上传业务样例'}</Action></div>{current.samples.length ? current.samples.map(sample => <details className="management-sample" key={sample.sampleId}><summary><strong>{sample.filename}</strong><span>{sample.rows.length} 条记录 · {sample.headers.length} 个字段</span></summary><p>来源：{sample.sourceRegions.slice(0, 4).join('、') || 'JSON 记录'}{sample.sourceRegions.length > 4 ? '…' : ''}</p><div className="management-table-scroll"><table><thead><tr>{sample.headers.map(header => <th key={header}>{header}</th>)}</tr></thead><tbody>{sample.rows.slice(0, 5).map((row, index) => <tr key={index}>{sample.headers.map(header => <td key={header}>{typeof row[header] === 'object' ? pretty(row[header]) : String(row[header] ?? '')}</td>)}</tr>)}</tbody></table></div><small>预览前 5 条；回归使用全部已保存记录。</small></details>) : <p className="management-empty">尚未上传业务样例。</p>}</section>
        <section className="management-section"><div className="management-section-head"><div><h2>Excel 解析规则</h2><p>候选映射经确认与全样例回归后，才能成为生效版本。</p></div><div className="management-actions"><Action disabled={!api || busy || dirty || !current.samples.length} onClick={() => void createRule()}>{generate.busy ? '模型分析中…' : '生成规则候选'}</Action><Action disabled={!api || busy || dirty || !current.rules.length} onClick={() => void runRegression()}>回归已保存规则</Action></div></div><div className="management-rule-tabs">{current.rules.map(rule => <button type="button" key={rule.ruleId} aria-pressed={ruleDraft?.ruleId === rule.ruleId} disabled={busy} onClick={() => openRule(rule)}><span>v{rule.version}</span><Badge value={rule.status} /></button>)}</div>{!current.rules.length ? <p className="management-empty">先上传样例，再生成解析规则候选。</p> : !ruleDraft ? <p className="management-empty">选择版本查看字段映射与记录边界。</p> : null}
        {ruleDraft ? <div className="management-rule-editor">
          <div className="management-form-grid">
            <Field label="Canonical 字段（逗号分隔）"><input value={canonicalText} onChange={event => { setCanonicalText(event.target.value); setRuleDraft({ ...ruleDraft, canonicalFields: splitFields(event.target.value) }) }} /></Field>
            <Field label="必需字段（逗号分隔）"><input value={requiredText} onChange={event => { setRequiredText(event.target.value); setRuleDraft({ ...ruleDraft, requiredFacts: splitFields(event.target.value) }) }} /></Field>
          </div>
          {ruleDraft.layouts.map((layout: AnyRecord, index: number) => <fieldset className="management-layout" key={layout.layoutId}>
            <legend>版式 {layout.layoutId}</legend>
            <div className="management-form-grid">
              <Field label="工作表名称（可选）"><input value={layout.sheet || ''} onChange={event => patchLayout(index, { sheet: event.target.value || undefined })} /></Field>
              <Field label="记录边界"><select value={layout.recordMode || 'row'} onChange={event => patchLayout(index, { recordMode: event.target.value })}><option value="row">一行一条记录</option><option value="group">按字段分组</option><option value="sheet">整表一条记录</option></select></Field>
              {layout.recordMode === 'group' ? <Field label="分组字段（Canonical 字段）"><input value={groupTexts[layout.layoutId] || ''} onChange={event => { setGroupTexts({ ...groupTexts, [layout.layoutId]: event.target.value }); patchLayout(index, { groupBy: splitFields(event.target.value) }) }} /></Field> : null}
            </div>
            <div className="management-table-scroll"><table><thead><tr><th>原始表头</th><th>映射到 Canonical 字段</th></tr></thead><tbody>{layout.headers.map((header: string) => <tr key={header}><td>{header}</td><td><select aria-label={`${layout.layoutId} ${header} 字段映射`} value={layout.mapping[header] || ''} onChange={event => patchLayout(index, { mapping: { ...layout.mapping, [header]: event.target.value } })}><option value="">请选择</option>{ruleDraft.canonicalFields.map((field: string) => <option key={field} value={field}>{field}</option>)}</select></td></tr>)}</tbody></table></div>
          </fieldset>)}
          {ruleDirty ? <details className="management-diff"><summary>查看保存前后差异</summary><div><section><h3>保存前</h3><pre>{ruleBaseline}</pre></section><section><h3>待保存</h3><pre>{pretty(ruleDraft)}</pre></section></div></details> : null}
          <div className="management-actions"><Action primary disabled={!api || busy || formDirty || !ruleDirty} onClick={() => void saveRule()}>保存规则候选</Action><Action disabled={!api || busy || dirty || ruleDraft.status !== 'candidate'} onClick={() => void confirm(false)}>确认规则</Action><Action disabled={!api || busy || dirty || ruleDraft.status !== 'confirmed'} onClick={() => void confirm(true)}>回归并发布</Action><span>{ruleDirty ? '规则修改尚未保存' : labels[ruleDraft.status]}</span></div>
        </div> : null}
        {regression ? <div className="management-regression"><h3>全样例回归 <Badge value={regression.status} /></h3>{regression.results?.map((result: AnyRecord) => <div key={result.sampleId}><strong>{current.samples.find(sample => sample.sampleId === result.sampleId)?.filename || result.sampleId}</strong><span>{result.rows} 条记录</span><span>{result.layout ? `匹配 ${result.layout.layoutId}` : result.reason || '未匹配版式'}</span></div>)}</div> : null}</section></> : <p className="gate-notice">保存场景后即可上传样例、生成和发布解析规则。</p>}
      </> : !detail.loading ? <p className="management-empty">从目录选择场景，或创建新的业务场景。</p> : null}</main>
    </div></fieldset>
  </div>
}

function downloadContent(filename: string, content: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function SettingsPage({ api, onExit, onNotice, onDirtyChange }: { api: RemoteApi; onExit: () => void; onNotice: Notice; onDirtyChange?: (dirty: boolean) => void }): React.ReactElement {
  const settings = useRemoteQuery<AnyRecord>(api, 'settingsGet', [], {})
  const health = useRemoteQuery<AnyRecord>(api, 'settingsHealth', [], {})
  const [error, setError] = useState<string>()
  const [days, setDays] = useState('30'); const [baseline, setBaseline] = useState('30')
  const [backupResult, setBackupResult] = useState<AnyRecord>()
  const [auditFilters, setAuditFilters] = useState({ entityType: '', entityId: '', action: '', since: '', until: '' })
  const [auditRequest, setAuditRequest] = useState<AnyRecord>({ limit: 100 })
  const audit = useRemoteQuery<{ events: AnyRecord[] }>(api, 'settingsAudit', [auditRequest], { events: [] })
  const save = useMutation(api, 'settingsSave', settings.reload)
  const backup = useMutation(api, 'settingsBackup', () => { health.reload(); audit.reload() })
  const cleanup = useMutation(api, 'traceCleanup', () => { health.reload(); audit.reload() })
  const [exporting, setExporting] = useState(false)
  const dirty = days !== baseline
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty
  useDirtyProtection(dirty, onDirtyChange)
  useEffect(() => { if (settings.data.settings && !dirtyRef.current) { const next = String(settings.data.settings.traceRetentionDays ?? 30); setDays(next); setBaseline(next) } }, [settings.data.settings])
  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault(); setError(undefined)
    try { const count = Number(days); if (!Number.isInteger(count) || count < 1 || count > 3650) throw new Error('保留天数必须是 1 至 3650 的整数。'); await save.run({ traceRetentionDays: count }); setBaseline(String(count)); setDays(String(count)); audit.reload(); onNotice('Trace 默认保留期已保存') }
    catch (reason) { setError(safeError(reason)) }
  }
  const createBackup = async () => {
    setError(undefined)
    try { const result = await backup.run({}); setBackupResult(result); onNotice('管理库与运行库备份集已创建') }
    catch (reason) { setError(safeError(reason)) }
  }
  const exportAudit = async () => {
    setError(undefined); setExporting(true)
    try { const result = await callRemote<AnyRecord>(api, 'settingsAuditExport', [auditRequest]); downloadContent(result.filename, result.content, result.contentType); onNotice('审计记录已导出') }
    catch (reason) { setError(safeError(reason)) }
    finally { setExporting(false) }
  }
  const runCleanup = async () => {
    setError(undefined)
    if (!window.confirm(`按已保存的 ${baseline} 天保留策略清理过期 Trace。受保护、补传中和测评证据会保留；删除不可恢复。确认清理？`)) return
    try { const result = await cleanup.run({}); onNotice(`已清理 ${result.deleted} 条过期 Trace`); health.reload() }
    catch (reason) { setError(safeError(reason)) }
  }
  const leave = () => {
    // The full-page shell owns its navigation/exit confirmation when supplied.
    // Standalone embedding still protects edits without a second modal.
    if (onDirtyChange || !dirty || window.confirm('Trace 保留期尚未保存，放弃修改并返回原生 Harness 吗？')) onExit()
  }
  const statusRows = [
    { label: '管理 SQLite', status: health.data.manager?.integrity_check, detail: settings.data.config?.managerPath },
    { label: '运行 SQLite', status: health.data.runtime?.integrity_check, detail: settings.data.config?.runtimePath },
    { label: '模型通道', status: health.data.llm?.status, detail: health.data.llm?.message || health.data.llm?.providers?.map((provider: AnyRecord) => provider.name || provider.id).join('、') || '请返回原生 Harness 配置模型 Provider。' },
    { label: 'Redis 通知', status: health.data.notifications?.status, detail: health.data.notifications ? `${health.data.notifications.pending} 待发送 / ${health.data.notifications.failed} 失败 / ${health.data.notifications.delivered} 已送达` : undefined },
    { label: 'OTLP 接收', status: health.data.otlp?.status, detail: health.data.otlp?.endpoint || health.data.otlp?.error },
    { label: '磁盘', status: health.data.disk?.status, detail: health.data.disk?.freeBytes !== undefined ? `可用 ${(health.data.disk.freeBytes / 1024 ** 3).toFixed(2)} GiB` : health.data.disk?.message },
    { label: '最近备份', status: health.data.backup ? health.data.backup.status || 'ready' : undefined, detail: health.data.backup?.backupId },
  ]
  return <div className="sm-page management-page">
    <PageHead title="系统设置" description="查看独立服务状态、管理 Trace 保留策略和审计记录。"><Action onClick={() => { health.reload(); settings.reload(); audit.reload() }} disabled={health.loading}>刷新状态</Action><Action onClick={leave}>返回原生 Harness</Action></PageHead>
    <fieldset className="management-form-guard" disabled={save.busy || backup.busy || cleanup.busy}>
    <ErrorBox message={error} /><ErrorBox message={settings.error} onRetry={settings.reload} />
    <section className="management-section"><div className="management-section-head"><div><h2>运行健康</h2><p>模型 Provider 已注册不等于模型请求成功；具体调用失败会显示在任务结果中。</p></div><Badge value={health.loading ? 'pending' : health.data.status} /></div><ErrorBox message={health.error} onRetry={health.reload} /><div className="management-health-ledger">{statusRows.map(row => <div key={row.label}><strong>{row.label}</strong><Badge value={row.status} /><span>{row.detail || (health.loading ? '检查中…' : '尚无详情')}</span></div>)}</div></section>
    <div className="management-settings-columns"><section className="management-section"><div className="management-section-head"><div><h2>Trace 保留与内容策略</h2><p>保留期用于手动清理时的默认阈值，保存不会立即删除数据。</p></div></div><form onSubmit={saveSettings} className="management-settings-form"><Field label="默认保留天数"><input type="number" required min="1" max="3650" step="1" value={days} onChange={event => setDays(event.target.value)} /></Field><p>凭证禁止写入，默认脱敏。受保护、补传中和测评 Trace 不随普通过期链路清理。</p><div className="management-actions"><Action type="submit" primary disabled={!api || save.busy || !dirty}>{save.busy ? '保存中…' : '保存策略'}</Action><Action disabled={!api || dirty || cleanup.busy || save.busy} onClick={() => void runCleanup()}>{cleanup.busy ? '清理中…' : '按保留策略清理'}</Action></div></form></section>
    <section className="management-section"><div className="management-section-head"><div><h2>数据与备份</h2><p>管理库、运行库和校验清单作为一个备份集保存。</p></div><Action primary disabled={!api || backup.busy} onClick={() => void createBackup()}>{backup.busy ? '备份中…' : '立即备份'}</Action></div><div className="management-settings-form"><dl className="management-facts"><div><dt>数据目录</dt><dd>{settings.data.config?.dataDir || '未连接'}</dd></div><div><dt>Schema</dt><dd>{health.data.schemaVersion || '—'}</dd></div></dl>{backupResult ? <div className="gate-notice"><strong>备份已创建</strong><p>{backupResult.backupId}</p><Action onClick={() => downloadContent(`backup-${backupResult.backupId}.json`, pretty(backupResult.manifest))}>下载校验清单</Action></div> : null}<p>需要恢复数据时在 Host 侧执行完整备份集恢复。</p></div></section></div>
    <section className="management-section"><div className="management-section-head"><div><h2>审计记录</h2><p>按时间、业务对象和操作检索，记录只追加。</p></div><Action disabled={!api || exporting || audit.loading} onClick={() => void exportAudit()}>{exporting ? '导出中…' : '导出当前查询'}</Action></div><form className="management-audit-filters" onSubmit={event => { event.preventDefault(); setAuditRequest({ limit: 500, ...Object.fromEntries(Object.entries(auditFilters).filter(([, value]) => value).map(([key, value]) => [key, key === 'since' || key === 'until' ? new Date(value).toISOString() : value.trim()])) }) }}><Field label="对象类型"><select value={auditFilters.entityType} onChange={event => setAuditFilters({ ...auditFilters, entityType: event.target.value })}><option value="">全部</option>{['skill', 'scenario', 'excel-rule', 'evaluation', 'release', 'trace', 'settings'].map(value => <option value={value} key={value}>{value}</option>)}</select></Field><Field label="对象 ID"><input value={auditFilters.entityId} onChange={event => setAuditFilters({ ...auditFilters, entityId: event.target.value })} /></Field><Field label="操作"><input placeholder="如 save、publish" value={auditFilters.action} onChange={event => setAuditFilters({ ...auditFilters, action: event.target.value })} /></Field><Field label="起始时间"><input type="datetime-local" value={auditFilters.since} onChange={event => setAuditFilters({ ...auditFilters, since: event.target.value })} /></Field><Field label="结束时间"><input type="datetime-local" value={auditFilters.until} onChange={event => setAuditFilters({ ...auditFilters, until: event.target.value })} /></Field><Action type="submit" disabled={!api || audit.loading}>查询</Action></form><ErrorBox message={audit.error} onRetry={audit.reload} /><div className="management-table-scroll"><table><thead><tr><th>时间</th><th>对象</th><th>操作</th><th>原因 / 详情</th></tr></thead><tbody>{audit.data.events.map(event => <tr key={event.eventId}><td>{new Date(event.createdAt).toLocaleString('zh-CN')}</td><td>{event.entityType}<small>{event.entityId}</small></td><td>{event.action}</td><td><details><summary>{event.reason || '查看事件'}</summary><pre>{pretty({ eventId: event.eventId, beforeHash: event.beforeHash, afterHash: event.afterHash, payload: event.payload })}</pre></details></td></tr>)}</tbody></table></div>{!audit.data.events.length && !audit.loading ? <p className="management-empty">当前查询没有审计事件。</p> : null}<p className="management-empty">显示当前查询最近 {auditRequest.limit} 条以内的记录；可缩小时间范围查看更早事件。</p></section>
    </fieldset>
  </div>
}
