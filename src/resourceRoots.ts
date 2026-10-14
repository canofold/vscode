import path from 'node:path'

function isInside(candidatePath: string, rootPath: string): boolean {
  const relative = path.posix.relative(rootPath, candidatePath)
  return relative !== '..' && !relative.startsWith('../') && !path.posix.isAbsolute(relative)
}

export function resolveLocalResourcePath(
  documentPath: string,
  workspaceRootPath: string,
  publicDirectoryPath: string | undefined,
  href: string
): string | undefined {
  if (!href || href.startsWith('//') || /^[a-z][\w+.-]*:/i.test(href)) return undefined
  try {
    const match = /^([^?#]*)/.exec(href)
    if (!match) return undefined
    const authoredPath = decodeURIComponent(match[1])
    const root = path.posix.resolve('/', workspaceRootPath)
    if (!isInside(path.posix.resolve('/', documentPath), root)) return undefined
    const base = authoredPath.startsWith('/')
      ? path.posix.resolve('/', publicDirectoryPath ?? workspaceRootPath)
      : path.posix.dirname(path.posix.resolve('/', documentPath))
    const resource = path.posix.resolve(base, authoredPath.replace(/^\/+/, ''))
    return isInside(resource, root) ? resource : undefined
  } catch {
    return undefined
  }
}

export function publicDirectoryCandidates(documentPath: string, workspaceRootPath: string): string[] {
  const root = path.posix.resolve('/', workspaceRootPath)
  const document = path.posix.resolve('/', documentPath)
  let current = path.posix.dirname(document)
  if (!isInside(current, root)) return []

  const candidates: string[] = []
  while (isInside(current, root)) {
    candidates.push(path.posix.join(current, 'public'))
    if (current === root) break
    const parent = path.posix.dirname(current)
    if (parent === current) break
    current = parent
  }
  return candidates
}
