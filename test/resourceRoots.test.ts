import assert from 'node:assert/strict'
import test from 'node:test'
import { publicDirectoryCandidates } from '../src/resourceRoots'
import './markdownSource.test'

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
