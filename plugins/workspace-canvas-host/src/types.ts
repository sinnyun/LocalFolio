import { z } from 'zod'

export const BoardMetaSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  imageCount: z.number().int().min(0).default(0),
  brokenCount: z.number().int().min(0).default(0),
})
export type BoardMeta = z.infer<typeof BoardMetaSchema>

export const BoardIndexStateSchema = z.object({
  version: z.literal(1),
  boards: z.array(BoardMetaSchema),
})
export type BoardIndexState = z.infer<typeof BoardIndexStateSchema>

export const BoardDocumentSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  snapshot: z.record(z.string(), z.unknown()),
  updatedAt: z.number().finite(),
})
export type BoardDocument = z.infer<typeof BoardDocumentSchema>

export interface BoardSaveResult {
  readonly meta: BoardMeta
  readonly updatedAt: number
  readonly strippedInlineCount: number
}

export interface LinkedImageInspectResult {
  readonly path: string
  readonly exists: boolean
  readonly fileName: string
  readonly ext: string
  readonly mime: string
  readonly size: number
  readonly mtimeMs: number
  readonly naturalWidth: number | null
  readonly naturalHeight: number | null
  readonly isImage: boolean
}

export interface LinkCheckEntry {
  readonly path: string
  readonly exists: boolean
  readonly size: number | null
  readonly mtimeMs: number | null
}

export interface MissingLinkQueryItem {
  readonly linkId: string
  readonly fileName: string
  readonly expectedSize?: number
}

export interface BatchRelocateMatch {
  readonly linkId: string
  readonly inspected: LinkedImageInspectResult
}

export interface BatchRelocateResult {
  readonly folderPath: string
  readonly scannedFiles: number
  readonly matches: readonly BatchRelocateMatch[]
}

export interface CanvasQuickFolder {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly kind: 'home' | 'desktop' | 'documents' | 'downloads' | 'pictures'
}

export interface CanvasDriveInfo {
  readonly name: string
  readonly path: string
}

export interface CanvasRootsResult {
  readonly homePath: string
  readonly platform: string
  readonly quickFolders: readonly CanvasQuickFolder[]
  readonly drives: readonly CanvasDriveInfo[]
}

export interface CanvasDirEntry {
  readonly name: string
  readonly path: string
  readonly isDir: boolean
  readonly ext: string
  readonly mime: string
  readonly size: number
  readonly mtimeMs: number
}

export interface CanvasListDirResult {
  readonly path: string
  readonly parentPath: string | null
  readonly entries: readonly CanvasDirEntry[]
  readonly truncated: boolean
}

export interface CanvasCacheStats {
  readonly fileCount: number
  readonly totalBytes: number
  readonly maxBytes: number
  readonly maxFiles: number
  readonly tiers: readonly number[]
}
