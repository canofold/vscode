const assert = require('node:assert/strict')
const test = require('node:test')
const vm = require('node:vm')
const { build } = require('esbuild')

async function rendererHarness() {
  const renders = []
  let failScript = false
  const result = await build({
    entryPoints: ['src/webview/diagramRenderers.ts'], bundle: true, platform: 'node', format: 'cjs', write: false,
    define: { 'import.meta.url': '"https://test/main.js"' },
    plugins: [{ name: 'plantuml-boundary', setup(api) {
      api.onResolve({ filter: /^@plantuml\/core/ }, (args) => ({ path: args.path, namespace: 'engine' }))
      api.onLoad({ filter: /.*/, namespace: 'engine' }, (args) => ({ loader: 'js', contents: args.path === '@plantuml/core'
        ? 'export function renderToString(lines,resolve,reject){renders.push({lines,resolve,reject})}'
        : 'export {}' }))
    } }]
  })
  const module = { exports: {} }
  vm.runInNewContext(result.outputFiles[0].text, {
    module, exports: module.exports, URL, DOMException, renders,
    DOMParser: class { parseFromString(source) {
      const texts = [...source.matchAll(/<text>(.*?)<\/text>/g)].map((match) => ({ textContent: match[1] }))
      return { querySelector: () => null, querySelectorAll: () => texts,
        documentElement: { localName: 'svg', textContent: texts.map((text) => text.textContent).join(' ') } }
    } },
    document: {
      createElement() {
        const events = new Map()
        return { addEventListener: (name, action) => events.set(name, action), remove() {}, events }
      },
      head: { append(script) { queueMicrotask(() => script.events.get(failScript ? 'error' : 'load')()) } }
    }
  })
  return { render: module.exports.renderPlantUmlDiagram, renders, setFailScript: (value) => { failScript = value } }
}

test('PlantUML cancellation preserves serialization until the engine completes', async () => {
  const { render, renders } = await rendererHarness()
  const controller = new AbortController()
  const first = render({ source: 'A -> B', signal: controller.signal })
  const rejected = assert.rejects(first, { name: 'AbortError' })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(renders.length, 1)
  controller.abort()
  await rejected
  const second = render({ source: 'C -> D', signal: new AbortController().signal })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(renders.length, 1, 'the second call must wait for the running engine')
  renders[0].resolve('<svg/>')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(renders.length, 2)
  renders[1].resolve('<svg/>')
  assert.equal((await second).svg, '<svg/>')
  const cancelled = new AbortController(); cancelled.abort()
  await assert.rejects(render({ source: 'Old', signal: cancelled.signal }), { name: 'AbortError' })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(renders.length, 2)
})

test('PlantUML retries failed initialization and recovers after a render failure', async () => {
  const harness = await rendererHarness()
  const signal = new AbortController().signal
  harness.setFailScript(true)
  await assert.rejects(harness.render({ source: 'A -> B', signal }), /Failed to load/)
  harness.setFailScript(false)
  const failure = harness.render({ source: 'bad', signal })
  const rejected = assert.rejects(failure, /syntax error/)
  await new Promise((resolve) => setImmediate(resolve))
  harness.renders[0].reject('syntax error')
  await rejected
  const recovery = harness.render({ source: 'Recovered -> OK', signal })
  await new Promise((resolve) => setImmediate(resolve))
  harness.renders[1].resolve('<svg/>')
  assert.equal((await recovery).svg, '<svg/>')
})

test('PlantUML rejects engine-generated error diagrams but accepts error words in ordinary labels', async () => {
  const harness = await rendererHarness()
  const signal = new AbortController().signal
  const failure = harness.render({ source: 'class {', signal })
  const rejected = assert.rejects(failure, /Syntax Error/)
  await new Promise((resolve) => setImmediate(resolve))
  harness.renders[0].resolve('<svg><text>PlantUML version $version$ / $git.commit.id$</text><text>[From textarea (line 2) ]</text><text>Syntax Error? (Assumed diagram type: sequence)</text></svg>')
  await rejected
  const recovered = harness.render({ source: 'A -> B: Syntax Error?', signal })
  await new Promise((resolve) => setImmediate(resolve))
  harness.renders[1].resolve('<svg><text>A</text><text>Syntax Error?</text></svg>')
  assert.match((await recovered).svg, /Syntax Error/)
})
