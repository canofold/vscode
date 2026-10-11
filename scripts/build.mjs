import { build, context } from 'esbuild'

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
    entryPoints: ['src/webview/main.tsx'],
    bundle: true,
    splitting: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    outdir: 'dist/webview',
    entryNames: 'main',
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

if (process.argv.includes('--watch')) {
  const contexts = await Promise.all(configs.map((config) => context(config)))
  await Promise.all(contexts.map((item) => item.watch()))
} else {
  await Promise.all(configs.map((config) => build(config)))
}
