import { build } from 'esbuild'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { parseArgs } from 'node:util'
import { configs } from './build.config.mjs'

const { values } = parseArgs({ options: { 'plugins-package': { type: 'string' } } })
const executable = process.env.VSCODE_EXECUTABLE
if (!executable) throw new Error('Set VSCODE_EXECUTABLE to the actual VS Code executable (not the code CLI).')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratch = await mkdtemp(join(tmpdir(), 'canofold-editor-test-'))
const consumer = join(scratch, 'extension')
const workspace = await mkdtemp(join(root, '.editor-test-'))
try {
  for (const file of ['dist', 'media', 'package.json', 'test']) await cp(join(root, file), join(consumer, file), { recursive: true })
  if (values['plugins-package']) {
    const plugins = resolve(values['plugins-package'])
    const manifest = JSON.parse(await readFile(join(plugins, 'package.json'), 'utf8'))
    if (manifest.name !== '@canofold/plugins') throw new Error('Expected an @canofold/plugins package.')
    const alias = Object.fromEntries(Object.entries(manifest.exports).map(([name, entry]) => [
      `@canofold/plugins${name === '.' ? '' : name.slice(1)}`,
      resolve(plugins, typeof entry === 'string' ? entry : entry.import)
    ]))
    await rm(join(consumer, 'dist/webview'), { recursive: true })
    await build({ ...configs[1], absWorkingDir: root, outdir: join(consumer, 'dist/webview'), alias })
    await cp(join(root, 'dist/webview/plantuml'), join(consumer, 'dist/webview/plantuml'), { recursive: true })
    console.log(`[editor-test] Isolated consumer of ${plugins}; installed dependencies unchanged.`)
  }
  const result = await new Promise((accept, reject) => {
    const child = spawn(executable, [
      `--user-data-dir=${join(scratch, 'user-data')}`, `--extensions-dir=${join(scratch, 'extensions')}`,
      `--extensionDevelopmentPath=${consumer}`, `--extensionTestsPath=${join(consumer, 'test/editor.test.cjs')}`,
      '--disable-extensions', '--skip-welcome', '--skip-release-notes', workspace
    ], { stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => accept(code ?? (signal ? 1 : 0)))
  })
  process.exitCode = result
} finally {
  await rm(scratch, { recursive: true, force: true })
  await rm(workspace, { recursive: true, force: true })
}
