const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const vscode = require('vscode')

const directory = path.resolve(__dirname, '..')
let provider

async function createEditorHarness(name, initialSource = '# Initial') {
  if (!provider) {
    const window = new Proxy(vscode.window, { get: (target, key) => key === 'registerCustomEditorProvider'
      ? (_, value) => { provider = value; return new vscode.Disposable(() => {}) } : target[key] })
    const commands = new Proxy(vscode.commands, { get: (target, key) => key === 'registerCommand'
      ? () => new vscode.Disposable(() => {}) : target[key] })
    const api = new Proxy(vscode, { get: (target, key) => key === 'window' ? window : key === 'commands' ? commands : target[key] })
    const filename = path.join(directory, 'dist/extension.cjs')
    const module = { exports: {} }
    const requireFromBundle = createRequire(filename)
    const execute = vm.compileFunction(await fs.readFile(filename, 'utf8'), ['require', 'module', 'exports', '__filename', '__dirname'], { filename })
    execute((name) => name === 'vscode' ? api : requireFromBundle(name), module, module.exports, filename, path.dirname(filename))
    module.exports.activate({ extensionUri: vscode.Uri.file(directory), subscriptions: [] })
    assert.ok(provider)
  }
  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  assert.ok(workspace, 'The editor tests require their isolated workspace.')
  const fixture = await fs.mkdtemp(path.join(workspace, `${name}-`))
  const uri = vscode.Uri.file(path.join(fixture, 'preview.md'))
  await fs.writeFile(uri.fsPath, initialSource)
  const document = await vscode.workspace.openTextDocument(uri)
  let panel, subscription, last, notify
  const close = () => { panel?.dispose(); subscription?.dispose() }
  return {
    workspace, fixture, uri, document,
    get panel() { return panel },
    get snapshot() { return last },
    wait: (label, predicate) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { notify = undefined; reject(new Error(`${label} timed out: ${JSON.stringify(last)}`)) }, 20000)
      notify = () => {
        if (!last || !predicate(last)) return
        clearTimeout(timer); notify = undefined; resolve(last)
      }
      notify()
    }),
    async open() {
      last = undefined
      panel = vscode.window.createWebviewPanel('canofold.editorTest', `Canofold ${name} test`, vscode.ViewColumn.One, { enableScripts: true })
      subscription = panel.webview.onDidReceiveMessage((message) => {
        if (message.type === 'editorTestSnapshot') {
          last = message
          notify?.()
        }
      })
      const observer = vscode.Uri.joinPath(vscode.Uri.file(directory), 'test', 'editorObserver.js')
      const view = new Proxy(panel.webview, {
        get: (target, key) => typeof target[key] === 'function' ? target[key].bind(target) : target[key],
        set(target, key, value) {
          if (key === 'options') value = { ...value, localResourceRoots: [...value.localResourceRoots, vscode.Uri.joinPath(vscode.Uri.file(directory), 'test')] }
          if (key === 'html') value = value.replace('<script type="module"', `<script src="${target.asWebviewUri(observer)}"></script><script type="module"`)
          target[key] = value
          return true
        }
      })
      const observedPanel = new Proxy(panel, { get: (target, key) => key === 'webview' ? view : typeof target[key] === 'function' ? target[key].bind(target) : target[key] })
      await provider.resolveCustomTextEditor(document, observedPanel, new vscode.CancellationTokenSource().token)
    },
    async edit(text) {
      const change = new vscode.WorkspaceEdit()
      change.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text)
      assert.equal(await vscode.workspace.applyEdit(change), true)
    },
    close,
    async dispose() {
      close()
      if (document.isDirty) await document.save()
      // The runner removes the workspace after VS Code exits, including asynchronous local-history writes.
    }
  }
}

module.exports = { createEditorHarness }
