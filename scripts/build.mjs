import { build, context } from 'esbuild'
import { copyFile, mkdir, rm } from 'node:fs/promises'

const configs = [
  {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['vscode'],
    outfile: 'dist/extension.cjs'
  },
  {
    entryPoints: {
      main: 'src/webview/main.tsx',
      mermaid: 'src/webview/mermaid.ts'
    },
    bundle: true,
    splitting: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    outdir: 'dist/webview',
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'assets/[name]-[hash]',
    loader: {
      '.svg': 'file',
      '.webp': 'file',
      '.png': 'dataurl',
      '.woff': 'file',
      '.woff2': 'file'
    }
  }
]

await rm('dist', { recursive: true, force: true })

if (process.argv.includes('--watch')) {
  const contexts = await Promise.all(configs.map((config) => context(config)))
  await Promise.all(contexts.map((item) => item.watch()))
} else {
  await Promise.all(configs.map((config) => build(config)))
  await mkdir('dist/webview/plantuml', { recursive: true })
  await copyFile('node_modules/@plantuml/core/viz-global.js', 'dist/webview/plantuml/viz-global.js')
}
