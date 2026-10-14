import assert from 'node:assert/strict'
import test from 'node:test'
import { createMarkdownRenderer } from '@canofold/markdown/server'
import { kroki, math, mermaid, plantUml } from '@canofold/plugins'
import { renderToStaticMarkup } from 'react-dom/server'

test('Canofold prepares every supported diagram for local enhancement', async () => {
  const renderer = createMarkdownRenderer()
  const source = [
    '```mermaid',
    'flowchart LR',
    '  A --> B',
    '```',
    '',
    '```plantuml',
    '@startuml',
    'A -> B',
    '@enduml',
    '```',
    '',
    '```dot',
    'digraph G { A -> B }',
    '```',
    '',
    '```d2',
    'A -> B',
    '```',
    '',
    '$$',
    'E = mc^2',
    '$$'
  ].join('\n')

  const { content } = await renderer.render(source, {
    markdown: {
      html: 'sanitize',
      plugins: [
        math(),
        mermaid(),
        kroki({ renderer: 'client' }),
        plantUml({ renderer: 'client' })
      ]
    }
  })
  const html = renderToStaticMarkup(content)

  assert.match(html, /data-cf-plugin-diagram="mermaid"/)
  assert.match(html, /data-cf-plugin-diagram="plantuml"/)
  assert.match(html, /data-cf-plugin-diagram="kroki"/)
  assert.match(html, /data-cf-diagram-type="graphviz"/)
  assert.match(html, /data-cf-diagram-type="d2"/)
  assert.match(html, /class="katex-display"/)
  assert.doesNotMatch(html, /kroki\.io|plantuml\.com|plantuml\.server/)
})
