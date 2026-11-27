export type ArchiveSourceDisposal = 'recycle' | 'keep' | 'delete'
export type ArchiveCompressionMethod = 'default' | 'm9' | 'm7'

export interface ArchiveSettings {
  readonly mirrorPrefix: string
  readonly customBinaryPath: string | null
  readonly defaultSourceDisposal: ArchiveSourceDisposal
  readonly extractCacheMaxMb: number
  readonly hideMetaDir: boolean
  readonly chunkSizeGb: number
  readonly compressionMethod: ArchiveCompressionMethod
  readonly useSequentialExtract: boolean
}

export interface ArchiveCacheStats {
  readonly fileCount: number
  readonly totalBytes: number
  readonly cacheDir: string
}

export interface ArchiveMountSessionInfo {
  readonly projectId: string
  readonly projectName: string
  readonly archiveFileName: string
  readonly mountPoint: string | null
  readonly allVersions: boolean
  readonly startedAt: number
  readonly pid: number | null
}

export interface ArchiveToolStatus {
  readonly installed: boolean
  readonly source: 'managed' | 'custom' | 'none'
  readonly version: string | null
  readonly supportsChunkBackup?: boolean
  readonly binaryPath: string | null
  readonly managedDir: string
  readonly managedBinaryPath: string
  readonly settings: ArchiveSettings
  readonly cacheStats: ArchiveCacheStats
  readonly activeMounts?: readonly ArchiveMountSessionInfo[]
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
