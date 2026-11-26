import { z } from 'zod'

export const FileCategorySchema = z.enum([
  'folder',
  'image',
  'video',
  'audio',
  'document',
  'code',
  'archive',
  'other',
])
export type FileCategory = z.infer<typeof FileCategorySchema>

export interface FileEntry {
  readonly name: string
  readonly path: string
  readonly ext: string
  readonly isDir: boolean
  readonly isSymlink: boolean
  readonly isHidden: boolean
  readonly size: number
  readonly mtimeMs: number
  readonly ctimeMs: number
  readonly category: FileCategory
  readonly mime: string
  readonly thumbSupported: boolean
}

export interface DriveInfo {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly label: string
  readonly kind: 'fixed' | 'removable' | 'network' | 'root'
  readonly totalBytes: number
  readonly freeBytes: number
  readonly usedBytes: number
}

export interface QuickFolder {
  readonly id: string
  readonly name: string
  readonly path: string
  readonly kind: 'home' | 'desktop' | 'documents' | 'downloads' | 'pictures' | 'videos' | 'music' | 'pinned'
  readonly pinned: boolean
}

export interface BreadcrumbItem {
  readonly name: string
  readonly path: string
}

export interface DirChildGroup {
  readonly folderName: string
  readonly folderPath: string
  readonly entries: readonly FileEntry[]
  readonly totalChildren: number
  readonly truncated: boolean
}

export interface ListDirectoryResult {
  readonly path: string
  readonly parentPath: string | null
  readonly breadcrumbs: readonly BreadcrumbItem[]
  readonly entries: readonly FileEntry[]
  readonly childGroups: readonly DirChildGroup[]
  readonly totalEntries: number
  readonly truncated: boolean
}

export interface TreeNodeInfo {
  readonly name: string
  readonly path: string
  readonly hasSubdirs: boolean
}

export interface ImageDimensions {
  readonly width: number
  readonly height: number
}

export interface FileInspectResult {
  readonly entry: FileEntry
  readonly resolvedPath: string
  readonly parentPath: string | null
  readonly readonly: boolean
  readonly childCount: number | null
  readonly folderChildCount: number | null
  readonly fileChildCount: number | null
  readonly imageDimensions: ImageDimensions | null
  readonly textPreview: string | null
  readonly textTruncated: boolean
  readonly mediaUrl: string | null
  readonly thumbUrl: string | null
}

export const FilesPrefsSchema = z.object({
  pinnedFolders: z.array(z.string()).default([]),
})
export type FilesPrefs = z.infer<typeof FilesPrefsSchema>

export const FavoriteGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1).default('#3b82f6'),
  order: z.number().int().default(0),
})
export type FavoriteGroup = z.infer<typeof FavoriteGroupSchema>

export const FavoriteFolderSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  order: z.number().int().default(0),
  createdAt: z.number().nonnegative().default(0),
})
export type FavoriteFolder = z.infer<typeof FavoriteFolderSchema>

export const FavoritesStateSchema = z.object({
  version: z.literal(1).default(1),
  groups: z.array(FavoriteGroupSchema).default([]),
  items: z.array(FavoriteFolderSchema).default([]),
})
export type FavoritesState = z.infer<typeof FavoritesStateSchema>

export const TagDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1).default('#3b82f6'),
  description: z.string().default(''),
  createdAt: z.number().nonnegative().default(0),
})
export type TagDef = z.infer<typeof TagDefSchema>

export const FileMetaRecordSchema = z.object({
  path: z.string().min(1),
  rating: z.number().int().min(0).max(5).default(0),
  tagIds: z.array(z.string()).default([]),
  note: z.string().default(''),
  updatedAt: z.number().nonnegative().default(0),
})
export type FileMetaRecord = z.infer<typeof FileMetaRecordSchema>

export const MetadataStateSchema = z.object({
  version: z.literal(1).default(1),
  tags: z.array(TagDefSchema).default([]),
  files: z.record(z.string(), FileMetaRecordSchema).default({}),
})
export type MetadataState = z.infer<typeof MetadataStateSchema>

export interface MetadataSnapshot {
  readonly tags: readonly TagDef[]
  readonly files: Readonly<Record<string, FileMetaRecord>>
  readonly tagCounts: Readonly<Record<string, number>>
}

export interface TagFilesResult {
  readonly tag: TagDef
  readonly entries: readonly FileEntry[]
  readonly missingPaths: readonly string[]
  readonly totalCount: number
}
