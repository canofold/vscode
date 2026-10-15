import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parentPort } from 'node:worker_threads'
import type { LocalDiagramType } from './previewProtocol'

const { instance } = require('@viz-js/viz') as typeof import('@viz-js/viz')
let viz: Awaited<ReturnType<typeof instance>> | undefined
let d2: InstanceType<typeof import('@terrastruct/d2').D2> | undefined

async function render(diagramType: LocalDiagramType, source: string): Promise<string> {
  if (diagramType === 'graphviz') {
    viz ??= await instance()
    return viz.renderString(source, { format: 'svg', engine: 'dot' })
  }
  if (diagramType !== 'd2') throw new Error(`Unsupported local diagram type: ${diagramType}`)
  if (!d2) {
    const moduleUrl = pathToFileURL(path.join(__dirname, 'vendor', 'd2', 'index.js')).href
    const { D2 } = await import(moduleUrl) as typeof import('@terrastruct/d2')
    d2 = new D2()
  }
  const compiled = await d2.compile(source)
  return d2.render(compiled.diagram, { ...compiled.renderOptions, noXMLTag: true })
}

parentPort!.on('message', (request: { diagramType: LocalDiagramType; source: string }) => {
  void render(request.diagramType, request.source).then(
    (svg) => parentPort!.postMessage({ svg }),
    (error: unknown) => parentPort!.postMessage({ error: String(error) })
  )
})
