const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const vscode = require('vscode')

async function run() {
  const extension = vscode.extensions.getExtension('canofold.canofold-vscode')
  assert.ok(extension)
  assert.equal(extension.packageJSON.version, '0.1.13')
  assert.equal(extension.packageJSON.dependencies['@canofold/markdown'], '0.6.6')
  assert.equal(extension.packageJSON.dependencies['@canofold/plugins'], '0.6.6')
  assert.equal(extension.packageJSON.dependencies['@canofold/themes'], '0.6.6')
  assert.equal(extension.packageJSON.dependencies.mermaid, '12.2.0')
  const toggle = extension.packageJSON.contributes.commands.find((command) => command.command === 'canofold.toggle')
  assert.deepEqual(toggle.icon, {
    light: 'media/canofold.png',
    dark: 'media/canofold.png'
  })
  const titleAction = extension.packageJSON.contributes.menus['editor/title'].find((item) => item.command === 'canofold.toggle')
  assert.equal(titleAction.when, "(resourceExtname =~ /^\\.md$/i && !notebookEditorFocused) || activeCustomEditorId == 'canofold.markdownPreview'")
  await fs.access(path.join(extension.extensionPath, 'media/canofold.png'))
  await fs.access(path.join(extension.extensionPath, 'dist/webview/mermaid.js'))
  await fs.access(path.join(extension.extensionPath, 'dist/webview/plantuml/viz-global.js'))
  const licenses = await fs.readFile(path.join(extension.extensionPath, 'dist/THIRD_PARTY_LICENSES.txt'), 'utf8')
  assert.match(licenses, /Mozilla Public License Version 2.0/)
  assert.match(licenses, /Eclipse Public License/)
  assert.match(licenses, /Copyright \(c\) Michael Daines/)
  const stylesheet = await fs.readFile(path.join(extension.extensionPath, 'dist/webview/main.css'), 'utf8')
  const webviewScript = await fs.readFile(path.join(extension.extensionPath, 'dist/webview/main.js'), 'utf8')
  assert.doesNotMatch(stylesheet, /--cf-surface:\s*var\(--vscode-editor-background\)/)
  assert.match(stylesheet, /background:\s*var\(--cf-surface\)/)
  assert.doesNotMatch(webviewScript, /vscode-dark/)
  assert.match(webviewScript, /data:image\/png;base64,/)
  assert.doesNotMatch(webviewScript, /\.\/assets\/canofold-/)
  assert.match(stylesheet, /max-width:\s*1100px/)
  assert.match(stylesheet, /\.cf-gallery-lightbox/)
  assert.match(stylesheet, /\.cf-image-lightbox/)
  assert.match(stylesheet, /\.cf-table-preview/)
  assert.match(stylesheet, /appearance:\s*none/)

  const directory = await fs.mkdtemp(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'commands-'))
  const uri = vscode.Uri.file(path.join(directory, 'preview.md'))

  try {
    await fs.writeFile(uri.fsPath, '# Preview\n\n![Image](image.svg)\n')
    await fs.writeFile(path.join(directory, 'image.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')
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
    for (const [filename, language] of [['SKILL.md', 'skill'], ['guide.instructions.md', 'instructions'], ['README.MD', 'plaintext']]) {
      const specialUri = vscode.Uri.file(path.join(directory, filename))
      await fs.writeFile(specialUri.fsPath, '---\nname: example\n---\n\n# Markdown body\n')
      const specialDocument = await vscode.workspace.openTextDocument(specialUri)
      await vscode.languages.setTextDocumentLanguage(specialDocument, language)
      await vscode.window.showTextDocument(specialDocument)
      await vscode.commands.executeCommand('canofold.toggle')
      assert.equal(vscode.window.tabGroups.activeTabGroup.activeTab?.input.viewType, 'canofold.markdownPreview')
      await vscode.commands.executeCommand('canofold.source')
      assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), specialUri.toString())
      assert.equal(vscode.window.activeTextEditor?.document.languageId, language)
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    }
  } finally {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
  }
}

module.exports = { run }
