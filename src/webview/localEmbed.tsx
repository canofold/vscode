import { type ComponentProps, useEffect, useState } from 'react'
import type { LocalEmbedDocument } from '../previewProtocol'
import { prepareEmbeddedDocument, type LocalEmbedAssetLoader } from './embedDocument'

type LocalEmbedLoader = (href: string, signal: AbortSignal) => Promise<LocalEmbedDocument>

export function LocalEmbedFrame({ authoredSrc, loader, assetLoader, src, ...props }: ComponentProps<'iframe'> & {
  authoredSrc?: string
  loader: LocalEmbedLoader
  assetLoader: LocalEmbedAssetLoader
}) {
  const [document, setDocument] = useState<string>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!authoredSrc) return
    const controller = new AbortController()
    setDocument(undefined)
    setError(undefined)
    void loader(authoredSrc, controller.signal).then((result) => prepareEmbeddedDocument(result, assetLoader, controller.signal)).then((result) => {
      if (!controller.signal.aborted) setDocument(result)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(String(reason))
    })
    return () => controller.abort()
  }, [authoredSrc, loader, assetLoader])

  if (!authoredSrc) {
    if (src?.startsWith('http:')) return <iframe {...props} sandbox="" srcDoc="<!doctype html><p>Remote embedded documents must use HTTPS.</p>" />
    return <iframe {...props} src={src} />
  }
  const message = error?.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  const srcDoc = message
    ? `<!doctype html><p>Embedded document could not be loaded: ${message}</p>`
    : document ?? '<!doctype html><title>Loading embedded document</title><p role="status">Loading embedded document…</p>'
  return <iframe {...props} sandbox="" srcDoc={srcDoc} aria-busy={!document && !error ? true : undefined} />
}
