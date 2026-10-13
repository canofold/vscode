import type { DiagramRenderer } from '@canofold/plugins/client/kroki'

const plantUmlVizUrl = new URL('./plantuml/viz-global.js', import.meta.url).href

let vizRuntime: ReturnType<typeof loadViz> | undefined
let d2Runtime: ReturnType<typeof loadD2> | undefined
let plantUmlRuntime: ReturnType<typeof loadPlantUml> | undefined
let plantUmlQueue: Promise<void> = Promise.resolve()

function aborted(): DOMException {
  return new DOMException('Diagram rendering was cancelled.', 'AbortError')
}

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(aborted())
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(aborted())
    signal.addEventListener('abort', cancel, { once: true })
    work.then(
      (value) => {
        signal.removeEventListener('abort', cancel)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', cancel)
        reject(error)
      }
    )
  })
}

async function loadViz() {
  const { instance } = await import('@viz-js/viz')
  return instance()
}

async function loadD2() {
  const { D2 } = await import('@terrastruct/d2')
  return new D2()
}

function loadClassicScript(url: string): Promise<void> {
  const current = Array.from(document.scripts)
    .find((script) => script.dataset.canofoldRuntime === url)
  if (current?.dataset.loaded === 'true') return Promise.resolve()
  if (current) {
    return new Promise((resolve, reject) => {
      current.addEventListener('load', () => resolve(), { once: true })
      current.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.dataset.canofoldRuntime = url
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), { once: true })
    document.head.append(script)
  })
}

async function loadPlantUml() {
  await loadClassicScript(plantUmlVizUrl)
  await Promise.all([
    import('@plantuml/core/themes.js'),
    import('@plantuml/core/emoji.js'),
    import('@plantuml/core/openiconic.js')
  ])
  return import('@plantuml/core')
}

export const renderKrokiDiagram: DiagramRenderer = async ({ diagramType, source, signal }) => {
  if (diagramType === 'graphviz') {
    vizRuntime ??= loadViz()
    const viz = await abortable(vizRuntime, signal)
    const svg = viz.renderString(source, { format: 'svg', engine: 'dot' })
    if (signal.aborted) throw aborted()
    return { svg }
  }

  if (diagramType === 'd2') {
    d2Runtime ??= loadD2()
    const d2 = await abortable(d2Runtime, signal)
    const compiled = await abortable(d2.compile(source), signal)
    const svg = await abortable(d2.render(compiled.diagram, {
      ...compiled.renderOptions,
      noXMLTag: true
    }), signal)
    return { svg }
  }

  throw new Error(`Unsupported local diagram type: ${diagramType}`)
}

function renderPlantUml(source: string): Promise<string> {
  plantUmlRuntime ??= loadPlantUml()
  return plantUmlRuntime.then(({ renderToString }) => new Promise<string>((resolve, reject) => {
    const normalized = /@start\w+/i.test(source) ? source : `@startuml\n${source}\n@enduml`
    renderToString(normalized.split(/\r\n|\r|\n/), resolve, (message) => reject(new Error(message)))
  }))
}

export const renderPlantUmlDiagram: DiagramRenderer = ({ source, signal }) => {
  const queued = plantUmlQueue.then(() => abortable(renderPlantUml(source), signal))
  plantUmlQueue = queued.then(() => undefined, () => undefined)
  return queued.then((svg) => ({ svg }))
}
