import { build, context } from 'esbuild'
import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { configs } from './build.config.mjs'
import { writeLicenses } from './licenses.mjs'

async function copyRuntimeAssets() {
  await mkdir('dist/webview/plantuml', { recursive: true })
  await copyFile('node_modules/@plantuml/core/viz-global.js', 'dist/webview/plantuml/viz-global.js')
  await cp('node_modules/@terrastruct/d2/dist/node-esm', 'dist/vendor/d2', { recursive: true })
  await writeFile('dist/vendor/d2/package.json', '{"type":"module"}\n')
}

await rm('dist', { recursive: true, force: true })

if (process.argv.includes('--watch')) {
  const contexts = await Promise.all(configs.map((config) => context(config)))
  await Promise.all(contexts.map((item) => item.watch()))
} else {
  const results = await Promise.all(configs.map((config) => build({ ...config, metafile: true })))
  await writeLicenses(results)
}

await copyRuntimeAssets()
