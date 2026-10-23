exports.run = async () => {
  await require('./extension.test.cjs').run()
  console.log('[editor-test] PASS actual editor commands and single-tab switching')
  for (const file of ['directives.editor', 'math.editor', 'embeds.editor', 'diagrams.editor']) await require(`./${file}.test.cjs`).run()
  await require('./checks.editor.test.cjs').run()
  await require('node:fs/promises').writeFile(process.env.CANOFOLD_EDITOR_COMPLETION_FILE, 'passed')
}
