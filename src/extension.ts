import path from 'node:path'
import * as vscode from 'vscode'
import { LocalDiagramRenderer } from './localDiagramRenderer'
import { publicDirectoryCandidates } from './resourceRoots'
import { readLocalEmbed, readLocalEmbedAsset } from './localEmbedResources'
import { registerDocumentCheck } from './documentCheck'

const VIEW_TYPE = 'canofold.markdownPreview'

function activeMarkdownUri(resource?: vscode.Uri): vscode.Uri | undefined {
  if (resource instanceof vscode.Uri && resource.path.toLowerCase().endsWith('.md')) return resource
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  if (input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom) {
    return input.uri.path.toLowerCase().endsWith('.md') ? input.uri : undefined
  }
  return undefined
}

function isRequestedEditor(viewType: string): boolean {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input
  return viewType === 'default'
    ? input instanceof vscode.TabInputText
    : input instanceof vscode.TabInputCustom && input.viewType === viewType
}

async function saveDirtyDocument(uri: vscode.Uri): Promise<void> {
  const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === uri.toString())
  if (document?.isDirty && !await document.save()) {
    throw new Error('Save the Markdown document before opening its Canofold preview.')
  }
}

async function reopenInCurrentTab(viewType: string, resource?: vscode.Uri): Promise<void> {
  const uri = activeMarkdownUri(resource)
  const previousGroup = vscode.window.tabGroups.activeTabGroup
  const previousTab = previousGroup.activeTab
  const previousIndex = previousTab ? previousGroup.tabs.indexOf(previousTab) : -1
  if (!uri || !previousTab || isRequestedEditor(viewType)) return
  await saveDirtyDocument(uri)

  if (viewType === 'default') {
    await vscode.commands.executeCommand('workbench.action.reopenTextEditor')
    if (isRequestedEditor(viewType)) return
  }

  await vscode.commands.executeCommand('vscode.openWith', uri, viewType, {
    viewColumn: vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active,
    preview: false
  })

  if (!isRequestedEditor(viewType)) {
    throw new Error('VS Code did not open the requested editor.')
  }

  const currentGroup = vscode.window.tabGroups.all.find((group) => group.viewColumn === previousGroup.viewColumn)
  const currentTab = currentGroup?.activeTab
  const oldTab = previousIndex >= 0 ? currentGroup?.tabs[previousIndex] : undefined
  if (!oldTab || oldTab === currentTab) return

  const closed = await vscode.window.tabGroups.close(oldTab)
  if (!closed) {
    throw new Error('VS Code kept the previous tab open. Please close the duplicate manually.')
  }
}

function documentDirectory(uri: vscode.Uri): vscode.Uri {
  return uri.with({ path: path.posix.dirname(uri.path), query: '', fragment: '' })
}

async function findPublicDirectory(document: vscode.TextDocument, root: vscode.Uri): Promise<vscode.Uri | undefined> {
  for (const candidatePath of publicDirectoryCandidates(document.uri.path, root.path)) {
    const candidate = root.with({ path: candidatePath, query: '', fragment: '' })
    try {
      const stat = await vscode.workspace.fs.stat(candidate)
      if (stat.type & vscode.FileType.Directory) return candidate
    } catch {
      // Continue towards the workspace root until an existing public directory is found.
    }
  }
  return undefined
}

function isInsideRoot(uri: vscode.Uri, root: vscode.Uri): boolean {
  if (uri.scheme !== root.scheme || uri.authority !== root.authority) return false
  const relative = path.posix.relative(root.path, uri.path)
  return relative !== '..' && !relative.startsWith('../') && !path.posix.isAbsolute(relative)
}

