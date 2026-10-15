/** Return the authored Markdown body without an optional YAML frontmatter block. */
export function markdownContent(input: string): string {
  const source = input.replace(/^\uFEFF/, '')
  const start = /^---[\t ]*\r?\n/.exec(source)
  if (!start) return source

  const remaining = source.slice(start[0].length)
  const end = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/m.exec(remaining)
  if (!end) return source

  return remaining.slice(end.index + end[0].length)
}
