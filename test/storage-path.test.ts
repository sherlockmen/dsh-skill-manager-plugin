import { afterEach, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { resolveDataDirectory } from '../src/host/storage-path.js'

vi.mock('node:os', () => ({ homedir: () => '/users/example' }))
vi.mock('node:fs', () => ({ existsSync: vi.fn(() => false) }))
afterEach(() => { vi.restoreAllMocks(); vi.mocked(existsSync).mockReturnValue(false) })

it('uses the same home directory when launched from different working directories', () => {
  vi.spyOn(process, 'cwd').mockReturnValue('/work/one')
  expect(resolveDataDirectory(undefined)).toBe('/users/example/.dsh-skill-manager')
  vi.mocked(process.cwd).mockReturnValue('/work/two')
  expect(resolveDataDirectory(undefined)).toBe('/users/example/.dsh-skill-manager')
})

it('requires an explicit choice when either legacy database exists', () => {
  for (const name of ['manager.sqlite', 'runtime.sqlite']) {
    vi.mocked(existsSync).mockImplementation(path => path === join(resolve('.dsh-skill-manager'), name))
    expect(() => resolveDataDirectory(undefined)).toThrow('检测到旧数据目录')
  }
})

it('preserves explicitly configured locations even when legacy data exists', () => {
  vi.mocked(existsSync).mockReturnValue(true)
  expect(resolveDataDirectory('/existing/data')).toBe('/existing/data')
  expect(resolveDataDirectory('relative/data')).toBe(resolve('relative/data'))
})

it('rejects empty or non-string overrides instead of creating a new default database', () => {
  for (const value of ['', '  ', false, 123]) expect(() => resolveDataDirectory(value)).toThrow('non-empty path')
})
