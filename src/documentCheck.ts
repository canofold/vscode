import path from 'node:path'
import { realpath, stat } from 'node:fs/promises'
import * as vscode from 'vscode'
import { diagnosticFile, findCheckProject, insideProject, runProjectCheck } from './projectCheck'

interface ProjectState {
  project: string
  uri: vscode.Uri
  folder: vscode.WorkspaceFolder
  collection: vscode.DiagnosticCollection
  watcher: vscode.FileSystemWatcher
  controller?: AbortController
  checkedAt?: number
}

/** Own only editor state and task lifetime; the project's CLI owns all check rules. */
export function registerDocumentCheck(context: vscode.ExtensionContext, activeResource: () => vscode.Uri | undefined): void {
  const projects = new Map<string, ProjectState>()
  let selection = 0
  let disposed = false
  const belongs = (state: ProjectState, uri: vscode.Uri) => uri.scheme === 'file' &&
    (insideProject(state.project, uri.fsPath) || insideProject(state.uri.fsPath, uri.fsPath))
  const invalidate = (state: ProjectState) => {
    state.controller?.abort()
    state.controller = undefined
    state.checkedAt = undefined
    state.collection.clear()
  }
  const remove = (state: ProjectState) => {
    invalidate(state)
    state.watcher.dispose()
    state.collection.dispose()
    projects.delete(state.uri.toString())
  }
  const dirty = (state: ProjectState) => vscode.workspace.textDocuments.some((doc) => doc.isDirty && belongs(state, doc.uri))

  context.subscriptions.push(
    new vscode.Disposable(() => { disposed = true; selection++; for (const state of projects.values()) remove(state) }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length) for (const state of projects.values()) if (belongs(state, event.document.uri)) invalidate(state)
    }),
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      selection++
      for (const state of projects.values()) if (event.removed.some((folder) => folder.uri.toString() === state.folder.uri.toString())) remove(state)
    }),
    vscode.commands.registerCommand('canofold.checkProject', async (resource?: vscode.Uri) => {
      const request = ++selection
      if (!vscode.workspace.isTrusted) {
        void vscode.window.showWarningMessage('Canofold project checks execute project configuration and plugins. Trust this workspace before checking.')
        return
      }
      try {
        const folders = vscode.workspace.workspaceFolders ?? []
        if (!folders.length) throw new Error('Open a local Canofold project folder before checking.')
        const target = resource instanceof vscode.Uri ? resource : activeResource() ?? vscode.window.activeTextEditor?.document.uri
        let folder = target ? vscode.workspace.getWorkspaceFolder(target) : undefined
        if (target && !folder) throw new Error('The selected file is not in an open workspace folder.')
        if (!folder) folder = folders.length === 1 ? folders[0] : await vscode.window.showQuickPick(
          folders.map((item) => ({ label: item.name, description: item.uri.fsPath, folder: item })),
          { placeHolder: 'Select the Canofold workspace folder to check' }
        ).then((item) => item?.folder)
        if (!folder || disposed || request !== selection) return
        if (folder.uri.scheme !== 'file' || (target && target.scheme !== 'file')) throw new Error('Project checks require a local filesystem workspace.')
        const boundary = await realpath(folder.uri.fsPath)
        const start = target ? ((await stat(target.fsPath)).isDirectory() ? target.fsPath : path.dirname(target.fsPath)) : folder.uri.fsPath
        const project = await findCheckProject(start, boundary)
        if (disposed || request !== selection || !vscode.workspace.isTrusted) return
        const uri = vscode.Uri.joinPath(folder.uri, path.relative(boundary, project).split(path.sep).join('/'))
        let state = projects.get(uri.toString())
        if (!state) {
          const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(uri, '**/*'))
          state = { project, uri, folder, watcher, collection: vscode.languages.createDiagnosticCollection('canofold-project-check') }
          projects.set(uri.toString(), state)
          const current = state
          const changed = async (file: vscode.Uri) => {
            const relative = path.relative(uri.fsPath, file.fsPath)
            if (relative.split(path.sep).some((segment) => ['node_modules', '.git', '.canofold'].includes(segment))) return
            try {
              // Watch notifications can arrive after a newer check has started. Use
              // change time, not preservable modification time, to reject old notices.
              const metadata = await stat(file.fsPath)
              if (current.checkedAt === undefined || metadata.ctimeMs < current.checkedAt) return
            } catch {
              // Deletion or an unreadable input still invalidates the saved result.
            }
            invalidate(current)
          }
          watcher.onDidChange(changed)
          watcher.onDidCreate(changed)
          watcher.onDidDelete(changed)
        }
        invalidate(state)
        if (dirty(state)) {
          void vscode.window.showWarningMessage('Canofold checks saved files only. Save or discard this project’s unsaved changes, then run Check Project again. No files were saved.')
          return
        }
        const current = state
        const controller = new AbortController()
        current.checkedAt = Date.now()
        current.controller = controller
        await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Canofold: checking saved files in ${path.basename(project)}`, cancellable: true }, async (_progress, token) => {
          const cancellation = token.onCancellationRequested(() => {
            if (current.controller === controller) invalidate(current)
            else controller.abort()
          })
          try {
            if (token.isCancellationRequested) controller.abort()
            const issues = await runProjectCheck(project, boundary, controller.signal)
            const entries = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>()
            for (const issue of issues) {
              const file = await diagnosticFile(project, issue.page)
              const targetUri = file ? vscode.Uri.joinPath(uri, path.relative(project, file).split(path.sep).join('/')) : uri
              const precise = file !== undefined && issue.line !== undefined && issue.sourcePointer === undefined
              const row = precise ? issue.line! - 1 : 0
              const column = precise && issue.column !== undefined ? issue.column - 1 : 0
              const location = precise ? (issue.column === undefined ? ' [CLI provided a line only]' : '') : ` [CLI source: ${issue.page ?? 'project'}${issue.sourcePointer === undefined ? '' : `#${issue.sourcePointer}`}; no exact source position]`
              const diagnostic = new vscode.Diagnostic(new vscode.Range(row, column, row, column + 1), issue.message + location,
                issue.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning)
              diagnostic.source = 'Canofold'
              diagnostic.code = issue.ruleId
              const entry = entries.get(targetUri.toString()) ?? { uri: targetUri, diagnostics: [] }
              entry.diagnostics.push(diagnostic)
              entries.set(targetUri.toString(), entry)
            }
            if (disposed || controller.signal.aborted || current.controller !== controller || dirty(current) || !vscode.workspace.isTrusted) return
            current.collection.set([...entries.values()].map((entry) => [entry.uri, entry.diagnostics] as [vscode.Uri, vscode.Diagnostic[]]))
            await vscode.commands.executeCommand('workbench.actions.view.problems')
            if (disposed || controller.signal.aborted || current.controller !== controller) return
            const errors = issues.filter((issue) => issue.severity === 'error').length
            void vscode.window.showInformationMessage(`Canofold: ${errors} errors, ${issues.length - errors} warnings in saved project files.`)
          } catch (error) {
            if (!disposed && !controller.signal.aborted && current.controller === controller) {
              current.collection.clear()
              void vscode.window.showErrorMessage(`Canofold Check: ${error instanceof Error ? error.message : String(error)}`)
            }
          } finally {
            cancellation.dispose()
            if (current.controller === controller) current.controller = undefined
          }
        })
      } catch (error) {
        if (!disposed && request === selection) void vscode.window.showErrorMessage(`Canofold Check: ${error instanceof Error ? error.message : String(error)}`)
      }
    })
  )
}
