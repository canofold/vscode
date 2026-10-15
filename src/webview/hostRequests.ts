import { REQUEST_TIMEOUT_MS, type HostRequestData, type HostRequestResults } from '../previewProtocol'

interface VsCodeApi { postMessage(message: unknown): void }

/** VS Code hides window.parent; authenticate its origin and reject nested frame senders. */
export function isPreviewHostMessage(event: MessageEvent<unknown>): boolean {
  return event.origin === window.location.origin && event.source !== null && event.source !== window &&
    ![...document.querySelectorAll('iframe')].some((frame) => frame.contentWindow === event.source)
}

/** The webview has one request table and one response listener for host operations. */
export function createHostRequests(vscode: VsCodeApi) {
  const pending = new Map<number, { type: keyof HostRequestData; resolve(value: unknown): void; reject(error: unknown): void }>()
  let sequence = 0
  let disposed = false
  const receive = (event: MessageEvent<unknown>) => {
    if (!isPreviewHostMessage(event)) return
    const value = event.data
    if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'hostResult' ||
      !('id' in value) || typeof value.id !== 'number') return
    const request = pending.get(value.id)
    if (!request) return
    if ('error' in value && typeof value.error === 'string') {
      request.reject(new Error(value.error))
      return
    }
    const result = 'value' in value ? value.value : undefined
    const valid = result && typeof result === 'object' && (request.type === 'renderDiagram'
      ? 'svg' in result && typeof result.svg === 'string' && result.svg.trim() !== ''
      : request.type === 'loadLocalEmbed'
        ? 'html' in result && typeof result.html === 'string' && 'path' in result && typeof result.path === 'string'
        : 'path' in result && typeof result.path === 'string' && 'mediaType' in result && typeof result.mediaType === 'string' &&
          'content' in result && typeof result.content === 'string' && 'byteLength' in result &&
          typeof result.byteLength === 'number' && Number.isSafeInteger(result.byteLength) && result.byteLength >= 0)
    if (valid) request.resolve(result)
    else request.reject(new Error('Invalid response from the preview host.'))
  }
  window.addEventListener('message', receive)

  return {
    request<K extends keyof HostRequestData>(type: K, data: HostRequestData[K], signal: AbortSignal): Promise<HostRequestResults[K]> {
      return new Promise((resolve, reject) => {
        if (disposed || signal.aborted) { reject(new DOMException('Preview request cancelled.', 'AbortError')); return }
        const id = ++sequence
        const finish = (error?: unknown, result?: unknown) => {
          pending.delete(id)
          clearTimeout(timer)
          signal.removeEventListener('abort', abort)
          if (error !== undefined) reject(error)
          else resolve(result as HostRequestResults[K])
        }
        const cancel = (error: unknown) => {
          finish(error)
          try { vscode.postMessage({ type: 'cancelRequest', id }) }
          catch { /* The host may already be gone during webview teardown. */ }
        }
        const abort = () => cancel(new DOMException('Preview request cancelled.', 'AbortError'))
        const timer = setTimeout(() => cancel(new Error('Preview host request timed out.')), REQUEST_TIMEOUT_MS)
        pending.set(id, { type, resolve: (result) => finish(undefined, result), reject: (error) => finish(error) })
        signal.addEventListener('abort', abort, { once: true })
        try { vscode.postMessage({ type, id, ...data }) }
        catch (error) { finish(error) }
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      window.removeEventListener('message', receive)
      for (const [id, request] of pending) {
        request.reject(new DOMException('Preview closed.', 'AbortError'))
        try { vscode.postMessage({ type: 'cancelRequest', id }) }
        catch { /* Continue releasing requests after the host has closed. */ }
      }
    }
  }
}
