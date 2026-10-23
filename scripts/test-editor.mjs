import { build } from 'esbuild'
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { parseArgs } from 'node:util'
import { configs } from './build.config.mjs'

const { values } = parseArgs({ options: { 'plugins-package': { type: 'string' }, 'markdown-package': { type: 'string' }, 'check-project': { type: 'string' } } })
const executable = process.env.VSCODE_EXECUTABLE
if (!executable) throw new Error('Set VSCODE_EXECUTABLE to the actual VS Code executable (not the code CLI).')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratch = await mkdtemp(join(tmpdir(), 'canofold-editor-test-'))
const consumer = join(scratch, 'extension')
const workspace = await mkdtemp(join(root, '.editor-test-'))
const workspaceFile = join(scratch, 'acceptance.code-workspace')
const completionFile = join(scratch, 'completed')
try {
  await writeFile(workspaceFile, JSON.stringify({ folders: [{ path: workspace }] }))
  let checkPackage
  if (values['check-project']) {
    checkPackage = await realpath(join(resolve(values['check-project']), 'node_modules/canofold'))
    const manifest = JSON.parse(await readFile(join(checkPackage, 'package.json'), 'utf8'))
    if (manifest.name !== 'canofold') throw new Error('The check project must contain an installed Canofold package.')
    console.log(`[editor-test] Project checking consumes installed Canofold ${manifest.version}.`)
  }
  for (const file of ['dist', 'media', 'package.json', 'test']) await cp(join(root, file), join(consumer, file), { recursive: true })
  const candidates = ['plugins', 'markdown'].filter((name) => values[`${name}-package`])
  if (candidates.length) {
    const resolveInstalled = createRequire(join(root, 'package.json'))
    const alias = Object.fromEntries(['react', 'react-dom'].map((name) => [name, dirname(resolveInstalled.resolve(`${name}/package.json`))]))
    for (const name of candidates) {
      const candidate = resolve(values[`${name}-package`])
      const manifest = JSON.parse(await readFile(join(candidate, 'package.json'), 'utf8'))
      if (manifest.name !== `@canofold/${name}`) throw new Error(`Expected an @canofold/${name} package.`)
      for (const [entryName, entry] of Object.entries(manifest.exports)) {
        alias[`${manifest.name}${entryName === '.' ? '' : entryName.slice(1)}`] = resolve(candidate, typeof entry === 'string' ? entry : entry.import)
      }
      console.log(`[editor-test] Isolated consumer of ${candidate}; installed dependencies unchanged.`)
    }
    await rm(join(consumer, 'dist/webview'), { recursive: true })
    await build({ ...configs[1], absWorkingDir: root, outdir: join(consumer, 'dist/webview'), alias })
    await cp(join(root, 'dist/webview/plantuml'), join(consumer, 'dist/webview/plantuml'), { recursive: true })
  }
  const result = await new Promise((accept, reject) => {
    const child = spawn(executable, [
      `--user-data-dir=${join(scratch, 'user-data')}`, `--extensions-dir=${join(scratch, 'extensions')}`,
      `--extensionDevelopmentPath=${consumer}`, `--extensionTestsPath=${join(consumer, 'test/editor.test.cjs')}`,
      '--disable-extensions', '--skip-welcome', '--skip-release-notes', workspaceFile
    ], { stdio: 'inherit', env: { ...process.env, CANOFOLD_EDITOR_COMPLETION_FILE: completionFile, ...(checkPackage ? { CANOFOLD_CHECK_PACKAGE: checkPackage } : {}) } })
    child.once('error', reject)
    child.once('exit', (code, signal) => accept(code ?? (signal ? 1 : 0)))
  })
  if (result === 0) {
    const completed = await readFile(completionFile, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return ''
      throw error
    })
    if (completed !== 'passed') throw new Error('VS Code exited before editor acceptance completed.')
  }
  process.exitCode = result
} finally {
  await rm(scratch, { recursive: true, force: true })
  await rm(workspace, { recursive: true, force: true })
}
