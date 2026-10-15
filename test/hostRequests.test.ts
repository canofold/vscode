import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { createHostRequests } from '../src/webview/hostRequests'

const view = new EventTarget()
const bridge = new MessageChannel()
const frames: Array<{ contentWindow: MessagePort }> = []
const origin = 'vscode-webview://test'
Object.assign(view, { location: { origin } })
Object.assign(globalThis, { window: view })
Object.assign(globalThis, { document: { querySelectorAll: () => frames } })
after(() => { bridge.port1.close(); bridge.port2.close() })
const hostMessage = (data: unknown) => view.dispatchEvent(new MessageEvent('message', { origin, source: bridge.port1, data }))

test('host requests correlate responses, cancel obsolete work and recover from errors', async () => {
  const sent: Array<{ type: string; id: number }> = []
  const host = createHostRequests({ postMessage: (message) => sent.push(message as typeof sent[number]) })
  const signal = new AbortController().signal
  try {
    const diagram = host.request('renderDiagram', { diagramType: 'd2', source: 'A -> B' }, signal)
    const embed = host.request('loadLocalEmbed', { href: 'demo.html' }, signal)
    hostMessage({ type: 'hostResult', id: sent[1].id, value: { html: 'Demo', path: '/root/file.html' } })
    hostMessage({ type: 'hostResult', id: sent[0].id, value: { svg: '<svg/>' } })
    assert.equal((await diagram).svg, '<svg/>')
    assert.equal((await embed).html, 'Demo')

    const controller = new AbortController()
    const cancelled = host.request('renderDiagram', { diagramType: 'd2', source: 'Old' }, controller.signal)
    const rejection = assert.rejects(cancelled, { name: 'AbortError' })
    controller.abort()
    await rejection
    assert.equal(sent.at(-1)?.type, 'cancelRequest')

    const failed = host.request('renderDiagram', { diagramType: 'graphviz', source: 'bad' }, signal)
    const error = assert.rejects(failed, /syntax error/)
    hostMessage({ type: 'hostResult', id: sent.at(-1)?.id, error: 'syntax error' })
    await error

    const pending = host.request('loadLocalEmbed', { href: 'demo.html' }, signal)
    const closed = assert.rejects(pending, { name: 'AbortError' })
    host.dispose()
    await closed
    await assert.rejects(host.request('loadLocalEmbed', { href: 'demo.html' }, signal), { name: 'AbortError' })
  } finally { host.dispose() }
})

test('host teardown rejects all requests even when the host cannot receive cancellation', async () => {
  let closed = false
  const host = createHostRequests({ postMessage: () => { if (closed) throw new Error('host closed') } })
  const signal = new AbortController().signal
  const first = host.request('loadLocalEmbed', { href: 'demo.html' }, signal)
  const second = host.request('renderDiagram', { diagramType: 'd2', source: 'A -> B' }, signal)
  const rejections = Promise.all([assert.rejects(first, { name: 'AbortError' }), assert.rejects(second, { name: 'AbortError' })])
  closed = true
  host.dispose()
  await rejections
})

test('iframe messages cannot spoof a pending host response', async () => {
  const sent: Array<{ id: number }> = []
  const host = createHostRequests({ postMessage: (message) => sent.push(message as { id: number }) })
  const child = new MessageChannel()
  frames.push({ contentWindow: child.port1 })
  try {
    const result = host.request('renderDiagram', { diagramType: 'd2', source: 'A -> B' }, new AbortController().signal)
    let resolved = false
    void result.then(() => { resolved = true })
    view.dispatchEvent(new MessageEvent('message', { origin, source: child.port1, data: {
      type: 'hostResult', id: sent[0].id, value: { svg: '<svg>spoofed</svg>' }
    } }))
    await Promise.resolve()
    assert.equal(resolved, false, 'The child is not the VS Code message bridge.')
    hostMessage({ type: 'hostResult', id: sent[0].id, value: { svg: '<svg>host</svg>' } })
    assert.equal((await result).svg, '<svg>host</svg>')
  } finally { host.dispose(); frames.pop(); child.port1.close(); child.port2.close() }
})
