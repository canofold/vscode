const assert = require('node:assert/strict')
const test = require('node:test')
const { LocalDiagramRenderer } = require(process.env.CANOFOLD_TEST_RENDERER)
const renderer = new LocalDiagramRenderer()
const renderLocalDiagram = (type, source, signal = new AbortController().signal) => renderer.render(type, source, signal)

test.after(() => renderer.dispose())

test('Graphviz diagrams render locally in the packaged extension runtime', async () => {
  const svg = await renderLocalDiagram('graphviz', 'digraph G { A -> B }')
  assert.match(svg, /^<\?xml[\s\S]*<svg/)
})

test('D2 diagrams render locally and serialize concurrent requests', async () => {
  const diagrams = await Promise.all([
    renderLocalDiagram('d2', 'A -> B'),
    renderLocalDiagram('d2', 'C -> D')
  ])
  diagrams.forEach((svg) => assert.match(svg, /^<svg/))
})

test('an already cancelled diagram does not render', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(renderLocalDiagram('d2', 'A -> B', controller.signal), { name: 'AbortError' })
})

test('cancelling an active render releases queued work and allows a fresh render', async () => {
  const isolated = new LocalDiagramRenderer()
  try {
    const controller = new AbortController()
    const active = isolated.render('d2', 'Old -> Result', controller.signal)
    const stale = isolated.render('d2', 'Stale -> Result', controller.signal)
    const rejected = Promise.all([
      assert.rejects(active, { name: 'AbortError' }),
      assert.rejects(stale, { name: 'AbortError' })
    ])
    await new Promise((resolve) => setImmediate(resolve))
    controller.abort()
    await rejected
    const svg = await isolated.render('d2', 'Fresh -> Result', new AbortController().signal)
    assert.match(svg, /Fresh/)
    assert.doesNotMatch(svg, /Stale|Old/)
  } finally { await isolated.dispose() }
})

test('a malformed diagram does not poison the next request', async () => {
  await assert.rejects(renderLocalDiagram('graphviz', 'not a graph'))
  assert.match(await renderLocalDiagram('graphviz', 'digraph G { Recovered -> OK }'), /Recovered/)
  await assert.rejects(renderLocalDiagram('d2', 'a: {'))
  assert.match(await renderLocalDiagram('d2', 'Recovered -> OK'), /Recovered/)
})

test('closing a preview cancels active and queued work and a new preview works', async () => {
  const closing = new LocalDiagramRenderer()
  const active = closing.render('d2', 'A -> B', new AbortController().signal)
  const queued = closing.render('d2', 'C -> D', new AbortController().signal)
  const rejected = Promise.all([assert.rejects(active, { name: 'AbortError' }), assert.rejects(queued, { name: 'AbortError' })])
  await new Promise((resolve) => setImmediate(resolve))
  const shutdown = closing.dispose()
  assert.equal(closing.dispose(), shutdown)
  await shutdown
  await rejected
  await assert.rejects(closing.render('graphviz', 'digraph G { A -> B }', new AbortController().signal))
  const reopened = new LocalDiagramRenderer()
  try { assert.match(await reopened.render('graphviz', 'digraph G { Reopened -> OK }', new AbortController().signal), /Reopened/) }
  finally { await reopened.dispose() }
})
