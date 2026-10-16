# Changelog

## 0.1.13

- Show the preview toolbar action for `.md` files regardless of the editor language, including `SKILL.md` and instruction files, without changing their language association.
- Add a Chinese README and clarify installation, source saving, and preview security boundaries in both languages.

## 0.1.12

- Use Canofold 0.6.6 and enable localized rich-directive recovery for authoring previews, preserving ordinary colon text and valid surrounding content. Malformed structured containers remain complete inert source.
- Stop displaying the loading indicator after a fatal preview failure; keep HTML sanitization and local resource boundaries unchanged.

## 0.1.11

- Use Canofold 0.6.5 and Mermaid 12.2.0 with its patched KaTeX runtime, while preserving the default diagram layout and appearance.
- Preview Markdown in its current editor tab and return to source with the same toolbar action.
- Render math, Mermaid, PlantUML, Graphviz, and D2 locally without sending diagram source to public rendering services.
- Cancel obsolete rendering, recover after invalid diagram syntax, and release worker resources when previews close.
- Preview workspace HTML in script-disabled frames with bounded local CSS, images, and fonts; reject traversal, symlinks, unsafe markup, and forged iframe messages.
- Include runtime licenses and third-party source notices in the installation package.
