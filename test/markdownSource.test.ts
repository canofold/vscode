import assert from 'node:assert/strict'
import test from 'node:test'
import { markdownContent } from '../src/markdownSource'

test('preview content excludes YAML frontmatter', () => {
  const source = [
    '---',
    'title: Markdown Playground',
    'description: Preview the complete Markdown fixture',
    'order: 0',
    '---',
    '',
    '# Markdown Playground'
  ].join('\n')

  assert.equal(markdownContent(source), '\n# Markdown Playground')
})

test('preview content preserves ordinary Markdown and incomplete delimiters', () => {
  assert.equal(markdownContent('# Guide\n\n---\n\nBody'), '# Guide\n\n---\n\nBody')
  assert.equal(markdownContent('---\ntitle: unfinished'), '---\ntitle: unfinished')
})

test('preview content accepts a BOM, CRLF, and the YAML document end marker', () => {
  assert.equal(markdownContent('\uFEFF---\r\ntitle: Guide\r\n...\r\n# Body\r\n'), '# Body\r\n')
})
