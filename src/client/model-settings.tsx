import React, { useEffect, useRef, useState } from 'react'
import { WorkbenchSelect } from './select.js'
import { ActionButton } from './action-button.js'
import { safeError, useMutation, type AnyRecord, type RemoteApi } from './api.js'

const encode = (provider: string, model: string) => JSON.stringify([provider, model])
const buttonClass = 'sm-button gate-button sm-button-secondary'

export function ModelSettings({ api, value, loading, reload, onNotice, onDirtyChange }: { api: RemoteApi; value?: AnyRecord; loading: boolean; reload: () => void; onNotice: (message: string) => void; onDirtyChange: (dirty: boolean) => void }) {
  const [selection, setSelection] = useState('default')
  const [baseline, setBaseline] = useState('default')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const dirty = selection !== baseline
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty
  const save = useMutation(api, 'settingsSave', reload)
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!value || dirtyRef.current) return
    const next = value.source === 'selected' && value.selection ? encode(value.selection.provider, value.selection.model) : value.source === 'legacy' ? 'legacy' : 'default'
    setSelection(next); setBaseline(next)
  }, [value])
  const options = (value?.providers || []).flatMap((provider: AnyRecord) => (provider.models || []).map((model: AnyRecord) => ({ value: encode(provider.id, model.id), label: `${provider.name} / ${model.name}`, provider: provider.id, model: model.id })))
  const missing = !['default', 'legacy'].includes(selection) && !options.some((option: AnyRecord) => option.value === selection)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSaved('')
    try {
      const modelSelection = selection === 'default' ? { mode: 'dsh-default' } : (() => { const [provider, model] = JSON.parse(selection); return { mode: 'selected', provider, model } })()
      await save.run({ modelSelection }); setBaseline(selection)
      const message = selection === 'default' ? '已改为跟随 DSH 默认模型。新的生成和测评将使用 DSH 当前默认模型。' : '模型选择已保存，将用于新的生成和测评。'
      setSaved(message); onNotice(message)
    } catch (reason) { setError(safeError(reason)) }
  }
  return <section className="management-section sm-model-settings">
    <div className="management-section-head"><div><h2>模型选择</h2><p>直接使用 DSH 已配置的模型。Provider、API Key 和地址统一在 DSH 中管理。</p></div><ActionButton className={buttonClass} disabled={loading || save.busy} onClick={reload}>{loading ? '读取中…' : '刷新模型列表'}</ActionButton></div>
    <form className="management-settings-form" onSubmit={submit}>
      <label className="sm-model-field"><span>生成与新测评使用的模型</span><WorkbenchSelect aria-label="生成与新测评使用的模型" value={selection} disabled={loading || save.busy || !value} onChange={event => { setSelection(event.target.value); setError(''); setSaved('') }}>
        <option value="default">跟随 DSH 默认模型</option>
        {value?.source === 'legacy' ? <option value="legacy" disabled>沿用旧版显式选择（可改为跟随 DSH）</option> : null}
        {missing ? <option value={selection} disabled>所选模型已不在列表中</option> : null}
        {options.map((option: AnyRecord) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </WorkbenchSelect></label>
      <p>当前生效：<strong>{value?.selection ? `${value.selection.provider} / ${value.selection.model}` : loading ? '读取中…' : '尚未配置'}</strong>{value?.selection?.reasoningEffort ? ` · ${value.selection.reasoningEffort}` : ''}</p>
      <p>跟随默认模型会读取 DSH 的最新设置。已创建的测评保留原模型快照；只切换某个聊天的模型不会改变 DSH 默认模型。</p>
      {value?.message ? <p className="gate-notice error" role="alert">{value.message}</p> : null}
      {value?.source === 'legacy' ? <p className="gate-notice">当前 DSH 默认模型不可用，正在沿用旧版显式选择。选择“跟随 DSH 默认模型”并保存后，将停止使用旧版选择。</p> : null}
      {(value?.providers || []).filter((provider: AnyRecord) => provider.error).map((provider: AnyRecord) => <p key={provider.id} role="alert">{provider.name}：{provider.error}</p>)}
      {error ? <p className="gate-notice error" role="alert">{error}</p> : null}
      {saved ? <p className="gate-notice" role="status">{saved}</p> : null}
      <div className="management-actions"><ActionButton className="sm-button gate-button sm-button-primary" type="submit" disabled={!api || !dirty || save.busy || loading || missing || selection === 'legacy'}>{save.busy ? '保存中…' : '保存模型选择'}</ActionButton><span>新增或修改 Provider：返回原生 Harness → 设置 → 模型。</span></div>
    </form>
  </section>
}
