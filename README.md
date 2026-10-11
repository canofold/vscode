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

The preview updates from the current text document, including unsaved edits. Relative images and links resolve from the Markdown file; links open through VS Code. Light and dark themes are supported. Raw HTML is sanitized, and MDX code is not executed.

To create a local VSIX after verification:

```sh
pnpm package
```

The extension is currently an optional editor for `.md`; it does not change VS Code's default Markdown editor.

## License

MIT
