const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { createEditorHarness } = require('./editorHarness.cjs')

const source = (title) => `# ${title}

Run format:check and npm:test.

:::galery[Unknown block]
Keep this source.
:::

::embed[Unsafe]{src="javascript:alert(1)"}

## Normal content after invalid syntax

Still **readable**.
`

exports.run = async () => {
  const harness = await createEditorHarness('directives', source('Recovery'))
  const complete = (title) => (snapshot) => snapshot.title === title && snapshot.loading === 0 &&
    snapshot.headings.includes('Normal content after invalid syntax') && snapshot.alerts.length === 0 &&
    snapshot.text.includes('format:check') && snapshot.text.includes(':::galery[Unknown block]')
  try {
    await harness.open()
    const initial = await harness.wait('directive first-load recovery', complete('Recovery'))
    assert.deepEqual(initial.embeds, [])
    assert.deepEqual(initial.violations, [])
    for (let index = 0; index < 10; index++) await harness.edit(source(`Edit ${index}`))
    await harness.wait('directive continuous editing', complete('Edit 9'))
    await harness.edit('# Corrected\n\n:::tip[Valid]\nReadable content.\n:::\n\nformat:check')
    await harness.wait('directive corrected source', (snapshot) => snapshot.title === 'Corrected' &&
      snapshot.text.includes('Readable content.') && snapshot.text.includes('format:check') &&
      snapshot.alerts.length === 0 && snapshot.loading === 0)
    if (process.env.CANOFOLD_MARKDOWN_FIXTURE) {
      await harness.edit(await fs.readFile(process.env.CANOFOLD_MARKDOWN_FIXTURE, 'utf8'))
      await harness.wait('authored ISSUE document', (snapshot) => snapshot.loading === 0 &&
        snapshot.alerts.length === 0 && snapshot.headings.length > 1 && snapshot.text.includes('format:check'))
    }
    await harness.document.save()
    harness.close()
    await harness.open()
    const reopened = await harness.wait('directive reopen', (snapshot) => snapshot.loading === 0 &&
      snapshot.alerts.length === 0 && snapshot.text.includes('format:check'))
    assert.deepEqual(reopened.violations, [])
    console.log('[editor-test] PASS ordinary colon text, localized directive recovery, safe media, continuous edits, correction and reopen')
  } finally { await harness.dispose() }
}
