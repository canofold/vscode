import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'

const directory = await mkdtemp(join(tmpdir(), 'canofold-vscode-test-'))
const outfile = join(directory, 'resourceRoots.test.cjs')

try {
  await build({
    entryPoints: ['test/resourceRoots.test.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    outfile
  })
  const result = spawnSync(process.execPath, ['--test', outfile], { stdio: 'inherit' })
  if (result.status !== 0) process.exitCode = result.status ?? 1
} finally {
  await rm(directory, { recursive: true, force: true })
}
