import type {
  ProjectArchiveMetaInfo,
  TaskSnapshot,
} from '@folio/base-contract'

export type ProjectArchiveMeta = ProjectArchiveMetaInfo

export type FileCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'design'
  | 'code'
  | 'archive'
  | 'other'

export interface ProjectFileEntry {
  readonly relPath: string
  readonly folderRelPath: string
  readonly name: string
  readonly ext: string
  readonly category: FileCategory
  readonly mime: string
  readonly thumbSupported: boolean
  readonly size: number
  readonly mtimeMs: number
  readonly fingerprint: string
  readonly thumbKey: string
}

export interface ProjectFolderGroup {
  readonly relPath: string
  readonly name: string
  readonly depth: number
  readonly fileCount: number
  readonly totalBytes: number
  readonly files: readonly ProjectFileEntry[]
}

export interface ProjectChangeSummary {
  readonly added: number
  readonly modified: number
  readonly removed: number
}

export interface ProjectStats {
  readonly fileCount: number
  readonly folderCount: number
  readonly totalBytes: number
  readonly categories: Readonly<Record<string, number>>
}

export interface ProjectManifest {
  readonly version: 1
  readonly projectId: string
  readonly name: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly lastScannedAt: number
  readonly coverRelPath: string | null
  readonly coverThumbFile: string | null
  readonly summary: string
  readonly projectType: string
  readonly tags: readonly string[]
  readonly aiExtractedAt: number | null
  readonly aiLastTrace?: ProjectAiTrace | null
  readonly archive?: ProjectArchiveMeta | null
  readonly stats: ProjectStats
  readonly fingerprintDigest: string
  readonly groups: readonly ProjectFolderGroup[]
}

export interface ProjectAiTrace {
  readonly extractedAt: number
  readonly provider: string
  readonly model: string
  readonly status: 'success' | 'error'
  readonly error: string | null
  readonly systemPrompt: string
  readonly userPrompt: string
  readonly sampledFiles: readonly string[]
  readonly coverCandidates: readonly string[]
  readonly rawResponse: string
  readonly parsedOutput: AiExtractionOutput | null
}

export interface ProjectSampleSummary {
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

export interface ProjectAiSamplePreview {
  readonly sample: ProjectSampleSummary
  readonly systemPrompt: string
  readonly userPrompt: string
}

export interface LibraryRoot {
  readonly id: string
  readonly name: string
  readonly rootPath: string
  readonly addedAt: number
  readonly lastScannedAt: number | null
  readonly projectCount: number
}

export interface ProjectSummary {
  readonly id: string
  readonly libraryId: string
  readonly name: string
  readonly path: string
  readonly coverRelPath: string | null
  readonly coverFingerprint: string | null
  readonly coverThumbKey: string | null
  readonly tags: readonly string[]
  readonly summary: string
  readonly projectType: string
  readonly fileCount: number
  readonly folderCount: number
  readonly totalBytes: number
  readonly lastScannedAt: number
  readonly aiExtractedAt: number | null
  readonly hasChanges: boolean
  readonly changeSummary: ProjectChangeSummary
  readonly missing: boolean
  readonly metaWritable: boolean
  readonly archived?: boolean
  readonly archiveBytes?: number | null
  readonly archiveFileName?: string | null
  readonly extractedUnmodified?: number
}

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

export interface AiExtractionOutput {
  readonly projectType: string
  readonly tags: readonly string[]
  readonly summary: string
  readonly recommendedCoverRelPath?: string | null
}

export interface LibraryIndex {
  readonly version: 1
  readonly libraries: readonly LibraryRoot[]
  readonly projects: readonly ProjectSummary[]
}

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

export type CardZoom = 'sm' | 'md' | 'lg'
export type SortMode = 'name' | 'size' | 'mtime'
export type CategoryFilter = 'all' | FileCategory

export type { TaskSnapshot }
