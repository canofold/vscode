import path from 'node:path'
import * as vscode from 'vscode'

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

async function reopenInCurrentTab(viewType: string, resource?: vscode.Uri): Promise<void> {
  const uri = activeMarkdownUri(resource)
  const previousGroup = vscode.window.tabGroups.activeTabGroup
  const previousTab = previousGroup.activeTab
  const previousIndex = previousTab ? previousGroup.tabs.indexOf(previousTab) : -1
  if (!uri || !previousTab || isRequestedEditor(viewType)) return

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
    `img-src ${webview.cspSource} https: data:`,
    `media-src ${webview.cspSource} https:`,
    `font-src ${webview.cspSource}`,
    `style-src ${webview.cspSource}`,
    `script-src ${webview.cspSource}`
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

  resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): void {
    const directory = documentDirectory(document.uri)
    const root = vscode.workspace.getWorkspaceFolder(document.uri)?.uri ?? directory
    const bundle = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [bundle, root]
    }

    const sendDocument = () => {
      void panel.webview.postMessage({
        type: 'document',
        source: document.getText(),
        documentBase: `${panel.webview.asWebviewUri(directory).toString().replace(/\/$/, '')}/`,
        rootBase: `${panel.webview.asWebviewUri(root).toString().replace(/\/$/, '')}/`
      })
    }

    const disposables = [
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === document.uri.toString()) sendDocument()
      }),
      panel.webview.onDidReceiveMessage((message: unknown) => {
        if (!message || typeof message !== 'object' || !('type' in message)) return
        if (message.type === 'ready') sendDocument()
        if (message.type === 'openLink' && 'href' in message && typeof message.href === 'string') {
          void openLink(document, root, message.href)
        }
      })
    ]
    panel.onDidDispose(() => disposables.forEach((item) => item.dispose()))
    panel.webview.html = webviewHtml(panel.webview, this.extensionUri)
  }
}

export function activate(context: vscode.ExtensionContext): void {
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
