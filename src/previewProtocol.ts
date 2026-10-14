export type LocalDiagramType = 'graphviz' | 'd2'

export interface LocalEmbedDocument {
  html: string
  path: string
}

export interface LocalEmbedAsset {
  path: string
  mediaType: string
  content: string
  byteLength: number
}

export const MAX_EMBED_FILE_BYTES = 2 * 1024 * 1024
export const MAX_EMBED_ASSETS = 64
export const MAX_EMBED_TOTAL_BYTES = 16 * 1024 * 1024
export const MAX_EMBED_STYLE_DEPTH = 8

export interface HostRequestData {
  renderDiagram: { diagramType: LocalDiagramType; source: string }
  loadLocalEmbed: { href: string }
  loadLocalEmbedAsset: { documentPath: string; href: string }
}

export interface HostRequestResults {
  renderDiagram: { svg: string }
  loadLocalEmbed: LocalEmbedDocument
  loadLocalEmbedAsset: LocalEmbedAsset
}

export const REQUEST_TIMEOUT_MS = 30_000
