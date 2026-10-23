const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const vscode = require('vscode')

async function until(label, predicate) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Timed out: ${label}`)
}

const diagnostics = (uri) => vscode.languages.getDiagnostics(uri).filter((item) => item.source === 'Canofold')

function updateFolders(start, deleteCount, ...folders) {
  return new Promise((resolve, reject) => {
    const listener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      clearTimeout(timer)
      listener.dispose()
      resolve()
    })
    const timer = setTimeout(() => {
      listener.dispose()
      reject(new Error(`No workspace folder change event: ${JSON.stringify({ start, deleteCount, folders, current: vscode.workspace.workspaceFolders })}`))
    }, 10000)
    if (!vscode.workspace.updateWorkspaceFolders(start, deleteCount, ...folders)) {
      clearTimeout(timer)
      listener.dispose()
      reject(new Error('VS Code rejected the workspace folder change.'))
    }
  })
}

exports.run = async () => {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath
  const directory = await fs.mkdtemp(path.join(root, 'checks-'))
  const uri = vscode.Uri.file(path.join(directory, 'docs/index.md'))
  const pkg = path.join(directory, 'node_modules/canofold')
  const marker = path.join(root, 'check-invocations.json')
  const issue = (message) => ({ severity: 'error', message, ruleId: 'broken-link', page: 'docs/index.md', line: 5, column: 3 })
  const fakeCli = async (message, delay = 0, issues = [issue(message)]) => fs.writeFile(path.join(pkg, 'cli.cjs'), `
    const fs = require('node:fs');
    fs.writeFileSync(${JSON.stringify(marker)}, ${JSON.stringify(message)});
    setTimeout(() => { console.log(JSON.stringify({schemaVersion:1,diagnostics:${JSON.stringify(issues)}}));process.exitCode=1 }, ${delay});
  `)
  await fs.mkdir(path.dirname(uri.fsPath), { recursive: true })
  await fs.mkdir(pkg, { recursive: true })
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify({ private: true, devDependencies: { canofold: '0.8.2' } }))
  await fs.writeFile(path.join(pkg, 'package.json'), JSON.stringify({ name: 'canofold', bin: { canofold: './cli.cjs' } }))
  await fs.writeFile(uri.fsPath, '---\ntitle: Check\ndescription: Fixture\n---\n[Broken](missing.md)\n')
  let second
  try {
    const document = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(document)
    await fakeCli('first')
    second = await fs.mkdtemp(path.join(root, 'checks-second-'))
    await fs.cp(directory, second, { recursive: true })
    if (!vscode.workspace.isTrusted) {
      await vscode.commands.executeCommand('canofold.checkProject', uri)
      assert.equal(diagnostics(uri).length, 0)
      await assert.rejects(fs.access(marker), { code: 'ENOENT' })
      console.log('[editor-test] PASS Restricted Mode refuses project execution; awaiting trust for this disposable workspace only')
      await vscode.commands.executeCommand('workbench.action.focusWindow')
      await new Promise((resolve, reject) => {
        const listener = vscode.workspace.onDidGrantWorkspaceTrust(() => { listener.dispose(); resolve() })
        void vscode.commands.executeCommand('workbench.trust.manage').then(undefined, (error) => { listener.dispose(); reject(error) })
        if (vscode.workspace.isTrusted) { listener.dispose(); resolve() }
      })
    }
    await vscode.commands.executeCommand('canofold.checkProject', uri)
    assert.equal(diagnostics(uri).length, 1)
    assert.equal(diagnostics(uri)[0].code, 'broken-link')
    assert.equal(diagnostics(uri)[0].range.start.line, 4)
    assert.equal(diagnostics(uri)[0].range.start.character, 2)
    await vscode.commands.executeCommand('vscode.open', uri, { selection: diagnostics(uri)[0].range })
    assert.equal(vscode.window.activeTextEditor.document.uri.toString(), uri.toString())
    assert.equal(vscode.window.activeTextEditor.selection.start.line, 4)

    const edit = new vscode.WorkspaceEdit()
    edit.insert(uri, document.positionAt(document.getText().length), '\nUnsaved\n')
    await vscode.workspace.applyEdit(edit)
    await until('editing invalidates diagnostics', () => diagnostics(uri).length === 0)
    await vscode.commands.executeCommand('canofold.checkProject', uri)
    assert.equal(document.isDirty, true)
    assert.equal(await fs.readFile(marker, 'utf8'), 'first', 'A dirty project must not execute the CLI or save files.')
    await document.save()

    await fakeCli('old', 1500)
    const old = vscode.commands.executeCommand('canofold.checkProject', uri)
    await until('old CLI started', async () => (await fs.readFile(marker, 'utf8')) === 'old')
    await fakeCli('new')
    await vscode.commands.executeCommand('canofold.checkProject', uri)
    await old
    assert.equal(diagnostics(uri)[0]?.message, 'new')
    await fs.writeFile(uri.fsPath, document.getText() + '\nExternal edit\n')
    await until('external edits to open documents invalidate diagnostics', () => diagnostics(uri).length === 0)
    await fakeCli('interrupted', 1500)
    const interrupted = vscode.commands.executeCommand('canofold.checkProject', uri)
    await until('interruptible CLI started', async () => (await fs.readFile(marker, 'utf8')) === 'interrupted')
    const duringCheck = new vscode.WorkspaceEdit()
    duringCheck.insert(uri, new vscode.Position(0, 0), '\n')
    await vscode.workspace.applyEdit(duringCheck)
    await interrupted
    assert.equal(diagnostics(uri).length, 0, 'Editing during a check must prevent its result from committing.')
    await document.save()

    await fs.writeFile(path.join(pkg, 'cli.cjs'), 'console.log("malformed response")')
    await vscode.commands.executeCommand('canofold.checkProject', uri)
    assert.equal(diagnostics(uri).length, 0)
    await fakeCli('recovered')
    await vscode.commands.executeCommand('canofold.checkProject', uri)
    assert.equal(diagnostics(uri)[0].message, 'recovered')

    await fakeCli('locations', 0, [
      { ...issue('pointer'), sourcePointer: '/paths/~1pets/get' },
      { ...issue('line-only'), column: undefined },
      { severity: 'warning', ruleId: 'missing-translation', message: 'project-level' }
    ])
    await vscode.commands.executeCommand('canofold.checkProject', uri)
    const pointer = diagnostics(uri).find((item) => item.message.startsWith('pointer'))
    assert.equal(pointer.range.start.line, 0)
    assert.match(pointer.message, /\/paths\/~1pets\/get; no exact source position/)
    assert.match(diagnostics(uri).find((item) => item.message.startsWith('line-only')).message, /line only/)
    assert.match(diagnostics(vscode.Uri.file(directory))[0].message, /project-level.*no exact source position/)
    await fakeCli('recovered')
    await vscode.commands.executeCommand('canofold.checkProject', uri)

    const secondUri = vscode.Uri.file(path.join(second, 'docs/index.md'))
    const secondFolder = vscode.Uri.file(second)
    await updateFolders(vscode.workspace.workspaceFolders.length, 0, { uri: secondFolder, name: 'Check second' })
    await until('second workspace folder added', () => vscode.workspace.getWorkspaceFolder(secondUri)?.uri.toString() === secondFolder.toString())
    await vscode.commands.executeCommand('canofold.checkProject', secondUri)
    assert.equal(diagnostics(secondUri).length, 1)
    assert.equal(diagnostics(uri).length, 1, 'Checking the other root must not clear this project.')
    const index = vscode.workspace.workspaceFolders.findIndex((folder) => folder.uri.toString() === secondFolder.toString())
    await updateFolders(index, 1)
    await until('removed workspace diagnostics cleared', () => diagnostics(secondUri).length === 0)
    assert.equal(diagnostics(uri).length, 1)

    if (process.env.CANOFOLD_CHECK_PACKAGE) {
      await fs.rm(pkg, { recursive: true })
      await fs.symlink(process.env.CANOFOLD_CHECK_PACKAGE, pkg, process.platform === 'win32' ? 'junction' : 'dir')
      const invalidYaml = vscode.Uri.file(path.join(directory, 'docs/invalid-yaml.md'))
      const invalidSchema = vscode.Uri.file(path.join(directory, 'docs/invalid-schema.md'))
      await fs.writeFile(invalidYaml.fsPath, '---\ntitle: [broken\n---\n# Invalid YAML\n')
      await fs.writeFile(invalidSchema.fsPath, '---\ntitle: 123\n---\n# Invalid metadata\n')
      await vscode.commands.executeCommand('canofold.checkProject', uri)
      const actual = diagnostics(uri).find((item) => item.code === 'broken-link')
      assert.ok(actual, 'The actual installed Canofold CLI must report the broken source link.')
      const syntax = diagnostics(invalidYaml).find((item) => item.code === 'content-syntax')
      assert.ok(syntax, 'The actual CLI must report malformed YAML without hiding other files.')
      assert.equal(syntax.range.start.line, 2)
      assert.ok(diagnostics(invalidSchema).some((item) => item.code === 'content-syntax'))
      await vscode.commands.executeCommand('vscode.open', invalidYaml, { selection: syntax.range })
      assert.equal(vscode.window.activeTextEditor.selection.start.line, 2)
      await fs.writeFile(invalidYaml.fsPath, '---\ntitle: Fixed YAML\ndescription: Fixed\n---\n# Fixed YAML\n')
      await fs.writeFile(invalidSchema.fsPath, '---\ntitle: Fixed metadata\ndescription: Fixed\n---\n# Fixed metadata\n')
      const fix = new vscode.WorkspaceEdit()
      fix.replace(uri, new vscode.Range(0, 0, document.lineCount, 0), '---\ntitle: Check\ndescription: Fixture\n---\n# Check\n\nFixed content.\n')
      await vscode.workspace.applyEdit(fix)
      await document.save()
      await vscode.commands.executeCommand('canofold.checkProject', uri)
      assert.equal(diagnostics(uri).length, 0, 'The actual CLI must clear the repaired problem.')
      assert.equal(diagnostics(invalidYaml).length, 0)
      assert.equal(diagnostics(invalidSchema).length, 0)
      console.log('[editor-test] PASS actual installed Canofold check JSON, source Problems and repair/recheck')
    } else console.log('[editor-test] Actual Canofold integration not run; pass --check-project to include it.')
    console.log('[editor-test] PASS Problems locations, dirty-file refusal, obsolete task cancellation, malformed-output recovery and workspace isolation')
  } finally {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors')
    if (second) await fs.rm(second, { recursive: true, force: true })
    await fs.rm(directory, { recursive: true, force: true })
    await fs.rm(marker, { force: true })
  }
}
