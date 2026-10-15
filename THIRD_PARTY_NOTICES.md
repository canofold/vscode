# Third-party notices

Canofold Markdown Preview is MIT-licensed. Bundled dependencies retain their own licenses and copyright notices. Complete license texts for the actual bundle graph and vendored runtimes are included in `dist/THIRD_PARTY_LICENSES.txt` in the VSIX.

| Runtime | Version | License | Source |
|---|---|---|---|
| Canofold Markdown, plugins, and themes | See package.json | MIT | https://github.com/canofold/canofold |
| PlantUML JavaScript | 1.2026.8 | MIT | https://github.com/plantuml/plantuml.js |
| D2 | 0.1.33 | MPL-2.0 | https://github.com/terrastruct/d2/tree/581c91096b62d644fb5168313142c836b7e68e74 |
| Viz.js | 3.31.0; PlantUML also contains 3.24.0 | MIT | https://github.com/mdaines/viz-js |
| Mermaid | 12.2.0 | MIT | https://github.com/mermaid-js/mermaid |

Viz.js includes Graphviz (EPL-1.0) and Expat (MIT). D2 includes ELK (EPL-2.0), the Go WebAssembly runtime (BSD-3-Clause), Dagre and derived code (MIT), and Fuzzy Bubbles, Source Code Pro, and Source Sans Pro fonts (SIL OFL 1.1). Their license texts are included in the generated notice file. The vendored D2 and ELK files are unmodified; the linked upstream repositories provide their source code. JavaScript bundles preserve upstream legal comments.

The locked versions of React, KaTeX, Markdown compiler dependencies, and other bundled libraries are recorded in `pnpm-lock.yaml` in the source repository. The build collects their license texts from installed packages, and fails if a bundled package lacks a known notice source.
