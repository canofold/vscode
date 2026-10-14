import type { DiagramRenderer } from '@canofold/plugins/client/kroki'

const plantUmlVizUrl = new URL('./plantuml/viz-global.js', import.meta.url).href

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

function loadClassicScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.addEventListener('load', () => {
      script.remove()
      resolve()
    }, { once: true })
    script.addEventListener('error', () => {
      script.remove()
      reject(new Error(`Failed to load ${url}`))
    }, { once: true })
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

function renderPlantUml(source: string): Promise<string> {
  if (!plantUmlRuntime) {
    const pending = loadPlantUml()
    plantUmlRuntime = pending
    void pending.catch(() => { if (plantUmlRuntime === pending) plantUmlRuntime = undefined })
  }
  return plantUmlRuntime.then(({ renderToString }) => new Promise<string>((resolve, reject) => {
    const normalized = /@start\w+/i.test(source) ? source : `@startuml\n${source}\n@enduml`
    renderToString(normalized.split(/\r\n|\r|\n/), (svg) => {
      const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
      const texts = [...parsed.querySelectorAll('text')].map((text) => text.textContent ?? '')
      const firstText = texts[0] ?? ''
      const errorHeader = /^\[From (?:string|file|textarea) \(line \d+\) \]$/
      if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') {
        reject(new Error('PlantUML returned invalid SVG.'))
      } else if (/^An error has occurred/.test(firstText) || errorHeader.test(firstText) ||
        (/^PlantUML version /.test(firstText) && texts.some((text) => errorHeader.test(text)))) {
        reject(new Error(parsed.documentElement.textContent?.trim() || 'PlantUML rendering failed.'))
      } else resolve(svg)
    }, (message) => reject(new Error(message)))
  }))
}

export const renderPlantUmlDiagram: DiagramRenderer = ({ source, signal }) => {
  const queued = plantUmlQueue.then(() => {
    signal.throwIfAborted()
    return renderPlantUml(source)
  })
  plantUmlQueue = queued.then(() => undefined, () => undefined)
  return abortable(queued, signal).then((svg) => ({ svg }))
}
