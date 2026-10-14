const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createEditorHarness } = require('./editorHarness.cjs')

function source(marker, invalid = false) {
  return `# Diagram lifecycle — ${marker}

## Mermaid
\`\`\`mermaid
${invalid ? 'flowchart LR\n A --> [' : `flowchart LR\n ${marker} --> Preview`}
\`\`\`

## PlantUML sequence
\`\`\`plantuml
@startuml
${invalid ? 'this is not a valid diagram !?!' : `${marker} -> Preview: sequence`}
@enduml
\`\`\`

## PlantUML class
\`\`\`plantuml
@startuml
${invalid ? 'class {' : `class ${marker}\nclass Preview\n${marker} --> Preview`}
@enduml
\`\`\`

## Graphviz
\`\`\`dot
${invalid ? 'not a graph' : `digraph G { ${marker} -> Preview }`}
\`\`\`

## D2
\`\`\`d2
${invalid ? 'a: {' : `${marker} -> Preview`}
\`\`\`

## Local embed
::embed[Local embed]{src="./embed.html"}
`
}

async function run() {
  const harness = await createEditorHarness('diagrams', source('INITIAL'))
  await fs.writeFile(path.join(harness.fixture, 'embed.html'), '<!doctype html><style>body{color:navy}</style><p>Local embed loaded</p><script>throw new Error("EMBED_SCRIPT_MUST_NOT_RUN")</script>')
  const { open, edit, wait, document } = harness
  const complete = (marker) => (snapshot) => snapshot.title?.endsWith(marker) && snapshot.figures.length === 5 &&
    snapshot.figures.every((figure) => figure.loaded && !figure.error && !figure.rendering && figure.text.includes(marker)) &&
    snapshot.embeds.length === 1 && !snapshot.embeds[0].busy
  try {
    await open()
    const initial = await wait('first load', complete('INITIAL'))
    console.log('[editor-test] First load:', JSON.stringify(initial.figures))
    for (const figure of initial.figures.filter((figure) => figure.naturalWidth)) {
      assert.ok(figure.width <= figure.naturalWidth + 1, `${figure.kind} is enlarged at the default zoom (${figure.width} > ${figure.naturalWidth})`)
    }
    assert.match(initial.embeds[0].html, /Local embed loaded/)
    assert.doesNotMatch(initial.embeds[0].html, /<script/i)
    assert.deepEqual(initial.violations, [])
    console.log('[editor-test] PASS first load')
    for (let index = 1; index <= 12; index++) await edit(source(`EDIT_${index}`))
    const edited = await wait('continuous unsaved edits', complete('EDIT_12'))
    assert.equal(document.isDirty, true)
    assert.equal(edited.liveSvgUrls, 4)
    console.log('[editor-test] PASS 12 continuous unsaved edits')
    await edit(source('SAVED'))
    assert.equal(await document.save(), true)
    await wait('save during rendering', complete('SAVED'))
    console.log('[editor-test] PASS save during rendering')
    await edit(source('INVALID', true))
    await wait('syntax errors', (snapshot) => snapshot.title?.endsWith('INVALID') && snapshot.figures.length === 5 && snapshot.figures.every((figure) => figure.error && !figure.rendering))
    await edit(source('RECOVERED'))
    const recovered = await wait('failure recovery', complete('RECOVERED'))
    assert.deepEqual(recovered.violations, [])
    assert.equal(recovered.liveSvgUrls, 4)
    console.log('[editor-test] PASS syntax failure and recovery for every renderer')
    harness.close()
    await open()
    const reopened = await wait('close and reopen', complete('RECOVERED'))
    assert.equal(reopened.liveSvgUrls, 4)
    assert.deepEqual(reopened.violations, [])
    console.log('[editor-test] PASS close and reopen')
    await edit(source('CLOSING'))
    await wait('active render before closing', (snapshot) => snapshot.title?.endsWith('CLOSING') &&
      snapshot.figures.some((figure) => figure.rendering))
    harness.close()
    await edit(source('REOPENED'))
    await open()
    await wait('close during rendering', complete('REOPENED'))
    console.log('[editor-test] PASS close during rendering and reopen')
  } finally {
    await harness.dispose()
  }
}
module.exports = { run }
