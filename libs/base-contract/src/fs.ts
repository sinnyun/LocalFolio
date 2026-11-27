export type FsFileCategory =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'design'
  | 'code'
  | 'archive'
  | 'other'

export interface FsFileClassification {
  readonly ext: string
  readonly category: FsFileCategory
  readonly mime: string
  readonly isImage: boolean
  readonly isStreamableMedia: boolean
  readonly isTextPreviewable: boolean
}

export interface FsImageDimensions {
  readonly width: number
  readonly height: number
}

export interface FsBreadcrumbItem {
  readonly name: string
  readonly path: string
}

export type FsQuickFolderKind = 'home' | 'desktop' | 'documents' | 'downloads' | 'pictures'

export interface FsQuickFolder {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly kind: FsQuickFolderKind
}

export type FsDriveKind = 'fixed' | 'removable' | 'network'

export interface FsDriveInfo {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly label: string
  readonly kind: FsDriveKind
  readonly totalBytes: number
  readonly freeBytes: number
}

export interface FsRootsResult {
  readonly homePath: string
  readonly platform: string
  readonly quickFolders: readonly FsQuickFolder[]
  readonly drives: readonly FsDriveInfo[]
}

export interface FsDirEntry {
  readonly name: string
  readonly path: string
  readonly isDir: boolean
  readonly ext: string
  readonly category: FsFileCategory
  readonly mime: string
  readonly size: number
  readonly mtimeMs: number
}

export interface FsListDirectoryOptions {
  readonly path?: string
  readonly showHidden?: boolean
  readonly extensions?: readonly string[]
  readonly onlyDirs?: boolean
  readonly limit?: number
}

export interface FsListDirectoryResult {
  readonly path: string
  readonly parentPath: string | null
  readonly entries: readonly FsDirEntry[]
  readonly truncated: boolean
}

export interface FsServeMediaOptions {
  readonly maxImageBytes?: number
  readonly etagPrefix?: string
  readonly cacheControl?: string
  readonly allowedExts?: ReadonlySet<string>
}

export interface FsServeDownloadOptions {
  readonly maxBytes?: number
  readonly etagPrefix?: string
  readonly fileName?: string
}

export interface FsPruneCacheOptions {
  readonly maxFiles: number
  readonly maxBytes: number
  readonly extFilter?: string | readonly string[]
}

export interface FsPruneCacheResult {
  readonly removedFiles: number
  readonly remainingFiles: number
  readonly remainingBytes: number
}

/**
 * Host Cordis service (`ctx.folioFs`) provided by `@folio/base-fs-host`.
 * Centralizes path normalization/containment, file classification, image dimension
 * & MIME sniffing, drive/quick-folder enumeration, directory listing,
 * HTTP Range media streaming, and LRU cache directory pruning.
 */
export interface FolioFsService {
  normalizePath(rawPath: string): string
  isPathInside(rootDir: string, candidatePath: string): boolean
  getParentPath(dirPath: string): string | null
  buildBreadcrumbs(dirPath: string): FsBreadcrumbItem[]
  classifyFile(
    fileName: string,
    isDir?: boolean,
    options?: { readonly includeDesignCategory?: boolean },
  ): FsFileClassification
  isStreamableMediaExt(ext: string): boolean
  isTextPreviewable(ext: string): boolean
  isHiddenName(name: string): boolean
  parseImageDimensionsFromBuffer(buf: Buffer, ext: string): FsImageDimensions | null
  readImageDimensions(filePath: string, ext: string): Promise<FsImageDimensions | null>
  sniffImageMime(buf: Buffer): string | null
  listDrives(): Promise<FsDriveInfo[]>
  listQuickFolders(): Promise<FsQuickFolder[]>
  listRoots(): Promise<FsRootsResult>
  listDirectory(options?: FsListDirectoryOptions): Promise<FsListDirectoryResult>
  serveMediaFile(
    request: Request,
    filePath: string,
    options?: FsServeMediaOptions,
  ): Promise<Response>
  serveDownloadFile(
    request: Request,
    filePath: string,
    options?: FsServeDownloadOptions,
  ): Promise<Response>
  pruneCacheDir(dirPath: string, options: FsPruneCacheOptions): Promise<FsPruneCacheResult>
  writeAtomicFile(targetPath: string, data: string | Buffer): Promise<void>
}
