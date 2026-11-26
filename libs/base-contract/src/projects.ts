import type * as React from 'react'
import type { TaskSnapshot } from './tasks.js'

export type ProjectArchiveSourceDisposal = 'recycle' | 'keep' | 'delete'

export interface ProjectArchiveExtractedFile {
  readonly relPath: string
  readonly fingerprint: string
  readonly originalFingerprint: string
  readonly extractedAt: number
}

export interface ProjectArchiveMetaInfo {
  readonly mode: 'none' | 'archived'
  readonly engine: string
  readonly archiveFileName: string
  readonly archiveBytes: number
  readonly originalBytes: number
  readonly archivedFileCount: number
  readonly archivedAt: number
  readonly verifiedAt: number | null
  readonly sourceDisposal: ProjectArchiveSourceDisposal
  readonly versions: number
  readonly extractedFiles?: readonly ProjectArchiveExtractedFile[]
}

export interface ProjectHostRecord {
  readonly id: string
  readonly libraryId: string
  readonly name: string
  readonly path: string
  readonly fileCount: number
  readonly totalBytes: number
  readonly archived: boolean
  readonly archiveBytes: number | null
  readonly archiveFileName: string | null
}

export interface ProjectHostFileInfo {
  readonly relPath: string
  readonly name: string
  readonly size: number
  readonly fingerprint: string
  readonly thumbKey: string
  readonly thumbSupported: boolean
}

export interface ProjectArchivedLiveFileItem {
  readonly relPath: string
  readonly name: string
  readonly size: number
  readonly mtimeMs: number
  readonly fingerprint: string
  readonly thumbKey: string
  readonly thumbSupported: boolean
}

export interface ProjectArchivedLiveInspection {
  readonly projectId: string
  readonly archived: boolean
  readonly cleanExtracted: readonly ProjectArchivedLiveFileItem[]
  readonly modifiedExtracted: readonly ProjectArchivedLiveFileItem[]
  readonly addedFiles: readonly ProjectArchivedLiveFileItem[]
}

export interface ProjectHostManifestSnapshot {
  readonly projectId: string
  readonly name: string
  readonly archive: ProjectArchiveMetaInfo | null
  readonly stats: {
    readonly fileCount: number
    readonly folderCount: number
    readonly totalBytes: number
  }
  readonly files: readonly ProjectHostFileInfo[]
}

export interface ProjectFileResolveContext {
  readonly project: ProjectHostRecord
  readonly relPath: string
  readonly thumbKey?: string
  readonly archive: ProjectArchiveMetaInfo | null
  readonly signal?: AbortSignal
}

export interface ProjectFileResolver {
  readonly id: string
  readonly order?: number
  resolveForOpen?(
    ctx: ProjectFileResolveContext,
  ): Promise<{ readonly localPath: string; readonly extractedFromArchive?: boolean } | null>
  resolveForMedia?(
    ctx: ProjectFileResolveContext,
  ): Promise<{ readonly localPath: string } | null>
  resolveForReveal?(
    ctx: ProjectFileResolveContext,
  ): Promise<{ readonly localPath: string } | null>
}

/**
 * Host Cordis service (`ctx.folioProjectsHost`) provided by `@folio/workspace-projects-host`.
 * Exposes project lookup, thumbnail pre-warming, archive snapshot persistence,
 * and file resolvers so external feature plugins remain cleanly decoupled.
 */
