import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export function resolveDataDirectory(configured: unknown): string {
  if (configured !== undefined && configured !== null) {
    if (typeof configured !== 'string' || !configured.trim()) throw new Error('skill-manager: dataDir must be a non-empty path')
    return resolve(configured)
  }
  const directory = join(homedir(), '.dsh-skill-manager')
  const legacy = resolve('.dsh-skill-manager')
  if (legacy !== directory && ['manager.sqlite', 'runtime.sqlite'].some(name => existsSync(join(legacy, name)))) {
    throw new Error(`skill-manager: 检测到旧数据目录 ${legacy}。请在 Profile 的 skill-manager config.dataDir 中明确填写要继续使用的绝对路径；未移动或覆盖数据库。新安装默认目录为 ${directory}。`)
  }
  return directory
}
