import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Markdown, type MarkdownUrlProperty } from '@canofold/markdown'
import '@canofold/markdown/base.css'
import '@canofold/markdown/theme.css'
import canofoldIcon from '../../media/canofold.png'
import { markdownContent } from '../markdownSource'
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

function isDocumentMessage(value: unknown): value is DocumentMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<DocumentMessage>
  return message.type === 'document' && typeof message.source === 'string' &&
    typeof message.documentBase === 'string' && typeof message.rootBase === 'string'
}

function Preview({ message }: { message: DocumentMessage }) {
  const [error, setError] = useState<string>()
  const links = useMemo(() => new Map<string, string>(), [message])
  const source = useMemo(() => markdownContent(message.source), [message.source])

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
    <article className="preview" onClick={handleClick}>
      {error ? <p role="alert">Preview failed: {error}</p> : null}
      <Markdown
        source={source}
        options={{ html: 'sanitize' }}
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
        onReady={() => setError(undefined)}
      />
    </article>
  )
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (isDocumentMessage(event.data)) root.render(<Preview key={event.data.documentBase} message={event.data} />)
})

vscode.postMessage({ type: 'ready' })