export interface FolioProjectsHostService {
  resolveProject(projectId: string): Promise<ProjectHostRecord | null>
  listProjects(): Promise<readonly ProjectHostRecord[]>
  readProjectSnapshot(projectId: string): Promise<ProjectHostManifestSnapshot | null>
  warmProjectThumbs(
    projectId: string,
    options?: {
      readonly signal?: AbortSignal
      readonly hideMetaDir?: boolean
      readonly onProgress?: (done: number, total: number, currentRelPath: string) => void
    },
  ): Promise<{ readonly total: number; readonly warmed: number }>
  warmProjectFileThumbs(
    projectId: string,
    relPaths: readonly string[],
    options?: {
      readonly signal?: AbortSignal
      readonly hideMetaDir?: boolean
      readonly onProgress?: (done: number, total: number, currentRelPath: string) => void
    },
  ): Promise<{ readonly total: number; readonly warmed: number }>
  inspectArchivedLiveFiles(projectId: string): Promise<ProjectArchivedLiveInspection>
  commitArchivedDeltaFiles(
    projectId: string,
    options: {
      readonly deltaRelPaths: readonly string[]
      readonly archive: ProjectArchiveMetaInfo
      readonly hideMetaDir?: boolean
    },
  ): Promise<void>
  updateProjectArchiveMeta(
    projectId: string,
    archive: ProjectArchiveMetaInfo | null,
    options?: { readonly rescanIfLive?: boolean; readonly hideMetaDir?: boolean },
  ): Promise<void>
  setProjectMetaDirHidden(projectPath: string, hidden: boolean): Promise<boolean>
  registerFileResolver(resolver: ProjectFileResolver): () => void
}

export interface ProjectsUiProjectInfo {
  readonly id: string
  readonly libraryId: string
  readonly name: string
  readonly path: string
  readonly fileCount: number
  readonly totalBytes: number
  readonly archived?: boolean
  readonly archiveBytes?: number | null
  readonly archiveFileName?: string | null
  readonly hasChanges?: boolean
}

export interface ProjectsUiFileInfo {
  readonly relPath: string
  readonly name: string
  readonly ext: string
  readonly category: string
  readonly size: number
  readonly thumbKey: string
  readonly thumbSupported: boolean
}

export interface ProjectsUiContextMenuAction {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
  readonly danger?: boolean
  readonly separatorBefore?: boolean
  readonly run: () => void | Promise<void>
}

export interface ProjectsUiExtensionContext {
  readonly selectedProject: ProjectsUiProjectInfo | null
  readonly projectArchive: ProjectArchiveMetaInfo | null
  readonly selectedFile: ProjectsUiFileInfo | null
  notify(message: string, ok?: boolean): void
  refreshProjects(): Promise<void>
  refreshSelectedProject(): Promise<void>
  onTaskEnqueued(task: TaskSnapshot): void
  openFile(file: ProjectsUiFileInfo): Promise<void>
  revealPath(relPath?: string): Promise<void>
}

export interface ProjectsUiExtension {
  readonly id: string
  readonly order?: number
  renderToolbarActions?(ctx: ProjectsUiExtensionContext): React.ReactNode
  renderChangeBannerActions?(ctx: ProjectsUiExtensionContext): React.ReactNode
  renderProjectBadges?(
    project: ProjectsUiProjectInfo,
    variant?: 'sidebar' | 'header',
  ): React.ReactNode
  renderInspectorSection?(ctx: ProjectsUiExtensionContext): React.ReactNode
  renderFileActions?(
    ctx: ProjectsUiExtensionContext,
    file: ProjectsUiFileInfo,
  ): React.ReactNode
  getFileContextMenuActions?(
    ctx: ProjectsUiExtensionContext,
    file: ProjectsUiFileInfo,
  ): readonly ProjectsUiContextMenuAction[]
  getProjectContextMenuActions?(
    ctx: ProjectsUiExtensionContext,
    project: ProjectsUiProjectInfo,
  ): readonly ProjectsUiContextMenuAction[]
  formatOpenSuccessMessage?(
    file: ProjectsUiFileInfo,
    result: { readonly openedPath: string; readonly extractedFromArchive?: boolean },
  ): string | null
}

/**
 * Frontend Cordis extension registry (`ctx.folioProjects`) provided by `@folio/workspace-projects-ui`.
 */
export interface FolioProjectsUiService {
  registerExtension(ext: ProjectsUiExtension): () => void
  listExtensions(): readonly ProjectsUiExtension[]
  subscribe(listener: () => void): () => void
}
