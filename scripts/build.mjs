import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { build as esbuild } from 'esbuild'
import { build as viteBuild } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const libDir = join(root, 'lib')
const distDir = join(root, 'dist')
const packageId = '@deepseek-ai/dsh-skill-manager-plugin'
const execFileAsync = promisify(execFile)

await rm(libDir, { recursive: true, force: true })
await rm(distDir, { recursive: true, force: true })
await mkdir(libDir, { recursive: true })

await esbuild({
  entryPoints: [join(root, 'src/index.ts')],
  outfile: join(libDir, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  packages: 'external',
  external: ['node:*', '@deepseek-ai/dsh-typert-protocol', '@deepseek-ai/dsh-llm'],
})

await esbuild({
  entryPoints: [join(root, 'src/host/phase0.ts')],
  outfile: join(libDir, 'phase0-core.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  packages: 'external',
})

await esbuild({
  entryPoints: [join(root, 'src/contracts/index.ts')],
  outfile: join(libDir, 'contracts/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  sourcemap: false,
})

// Publish the same descriptor artifact that the Browser face mounts at
// runtime.  Consumers that compose their own Client entry can import
// `@deepseek-ai/dsh-skill-manager-plugin/remote` directly, while the bundled
// client keeps the object inlined for Harness' ModuleLoader factory.
await esbuild({
  entryPoints: [join(root, 'src/client/remote.ts')],
  outfile: join(libDir, 'remote.js'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  sourcemap: false,
})

// Keep public Host/Browser/contracts declarations beside the generated JS so
// consumers can type-check the dual-face package without importing source.
await execFileAsync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'tsconfig.node.json')], { cwd: root })

await viteBuild({ root, configFile: join(root, 'vite.config.ts'), mode: 'production' })
const clientPath = join(root, 'dist/client/client.cjs')
if (!existsSync(clientPath)) throw new Error(`Browser build did not emit ${clientPath}`)
const client = await readFile(clientPath, 'utf8')
// Preserve compiled bytes: adding indentation to each line also adds spaces
// inside Vite's multiline template literals (including newline delimiters).
const wrapped = `window.__ModuleLoader__.load({\n  id: ${JSON.stringify(packageId)},\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n${client}\n    return module.exports;\n  }\n});\n`
await writeFile(join(libDir, 'client.js'), wrapped)

await rm(distDir, { recursive: true, force: true })
const verification = await execFileAsync(process.execPath, [join(root, 'scripts/verify-client-bundle.mjs')], { cwd: root })
process.stdout.write(verification.stdout)
