import { describe, expect, it } from 'vitest'
import { sampleUploadRequest, scenarioFormRequest, type ScenarioForm } from '../src/client/management-pages.js'

const form: ScenarioForm = { scenarioId: 'scenario-a', name: '月报', description: '省级业务', region: 'province', status: 'active', minimumAccuracy: '90', minimumLabeledCases: '3', skillIds: ['skill-a', 'skill-a'] }

describe('management form request boundaries', () => {
  it('converts a displayed percentage without overwriting concurrent sample or rule data', () => {
    const request = scenarioFormRequest({ ...form, ...{ samples: [], rules: [] } })
    expect(request.minimumAccuracy).toBe(.9)
    expect(request.minimumLabeledCases).toBe(3)
    expect(request.skillIds).toEqual(['skill-a'])
    expect(request).not.toHaveProperty('samples')
    expect(request).not.toHaveProperty('rules')
  })

  it('rejects impossible publication gates before sending a write', () => {
    expect(() => scenarioFormRequest({ ...form, minimumAccuracy: '' })).toThrow('最低准确率')
    expect(() => scenarioFormRequest({ ...form, minimumAccuracy: '101' })).toThrow('最低准确率')
    expect(() => scenarioFormRequest({ ...form, minimumLabeledCases: '1.5' })).toThrow('最低有效标注数')
    expect(() => scenarioFormRequest({ ...form, name: ' ' })).toThrow('场景名称')
  })

  it('passes the actual JSON file records and never fills in fixture data', async () => {
    const file = new File(['{"rows":[{"省份":"江苏","销量":42}]}'], '月报.json')
    const request = await sampleUploadRequest(file, 'scenario-a')
    expect(request).toEqual({ scenarioId: 'scenario-a', filename: '月报.json', rows: [{ 省份: '江苏', 销量: 42 }] })
    await expect(sampleUploadRequest(new File(['["wrong"]'], 'invalid.json'), 'scenario-a')).rejects.toThrow('业务记录对象数组')
  })

  it('transports exact workbook bytes to the Host parser', async () => {
    const bytes = new Uint8Array([80, 75, 3, 4, 0, 255, 195, 169])
    const file = new File([bytes], '真实样例.xlsx')
    const request = await sampleUploadRequest(file, 'scenario-a')
    expect(request.scenarioId).toBe('scenario-a')
    expect(request.filename).toBe('真实样例.xlsx')
    expect([...Buffer.from(request.input, 'base64')]).toEqual([...bytes])
    expect(request).not.toHaveProperty('rows')
  })
})
