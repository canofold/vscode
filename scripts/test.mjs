import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

const directory = await mkdtemp(join(tmpdir(), 'canofold-vscode-test-'))
const outfile = join(directory, 'resourceRoots.test.cjs')
const hostTests = join(directory, 'hostRequests.test.cjs')
const rendererModule = join(directory, 'localDiagramRenderer.cjs')

try {
  await build({
    entryPoints: ['test/resourceRoots.test.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outfile
  })
  await build({ entryPoints: ['test/hostRequests.test.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', outfile: hostTests })
  await build({ entryPoints: ['src/localDiagramRenderer.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22',
    define: { __dirname: JSON.stringify(resolve('dist')) }, outfile: rendererModule })
  const result = spawnSync(process.execPath, ['--test', outfile, hostTests, 'test/localDiagramRenderer.test.cjs', 'test/plantUml.test.cjs'], {
    stdio: 'inherit', env: { ...process.env, CANOFOLD_TEST_RENDERER: rendererModule }
  })
  if (result.status !== 0) process.exitCode = result.status ?? 1
} finally {
  await rm(directory, { recursive: true, force: true })
}
