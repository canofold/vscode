import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Markdown, type MarkdownUrlProperty } from '@canofold/markdown'
import { kroki, math, mermaid, plantUml } from '@canofold/plugins'
import { enhance as enhanceKroki } from '@canofold/plugins/client/kroki'
import { enhance as enhanceMermaid } from '@canofold/plugins/client/mermaid'
import { enhance as enhancePlantUml } from '@canofold/plugins/client/plantuml'
import '@canofold/markdown/base.css'
import '@canofold/themes/canofold.css'
import '@canofold/plugins/diagram.css'
import '@canofold/plugins/math.css'
import canofoldIcon from '../../media/canofold.png'
import { markdownContent } from '../markdownSource'
import { renderKrokiDiagram, renderPlantUmlDiagram } from './diagramRenderers'
import './preview.css'

interface VsCodeApi {
  postMessage(message: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

interface DocumentMessage {
  type: 'document'
  source: string
  documentBase: string
  rootBase: string
}

const vscode = acquireVsCodeApi()
const root = createRoot(document.getElementById('app')!)
const mermaidModuleUrl = new URL('./mermaid.js', import.meta.url).href
const plugins = [
  math(),
  mermaid({ moduleUrl: mermaidModuleUrl }),
  kroki({ renderer: 'client' }),
  plantUml({ renderer: 'client' })
]

function isDocumentMessage(value: unknown): value is DocumentMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<DocumentMessage>
  return message.type === 'document' && typeof message.source === 'string' &&
    typeof message.documentBase === 'string' && typeof message.rootBase === 'string'
}

function Preview({ message }: { message: DocumentMessage }) {
  const [error, setError] = useState<string>()
  const [readySource, setReadySource] = useState<string>()
  const preview = useRef<HTMLElement>(null)
  const links = useMemo(() => new Map<string, string>(), [message])
  const source = useMemo(() => markdownContent(message.source), [message.source])

  useEffect(() => {
    if (readySource !== source || !preview.current) return
    const root = preview.current
    const enhancements = [
      enhanceMermaid(root),
      enhanceKroki(root, { renderer: renderKrokiDiagram }),
      enhancePlantUml(root, { renderer: renderPlantUmlDiagram })
    ]
    return () => enhancements.forEach((enhancement) => enhancement.dispose())
  }, [readySource, source])

  const transformUrl = (value: string, property: MarkdownUrlProperty): string => {
    if (value.startsWith('#')) return value
    if (value.startsWith('//')) {
      const resolved = `https:${value}`
      if (property === 'href') links.set(resolved, resolved)
      return resolved
    }
    if (/^[a-z][\w+.-]*:/i.test(value)) {
      if (property === 'href') links.set(value, value)
      return value
    }
    try {
      const base = value.startsWith('/') ? message.rootBase : message.documentBase
      const relative = value.startsWith('/') ? value.slice(1) : value
      const resolved = new URL(relative, base).toString()
      if (property === 'href') links.set(resolved, value)
      return resolved
    } catch {
      return ''
    }
  }

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest<HTMLAnchorElement>('a[href]')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href || href.startsWith('#')) return
    event.preventDefault()
    const original = links.get(href)
    if (original) vscode.postMessage({ type: 'openLink', href: original })
  }

  return (
    <article ref={preview} className="preview" onClick={handleClick}>
      {error ? <p role="alert">Preview failed: {error}</p> : null}
      <Markdown
        source={source}
        options={{ html: 'sanitize', plugins }}
        urlTransform={transformUrl}
        fallback={
          <div className="preview-loading" role="status" aria-label="正在生成 Canofold 预览">
            <img className="preview-loading-icon" src={canofoldIcon} alt="" />
            <span className="preview-loading-track" aria-hidden="true">
              <span className="preview-loading-indicator" />
            </span>
          </div>
        }
        retainPrevious
        onError={(reason) => setError(String(reason))}
        onReady={() => {
          setError(undefined)
          setReadySource(source)
        }}
      />
    </article>
  )
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (isDocumentMessage(event.data)) root.render(<Preview key={event.data.documentBase} message={event.data} />)
})

vscode.postMessage({ type: 'ready' })
