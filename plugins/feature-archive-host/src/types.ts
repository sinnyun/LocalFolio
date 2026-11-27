import { z } from 'zod'

export const ArchiveSourceDisposalSchema = z.enum(['recycle', 'keep', 'delete'])
export type ArchiveSourceDisposal = z.infer<typeof ArchiveSourceDisposalSchema>

export const ArchiveCompressionMethodSchema = z.enum(['default', 'm9', 'm7'])
export type ArchiveCompressionMethod = z.infer<typeof ArchiveCompressionMethodSchema>

export const ArchiveSettingsSchema = z.object({
  mirrorPrefix: z.string().default(''),
  customBinaryPath: z.string().nullable().default(null),
  defaultSourceDisposal: ArchiveSourceDisposalSchema.default('recycle'),
  extractCacheMaxMb: z.number().int().min(64).max(16384).default(512),
  hideMetaDir: z.boolean().default(true),
  chunkSizeGb: z.number().min(0.25).max(1024).default(8),
  compressionMethod: ArchiveCompressionMethodSchema.default('default'),
  useSequentialExtract: z.boolean().default(true),
})
export type ArchiveSettings = z.infer<typeof ArchiveSettingsSchema>

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
  readonly supportsChunkBackup: boolean
  readonly binaryPath: string | null
  readonly managedDir: string
  readonly managedBinaryPath: string
  readonly settings: ArchiveSettings
  readonly cacheStats: ArchiveCacheStats
  readonly activeMounts: readonly ArchiveMountSessionInfo[]
}
