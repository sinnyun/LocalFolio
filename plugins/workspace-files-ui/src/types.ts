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

export type ViewMode = 'grid' | 'list'
export type GroupBy = 'none' | 'time' | 'type' | 'name' | 'parent'
export type SortBy = 'name' | 'mtime' | 'size' | 'type'
export type SortDir = 'asc' | 'desc'
export type CategoryFilter = 'all' | FileCategory
export type PaneId = 'left' | 'right'

export interface PaneState {
  readonly id: PaneId
  readonly path: string
  readonly parentPath: string | null
  readonly breadcrumbs: readonly BreadcrumbItem[]
  readonly entries: readonly FileEntry[]
  readonly childGroups: readonly DirChildGroup[]
  readonly totalEntries: number
  readonly truncated: boolean
  readonly history: readonly string[]
  readonly historyIndex: number
  readonly filterQuery: string
  readonly categoryFilter: CategoryFilter
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
