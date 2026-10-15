# Canofold Markdown Preview for VS Code

Preview any saved `.md` file with [`@canofold/markdown`](https://www.npmjs.com/package/@canofold/markdown) in the current editor tab.

## Develop

Requires Node.js 22+, pnpm, and VS Code 1.100+.

```sh
pnpm install --frozen-lockfile
pnpm build
```

Open this repository in VS Code and press `F5`. In the Extension Development Host, open a `.md` file and run **Canofold: Toggle Canofold Preview**. The same command switches the current tab between Markdown source and Canofold preview.

Cursor hides newly contributed editor-title actions by default. To keep the Canofold book icon immediately to the left of the `...` menu, open `...` > **Configure Icon Visibility** once and enable **Toggle Canofold Preview**. The choice is saved in the current Cursor profile. VS Code normally shows the action without this extra step.

The command palette also exposes **Canofold: Preview with Canofold** and **Canofold: Edit Markdown Source** as explicit one-way commands.

The preview updates from the current text document, including unsaved edits. Relative images and links resolve from the Markdown file; links open through VS Code. The preview uses Canofold's light appearance independently of the editor's color theme. Raw HTML is sanitized, and MDX code is not executed.

Math, Mermaid, PlantUML, Graphviz/DOT, and D2 blocks are supported. Diagram source is rendered entirely on the local machine and is never sent to a public rendering service. Mermaid and PlantUML run in the isolated preview webview; Graphviz and D2 run in a dedicated Node.js worker owned by each preview and return only the generated SVG. Updating or closing a preview cancels obsolete work and releases its worker.

Local HTML embeds display static content in a sandbox without scripts or same-origin access. Relative CSS, images, fonts, and CSS imports are included in the embedded document, with resource paths restricted to the workspace and its public directory; symbolic links are not followed. Each file is limited to 2 MiB, with at most 64 local resources and 16 MiB of combined resources or generated output. Missing assets show a warning without discarding the remaining content. Remote embeds require HTTPS and remain subject to the remote site's framing policy.

To create a local VSIX after verification:

```sh
pnpm package
```

To run plugin and iframe tests in a real, isolated VS Code window, set `VSCODE_EXECUTABLE` to the application executable (not the `code` CLI) and run `pnpm test:editor`. On macOS:

```sh
VSCODE_EXECUTABLE='/Applications/Visual Studio Code.app/Contents/MacOS/Code' pnpm test:editor
```

The tests cover first load, unsaved edits, failure recovery, and closing/reopening previews, including math rendering and iframe resource and permission boundaries. For a local `@canofold/plugins` build, append `--plugins-package /absolute/path/to/packages/plugins`; this builds an isolated consumer without changing the installed dependencies.

The extension is currently an optional editor for `.md`; it does not change VS Code's default Markdown editor.

## License

MIT
