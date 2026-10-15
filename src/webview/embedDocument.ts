import { parse, walk, generate, type Url, type StringNode, type CssNode } from 'css-tree'
import parseSrcset from 'parse-srcset'
import { MAX_EMBED_ASSETS, MAX_EMBED_STYLE_DEPTH, MAX_EMBED_TOTAL_BYTES,
  type LocalEmbedAsset, type LocalEmbedDocument } from '../previewProtocol'

export type LocalEmbedAssetLoader = (documentPath: string, href: string, signal: AbortSignal) => Promise<LocalEmbedAsset>

const isLocal = (href: string) => !!href.trim() && !href.trim().startsWith('#') &&
  !href.trim().startsWith('//') && !/^[a-z][\w+.-]*:/i.test(href.trim())

function cssDataUrl(css: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(new Blob([css], { type: 'text/css' }))
  })
}

/** Package local assets into a static document; the opaque iframe never fetches workspace URLs. */
export async function prepareEmbeddedDocument(input: LocalEmbedDocument, loader: LocalEmbedAssetLoader, signal: AbortSignal): Promise<string> {
  const assets = new Map<string, Promise<LocalEmbedAsset>>()
  const styles = new Map<string, string>()
  const errors = new Set<string>()
  let byteLength = 0
  let outputLength = input.html.length
  const inline = (value: string) => {
    outputLength += value.length
    if (outputLength > MAX_EMBED_TOTAL_BYTES) throw new RangeError('Embedded output exceeds 16 MiB.')
    return value
  }
  const read = (owner: string, href: string) => {
    signal.throwIfAborted()
    const key = JSON.stringify([owner, href])
    let pending = assets.get(key)
    if (!pending) {
      if (assets.size >= MAX_EMBED_ASSETS) throw new RangeError('Embedded document exceeds 64 local resources.')
      pending = loader(owner, href, signal).then((asset) => {
        byteLength += asset.byteLength
        if (byteLength > MAX_EMBED_TOTAL_BYTES) throw new RangeError('Embedded resources exceed 16 MiB in total.')
        return asset
      })
      assets.set(key, pending)
    }
    return pending
  }
  const resolve = async (href: string, owner: string, ancestors: ReadonlySet<string> = new Set()): Promise<string> => {
    if (!isLocal(href)) return href
    try {
      const asset = await read(owner, href)
      signal.throwIfAborted()
      if (asset.mediaType !== 'text/css') {
        const fragment = href.indexOf('#')
        return inline(asset.content + (fragment < 0 ? '' : href.slice(fragment)))
      }
      if (ancestors.has(asset.path)) throw new Error('Circular CSS import.')
      if (ancestors.size >= MAX_EMBED_STYLE_DEPTH) throw new Error('CSS imports exceed 8 levels.')
      let result = styles.get(asset.path)
      if (!result) {
        result = await cssDataUrl(await rewriteCss(asset.content, asset.path, new Set([...ancestors, asset.path])))
        styles.set(asset.path, result)
      }
      return inline(result)
    } catch (error) {
      signal.throwIfAborted()
      if (error instanceof RangeError) throw error
      errors.add(`${href}: ${String(error)}`)
      return ''
    }
  }
  const rewriteCss = async (css: string, owner: string, ancestors: ReadonlySet<string> = new Set(), context = 'stylesheet') => {
    const ast = parse(css, { context, parseCustomProperty: true })
    const references: Array<{ node: Url | StringNode; remove?: () => void }> = []
    const removers = new Map<CssNode, () => void>()
    walk(ast, function(node, item, list) {
      if (node.type === 'Declaration' || (node.type === 'Atrule' && node.name.toLowerCase() === 'import')) {
        let removed = false
        removers.set(node, () => { if (!removed) { removed = true; list.remove(item) } })
      }
      if (node.type === 'Url' || (node.type === 'String' &&
        ((this.atrule?.name.toLowerCase() === 'import' && this.atrule.prelude?.type === 'AtrulePrelude' && this.atrule.prelude.children.first === node) ||
          /^(?:-webkit-)?image-set$/i.test(this.function?.name ?? '')))) {
        const owner = this.declaration ?? this.atrule
        references.push({ node, remove: owner ? removers.get(owner) : undefined })
      }
    })
    for (const { node, remove } of references) {
      node.value = await resolve(node.value, owner, ancestors)
      if (!node.value) remove?.()
    }
    return generate(ast)
  }

  const document = new DOMParser().parseFromString(input.html, 'text/html')
  document.querySelectorAll('script, base, meta[http-equiv="refresh" i], link[rel~="preload"], link[rel~="modulepreload"], link[rel~="prefetch"]').forEach((element) => element.remove())
  for (const element of document.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name)
      if (/^(?:href|src|xlink:href|action|formaction)$/i.test(attribute.name) &&
        /^(?:javascript|vbscript|file|command):/i.test(attribute.value.replace(/[\t\n\r]/g, '').trim())) element.removeAttribute(attribute.name)
    }
  }
  for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]')) {
    if (!isLocal(link.getAttribute('href')!)) continue
    const result = await resolve(link.getAttribute('href')!, input.path)
    if (result) link.href = result
    else link.remove()
  }
  for (const style of document.querySelectorAll('style')) style.textContent = await rewriteCss(style.textContent ?? '', input.path)
  for (const element of document.querySelectorAll<HTMLElement>('[style]')) {
    element.setAttribute('style', await rewriteCss(element.getAttribute('style')!, input.path, new Set(), 'declarationList'))
  }
  for (const element of document.querySelectorAll('img[src], source[src], video[src], audio[src], input[type="image"][src], [poster]')) {
    for (const name of ['src', 'poster']) {
      const href = element.getAttribute(name)
      if (!href) continue
      const result = await resolve(href, input.path)
      if (result) element.setAttribute(name, result)
      else element.removeAttribute(name)
    }
  }
  for (const element of document.querySelectorAll('[srcset]')) {
    const candidates = parseSrcset(element.getAttribute('srcset')!)
    const resolved: string[] = []
    for (const candidate of candidates) {
      const value = await resolve(candidate.url, input.path)
      if (value) resolved.push([value, candidate.w ? `${candidate.w}w` : '', candidate.h ? `${candidate.h}h` : '',
        candidate.d ? `${candidate.d}x` : ''].filter(Boolean).join(' '))
    }
    if (resolved.length) element.setAttribute('srcset', resolved.join(', '))
    else element.removeAttribute('srcset')
  }
  // A srcdoc document inherits its parent's base URL; fragment links must stay in this document.
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) anchor.setAttribute('href', `about:srcdoc${anchor.getAttribute('href')}`)
  if (errors.size) {
    const notice = document.createElement('aside')
    notice.setAttribute('role', 'alert')
    notice.textContent = `Embedded resources could not be loaded: ${[...errors].join('; ')}`
    document.body.prepend(notice)
  }
  signal.throwIfAborted()
  const result = `<!doctype html>${document.documentElement.outerHTML}`
  if (new TextEncoder().encode(result).byteLength > MAX_EMBED_TOTAL_BYTES) throw new RangeError('Embedded output exceeds 16 MiB.')
  return result
}
