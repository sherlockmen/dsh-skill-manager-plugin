import ExcelJS from 'exceljs'
import { expect, it } from 'vitest'
import { evaluationInputCases, previewEvaluationWorkbook } from '../src/host/evaluation-input.js'

it('accepts business text with an optional reference answer without JSON parsing', async () => {
  expect(await evaluationInputCases({ kind: 'text', text: '审核：电仪设备正常。', expected: '' })).toEqual([{ input: '审核：电仪设备正常。', source: { kind: 'text', label: '手动输入文本' } }])
  await expect(evaluationInputCases({ kind: 'text', text: '   ' })).rejects.toThrow()
})
it('previews real Excel rows, excludes the answer column, and preserves exact sheet provenance', async () => {
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('电仪及公用')
  sheet.addRows([['设备', '压力', '参考答案'], ['电仪', 3, '通过'], [], ['公用', 8, '复核']])
  workbook.addWorksheet('其他').addRows([['内容'], ['另一条']])
  const request = { kind: 'excel', filename: '验收.xlsx', input: Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64'), sheet: '电仪及公用', expectedColumn: '参考答案' }
  const preview = await previewEvaluationWorkbook(request)
  expect(preview.sheets.map(item => item.count)).toEqual([2, 1])
  const rows = await evaluationInputCases(request)
  expect(rows[0]).toMatchObject({ input: { 设备: '电仪', 压力: 3 }, expected: '通过', source: { row: 2, region: '电仪及公用!A2:C2' } })
  expect(rows[1]).toMatchObject({ source: { row: 4 } })
  expect(rows[0].input).not.toHaveProperty('参考答案')
  await expect(evaluationInputCases({ ...request, expectedColumn: '不存在' })).rejects.toThrow('参考答案列')
  await expect(evaluationInputCases({ ...request, sheet: '删除的工作表' })).rejects.toThrow('工作表')
})
