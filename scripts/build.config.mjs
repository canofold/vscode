export const configs = [
  {
    entryPoints: {
      extension: 'src/extension.ts',
      diagramWorker: 'src/diagramWorker.ts'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['vscode'],
    outdir: 'dist',
    entryNames: '[name]',
    outExtension: { '.js': '.cjs' }
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
