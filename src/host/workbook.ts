import ExcelJS from 'exceljs'
import { extractZipEntries, sha256Hex } from './phase0.js'

const MAX_BYTES = 8 * 1024 * 1024
function invalid(message: string): Error { return Object.assign(new Error(message), { code: 'excel/invalid-sample' }) }

/** Persist parsed records and exact worksheet provenance, never execute Excel formulas. */
export async function parseWorkbookSamples(input: unknown, filename: string) {
  if (!filename.toLowerCase().endsWith('.xlsx')) throw invalid('当前支持 .xlsx 文件；请将旧版 .xls 另存为 .xlsx 后上传。')
  if (typeof input !== 'string' || input.length > Math.ceil(MAX_BYTES / 3) * 4 + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input)) throw invalid('Excel 输入必须是 8 MiB 以内的 base64 文件。')
  const bytes = Buffer.from(input, 'base64')
  if (!bytes.length || bytes.length > MAX_BYTES) throw invalid('Excel 文件为空或超过 8 MiB。')
  const workbook = new ExcelJS.Workbook()
  try {
    const entries = extractZipEntries(bytes)
    if (!entries.has('xl/workbook.xml')) throw invalid('文件不是有效的 Excel 工作簿。')
    await workbook.xlsx.load(bytes as never)
  } catch (error) { throw invalid(`无法解析 Excel 文件：${error instanceof Error ? error.message : String(error)}`) }
  const samples = []
  let totalRows = 0
  for (const sheet of workbook.worksheets) {
    if (sheet.state !== 'visible' || !sheet.actualRowCount) continue
    if (sheet.columnCount > 256 || sheet.rowCount > 10_001) throw invalid(`工作表 ${sheet.name} 超过 256 列或 10000 条记录。`)
    let headerRow = 0
    sheet.eachRow({ includeEmpty: false }, row => { if (!headerRow && row.actualCellCount) headerRow = row.number })
    const headers: string[] = []
    const columns: number[] = []
    sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, column) => {
      const text = String(cellValue(cell)).trim()
      if (!text) return
      if (headers.some(header => header.toLowerCase() === text.toLowerCase())) throw invalid(`工作表 ${sheet.name} 的表头“${text}”重复，请先修正。`)
      headers.push(text); columns.push(column)
    })
    if (!headers.length) continue
    const rows: Record<string, unknown>[] = []
    const sourceRegions: string[] = []
    sheet.eachRow({ includeEmpty: false }, row => {
      if (row.number <= headerRow) return
      const record = Object.fromEntries(headers.map((header, index) => [header, cellValue(row.getCell(columns[index]))]))
      if (Object.values(record).every(value => value === null || value === '')) return
      rows.push(record)
      sourceRegions.push(`${sheet.name}!${row.getCell(columns[0]).address}:${row.getCell(columns[columns.length - 1]).address}`)
    })
    if (!rows.length) continue
    totalRows += rows.length
    if (totalRows > 10_000) throw invalid('一个工作簿最多导入 10000 条业务记录。')
    samples.push({ sheet: sheet.name, headerRow, headers, rows, sourceRegions, sourceHash: sha256Hex(bytes) })
  }
  if (!samples.length) throw invalid('没有找到包含表头和业务记录的可见工作表。')
  return samples
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return value
  if ('formula' in value || 'sharedFormula' in value) {
    if (!('result' in value) || value.result === undefined) throw invalid(`单元格 ${cell.address} 的公式没有已计算结果；请在 Excel 中重新计算并保存。`)
    const result = value.result
    if (result && typeof result === 'object' && 'error' in result) throw invalid(`单元格 ${cell.address} 的公式包含错误。`)
    return result instanceof Date ? result.toISOString() : result
  }
  if ('error' in value) throw invalid(`单元格 ${cell.address} 包含 Excel 错误 ${value.error}。`)
  if ('richText' in value) return value.richText.map(part => part.text).join('')
  if ('text' in value) return value.text
  return cell.text
}
