import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

// Collect licenses from the actual bundle graph, not the complete development dependency tree.
export async function writeLicenses(results) {
  const packages = new Map()
  for (const result of results) {
    for (const input of Object.keys(result.metafile.inputs)) {
      if (!input.includes('node_modules')) continue
      let directory = dirname(resolve(input))
      while (directory.includes('node_modules')) {
        let manifest
        try {
          manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'))
        } catch (error) {
          if (error.code !== 'ENOENT') throw error
        }
        if (manifest?.name) {
          packages.set(directory, manifest)
          break
        }
        directory = dirname(directory)
      }
    }
  }
  const notices = []
  for (const [directory, manifest] of [...packages].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
    const files = (await readdir(directory)).filter((file) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(file)).sort()
    let texts = await Promise.all(files.map((file) => readFile(resolve(directory, file), 'utf8')))
    if (!texts.length && manifest.name === 'fastdom') {
      const readme = await readFile(resolve(directory, 'README.md'), 'utf8')
      texts = [readme.slice(readme.indexOf('## License'))]
      if (!texts[0].includes('Permission is hereby granted')) throw new Error('Missing FastDom MIT notice')
    }
    // Viz.js omits its license from npm; the verified upstream copy is included below.
    if (!texts.length && manifest.name !== '@viz-js/viz') {
      throw new Error(`Missing bundled license: ${manifest.name}@${manifest.version}`)
    }
    notices.push(`${manifest.name}@${manifest.version} (${manifest.license ?? 'see notice'})\n\n${texts.join('\n\n')}`)
  }
  const icons = await readFile('node_modules/@canofold/markdown/dist/file-icons/LICENSE', 'utf8')
  const runtime = await readFile('licenses/runtime.txt', 'utf8')
  await writeFile('dist/THIRD_PARTY_LICENSES.txt', [...notices, icons, runtime].join('\n\n========================================\n\n'))
}