function resolveLocalLink(document: vscode.TextDocument, root: vscode.Uri, href: string): vscode.Uri | undefined {
  if (!href || href.startsWith('//') || /^[a-z][\w+.-]*:/i.test(href)) return undefined
  try {
    const match = /^([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(href)
    if (!match) return undefined
    const localPath = decodeURIComponent(match[1])
    const base = localPath.startsWith('/') ? root : documentDirectory(document.uri)
    const resource = vscode.Uri.joinPath(base, localPath.replace(/^\/+/, ''))
    if (!isInsideRoot(resource, root)) return undefined
    return resource.with({ query: match[2] ?? '', fragment: match[3] ?? '' })
  } catch {
    return undefined
  }
}

async function openLink(document: vscode.TextDocument, root: vscode.Uri, href: string): Promise<void> {
  if (/^(https?:|mailto:)/i.test(href)) {
    await vscode.env.openExternal(vscode.Uri.parse(href))
    return
  }
  const target = resolveLocalLink(document, root, href)
  if (target) await vscode.commands.executeCommand('vscode.open', target)
}

function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const bundle = vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
  const script = webview.asWebviewUri(vscode.Uri.joinPath(bundle, 'main.js'))
  const style = webview.asWebviewUri(vscode.Uri.joinPath(bundle, 'main.css'))
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https: data: blob:`,
    `media-src ${webview.cspSource} https:`,
    `frame-src ${webview.cspSource} https:`,
    `worker-src blob:`,
    `font-src ${webview.cspSource} data:`,
    // Markdown interactions and diagram engines generate styles at runtime.
    `style-src ${webview.cspSource} data: 'unsafe-inline'`,
    `script-src ${webview.cspSource} 'wasm-unsafe-eval'`
  ].join('; ')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="${style}">
</head>
<body>
  <main id="app"></main>
  <script type="module" src="${script}"></script>
</body>
</html>`
}

class MarkdownPreviewProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const directory = documentDirectory(document.uri)
    const root = vscode.workspace.getWorkspaceFolder(document.uri)?.uri ?? directory
    const bundle = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
    const renderer = new LocalDiagramRenderer()
    const requests = new Map<number, AbortController>()
    const disposables: vscode.Disposable[] = []
    let disposed = false
    const cancelRequests = () => {
      requests.forEach((controller) => controller.abort())
      requests.clear()
    }
    panel.onDidDispose(() => {
      disposed = true
      cancelRequests()
      disposables.forEach((item) => item.dispose())
      void renderer.dispose().catch((error: unknown) => console.error('[canofold] Diagram shutdown failed:', error))
    })
    const publicDirectory = await findPublicDirectory(document, root)
    if (disposed) return
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [bundle, root]
    }

    let sentSource: string | undefined
    const sendDocument = (force = false) => {
      const source = document.getText()
      if (!force && source === sentSource) return
      sentSource = source
      cancelRequests()
      void panel.webview.postMessage({
        type: 'document',
        source,
        documentBase: `${panel.webview.asWebviewUri(directory).toString().replace(/\/$/, '')}/`,
        rootBase: `${panel.webview.asWebviewUri(publicDirectory ?? root).toString().replace(/\/$/, '')}/`
      })
    }

    disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === document.uri.toString()) sendDocument()
      }),
      panel.webview.onDidReceiveMessage((message: unknown) => {
        if (!message || typeof message !== 'object' || !('type' in message)) return
        if (message.type === 'ready') sendDocument(true)
        if (message.type === 'openLink' && 'href' in message && typeof message.href === 'string') {
          void openLink(document, root, message.href)
        }
        if (!('id' in message) || typeof message.id !== 'number' || !Number.isSafeInteger(message.id) || message.id <= 0) return
        const id = message.id
        if (message.type === 'cancelRequest') { requests.get(id)?.abort(); requests.delete(id); return }
        let operation: ((signal: AbortSignal) => Promise<unknown>) | undefined
        if (message.type === 'renderDiagram' && 'diagramType' in message &&
          (message.diagramType === 'graphviz' || message.diagramType === 'd2') &&
          'source' in message && typeof message.source === 'string') {
          const { diagramType, source } = message
          operation = async (signal) => ({ svg: await renderer.render(diagramType, source, signal) })
        }
        if (message.type === 'loadLocalEmbed' && 'href' in message && typeof message.href === 'string') {
          const href = message.href
          operation = () => readLocalEmbed(document.uri.path, root, publicDirectory, href)
        }
        if (message.type === 'loadLocalEmbedAsset' && 'documentPath' in message && typeof message.documentPath === 'string' &&
          'href' in message && typeof message.href === 'string') {
          const { documentPath, href } = message
          operation = () => readLocalEmbedAsset(documentPath, root, publicDirectory, href)
        }
        if (!operation || disposed || requests.has(id)) return
        const controller = new AbortController()
        requests.set(id, controller)
        void operation(controller.signal).then(
          (value) => {
            if (!disposed && !controller.signal.aborted) return panel.webview.postMessage({ type: 'hostResult', id, value })
          },
          (error: unknown) => {
            if (!disposed && !controller.signal.aborted) return panel.webview.postMessage({ type: 'hostResult', id, error: String(error) })
          }
        ).catch((error: unknown) => console.error('[canofold] Preview response failed:', error)).finally(() => {
          if (requests.get(id) === controller) requests.delete(id)
        })
      })
    )
    panel.webview.html = webviewHtml(panel.webview, this.extensionUri)
  }
}

export function activate(context: vscode.ExtensionContext): void {
  registerDocumentCheck(context, activeMarkdownUri)
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, new MarkdownPreviewProvider(context.extensionUri)),
    vscode.commands.registerCommand('canofold.toggle', async (resource?: vscode.Uri) => {
      try {
        await reopenInCurrentTab(isRequestedEditor(VIEW_TYPE) ? 'default' : VIEW_TYPE, resource)
      } catch (error) {
        void vscode.window.showErrorMessage(`Canofold Preview: ${String(error)}`)
      }
    }),
    vscode.commands.registerCommand('canofold.preview', async (resource?: vscode.Uri) => {
      try {
        await reopenInCurrentTab(VIEW_TYPE, resource)
      } catch (error) {
        void vscode.window.showErrorMessage(`Canofold Preview: ${String(error)}`)
      }
    }),
    vscode.commands.registerCommand('canofold.source', async (resource?: vscode.Uri) => {
      try {
        await reopenInCurrentTab('default', resource)
      } catch (error) {
        void vscode.window.showErrorMessage(`Canofold Preview: ${String(error)}`)
      }
    })
  )
}
