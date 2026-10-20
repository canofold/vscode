# Canofold Markdown Preview for VS Code

[简体中文](README.zh-CN.md)

Preview any saved `.md` file with [`@canofold/markdown`](https://www.npmjs.com/package/@canofold/markdown) in the current editor tab.

## Install and use

Requires VS Code 1.100+. Install **Canofold Markdown Preview** by `canofold` from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=canofold.canofold-vscode).

Open a saved `.md` file, then click the Canofold icon in the editor title bar or run **Canofold: Toggle Canofold Preview**. The same command switches the current tab between source and preview. Specialized Markdown files such as `SKILL.md` and `*.instructions.md` are supported without changing their editor language.

If the action has been hidden in your editor profile, open the title bar's `...` menu and check **Configure Icon Visibility**.

The command palette also exposes **Canofold: Preview with Canofold** and **Canofold: Edit Markdown Source** as explicit one-way commands.

Switching to preview saves dirty source first. Once open, the preview updates from the current text document, including unsaved edits. Relative images and links resolve from the Markdown file; links open through VS Code. The preview uses Canofold's light appearance independently of the editor's color theme. Raw HTML is sanitized; MDX code and Skill instructions are not executed.

## Project checks

Run **Canofold: Check Project** from a file in a local workspace to check its nearest project declaring `canofold` in `dependencies` or `devDependencies`. Install Canofold through that project's normal dependency workflow first. The command executes the project's installed `canofold check --json`; it never installs a CLI, uses a global fallback, or duplicates Core's validation rules.

Checks require a trusted workspace and an extension-host Node.js runtime of at least 22.12. Preview remains available without project checks. Checks read saved files only: save or discard that project's unsaved edits before running the command; it does not save them for you. Results appear in **Problems**, with source locations only where supplied by the CLI. Project-level issues and OpenAPI pointers explicitly indicate that no exact source position is available.

Cancel from the progress notification. Editing project files invalidates old results; run the command again after saving. Re-running replaces obsolete work, and separate projects keep separate results. This is an explicit project check, not automatic whole-site validation on every keystroke.

## Rendering and boundaries

Unknown or invalid rich directives are displayed as inert source so valid surrounding content stays readable. Ordinary colon words such as `format:check` remain text. This recovery does not suppress plugin failures or relax HTML and local-resource security boundaries.

Math, Mermaid, PlantUML, Graphviz/DOT, and D2 blocks are supported. Diagram source is rendered entirely on the local machine and is never sent to a public rendering service. Mermaid and PlantUML run in the isolated preview webview; Graphviz and D2 run in a dedicated Node.js worker owned by each preview and return only the generated SVG. Updating or closing a preview cancels obsolete work and releases its worker.

Local HTML embeds display static content in a sandbox without scripts or same-origin access. Relative CSS, images, fonts, and CSS imports are included in the embedded document, with resource paths restricted to the workspace and its public directory; symbolic links are not followed. Each file is limited to 2 MiB, with at most 64 local resources and 16 MiB of combined resources or generated output. Missing assets show a warning without discarding the remaining content. Remote embeds require HTTPS and remain subject to the remote site's framing policy.

The extension is an optional editor for saved `.md` files; it does not change VS Code's default Markdown editor. It does not build site navigation, search indexes, or AI output, and it does not install or run Agent Skills. See the [Canofold documentation](https://canofold.dev/) for the site and SDK workflows.

## Develop

Requires Node.js 22.12+, pnpm, and VS Code 1.100+.

```sh
pnpm install --frozen-lockfile
pnpm build
```

Open this repository in VS Code and press `F5` to launch the Extension Development Host. Open a `.md` file there and run **Canofold: Toggle Canofold Preview**.

To create a local VSIX after verification:

```sh
pnpm package
```

To run plugin and iframe tests in a real, isolated VS Code window, set `VSCODE_EXECUTABLE` to the application executable (not the `code` CLI) and run `pnpm test:editor`. On macOS:

```sh
VSCODE_EXECUTABLE='/Applications/Visual Studio Code.app/Contents/MacOS/Code' pnpm test:editor
```

The tests cover first load, unsaved edits, failure recovery, and closing/reopening previews, including directive recovery, math rendering, and iframe resource and permission boundaries. For a local Core build, append `--plugins-package /absolute/path/to/packages/plugins` and/or `--markdown-package /absolute/path/to/packages/markdown`; these build an isolated consumer without changing installed dependencies. Release acceptance must omit both options and use the published dependencies.

To include checks against a real installed Canofold CLI, append `--check-project /absolute/path/to/consumer`. Trust only the disposable test workspace when VS Code prompts; the tests do not disable Workspace Trust. Waiting for that decision does not count toward the CLI execution timeout; close the test window to cancel the run.

## License

MIT
