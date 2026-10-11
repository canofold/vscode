import path from 'node:path'

function isInside(candidatePath: string, rootPath: string): boolean {
  const relative = path.posix.relative(rootPath, candidatePath)
  return relative !== '..' && !relative.startsWith('../') && !path.posix.isAbsolute(relative)
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
