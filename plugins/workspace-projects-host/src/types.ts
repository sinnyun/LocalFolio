import { z } from 'zod'

export const FileCategorySchema = z.enum([
  'image',
  'video',
  'audio',
  'document',
  'design',
  'code',
  'archive',
  'other',
])
export type FileCategory = z.infer<typeof FileCategorySchema>

export const ProjectFileEntrySchema = z.object({
  relPath: z.string(),
  folderRelPath: z.string(),
  name: z.string(),
  ext: z.string(),
  category: FileCategorySchema,
  mime: z.string(),
  thumbSupported: z.boolean(),
  size: z.number().nonnegative(),
  mtimeMs: z.number().nonnegative(),
  fingerprint: z.string(),
  thumbKey: z.string(),
})
export type ProjectFileEntry = z.infer<typeof ProjectFileEntrySchema>

export const ProjectFolderGroupSchema = z.object({
  relPath: z.string(),
  name: z.string(),
  depth: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().nonnegative(),
  files: z.array(ProjectFileEntrySchema),
})
export type ProjectFolderGroup = z.infer<typeof ProjectFolderGroupSchema>

export const ProjectChangeSummarySchema = z.object({
  added: z.number().int().nonnegative(),
  modified: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
})
export type ProjectChangeSummary = z.infer<typeof ProjectChangeSummarySchema>

export const ProjectStatsSchema = z.object({
  fileCount: z.number().int().nonnegative(),
  folderCount: z.number().int().nonnegative(),
  totalBytes: z.number().nonnegative(),
  categories: z.record(z.string(), z.number().int().nonnegative()),
})
export type ProjectStats = z.infer<typeof ProjectStatsSchema>

export const AiExtractionOutputSchema = z.object({
  projectType: z.string().trim().min(1).max(40),
  tags: z.array(z.string().trim().min(1).max(24)).min(1).max(8),
  summary: z.string().trim().min(1).max(300),
  recommendedCoverRelPath: z.string().trim().nullable().optional(),
})
export type AiExtractionOutput = z.infer<typeof AiExtractionOutputSchema>

export const ProjectAiTraceSchema = z.object({
  extractedAt: z.number(),
  provider: z.string(),
  model: z.string(),
  status: z.enum(['success', 'error']),
  error: z.string().nullable().default(null),
  systemPrompt: z.string(),
  userPrompt: z.string(),
  sampledFiles: z.array(z.string()).default([]),
  coverCandidates: z.array(z.string()).default([]),
  rawResponse: z.string(),
  parsedOutput: AiExtractionOutputSchema.nullable().default(null),
})
export type ProjectAiTrace = z.infer<typeof ProjectAiTraceSchema>

export const ArchiveSourceDisposalSchema = z.enum(['recycle', 'keep', 'delete'])
export type ArchiveSourceDisposal = z.infer<typeof ArchiveSourceDisposalSchema>

export const ProjectArchiveExtractedFileSchema = z.object({
  relPath: z.string(),
  fingerprint: z.string(),
  originalFingerprint: z.string(),
  extractedAt: z.number(),
})
export type ProjectArchiveExtractedFile = z.infer<typeof ProjectArchiveExtractedFileSchema>

export const ProjectArchiveMetaSchema = z.object({
  mode: z.enum(['none', 'archived']),
  engine: z.string(),
  archiveFileName: z.string(),
  archiveBytes: z.number().nonnegative(),
  originalBytes: z.number().nonnegative(),
  archivedFileCount: z.number().int().nonnegative(),
  archivedAt: z.number(),
  verifiedAt: z.number().nullable().default(null),
  sourceDisposal: ArchiveSourceDisposalSchema,
  versions: z.number().int().positive().default(1),
  extractedFiles: z.array(ProjectArchiveExtractedFileSchema).default([]),
})
export type ProjectArchiveMeta = z.infer<typeof ProjectArchiveMetaSchema>

export const ProjectManifestSchema = z.object({
  version: z.literal(1),
  projectId: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastScannedAt: z.number(),
  coverRelPath: z.string().nullable(),
  coverThumbFile: z.string().nullable(),
  summary: z.string(),
  projectType: z.string(),
  tags: z.array(z.string()),
  aiExtractedAt: z.number().nullable(),
  aiLastTrace: ProjectAiTraceSchema.nullable().default(null),
  archive: ProjectArchiveMetaSchema.nullable().default(null),
  stats: ProjectStatsSchema,
  fingerprintDigest: z.string(),
  groups: z.array(ProjectFolderGroupSchema),
})
export type ProjectManifest = z.infer<typeof ProjectManifestSchema>

export const LibraryRootSchema = z.object({
  id: z.string(),
  name: z.string(),
  rootPath: z.string(),
  addedAt: z.number(),
  lastScannedAt: z.number().nullable(),
  projectCount: z.number().int().nonnegative(),
})
export type LibraryRoot = z.infer<typeof LibraryRootSchema>

export const ProjectSummarySchema = z.object({
  id: z.string(),
  libraryId: z.string(),
  name: z.string(),
  path: z.string(),
  coverRelPath: z.string().nullable(),
  coverFingerprint: z.string().nullable(),
  coverThumbKey: z.string().nullable(),
  tags: z.array(z.string()),
  summary: z.string(),
  projectType: z.string(),
  fileCount: z.number().int().nonnegative(),
  folderCount: z.number().int().nonnegative(),
  totalBytes: z.number().nonnegative(),
  lastScannedAt: z.number(),
  aiExtractedAt: z.number().nullable().default(null),
  hasChanges: z.boolean(),
  changeSummary: ProjectChangeSummarySchema,
  missing: z.boolean(),
  metaWritable: z.boolean(),
  archived: z.boolean().default(false),
  archiveBytes: z.number().nonnegative().nullable().default(null),
  archiveFileName: z.string().nullable().default(null),
  extractedUnmodified: z.number().int().nonnegative().default(0),
})
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>

export interface AiModelOption {
  readonly provider: string
  readonly model: string
  readonly name: string
}

export interface AiStatusResult {
  readonly available: boolean
  readonly defaultRoute: { readonly provider: string; readonly model: string } | null
  readonly models: readonly AiModelOption[]
  readonly reason?: string
}

export interface ProjectAiSamplePreview {
  readonly sample: {
    readonly projectName: string
    readonly fileCount: number
    readonly folderCount: number
    readonly totalBytes: number
    readonly categories: Readonly<Record<string, number>>
    readonly topExtensions: readonly { readonly ext: string; readonly count: number }[]
    readonly treeLines: readonly string[]
    readonly textSnippets: readonly { readonly relPath: string; readonly content: string }[]
    readonly coverCandidates: readonly string[]
  }
  readonly systemPrompt: string
  readonly userPrompt: string
}

export const LibraryIndexSchema = z.object({
  version: z.literal(1),
  libraries: z.array(LibraryRootSchema),
  projects: z.array(ProjectSummarySchema),
})
export type LibraryIndex = z.infer<typeof LibraryIndexSchema>

export interface ProjectDetailResult {
  readonly summary: ProjectSummary
  readonly manifest: ProjectManifest
}

export interface ProjectCheckResult {
  readonly projectId: string
  readonly hasChanges: boolean
  readonly changeSummary: ProjectChangeSummary
  readonly missing: boolean
  readonly extractedUnmodified?: number
}
