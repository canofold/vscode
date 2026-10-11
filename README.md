# Canofold Markdown Preview for VS Code

Preview any saved `.md` file with [`@canofold/markdown`](https://www.npmjs.com/package/@canofold/markdown) in the current editor tab.

## Develop

Requires Node.js 22+, pnpm, and VS Code 1.100+.

```sh
pnpm install --frozen-lockfile
pnpm build
```

Open this repository in VS Code and press `F5`. In the Extension Development Host, open a `.md` file and select **Preview** in the editor title bar. Select **Markdown** to return to the source editor. The command palette also exposes **Canofold: Preview** and **Canofold: Markdown**.

The preview updates from the current text document, including unsaved edits. Relative images and links resolve from the Markdown file; links open through VS Code. Light and dark themes are supported. Raw HTML is sanitized, and MDX code is not executed.

To create a local VSIX after verification:

```sh
pnpm package
```

The extension is currently an optional editor for `.md`; it does not change VS Code's default Markdown editor.

## License

MIT
