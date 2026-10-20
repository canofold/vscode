import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { findCheckProject, parseCheckOutput, diagnosticFile, runProjectCheck } from '../src/projectCheck'

test('validates the public JSON envelope without treating CLI errors as successful checks', () => {
  const issue = { severity: 'error', message: 'Broken link', ruleId: 'broken-link', page: 'docs/a.md', line: 3, column: 2 }
  assert.deepEqual(parseCheckOutput(JSON.stringify({ schemaVersion: 1, diagnostics: [issue] })), [issue])
  for (const value of [null, {}, { schemaVersion: 2, diagnostics: [] }, { schemaVersion: 1, diagnostics: [{}] },
    { schemaVersion: 1, diagnostics: [{ ...issue, line: 0 }] },
    { schemaVersion: 1, diagnostics: [{ ...issue, severity: 'info' }] },
    { schemaVersion: 1, diagnostics: [{ ...issue, severity: ['error'] }] },
    { schemaVersion: 1, diagnostics: [{ ...issue, page: '../outside.md' }] }]) {
    assert.throws(() => parseCheckOutput(JSON.stringify(value)))
  }
  assert.throws(() => parseCheckOutput('config log\n{"schemaVersion":1,"diagnostics":[]}'))
  assert.doesNotThrow(() => parseCheckOutput(JSON.stringify({ schemaVersion: 1, diagnostics: [{ ...issue, line: undefined, column: undefined, sourcePointer: '/paths/~1pets' }] })))
})

test('finds the nearest declared project, never a global package or a project outside the workspace', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'canofold-check-project-')))
  try {
    const nested = path.join(root, 'nested')
    await mkdir(path.join(nested, 'docs'), { recursive: true })
    await writeFile(path.join(root, 'package.json'), JSON.stringify({ dependencies: { canofold: '0.8.2' } }))
    assert.equal(await findCheckProject(path.join(nested, 'docs'), root), root)
    await writeFile(path.join(nested, 'package.json'), JSON.stringify({ devDependencies: { canofold: '0.8.2' } }))
    assert.equal(await findCheckProject(path.join(nested, 'docs'), root), nested)
    await assert.rejects(findCheckProject(path.dirname(root), root), /workspace/)
    await assert.rejects(findCheckProject(path.join(nested, 'docs'), path.join(nested, 'docs')), /declaring canofold/)
    await writeFile(path.join(nested, 'package.json'), '{invalid')
    await assert.rejects(findCheckProject(path.join(nested, 'docs'), root), SyntaxError)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('resolves only real project files and does not invent a source position for missing files', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'canofold-check-path-')))
  const outside = await mkdtemp(path.join(tmpdir(), 'canofold-check-outside-'))
  try {
    await writeFile(path.join(root, 'a.md'), '# A')
    await writeFile(path.join(outside, 'secret.md'), 'outside')
    assert.equal(await diagnosticFile(root, 'a.md'), path.join(root, 'a.md'))
    assert.equal(await diagnosticFile(root, 'missing.md'), undefined)
    assert.equal(await diagnosticFile(root, undefined), undefined)
    await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    await assert.rejects(diagnosticFile(root, 'escape/secret.md'), /outside/)
    for (const value of ['../secret.md', '/etc/passwd', 'C:\\secret.md', 'docs/../a.md', 'a.md\0']) {
      await assert.rejects(diagnosticFile(root, value))
    }
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }) }
})

test('runs a local bin without a shell, accepts exit 1 diagnostics, and rejects failures and cancellation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'canofold-check 中文 space;$-'))
  const pkg = path.join(root, 'node_modules/canofold')
  const controller = new AbortController()
  try {
    await mkdir(pkg, { recursive: true })
    await writeFile(path.join(pkg, 'package.json'), JSON.stringify({ name: 'canofold', bin: { canofold: './cli.cjs' } }))
    await writeFile(path.join(pkg, 'cli.cjs'), `console.log(JSON.stringify({schemaVersion:1,diagnostics:[{severity:'error',message:'expected',ruleId:'broken-link'}]}));process.exitCode=1`)
    assert.equal((await runProjectCheck(root, root, controller.signal))[0].message, 'expected')
    await writeFile(path.join(pkg, 'cli.cjs'), `console.error('config failed');process.exitCode=2`)
    await assert.rejects(runProjectCheck(root, root, controller.signal), /config failed/)
    await writeFile(path.join(pkg, 'cli.cjs'), `console.log('not JSON')`)
    await assert.rejects(runProjectCheck(root, root, controller.signal))
    await writeFile(path.join(pkg, 'cli.cjs'), `process.stdout.write('x'.repeat(9 * 1024 * 1024))`)
    await assert.rejects(runProjectCheck(root, root, controller.signal), /maxBuffer/)
    await writeFile(path.join(pkg, 'cli.cjs'), `console.log(JSON.stringify({schemaVersion:1,diagnostics:[]}));process.exitCode=1`)
    await assert.rejects(runProjectCheck(root, root, controller.signal))
    await writeFile(path.join(pkg, 'package.json'), JSON.stringify({ name: 'canofold', bin: { canofold: '../../outside.cjs' } }))
    await writeFile(path.join(root, 'outside.cjs'), 'throw new Error("must not execute")')
    await assert.rejects(runProjectCheck(root, root, controller.signal), /Invalid installed Canofold CLI path/)
    await writeFile(path.join(pkg, 'package.json'), JSON.stringify({ name: 'canofold', bin: { canofold: './cli.cjs' } }))
    await writeFile(path.join(pkg, 'cli.cjs'), `setTimeout(()=>console.log(JSON.stringify({schemaVersion:1,diagnostics:[]})),30000)`)
    const active = new AbortController()
    const pending = runProjectCheck(root, root, active.signal)
    setTimeout(() => active.abort(), 50)
    await assert.rejects(pending)
    controller.abort()
    await assert.rejects(runProjectCheck(root, root, controller.signal))
    await rm(path.join(pkg, 'package.json'))
    await assert.rejects(runProjectCheck(root, root, new AbortController().signal), /installed/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
