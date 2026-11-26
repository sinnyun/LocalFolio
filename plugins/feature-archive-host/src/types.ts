import { z } from 'zod'

export const ArchiveSourceDisposalSchema = z.enum(['recycle', 'keep', 'delete'])
export type ArchiveSourceDisposal = z.infer<typeof ArchiveSourceDisposalSchema>

export const ArchiveSettingsSchema = z.object({
  mirrorPrefix: z.string().default(''),
  customBinaryPath: z.string().nullable().default(null),
  defaultSourceDisposal: ArchiveSourceDisposalSchema.default('recycle'),
  extractCacheMaxMb: z.number().int().min(64).max(16384).default(512),
  hideMetaDir: z.boolean().default(true),
})
export type ArchiveSettings = z.infer<typeof ArchiveSettingsSchema>

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
