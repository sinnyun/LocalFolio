export type FileCategory =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'code'
  | 'archive'
  | 'other'

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

export interface RootsResult {
  readonly homePath: string
  readonly platform: string
  readonly quickFolders: readonly QuickFolder[]
  readonly drives: readonly DriveInfo[]
  readonly pinnedFolders: readonly string[]
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

export interface FavoriteGroup {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly order: number
}

export interface FavoriteFolder {
  readonly id: string
  readonly groupId: string
  readonly name: string
  readonly path: string
  readonly order: number
  readonly createdAt: number
}

export interface FavoritesState {
  readonly version: 1
  readonly groups: readonly FavoriteGroup[]
  readonly items: readonly FavoriteFolder[]
}

export interface TagDef {
  readonly id: string
  readonly name: string
  readonly color: string
  readonly description: string
  readonly createdAt: number
}

export interface FileMetaRecord {
  readonly path: string
  readonly rating: number
  readonly tagIds: readonly string[]
  readonly note: string
  readonly updatedAt: number
}

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

export type ViewMode = 'grid' | 'list'
export type GroupBy = 'none' | 'time' | 'type' | 'name' | 'parent'
export type SortBy = 'name' | 'mtime' | 'size' | 'type' | 'rating'
export type SortDir = 'asc' | 'desc'
export type CategoryFilter = 'all' | FileCategory
export type PaneId = 'left' | 'right'

export type PaneLocation =
  | { readonly kind: 'directory'; readonly path: string }
  | { readonly kind: 'tag'; readonly tagId: string }

export interface PaneState {
  readonly id: PaneId
  readonly mode: 'directory' | 'tag'
  readonly activeTagId: string | null
  readonly missingPaths: readonly string[]
  readonly path: string
  readonly parentPath: string | null
  readonly breadcrumbs: readonly BreadcrumbItem[]
  readonly entries: readonly FileEntry[]
  readonly childGroups: readonly DirChildGroup[]
  readonly totalEntries: number
  readonly truncated: boolean
  readonly history: readonly PaneLocation[]
  readonly historyIndex: number
  readonly filterQuery: string
  readonly categoryFilter: CategoryFilter
  readonly minRating: number
  readonly viewMode: ViewMode
  readonly gridSize: number
  readonly groupBy: GroupBy
  readonly sortBy: SortBy
  readonly sortDir: SortDir
  readonly showHidden: boolean
  readonly loading: boolean
  readonly error: string | null
  readonly selectedPath: string | null
}

export interface FileGroup {
  readonly key: string
  readonly title: string
  readonly folderPath?: string
  readonly entries: readonly FileEntry[]
  readonly totalCount: number
  readonly truncated: boolean
  readonly isSubfolder: boolean
}
