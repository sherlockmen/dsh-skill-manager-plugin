import { asRecord, asString } from '../contracts/index.js'
import { parseWorkbookSamples } from './workbook.js'

export async function previewEvaluationWorkbook(request: unknown) {
  const input = asRecord(request, 'request')
  const filename = asString(input.filename, '文件名', 240)
  const samples = await parseWorkbookSamples(input.input, filename)
  return { status: 'ready', sheets: samples.map(sheet => ({ name: sheet.sheet, headers: sheet.headers, count: sheet.rows.length, preview: sheet.rows.slice(0, 3) })) }
}
export async function evaluationInputCases(request: unknown) {
  const input = asRecord(request, '测评内容')
  if (input.kind === 'text') {
    const text = asString(input.text, '待测文本', 100000)
    const expected = typeof input.expected === 'string' ? input.expected.trim() : ''
    return [{ input: text, ...(expected ? { expected } : {}), source: { kind: 'text', label: '手动输入文本' } }]
  }
  if (input.kind !== 'excel') throw new Error('请选择文本或 Excel 作为测评内容。')
  const filename = asString(input.filename, '文件名', 240)
  const sheets = await parseWorkbookSamples(input.input, filename)
  const sheet = sheets.find(item => item.sheet === input.sheet)
  if (!sheet) throw new Error('请选择要导入的工作表并检查预览。')
  const expectedColumn = typeof input.expectedColumn === 'string' ? input.expectedColumn : ''
  if (expectedColumn && !sheet.headers.includes(expectedColumn)) throw new Error('参考答案列已不存在，请重新选择。')
  if (!sheet.headers.some(header => header !== expectedColumn)) throw new Error('移除参考答案列后没有待测内容，请保留至少一列业务数据。')
  return sheet.rows.map((row, index) => {
    const expected = expectedColumn ? row[expectedColumn] : undefined
    const region = sheet.sourceRegions[index]
    return { input: Object.fromEntries(Object.entries(row).filter(([key]) => key !== expectedColumn)), ...(expected !== undefined && expected !== null && expected !== '' ? { expected } : {}), source: { kind: 'excel', filename, sheet: sheet.sheet, row: Number(region.match(/!(?:[A-Z]+)(\d+)/)?.[1]), region, sourceHash: sheet.sourceHash } }
  })
}
