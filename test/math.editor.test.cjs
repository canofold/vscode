const assert = require('node:assert/strict')
const { createEditorHarness } = require('./editorHarness.cjs')

const formulas = (marker) => `# Math ${marker}

Inline $E = mc^2$.

$$
\\frac{${marker.length}}{3} + \\sqrt{2}
$$

\`\`\`math
\\int_0^1 x^2 dx = \\frac{1}{3}
\`\`\`
`

exports.run = async () => {
  const harness = await createEditorHarness('math', formulas('INITIAL'))
  const complete = (marker) => (s) => s.title === `Math ${marker}` && s.math.length === 3 &&
    s.math.every((m) => m.width > 0 && m.height > 0) && s.mathErrors.length === 0
  try {
    await harness.open()
    const initial = await harness.wait('math first load and fonts', (s) => complete('INITIAL')(s) && s.fonts.some((font) => font.status === 'loaded'))
    assert.deepEqual(initial.violations, [])
    for (let index = 1; index <= 10; index++) await harness.edit(formulas(`EDIT_${index}`))
    await harness.wait('math continuous edits', complete('EDIT_10'))
    await harness.document.save()
    await harness.wait('math save', complete('EDIT_10'))
    await harness.edit('# Math INVALID\n\n$\\frac{$')
    await harness.wait('math syntax error', (s) => s.title === 'Math INVALID' && s.mathErrors.length === 1)
    await harness.edit(formulas('RECOVERED'))
    await harness.wait('math recovery', complete('RECOVERED'))
    harness.close(); await harness.open()
    await harness.wait('math reopen', complete('RECOVERED'))
    await harness.edit('# Math MACRO\n\n$\\gdef\\custom{42}\\custom$')
    await harness.wait('math document-local macro', (s) => s.title === 'Math MACRO' && s.math.length === 1)
    await harness.edit('# Math ISOLATED\n\n$\\custom$')
    await harness.wait('macro isolation after editing', (s) => s.title === 'Math ISOLATED' && s.math[0]?.plain.includes('\\custom'))
    await harness.edit('# Math SAFE\n\n$\\href{javascript:alert(1)}{unsafe}$\n\n$\\htmlClass{injected}{text}$')
    const safe = await harness.wait('untrusted math commands', (s) => s.title === 'Math SAFE' && s.math.length === 2)
    assert.deepEqual(safe.mathLinks, [])
    assert.deepEqual(safe.violations, [])
    await harness.edit('# Math LITERAL\n\nEscaped \\$5 and `\\sqrt{x}`.\n\n```text\n$notMath$\n```')
    await harness.wait('literal currency and code', (s) => s.title === 'Math LITERAL' && s.math.length === 0 && s.mathErrors.length === 0)
    console.log('[editor-test] PASS math inline/display/fence, fonts, edits/save/recovery/reopen, macro isolation and untrusted commands')
  } finally { await harness.dispose() }
}
