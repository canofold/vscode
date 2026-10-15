import path from 'node:path'
import * as vscode from 'vscode'
import { resolveLocalResourcePath } from './resourceRoots'
import { MAX_EMBED_FILE_BYTES, type LocalEmbedAsset, type LocalEmbedDocument } from './previewProtocol'

const mediaTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf'
}

async function readResource(documentPath: string, root: vscode.Uri, publicDirectory: vscode.Uri | undefined,
  href: string, extensions: Readonly<Record<string, string>>) {
  const resourcePath = resolveLocalResourcePath(documentPath, root.path, publicDirectory?.path, href)
  const mediaType = resourcePath && extensions[path.posix.extname(resourcePath).toLowerCase()]
  if (!resourcePath || !mediaType) throw new Error('Embedded resource must use a supported file type inside the workspace.')
  const resource = root.with({ path: resourcePath, query: '', fragment: '' })
  const parts = path.posix.relative(root.path, resourcePath).split('/')
  let candidate = root
  let stat: vscode.FileStat | undefined
  for (const part of parts) {
    candidate = vscode.Uri.joinPath(candidate, part)
    stat = await vscode.workspace.fs.stat(candidate)
    if (stat.type & vscode.FileType.SymbolicLink) throw new Error('Embedded resources cannot follow symbolic links.')
  }
  if (!stat || !(stat.type & vscode.FileType.File) || stat.size > MAX_EMBED_FILE_BYTES) {
    throw new Error('Embedded resource must be a file no larger than 2 MiB.')
  }
  const bytes = await vscode.workspace.fs.readFile(resource)
  if (bytes.byteLength > MAX_EMBED_FILE_BYTES) throw new Error('Embedded resource must be a file no larger than 2 MiB.')
  return { path: resourcePath, bytes, mediaType }
}

export async function readLocalEmbed(documentPath: string, root: vscode.Uri, publicDirectory: vscode.Uri | undefined,
  href: string): Promise<LocalEmbedDocument> {
  const result = await readResource(documentPath, root, publicDirectory, href, { '.html': 'text/html', '.htm': 'text/html' })
  return { html: new TextDecoder('utf-8', { fatal: true }).decode(result.bytes), path: result.path }
}

export async function readLocalEmbedAsset(documentPath: string, root: vscode.Uri, publicDirectory: vscode.Uri | undefined,
  href: string): Promise<LocalEmbedAsset> {
  const result = await readResource(documentPath, root, publicDirectory, href, mediaTypes)
  return { path: result.path, mediaType: result.mediaType, byteLength: result.bytes.byteLength,
    content: result.mediaType === 'text/css'
      ? new TextDecoder('utf-8', { fatal: true }).decode(result.bytes)
      : `data:${result.mediaType};base64,${Buffer.from(result.bytes).toString('base64')}` }
}
