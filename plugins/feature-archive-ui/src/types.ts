export type ArchiveSourceDisposal = 'recycle' | 'keep' | 'delete'

export interface ArchiveSettings {
  readonly mirrorPrefix: string
  readonly customBinaryPath: string | null
  readonly defaultSourceDisposal: ArchiveSourceDisposal
  readonly extractCacheMaxMb: number
  readonly hideMetaDir: boolean
}

export interface ArchiveCacheStats {
  readonly fileCount: number
  readonly totalBytes: number
  readonly cacheDir: string
}

export interface ArchiveToolStatus {
  readonly installed: boolean
  readonly source: 'managed' | 'custom' | 'none'
  readonly version: string | null
  readonly binaryPath: string | null
  readonly managedDir: string
  readonly managedBinaryPath: string
  readonly settings: ArchiveSettings
  readonly cacheStats: ArchiveCacheStats
}

export interface ArchiveLiveFileItem {
  readonly relPath: string
  readonly name: string
  readonly size: number
  readonly mtimeMs: number
  readonly fingerprint: string
  readonly thumbKey: string
  readonly thumbSupported: boolean
}

export interface ArchiveLeftoverFile {
  readonly name: string
  readonly size: number
}

export interface ArchiveLiveInspection {
  readonly projectId: string
  readonly archived: boolean
  readonly cleanExtracted: readonly ArchiveLiveFileItem[]
  readonly modifiedExtracted: readonly ArchiveLiveFileItem[]
  readonly addedFiles: readonly ArchiveLiveFileItem[]
  readonly leftoverArchiveFiles?: readonly ArchiveLeftoverFile[]
}
