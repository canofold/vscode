import { execFile } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

export interface ProjectDiagnostic {
  severity: 'error' | 'warning'
  message: string
  ruleId: string
  page?: string
  line?: number
  column?: number
  sourcePointer?: string
}

export function insideProject(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function safePage(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/[\\\x00-\x1f]/.test(value) && !/^[a-z]:/i.test(value) &&
    !path.posix.isAbsolute(value) && value.split('/').every((part) => part !== '..' && part !== '.' && part !== '')
}

/** Decode only the public check protocol, never console output or generated source locations. */
export function parseCheckOutput(output: string): ProjectDiagnostic[] {
  const value = JSON.parse(output)
  if (value?.schemaVersion !== 1 || !Array.isArray(value.diagnostics)) throw new Error('Unsupported Canofold check JSON response.')
  return value.diagnostics.map((issue: unknown) => {
    if (!issue || typeof issue !== 'object') throw new Error('Invalid Canofold diagnostic.')
    const item = issue as Record<string, unknown>
    if ((item.severity !== 'error' && item.severity !== 'warning') || typeof item.message !== 'string' ||
      typeof item.ruleId !== 'string' || !item.ruleId ||
      (item.page !== undefined && !safePage(item.page)) ||
      (item.sourcePointer !== undefined && typeof item.sourcePointer !== 'string') ||
      ['line', 'column'].some((key) => item[key] !== undefined && (!Number.isSafeInteger(item[key]) || Number(item[key]) < 1)) ||
      (item.column !== undefined && item.line === undefined)) throw new Error('Invalid Canofold diagnostic.')
    return item as unknown as ProjectDiagnostic
  })
}

export async function findCheckProject(start: string, boundary: string): Promise<string> {
  let directory = await realpath(start)
  const root = await realpath(boundary)
  if (!insideProject(root, directory)) throw new Error('The project is outside the selected workspace.')
  while (true) {
    try {
      const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'))
      if (typeof pkg.dependencies?.canofold === 'string' || typeof pkg.devDependencies?.canofold === 'string') return directory
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (directory === root) break
    directory = path.dirname(directory)
  }
  throw new Error('No project declaring canofold was found inside the selected workspace.')
}

export async function diagnosticFile(project: string, page: string | undefined): Promise<string | undefined> {
  if (page === undefined) return undefined
  if (!safePage(page)) throw new Error('Invalid diagnostic source path.')
  try {
    const file = await realpath(path.join(project, page))
    if (!insideProject(await realpath(project), file)) throw new Error('Diagnostic source is outside the project.')
    return (await stat(file)).isFile() ? file : undefined
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

async function installedCli(project: string, boundary: string): Promise<string> {
  let directory = project
  while (insideProject(boundary, directory)) {
    const packageRoot = path.join(directory, 'node_modules/canofold')
    try {
      const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
      if (pkg.name !== 'canofold' || typeof pkg.bin?.canofold !== 'string') throw new Error('Invalid installed Canofold CLI.')
      const root = await realpath(packageRoot)
      const cli = await realpath(path.resolve(packageRoot, pkg.bin.canofold))
      if (!insideProject(root, cli) || !(await stat(cli)).isFile()) throw new Error('Invalid installed Canofold CLI path.')
      return cli
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (directory === boundary) break
    directory = path.dirname(directory)
  }
  throw new Error('Canofold is not installed in this workspace. Install the project dependencies before checking.')
}

export async function runProjectCheck(project: string, boundary: string, signal: AbortSignal): Promise<ProjectDiagnostic[]> {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 12)) throw new Error('Project checks require Node.js 22.12+ in the extension host. Update VS Code; Markdown preview remains available.')
  signal.throwIfAborted()
  const cli = await installedCli(project, boundary)
  signal.throwIfAborted()
  return new Promise((accept, reject) => {
    execFile(process.execPath, [cli, 'check', '--json'], {
      cwd: project, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, signal,
      timeout: 120_000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8', windowsHide: true
    }, (error, stdout, stderr) => {
      if (signal.aborted) { reject(signal.reason); return }
      if (error && error.code !== 1) {
        reject(new Error(`Canofold check failed: ${(stderr.trim() || error.message).slice(0, 2000)}`))
        return
      }
      try {
        const issues = parseCheckOutput(stdout)
        if (error && !issues.some((issue) => issue.severity === 'error')) throw new Error('Check failed without error diagnostics.')
        accept(issues)
      } catch {
        reject(new Error(`Canofold did not return valid check JSON.${stderr.trim() ? ` ${stderr.trim().slice(0, 2000)}` : ''}`))
      }
    })
  })
}
