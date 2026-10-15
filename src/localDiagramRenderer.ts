import path from 'node:path'
import { Worker } from 'node:worker_threads'
import type { LocalDiagramType } from './previewProtocol'

/** One engine worker per preview. Cancellation releases the engine, not just its result. */
export class LocalDiagramRenderer {
  private worker?: Worker
  private queue: Promise<void> = Promise.resolve()
  private stopped = false
  private readonly lifetime = new AbortController()
  private shutdown?: Promise<void>

  render(diagramType: LocalDiagramType, source: string, signal: AbortSignal): Promise<string> {
    const combined = AbortSignal.any([signal, this.lifetime.signal])
    const result = this.queue.then(async () => {
      combined.throwIfAborted()
      if (this.stopped) throw new Error('Diagram renderer is disposed.')
      if (!this.worker) {
        const created = new Worker(path.join(__dirname, 'diagramWorker.cjs'))
        const clear = () => { if (this.worker === created) this.worker = undefined }
        created.on('error', clear)
        created.on('exit', clear)
        this.worker = created
      }
      const worker = this.worker
      try {
        return await new Promise<string>((resolve, reject) => {
          const cleanup = () => {
            worker.off('message', message)
            worker.off('error', failed)
            worker.off('exit', exited)
            combined.removeEventListener('abort', aborted)
          }
          const failed = (error: Error) => { cleanup(); reject(error) }
          const exited = (code: number) => failed(new Error(`Diagram worker exited before returning a result (${code}).`))
          const aborted = () => { cleanup(); reject(combined.reason) }
          const message = (value: { svg?: string; error?: string }) => {
            cleanup()
            if (typeof value.svg === 'string' && value.svg.trim()) resolve(value.svg)
            else reject(new Error(value.error ?? 'Diagram worker returned no SVG.'))
          }
          worker.once('message', message)
          worker.once('error', failed)
          worker.once('exit', exited)
          combined.addEventListener('abort', aborted, { once: true })
          try { worker.postMessage({ diagramType, source }) }
          catch (error) { cleanup(); reject(error) }
        })
      } catch (error) {
        this.worker = undefined
        await worker.terminate()
        throw error
      }
    })
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  dispose(): Promise<void> {
    if (this.shutdown) return this.shutdown
    this.stopped = true
    this.lifetime.abort()
    this.shutdown = this.queue.then(async () => {
      const worker = this.worker
      this.worker = undefined
      await worker?.terminate()
    })
    return this.shutdown
  }
}
