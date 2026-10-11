const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vscode = require('vscode')

async function run() {
  const extension = vscode.extensions.getExtension('canofold.canofold-vscode')
  assert.ok(extension)
  const toggle = extension.packageJSON.contributes.commands.find((command) => command.command === 'canofold.toggle')
  assert.deepEqual(toggle.icon, {
    light: 'media/canofold.png',
    dark: 'media/canofold.png'
  })
  await fs.access(path.join(extension.extensionPath, 'media/canofold.png'))
  const stylesheet = await fs.readFile(path.join(extension.extensionPath, 'dist/webview/main.css'), 'utf8')
  assert.match(stylesheet, /--cf-surface:\s*var\(--vscode-editor-background\)/)
  assert.match(stylesheet, /max-width:\s*1100px/)

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'canofold-vscode-test-'))
  const uri = vscode.Uri.file(path.join(directory, 'preview.md'))

  try {
    await fs.writeFile(uri.fsPath, '# Preview\n\n![Image](image.png)\n')
    const document = await vscode.workspace.openTextDocument(uri)
    await vscode.window.showTextDocument(document)

    const edit = new vscode.WorkspaceEdit()
    edit.insert(uri, document.positionAt(document.getText().length), '\nUnsaved edit\n')
    assert.equal(await vscode.workspace.applyEdit(edit), true)
    assert.equal(document.isDirty, true)

    await vscode.commands.executeCommand('canofold.toggle', uri)
    const preview = vscode.window.tabGroups.activeTabGroup.activeTab?.input
    assert.ok(preview instanceof vscode.TabInputCustom)
    assert.equal(preview.viewType, 'canofold.markdownPreview')
    assert.equal(vscode.window.tabGroups.activeTabGroup.tabs.length, 1)
    assert.equal(document.isDirty, false)
    assert.match(document.getText(), /Unsaved edit/)
    assert.match(await fs.readFile(uri.fsPath, 'utf8'), /Unsaved edit/)

    await vscode.commands.executeCommand('canofold.source')
    const source = vscode.window.tabGroups.activeTabGroup.activeTab?.input
    assert.ok(source instanceof vscode.TabInputText)
    assert.equal(vscode.window.tabGroups.activeTabGroup.tabs.length, 1)
    assert.equal(document.isDirty, false)
    assert.match(document.getText(), /Unsaved edit/)
    await vscode.commands.executeCommand('canofold.toggle')
    assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab?.input.viewType, 'canofold.markdownPreview')
    await vscode.commands.executeCommand('canofold.toggle', uri)
    assert.ok(vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputText)
    assert.equal(vscode.window.tabGroups.activeTabGroup.tabs.length, 1)
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

module.exports = { run }
