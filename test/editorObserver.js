// Loaded only by the editor integration test, before the unmodified production bundle.
(() => {
  const api = acquireVsCodeApi()
  let acquired = false
  window.acquireVsCodeApi = () => {
    if (acquired) throw new Error('VS Code API was acquired more than once.')
    acquired = true
    return api
  }
  const sources = new Map()
  const labels = (root) => [...root.querySelectorAll('text, foreignObject')].map((node) => node.textContent).join(' ')
  const create = URL.createObjectURL.bind(URL)
  const revoke = URL.revokeObjectURL.bind(URL)
  URL.createObjectURL = (blob) => {
    const url = create(blob)
    if (blob.type === 'image/svg+xml') {
      sources.set(url, '')
      void blob.text().then((source) => {
        if (sources.has(url)) sources.set(url, labels(new DOMParser().parseFromString(source, 'image/svg+xml')))
      })
    }
    return url
  }
  URL.revokeObjectURL = (url) => { sources.delete(url); revoke(url) }
  const violations = []
  window.addEventListener('securitypolicyviolation', (event) => violations.push(`${event.violatedDirective}: ${event.blockedURI}`))
  const frameDocuments = new WeakMap()
  let attemptedChildMessage = false
  document.addEventListener('load', (event) => {
    if (event.target instanceof HTMLIFrameElement) {
      frameDocuments.set(event.target, event.target.srcdoc || event.target.src)
      if (event.target.title === 'Isolation test' && !attemptedChildMessage && event.target.srcdoc.includes('Local embed loaded')) {
        attemptedChildMessage = true
        // Fault injection at the real message boundary, with the actual child Window as sender.
        window.dispatchEvent(new MessageEvent('message', { source: event.target.contentWindow, origin: location.origin,
          data: { type: 'document', source: '# INJECTED_FROM_FRAME', documentBase: location.href, rootBase: location.href } }))
      }
    }
  }, true)
  const snapshot = () => {
    const figures = [...document.querySelectorAll('figure[data-cf-plugin-diagram]')].map((figure) => {
      const image = figure.querySelector('.cf-diagram-img')
      return {
        kind: figure.dataset.cfDiagramType ?? figure.dataset.cfPluginDiagram,
        source: figure.dataset.cfSource,
        error: figure.dataset.cfRenderError === 'true',
        rendering: figure.dataset.cfRendering === 'true',
        text: image ? sources.get(image.src) ?? '' : labels(figure.querySelector('.cf-diagram-preview') ?? figure),
        loaded: image ? image.complete && image.naturalWidth > 0 : !!figure.querySelector('.cf-diagram-preview svg'),
        mathLabels: figure.querySelectorAll('.cf-diagram-preview .katex').length,
        width: image?.getBoundingClientRect().width,
        naturalWidth: image?.naturalWidth
      }
    })
    api.postMessage({ type: 'editorTestSnapshot', title: document.querySelector('h1')?.textContent,
      figures, violations, liveSvgUrls: sources.size,
      elkLoaded: performance.getEntriesByType('resource').some((entry) => /\/elk[-.]/.test(entry.name)),
      text: document.querySelector('article')?.textContent,
      alerts: [...document.querySelectorAll('[role="alert"]')].map((element) => element.textContent),
      math: [...document.querySelectorAll('.katex')].map((element) => ({
        source: element.querySelector('annotation')?.textContent,
        plain: [...element.querySelectorAll('mtext')].map((node) => node.textContent).join(' '),
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height
      })),
      mathErrors: [...document.querySelectorAll('.katex-error')].map((element) => element.textContent),
      mathLinks: [...document.querySelectorAll('.katex a')].map((element) => element.getAttribute('href')),
      attemptedChildMessage,
      fonts: [...document.fonts].filter((font) => /KaTeX/.test(font.family)).map((font) => ({ family: font.family, status: font.status })),
      embeds: [...document.querySelectorAll('iframe')].map((frame) => ({
        title: frame.title, html: frame.srcdoc, src: frame.src,
        loaded: frameDocuments.get(frame) === (frame.srcdoc || frame.src),
        sandbox: frame.getAttribute('sandbox'), busy: frame.getAttribute('aria-busy')
      })) })
  }
  const timer = setInterval(snapshot, 100)
  const changes = new MutationObserver(snapshot)
  changes.observe(document, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['data-cf-rendering', 'data-cf-render-error', 'src', 'aria-busy'] })
  window.addEventListener('pagehide', () => { clearInterval(timer); changes.disconnect() }, { once: true })
})()
