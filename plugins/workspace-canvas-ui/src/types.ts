export interface BoardMeta {
  readonly id: string
  readonly title: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly imageCount: number
  readonly brokenCount: number
}

export interface BoardDocument {
  readonly version: 1
  readonly id: string
  readonly snapshot: Record<string, unknown>
  readonly updatedAt: number
}

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

export interface BatchRelocateResult {
  readonly folderPath: string
  readonly scannedFiles: number
  readonly matches: readonly {
    readonly linkId: string
    readonly inspected: LinkedImageInspectResult
  }[]
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

export interface FolioLinkMeta {
  readonly folioLink: true
  readonly linkId: string
  readonly localPath: string
  readonly fileName: string
  readonly fileSize: number
  readonly mtimeMs: number
  readonly naturalWidth: number | null
  readonly naturalHeight: number | null
  readonly mime: string
  readonly relinkRev: number
}

export type LinkStatus = 'ok' | 'missing' | 'checking'

export interface BoardLinkedImageItem {
  readonly assetId: string
  readonly shapeIds: readonly string[]
  readonly meta: FolioLinkMeta
  readonly status: LinkStatus
}

export type PickerMode = 'insert' | 'relink' | 'relocate-folder'

export interface PickerRequest {
  readonly mode: PickerMode
  readonly targetAssetId?: string
  readonly targetFileName?: string
  readonly initialDir?: string
  readonly dropPoint?: { readonly x: number; readonly y: number }
}
