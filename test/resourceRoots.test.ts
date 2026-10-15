import assert from 'node:assert/strict'
import test from 'node:test'
import { publicDirectoryCandidates, resolveLocalResourcePath } from '../src/resourceRoots'
import './markdownSource.test'
import './plugins.test'

test('site-absolute media starts at the nearest Canofold public directory', () => {
  assert.deepEqual(
    publicDirectoryCandidates('/workspace/docs/guide/page.md', '/workspace'),
    [
      '/workspace/docs/guide/public',
      '/workspace/docs/public',
      '/workspace/public'
    ]
  )
})

test('a document outside the declared root does not expose unrelated directories', () => {
  assert.deepEqual(
    publicDirectoryCandidates('/outside/page.md', '/workspace'),
    []
  )
})

test('site-absolute embeds resolve from the nearest Canofold public directory', () => {
  assert.equal(
    resolveLocalResourcePath(
      '/workspace/docs/markdown.md',
      '/workspace',
      '/workspace/docs/public',
      '/examples/embed-preview.html'
    ),
    '/workspace/docs/public/examples/embed-preview.html'
  )
})

test('local embed paths cannot escape the workspace', () => {
  assert.equal(
    resolveLocalResourcePath('/workspace/docs/markdown.md', '/workspace', '/workspace/docs/public', '../../secret.html'),
    undefined
  )
  assert.equal(resolveLocalResourcePath('/outside/page.html', '/workspace', '/workspace/public', '/image.png'), undefined)
})
