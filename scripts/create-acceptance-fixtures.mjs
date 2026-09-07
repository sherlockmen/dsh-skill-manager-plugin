// Explicit synthetic fixtures for manual, local end-to-end acceptance only.
import ExcelJS from 'exceljs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createXmindSample } from '../lib/phase0-core.js'

const directory = await mkdtemp(join(tmpdir(), 'skill-manager-acceptance-'))
const workbook = new ExcelJS.Workbook()
const sheet = workbook.addWorksheet('验收样例')
sheet.addRows([['报表月份', '省份', '收入'], ['2026-09', '江苏', 100], ['2026-09', '浙江', 120]])
await workbook.xlsx.writeFile(join(directory, 'acceptance-sample.xlsx'))
await writeFile(join(directory, 'acceptance-sample.json'), JSON.stringify([{ month: '2026-09', province: '江苏', revenue: 100 }], null, 2))
await writeFile(join(directory, 'acceptance-source.xmind'), createXmindSample())
console.log(directory)
