import React, { useEffect, useRef, useState } from 'react'
import type { Scenario, SkillDraft, EvaluationBatch } from '../contracts/index.js'
import { WorkbenchSelect } from './select.js'
import { ActionButton } from './action-button.js'
import { callRemote, safeError, type AnyRecord, type RemoteApi } from './api.js'

export function evaluationName(batch: EvaluationBatch) { return batch.name || `${batch.skillSnapshot?.title || '历史测评'} · ${new Date(batch.createdAt).toLocaleString('zh-CN', { hour12: false })}` }
const style = 'sm-button gate-button sm-button-secondary'
export function EvaluationCreate({ api, skills, scenarios, initialSkillId, busy, onCreate, onDirtyChange }: { api: RemoteApi; skills: SkillDraft[]; scenarios: Scenario[]; initialSkillId: string; busy: boolean; onCreate: (request: AnyRecord) => Promise<boolean>; onDirtyChange: (dirty: boolean) => void }) {
  const [skillId, setSkillId] = useState(initialSkillId || skills[0]?.skillId || '')
  const [name, setName] = useState('')
  const [kind, setKind] = useState('text')
  const [text, setText] = useState(''); const [expected, setExpected] = useState('')
  const [scenarioId, setScenarioId] = useState('')
  const [file, setFile] = useState<AnyRecord>(); const [sheets, setSheets] = useState<AnyRecord[]>([])
  const [sheetName, setSheetName] = useState(''); const [expectedColumn, setExpectedColumn] = useState('')
  const [parsing, setParsing] = useState(false); const [error, setError] = useState('')
  const generation = useRef(0)
  useEffect(() => () => { generation.current++ }, [])
  useEffect(() => { onDirtyChange(Boolean(name || text || expected || file || scenarioId)) }, [name, text, expected, file, scenarioId, onDirtyChange])
  useEffect(() => { if (!skillId && skills[0]) setSkillId(skills[0].skillId) }, [skills, skillId])
  const available = scenarios.filter(scenario => scenario.skillIds.includes(skillId))
  const sheet = sheets.find(item => item.name === sheetName)
  const upload = async (selected?: File) => {
    if (!selected) return
    const id = ++generation.current; setError(''); setFile(undefined); setSheets([]); setParsing(true)
    try {
      if (!/\.xlsx$/i.test(selected.name) || !selected.size || selected.size > 8 * 1024 * 1024) throw new Error('请选择非空、8 MiB 以内的 .xlsx 文件。旧版 .xls 请另存为 .xlsx。')
      const bytes = new Uint8Array(await selected.arrayBuffer()); let binary = ''
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
      const input = { filename: selected.name, input: btoa(binary) }
      const result = await callRemote<AnyRecord>(api, 'evaluationPreviewInput', [input])
      if (id !== generation.current) return
      setFile(input); setSheets(result.sheets); setSheetName(result.sheets[0]?.name || ''); setExpectedColumn('')
    } catch (reason) { if (id === generation.current) setError(safeError(reason)) }
    finally { if (id === generation.current) setParsing(false) }
  }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('')
    if (!name.trim()) { setError('请填写测评名称或批次号，方便稍后在列表中找到。'); return }
    if (!skillId) { setError('请选择要测评的 Skill。'); return }
    if (kind === 'text' && !text.trim()) { setError('请填写要交给 Skill 处理的业务文本。'); return }
    if (kind === 'excel' && (!file || !sheet)) { setError('请上传 Excel 并选择工作表。'); return }
    if (kind === 'scenario' && !available.some(item => item.scenarioId === scenarioId)) { setError('请选择已有业务场景。'); return }
    const request: AnyRecord = { skillId, name: name.trim() }
    if (kind === 'scenario') request.scenarioId = scenarioId
    else request.sourceInput = kind === 'text' ? { kind, text, expected } : { kind, ...file, sheet: sheetName, expectedColumn }
    if (await onCreate(request)) onDirtyChange(false)
  }
  return <section className="gate-create evaluation-create" aria-label="新建测评"><div className="sm-card-heading"><div><h2>新建测评</h2><p>给这次测评起个名称，选择业务内容。创建后进入详情，点击“运行测评”查看模型结果。</p></div></div>
    <form onSubmit={submit}><fieldset className="sm-evaluation-create-fields" disabled={busy || parsing}>
    <div className="sm-form-grid sm-eval-create-grid"><label>测评名称或批次号<input maxLength={120} value={name} placeholder="例如：电仪及公用 · 9月验收第1轮" onChange={event => setName(event.target.value)} /></label><label>要测评的 Skill<WorkbenchSelect aria-label="要测评的 Skill" value={skillId} onChange={event => { setSkillId(event.target.value); setScenarioId('') }}>{skills.map(skill => <option key={skill.skillId} value={skill.skillId}>{skill.title}</option>)}</WorkbenchSelect></label></div>
    <div className="sm-evaluation-source-tabs" role="group" aria-label="测评内容来源">{[['text', '输入文本'], ['excel', '导入 Excel'], ['scenario', '使用场景样例']].map(([id, label]) => <ActionButton key={id} className={style} aria-pressed={kind === id} onClick={() => { setKind(id); setError('') }}>{label}</ActionButton>)}</div>
    {kind === 'text' ? <div className="sm-form-grid sm-eval-create-grid"><label>待测文本<textarea rows={5} maxLength={100000} value={text} placeholder="粘贴一条真实业务内容，例如需要审核的记录、问题或材料。无需填写 JSON。" onChange={event => setText(event.target.value)} /></label><label>参考答案（可选）<textarea rows={5} maxLength={100000} value={expected} placeholder="如果知道正确结果，在这里填写；不知道可以留空，运行后再人工判断。" onChange={event => setExpected(event.target.value)} /></label></div> : kind === 'excel' ? <div className="sm-evaluation-upload"><label>选择 Excel 文件<input type="file" accept=".xlsx" aria-label="选择 Excel 文件" onChange={event => { void upload(event.target.files?.[0]); event.target.value = '' }} /></label><p>第一行非空行为表头，之后每行作为一条待测记录。复杂合并、分组或版式规则请使用“场景样例”。</p>{sheet ? <><div className="sm-form-grid sm-eval-create-grid"><label>工作表<WorkbenchSelect value={sheetName} aria-label="工作表" onChange={event => { setSheetName(event.target.value); setExpectedColumn('') }}>{sheets.map(item => <option key={item.name} value={item.name}>{item.name} · {item.count} 条</option>)}</WorkbenchSelect></label><label>参考答案列（可选）<WorkbenchSelect value={expectedColumn} aria-label="参考答案列" onChange={event => setExpectedColumn(event.target.value)}><option value="">不提供参考答案</option>{sheet.headers.map((header: string) => <option key={header} value={header}>{header}</option>)}</WorkbenchSelect></label></div><p>{file?.filename} · 将导入 {sheet.count} 条记录，下面预览前 {Math.min(3, sheet.count)} 条。参考答案列不会发送给模型作为待测内容。</p><div className="management-table-scroll"><table><thead><tr>{sheet.headers.map((header: string) => <th key={header}>{header}{header === expectedColumn ? '（参考答案）' : ''}</th>)}</tr></thead><tbody>{sheet.preview.map((row: AnyRecord, index: number) => <tr key={index}>{sheet.headers.map((header: string) => <td key={header}>{String(row[header] ?? '')}</td>)}</tr>)}</tbody></table></div></> : null}</div> : <div className="sm-form-grid"><label>业务场景<WorkbenchSelect aria-label="业务场景" value={scenarioId} onChange={event => setScenarioId(event.target.value)}><option value="">选择已关联的场景</option>{available.map(item => <option key={item.scenarioId} value={item.scenarioId}>{item.name}</option>)}</WorkbenchSelect></label><p>复用场景样例和已确认的解析规则。没有场景时，可先直接输入文本或导入 Excel。</p></div>}
    </fieldset>{parsing ? <p role="status" className="sm-evaluation-inline">正在读取 Excel，稍后可选择工作表并检查预览…</p> : null}{error ? <p role="alert" className="sm-evaluation-inline">{error}</p> : null}<div className="sm-eval-create-action"><ActionButton className="sm-button gate-button sm-button-primary" type="submit" disabled={busy || parsing || !api}>{busy ? '正在创建…' : '创建测评'}</ActionButton><span>保存本次 Skill 和模型版本，后续修改不会改变这次测评记录。</span></div></form>
  </section>
}
