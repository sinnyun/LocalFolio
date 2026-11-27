import * as React from 'react'
import {
  type LightboxState,
  useLightboxState,
} from '@folio/base-collection-ui/client'
import type {
  FolioInteractionsService,
  FolioProjectsUiService,
  FrameProviderProps,
  ProjectsUiExtension,
  ProjectsUiExtensionContext,
  ProjectsUiFileInfo,
  TaskSnapshot,
} from '@folio/base-contract'
import { rpcCall, useActionQuery } from '@folio/base-contract/rpc'
import { copyTextToClipboard } from '@folio/base-metadata-ui/client'
import { useFolioTasks } from '@folio/base-tasks-ui/client'
import { useProjectsExtensions } from './extension-registry.js'
import { buildProjectMediaUrl, filterProjects, sortProjects } from './format.js'
import type {
  AiExtractionOutput,
  AiStatusResult,
  CardZoom,
  CategoryFilter,
  FileGroupBy,
  FileSortKey,
  FileViewMode,
  LibraryIndex,
  LibraryRoot,
  ProjectAiSamplePreview,
  ProjectCheckResult,
  ProjectDetailResult,
  ProjectFileEntry,
  ProjectManifest,
  ProjectSummary,
  SortDir,
  SortMode,
} from './types.js'

const FILE_VIEW_PREFS_KEY = 'folio.projects.ui.v1'

interface PersistedFileViewPrefs {
  readonly viewMode?: FileViewMode
  readonly cardSize?: number
  readonly groupBy?: FileGroupBy
  readonly sortKey?: FileSortKey
  readonly sortDir?: SortDir
}

interface FileViewPrefs extends Required<PersistedFileViewPrefs> {}

function readFileViewPrefs(): FileViewPrefs {
  const defaults: FileViewPrefs = {
    viewMode: 'grid',
    cardSize: 176,
    groupBy: 'folder',
    sortKey: 'name',
    sortDir: 'asc',
  }
  if (typeof window === 'undefined') return defaults
  try {
    const raw = window.localStorage.getItem(FILE_VIEW_PREFS_KEY)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as PersistedFileViewPrefs
    return {
      viewMode:
        parsed.viewMode === 'waterfall' ||
        parsed.viewMode === 'equal' ||
        parsed.viewMode === 'list'
          ? parsed.viewMode
          : 'grid',
      cardSize:
        typeof parsed.cardSize === 'number' && parsed.cardSize >= 96 && parsed.cardSize <= 320
          ? parsed.cardSize
          : defaults.cardSize,
      groupBy:
        parsed.groupBy === 'none' ||
        parsed.groupBy === 'time' ||
        parsed.groupBy === 'type' ||
        parsed.groupBy === 'name'
          ? parsed.groupBy
          : 'folder',
      sortKey:
        parsed.sortKey === 'mtime' || parsed.sortKey === 'size' || parsed.sortKey === 'type'
          ? parsed.sortKey
          : 'name',
      sortDir: parsed.sortDir === 'desc' ? 'desc' : 'asc',
    }
  } catch {
    return defaults
  }
}

function writeFileViewPrefs(prefs: PersistedFileViewPrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(FILE_VIEW_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore quota / storage errors
  }
}

export interface ProjectsContextValue {
  readonly indexLoading: boolean
  readonly indexError: string | null
  readonly libraries: readonly LibraryRoot[]
  readonly activeLibraryId: string
  readonly activeLibrary: LibraryRoot | null
  readonly projects: readonly ProjectSummary[]
  readonly filteredProjects: readonly ProjectSummary[]
  readonly allProjects: readonly ProjectSummary[]
  readonly availableTags: readonly string[]
  readonly overviewActive: boolean
  readonly overviewShowAll: boolean
  readonly overviewScopeProjects: readonly ProjectSummary[]
  readonly overviewProjects: readonly ProjectSummary[]
  readonly overviewAvailableTags: readonly string[]
  readonly overviewSearchQuery: string
  readonly overviewTagFilter: string | null
  readonly overviewOnlyChanged: boolean
  readonly overviewCardZoom: CardZoom
  readonly overviewSortMode: SortMode
  readonly selectedProjectId: string | null
  readonly selectedProject: ProjectSummary | null
  readonly thumbnailRevision: string | undefined
  readonly detailLoading: boolean
  readonly projectManifest: ProjectManifest | null
  readonly selectedFile: ProjectFileEntry | null
  readonly searchQuery: string
  readonly tagFilter: string | null
  readonly onlyChanged: boolean
  readonly fileSearchQuery: string
  readonly categoryFilter: CategoryFilter
  readonly viewMode: FileViewMode
  readonly cardSize: number
  readonly groupBy: FileGroupBy
  readonly sortKey: FileSortKey
  readonly sortDir: SortDir
  readonly addDialogOpen: boolean
  readonly syncingProjectId: string | null
  readonly checkingProjectId: string | null
  readonly extractingProjectId: string | null
  readonly aiStatus: AiStatusResult | null
  readonly aiApplyCover: boolean
  readonly batchMode: boolean
  readonly selectedProjectIds: ReadonlySet<string>
  readonly tasks: readonly TaskSnapshot[]
  readonly activeTask: TaskSnapshot | null
  readonly recentFinishedTask: TaskSnapshot | null
  readonly extensions: readonly ProjectsUiExtension[]
  readonly extensionContext: ProjectsUiExtensionContext
  readonly lightbox: LightboxState
  setActiveLibraryId(libraryId: string): void
  showAllProjects(): void
  selectLibrary(libraryId: string): void
  openProject(projectId: string): void
  closeProject(): void
  selectProject(projectId: string | null): void
  selectFile(file: ProjectFileEntry | null): void
  setOverviewSearchQuery(q: string): void
  setOverviewTagFilter(tag: string | null): void
  setOverviewOnlyChanged(only: boolean): void
  setOverviewCardZoom(zoom: CardZoom): void
  setOverviewSortMode(mode: SortMode): void
  setSearchQuery(q: string): void
  setTagFilter(tag: string | null): void
  setOnlyChanged(only: boolean): void
  setFileSearchQuery(q: string): void
  setCategoryFilter(cat: CategoryFilter): void
  setViewMode(mode: FileViewMode): void
  setCardSize(size: number): void
  setGroupBy(groupBy: FileGroupBy): void
  setSortKey(key: FileSortKey): void
  setSortDir(dir: SortDir): void
  setAddDialogOpen(open: boolean): void
  pickAndAddLibrary(): Promise<void>
  addLibraryByPath(rootPath: string, name?: string): Promise<boolean>
  rescanLibrary(libraryId?: string): Promise<void>
  removeLibrary(libraryId: string): Promise<void>
  checkSelectedChanges(): Promise<void>
  syncSelectedProject(): Promise<void>
  updateProjectMeta(patch: {
    readonly summary?: string
    readonly projectType?: string
    readonly tags?: readonly string[]
    readonly coverRelPath?: string | null
  }): Promise<void>
  openFile(file: ProjectFileEntry): Promise<void>
  revealPath(relPath?: string): Promise<void>
  openLightboxForFile(file: ProjectFileEntry): void
  setLightboxOpen(open: boolean): void
  setLightboxIndex(index: number): void
  setAiApplyCover(apply: boolean): void
  previewSelectedAiSample(): Promise<ProjectAiSamplePreview | null>
  extractSelectedWithAi(applyCover?: boolean): Promise<void>
  extractBatchWithAi(opts?: {
    readonly libraryId?: string
    readonly projectIds?: readonly string[]
    readonly onlyUnextracted?: boolean
    readonly applyCover?: boolean
  }): Promise<void>
  batchTagProjects(
    projectIds: readonly string[],
    addTags: readonly string[],
    removeTags?: readonly string[],
  ): Promise<number>
  batchSyncProjects(opts?: {
    readonly libraryId?: string
    readonly projectIds?: readonly string[]
    readonly onlyChanged?: boolean
  }): Promise<void>
  toggleBatchMode(): void
  toggleProjectChecked(projectId: string): void
  selectAllFilteredProjects(): void
  selectAllOverviewProjects(): void
  clearCheckedProjects(): void
  openFileContextMenu(file: ProjectFileEntry, clientX: number, clientY: number): void
  openProjectContextMenu(project: ProjectSummary, clientX: number, clientY: number): void
  pauseTask(taskId: string): Promise<void>
  resumeTask(taskId: string): Promise<void>
  cancelTask(taskId: string): Promise<void>
  clearFinishedTasks(): Promise<void>
  refreshIndex(): Promise<void>
}

const ProjectsContext = React.createContext<ProjectsContextValue | null>(null)

export function useProjects(): ProjectsContextValue {
  const ctx = React.useContext(ProjectsContext)
  if (!ctx) {
    throw new Error('useProjects must be used inside ProjectsProvider')
  }
  return ctx
}

export interface ProjectsProviderProps extends FrameProviderProps {
  readonly getInteractions?: () => FolioInteractionsService | undefined
  readonly projectsUiService?: FolioProjectsUiService
}

const EMPTY_INDEX: LibraryIndex = { version: 1, libraries: [], projects: [] }

export function ProjectsProvider({
  children,
  getInteractions,
  projectsUiService,
}: ProjectsProviderProps): React.ReactElement {
  const extensions = useProjectsExtensions(projectsUiService)
  const interactions = getInteractions?.()
  const notify = React.useCallback(
    (msg: string, ok = true) => {
      interactions?.notify(msg, ok)
    },
    [interactions],
  )

  const indexQuery = useActionQuery<LibraryIndex>('projects.libraries.list')
  const indexData = indexQuery.data ?? EMPTY_INDEX
  const aiStatusQuery = useActionQuery<AiStatusResult>('projects.ai.status')

  const [activeLibraryId, setActiveLibraryId] = React.useState<string>('')
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null)
  const [projectManifest, setProjectManifest] = React.useState<ProjectManifest | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)
  const [selectedFile, setSelectedFile] = React.useState<ProjectFileEntry | null>(null)

  const [searchQuery, setSearchQuery] = React.useState('')
  const [tagFilter, setTagFilter] = React.useState<string | null>(null)
  const [onlyChanged, setOnlyChanged] = React.useState(false)
  const [fileSearchQuery, setFileSearchQuery] = React.useState('')
  const [categoryFilter, setCategoryFilter] = React.useState<CategoryFilter>('all')
  const [fileViewPrefs] = React.useState<FileViewPrefs>(() => readFileViewPrefs())
  const [viewMode, setViewMode] = React.useState<FileViewMode>(fileViewPrefs.viewMode)
  const [cardSize, setCardSize] = React.useState(fileViewPrefs.cardSize)
  const [groupBy, setGroupBy] = React.useState<FileGroupBy>(fileViewPrefs.groupBy)
  const [sortKey, setSortKey] = React.useState<FileSortKey>(fileViewPrefs.sortKey)
  const [sortDir, setSortDir] = React.useState<SortDir>(fileViewPrefs.sortDir)
  const [addDialogOpen, setAddDialogOpen] = React.useState(false)
  const [syncingProjectId, setSyncingProjectId] = React.useState<string | null>(null)
  const [checkingProjectId, setCheckingProjectId] = React.useState<string | null>(null)
  const [extractingProjectId, setExtractingProjectId] = React.useState<string | null>(null)
  const [aiApplyCover, setAiApplyCover] = React.useState(true)
  const [batchMode, setBatchMode] = React.useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = React.useState<Set<string>>(() => new Set())
  const [overviewShowAll, setOverviewShowAll] = React.useState(true)
  const [overviewSearchQuery, setOverviewSearchQuery] = React.useState('')
  const [overviewTagFilter, setOverviewTagFilter] = React.useState<string | null>(null)
  const [overviewOnlyChanged, setOverviewOnlyChanged] = React.useState(false)
  const [overviewCardZoom, setOverviewCardZoom] = React.useState<CardZoom>('md')
  const [overviewSortMode, setOverviewSortMode] = React.useState<SortMode>('name')

  const {
    lightbox,
    openLightboxForItem,
    setLightboxOpen,
    setLightboxIndex,
  } = useLightboxState()

  React.useEffect(() => {
    writeFileViewPrefs({ viewMode, cardSize, groupBy, sortKey, sortDir })
  }, [viewMode, cardSize, groupBy, sortKey, sortDir])

  // Keep activeLibraryId valid as libraries load/change
  React.useEffect(() => {
    const libs = indexData.libraries
    if (libs.length === 0) {
      if (activeLibraryId !== '') setActiveLibraryId('')
      return
    }
    if (!activeLibraryId || !libs.some(l => l.id === activeLibraryId)) {
      setActiveLibraryId(libs[0]!.id)
    }
  }, [indexData.libraries, activeLibraryId])

  const libraryProjects = React.useMemo(() => {
    if (!activeLibraryId) return indexData.projects
    return indexData.projects.filter(p => p.libraryId === activeLibraryId)
  }, [indexData.projects, activeLibraryId])

  const availableTags = React.useMemo(() => {
    const set = new Set<string>()
    for (const p of libraryProjects) {
      for (const tag of p.tags) set.add(tag)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [libraryProjects])

  const filteredProjects = React.useMemo(
    () => filterProjects(libraryProjects, searchQuery, tagFilter, onlyChanged),
    [libraryProjects, onlyChanged, tagFilter, searchQuery],
  )

  const overviewScopeProjects = React.useMemo(
    () => (overviewShowAll ? indexData.projects : libraryProjects),
    [overviewShowAll, indexData.projects, libraryProjects],
  )

  const overviewAvailableTags = React.useMemo(() => {
    const set = new Set<string>()
    for (const p of overviewScopeProjects) {
      for (const tag of p.tags) set.add(tag)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [overviewScopeProjects])

  const overviewProjects = React.useMemo(
    () =>
      sortProjects(
        filterProjects(
          overviewScopeProjects,
          overviewSearchQuery,
          overviewTagFilter,
          overviewOnlyChanged,
        ),
        overviewSortMode,
      ),
    [
      overviewScopeProjects,
      overviewSearchQuery,
      overviewTagFilter,
      overviewOnlyChanged,
      overviewSortMode,
    ],
  )

  const showAllProjects = React.useCallback(() => {
    setOverviewShowAll(true)
  }, [])

  const selectLibrary = React.useCallback((libraryId: string) => {
    setActiveLibraryId(libraryId)
    setOverviewShowAll(false)
  }, [])

  const openProject = React.useCallback(
    (projectId: string) => {
      const project = indexData.projects.find(p => p.id === projectId)
      if (!project) return
      setActiveLibraryId(project.libraryId)
      setSelectedProjectId(projectId)
    },
    [indexData.projects],
  )

  const closeProject = React.useCallback(() => {
    setSelectedProjectId(null)
  }, [])

  // Keep the open project valid without forcing one open: the library overview
  // (project card grid) is the default surface.
  React.useEffect(() => {
    if (!selectedProjectId) return
    if (!indexData.projects.some(p => p.id === selectedProjectId)) {
      setSelectedProjectId(null)
    }
  }, [indexData.projects, selectedProjectId])

  const selectedProject = React.useMemo(
    () => indexData.projects.find(p => p.id === selectedProjectId) ?? null,
    [indexData.projects, selectedProjectId],
  )

  const activeLibrary = React.useMemo(
    () => indexData.libraries.find(l => l.id === activeLibraryId) ?? null,
    [indexData.libraries, activeLibraryId],
  )

  // Fetch project detail when selectedProjectId changes
  const loadProjectDetail = React.useCallback(async (projectId: string) => {
    setDetailLoading(true)
    try {
      const res = await rpcCall<ProjectDetailResult>('projects.detail.get', { projectId })
      setProjectManifest(res.manifest)
      setSelectedFile(prev =>
        prev
          ? res.manifest.groups.flatMap(g => g.files).find(f => f.relPath === prev.relPath) ?? null
          : null,
      )
    } catch (err) {
      setProjectManifest(null)
      notify(err instanceof Error ? err.message : '加载项目详情失败', false)
    } finally {
      setDetailLoading(false)
    }
  }, [notify])

  React.useEffect(() => {
    if (!selectedProjectId) {
      setProjectManifest(null)
      setSelectedFile(null)
      return
    }
    setSelectedFile(null)
    void loadProjectDetail(selectedProjectId)
  }, [selectedProjectId, loadProjectDetail])

  const {
    tasks,
    activeTask,
    recentFinishedTask,
    trackTask,
    pauseTask,
    resumeTask,
    cancelTask,
    clearFinishedTasks,
  } = useFolioTasks({
    scopes: ['projects', 'thumbs-eagle'],
    onTaskCompleted: snap => {
      if (snap.queue !== 'projects-scan' && snap.queue !== 'projects-ai') {
        void indexQuery.refetch()
        if (selectedProjectId) {
          void loadProjectDetail(selectedProjectId).catch(() => {})
        }
      }
    },
  })
  const rebuiltThumbs = tasks.find(task =>
    task.meta?.mode === 'archive-thumbs' &&
    task.meta.projectId === selectedProjectId &&
    task.finishedAt !== null &&
    Number(task.progress.detail?.succeeded ?? 0) > 0,
  )
  const thumbnailRevision = rebuiltThumbs?.id

  const addLibraryByPath = React.useCallback(
    async (rootPath: string, name?: string): Promise<boolean> => {
      try {
        const res = await rpcCall<{ library: LibraryRoot; task: TaskSnapshot }>(
          'projects.libraries.add',
          { rootPath, name },
        )
        setActiveLibraryId(res.library.id)
        setOverviewShowAll(false)
        trackTask(res.task)
        await indexQuery.refetch()
        notify(`已添加项目库「${res.library.name}」，后台扫描中…`)
        return true
      } catch (err) {
        notify(err instanceof Error ? err.message : '添加项目库失败', false)
        return false
      }
    },
    [indexQuery, notify, trackTask],
  )

  const pickAndAddLibrary = React.useCallback(async () => {
    try {
      const pick = await rpcCall<{
        supported: boolean
        cancelled: boolean
        folderPath: string | null
      }>('projects.libraries.pickFolder', {})
      if (!pick.supported) {
        setAddDialogOpen(true)
        return
      }
      if (pick.cancelled || !pick.folderPath) return
      await addLibraryByPath(pick.folderPath)
    } catch {
      setAddDialogOpen(true)
    }
  }, [addLibraryByPath])

  const rescanLibrary = React.useCallback(
    async (libraryId?: string) => {
      const targetId = libraryId ?? activeLibraryId
      if (!targetId) return
      try {
        const res = await rpcCall<{ library: LibraryRoot; task: TaskSnapshot }>(
          'projects.libraries.rescan',
          { libraryId: targetId },
        )
        trackTask(res.task)
        notify(`已启动「${res.library.name}」变更扫描`)
      } catch (err) {
        notify(err instanceof Error ? err.message : '启动扫描失败', false)
      }
    },
    [activeLibraryId, notify, trackTask],
  )

  const removeLibrary = React.useCallback(
    async (libraryId: string) => {
      try {
        await rpcCall('projects.libraries.remove', { libraryId })
        await indexQuery.refetch()
        notify('已从项目库列表移除（磁盘文件未改动）')
      } catch (err) {
        notify(err instanceof Error ? err.message : '移除项目库失败', false)
      }
    },
    [indexQuery, notify],
  )

  const checkSelectedChanges = React.useCallback(async () => {
    if (!selectedProjectId) return
    setCheckingProjectId(selectedProjectId)
    try {
      const res = await rpcCall<ProjectCheckResult>('projects.checkChanges', {
        projectId: selectedProjectId,
      })
      await indexQuery.refetch()
      if (res.hasChanges) {
        notify(
          `检测到变更：+${res.changeSummary.added} / ~${res.changeSummary.modified} / -${res.changeSummary.removed}`,
        )
      } else if ((res.extractedUnmodified ?? 0) > 0) {
        notify(
          `检测到 ${res.extractedUnmodified} 个从归档提取的文件（未修改），无增量变更，可直接清理`,
        )
      } else {
        notify('项目文件与元数据一致，无需更新')
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : '检测变更失败', false)
    } finally {
      setCheckingProjectId(null)
    }
  }, [selectedProjectId, indexQuery, notify])

  const syncSelectedProject = React.useCallback(async () => {
    if (!selectedProjectId) return
    setSyncingProjectId(selectedProjectId)
    try {
      const res = await rpcCall<ProjectDetailResult>('projects.sync', {
        projectId: selectedProjectId,
      })
      setProjectManifest(res.manifest)
      await indexQuery.refetch()
      notify(`已完成「${res.summary.name}」增量更新`)
    } catch (err) {
      notify(err instanceof Error ? err.message : '增量更新失败', false)
    } finally {
      setSyncingProjectId(null)
    }
  }, [selectedProjectId, indexQuery, notify])

  const updateProjectMeta = React.useCallback(
    async (patch: {
      readonly summary?: string
      readonly projectType?: string
      readonly tags?: readonly string[]
      readonly coverRelPath?: string | null
    }) => {
      if (!selectedProjectId) return
      try {
        const res = await rpcCall<ProjectDetailResult>('projects.meta.update', {
          projectId: selectedProjectId,
          ...patch,
        })
        setProjectManifest(res.manifest)
        await indexQuery.refetch()
        notify('已保存项目元数据')
      } catch (err) {
        notify(err instanceof Error ? err.message : '保存元数据失败', false)
      }
    },
    [selectedProjectId, indexQuery, notify],
  )

  const openFile = React.useCallback(
    async (file: ProjectsUiFileInfo) => {
      if (!selectedProjectId) return
      try {
        const res = await rpcCall<{ openedPath: string; extractedFromArchive?: boolean }>(
          'projects.file.open',
          {
            projectId: selectedProjectId,
            relPath: file.relPath,
          },
        )
        for (const ext of extensions) {
          const msg = ext.formatOpenSuccessMessage?.(file, res)
          if (msg) {
            notify(msg, true)
            break
          }
        }
      } catch (err) {
        notify(err instanceof Error ? err.message : '打开文件失败', false)
      }
    },
    [selectedProjectId, extensions, notify],
  )

  const revealPath = React.useCallback(
    async (relPath?: string) => {
      if (!selectedProjectId) return
      try {
        await rpcCall('projects.file.reveal', {
          projectId: selectedProjectId,
          ...(relPath ? { relPath } : {}),
        })
      } catch (err) {
        notify(err instanceof Error ? err.message : '定位路径失败', false)
      }
    },
    [selectedProjectId, notify],
  )

  const openLightboxForFile = React.useCallback(
    (file: ProjectFileEntry) => {
      if (!selectedProjectId || !projectManifest) return
      const imageFiles = projectManifest.groups
        .flatMap(g => g.files)
        .filter(f => f.category === 'image')
      openLightboxForItem(
        imageFiles,
        file,
        img => ({
          src: buildProjectMediaUrl(selectedProjectId, img.relPath),
          alt: img.name,
          caption: img.relPath,
        }),
        (a, b) => a.relPath === b.relPath,
      )
    },
    [selectedProjectId, projectManifest, openLightboxForItem],
  )

  const copyText = React.useCallback(
    async (text: string, label: string) => {
      const ok = await copyTextToClipboard(text)
      if (ok) {
        notify(`已复制${label}`)
      } else {
        notify(`复制${label}失败`, false)
      }
    },
    [notify],
  )

  const previewSelectedAiSample = React.useCallback(async (): Promise<ProjectAiSamplePreview | null> => {
    if (!selectedProjectId) return null
    try {
      return await rpcCall<ProjectAiSamplePreview>('projects.ai.previewSample', {
        projectId: selectedProjectId,
      })
    } catch (err) {
      notify(err instanceof Error ? err.message : '获取 AI 采样预览失败', false)
      return null
    }
  }, [selectedProjectId, notify])

  const extractProjectById = React.useCallback(
    async (projectId: string, applyCover = aiApplyCover) => {
      setExtractingProjectId(projectId)
      try {
        const res = await rpcCall<{ detail: ProjectDetailResult; extracted: AiExtractionOutput }>(
          'projects.ai.extract',
          { projectId, applyCover },
        )
        if (projectId === selectedProjectId) {
          setProjectManifest(res.detail.manifest)
        }
        await indexQuery.refetch()
        notify(`已完成「${res.detail.summary.name}」AI 提取`)
      } catch (err) {
        notify(err instanceof Error ? err.message : 'AI 提取失败', false)
        if (projectId === selectedProjectId) {
          await loadProjectDetail(projectId).catch(() => {})
        }
      } finally {
        setExtractingProjectId(null)
      }
    },
    [aiApplyCover, selectedProjectId, indexQuery, notify, loadProjectDetail],
  )

  const extractSelectedWithAi = React.useCallback(
    async (applyCover = aiApplyCover) => {
      if (!selectedProjectId) return
      await extractProjectById(selectedProjectId, applyCover)
    },
    [selectedProjectId, aiApplyCover, extractProjectById],
  )

  const extractBatchWithAi = React.useCallback(
    async (
      opts: {
        readonly libraryId?: string
        readonly projectIds?: readonly string[]
        readonly onlyUnextracted?: boolean
        readonly applyCover?: boolean
      } = {},
    ) => {
      try {
        const res = await rpcCall<{ task: TaskSnapshot | null; total: number }>(
          'projects.ai.extractBatch',
          {
            libraryId: opts.libraryId,
            projectIds: opts.projectIds ? [...opts.projectIds] : undefined,
            onlyUnextracted: opts.onlyUnextracted ?? false,
            applyCover: opts.applyCover ?? aiApplyCover,
          },
        )
        if (!res.task || res.total === 0) {
          notify('没有符合条件的待提取项目')
          return
        }
        trackTask(res.task)
        notify(`已加入 AI 批量提取队列（共 ${res.total} 个项目）`)
      } catch (err) {
        notify(err instanceof Error ? err.message : '启动 AI 批量提取失败', false)
      }
    },
    [aiApplyCover, notify, trackTask],
  )

  const batchTagProjects = React.useCallback(
    async (
      projectIds: readonly string[],
      addTags: readonly string[],
      removeTags: readonly string[] = [],
    ): Promise<number> => {
      if (projectIds.length === 0) return 0
      try {
        const res = await rpcCall<{ updatedCount: number }>('projects.batch.tag', {
          projectIds: [...projectIds],
          addTags: [...addTags],
          removeTags: [...removeTags],
        })
        await indexQuery.refetch()
        if (selectedProjectId && projectIds.includes(selectedProjectId)) {
          await loadProjectDetail(selectedProjectId)
        }
        notify(`已批量更新 ${res.updatedCount} 个项目的标签`)
        return res.updatedCount
      } catch (err) {
        notify(err instanceof Error ? err.message : '批量更新标签失败', false)
        return 0
      }
    },
    [indexQuery, selectedProjectId, loadProjectDetail, notify],
  )

  const batchSyncProjects = React.useCallback(
    async (
      opts: {
        readonly libraryId?: string
        readonly projectIds?: readonly string[]
        readonly onlyChanged?: boolean
      } = {},
    ) => {
      try {
        const res = await rpcCall<{ task: TaskSnapshot | null; total: number }>(
          'projects.batch.sync',
          {
            libraryId: opts.libraryId,
            projectIds: opts.projectIds ? [...opts.projectIds] : undefined,
            onlyChanged: opts.onlyChanged ?? true,
          },
        )
        if (!res.task || res.total === 0) {
          notify('没有需要增量更新的项目')
          return
        }
        trackTask(res.task)
        notify(`已启动批量增量更新（${res.total} 个项目）`)
      } catch (err) {
        notify(err instanceof Error ? err.message : '启动批量同步失败', false)
      }
    },
    [notify, trackTask],
  )

  const toggleBatchMode = React.useCallback(() => {
    setBatchMode(prev => {
      if (prev) setSelectedProjectIds(new Set())
      return !prev
    })
  }, [])

  const toggleProjectChecked = React.useCallback((projectId: string) => {
    setSelectedProjectIds(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }, [])

  const selectAllFilteredProjects = React.useCallback(() => {
    setSelectedProjectIds(new Set(filteredProjects.map(p => p.id)))
  }, [filteredProjects])

  const selectAllOverviewProjects = React.useCallback(() => {
    setSelectedProjectIds(new Set(overviewProjects.map(p => p.id)))
  }, [overviewProjects])

  const clearCheckedProjects = React.useCallback(() => {
    setSelectedProjectIds(new Set())
  }, [])

  const onTaskEnqueued = React.useCallback(
    (task: TaskSnapshot) => {
      trackTask(task)
    },
    [trackTask],
  )

  const refreshSelectedProject = React.useCallback(async () => {
    if (!selectedProjectId) return
    await loadProjectDetail(selectedProjectId)
  }, [selectedProjectId, loadProjectDetail])

  const extensionContext = React.useMemo<ProjectsUiExtensionContext>(
    () => ({
      selectedProject,
      projectArchive: projectManifest?.archive ?? null,
      selectedFile,
      notify,
      refreshProjects: async () => {
        await indexQuery.refetch()
      },
      refreshSelectedProject,
      onTaskEnqueued,
      openFile,
      revealPath,
    }),
    [
      selectedProject,
      projectManifest?.archive,
      selectedFile,
      notify,
      indexQuery,
      refreshSelectedProject,
      onTaskEnqueued,
      openFile,
      revealPath,
    ],
  )

  // Register bridged context menus for project files and sidebar projects
  React.useEffect(() => {
    if (!interactions) return undefined
    const disposeFileMenu = interactions.registerContextMenu({
      id: 'projects.file.context',
      target: 'projects.file',
      order: 10,
      resolve: value => {
        const relPath = typeof value.relPath === 'string' ? value.relPath : ''
        const thumbSupported = Boolean(value.thumbSupported)
        const fileObj = projectManifest?.groups
          .flatMap(g => g.files)
          .find(f => f.relPath === relPath)
        if (!fileObj) return []
        const fullPath = selectedProject ? `${selectedProject.path}\\${fileObj.relPath.replace(/\//g, '\\')}` : fileObj.relPath
        const actions: import('@folio/base-contract').ProjectsUiContextMenuAction[] = [
          {
            id: 'open',
            label: '用默认程序打开',
            run: () => openFile(fileObj),
          },
          {
            id: 'reveal',
            label: '在资源管理器中显示',
            run: () => revealPath(fileObj.relPath),
          },
          {
            id: 'copy-rel',
            label: '复制相对路径',
            separatorBefore: true,
            run: () => copyText(fileObj.relPath, '相对路径'),
          },
          {
            id: 'copy-abs',
            label: '复制完整路径',
            run: () => copyText(fullPath, '完整路径'),
          },
        ]
        if (thumbSupported) {
          actions.splice(2, 0, {
            id: 'set-cover',
            label: '设为项目封面',
            run: () => updateProjectMeta({ coverRelPath: fileObj.relPath }),
          })
        }
        for (const ext of extensions) {
          const extra = ext.getFileContextMenuActions?.(extensionContext, fileObj) ?? []
          for (const item of extra) {
            actions.push(item)
          }
        }
        return actions
      },
    })

    const disposeProjectMenu = interactions.registerContextMenu({
      id: 'projects.project.context',
      target: 'projects.project',
      order: 10,
      resolve: value => {
        const projectId = typeof value.projectId === 'string' ? value.projectId : ''
        const proj = indexData.projects.find(p => p.id === projectId)
        if (!proj) return []
        const actions: import('@folio/base-contract').ProjectsUiContextMenuAction[] = [
          {
            id: 'ai-extract',
            label: 'AI 提取项目信息',
            disabled: !aiStatusQuery.data?.available,
            run: () => extractProjectById(proj.id),
          },
          {
            id: 'check-changes',
            label: '检测文件变更',
            run: async () => {
              setSelectedProjectId(proj.id)
              await rpcCall('projects.checkChanges', { projectId: proj.id })
              await indexQuery.refetch()
            },
          },
          {
            id: 'sync-project',
            label: '增量更新元数据',
            run: async () => {
              await rpcCall('projects.sync', { projectId: proj.id })
              await indexQuery.refetch()
              if (proj.id === selectedProjectId) await loadProjectDetail(proj.id)
            },
          },
          {
            id: 'reveal-project',
            label: '在资源管理器中打开',
            separatorBefore: true,
            run: async () => {
              await rpcCall('projects.file.reveal', { projectId: proj.id })
            },
          },
          {
            id: 'copy-project-path',
            label: '复制项目路径',
            run: () => copyText(proj.path, '项目路径'),
          },
        ]
        for (const ext of extensions) {
          const extra = ext.getProjectContextMenuActions?.(extensionContext, proj) ?? []
          for (const item of extra) {
            actions.push(item)
          }
        }
        return actions
      },
    })

    return () => {
      disposeFileMenu()
      disposeProjectMenu()
    }
  }, [
    interactions,
    projectManifest,
    selectedProject,
    selectedProjectId,
    indexData.projects,
    aiStatusQuery.data?.available,
    extensions,
    extensionContext,
    openFile,
    revealPath,
    updateProjectMeta,
    copyText,
    extractProjectById,
    indexQuery,
    loadProjectDetail,
  ])

  const openFileContextMenu = React.useCallback(
    (file: ProjectFileEntry, clientX: number, clientY: number) => {
      if (!interactions) return
      interactions.openContextMenu(
        {
          kind: 'projects.file',
          value: {
            relPath: file.relPath,
            name: file.name,
            thumbSupported: file.thumbSupported,
          },
        },
        { x: clientX, y: clientY },
      )
    },
    [interactions],
  )

  const openProjectContextMenu = React.useCallback(
    (project: ProjectSummary, clientX: number, clientY: number) => {
      if (!interactions) return
      interactions.openContextMenu(
        {
          kind: 'projects.project',
          value: {
            projectId: project.id,
            name: project.name,
            path: project.path,
          },
        },
        { x: clientX, y: clientY },
      )
    },
    [interactions],
  )

  const value: ProjectsContextValue = {
    indexLoading: indexQuery.isLoading,
    indexError: indexQuery.error?.message ?? null,
    libraries: indexData.libraries,
    activeLibraryId,
    activeLibrary,
    projects: libraryProjects,
    filteredProjects,
    allProjects: indexData.projects,
    availableTags,
    overviewActive: selectedProjectId === null,
    overviewShowAll,
    overviewScopeProjects,
    overviewProjects,
    overviewAvailableTags,
    overviewSearchQuery,
    overviewTagFilter,
    overviewOnlyChanged,
    overviewCardZoom,
    overviewSortMode,
    selectedProjectId,
    selectedProject,
    thumbnailRevision,
    detailLoading,
    projectManifest,
    selectedFile,
    searchQuery,
    tagFilter,
    onlyChanged,
    fileSearchQuery,
    categoryFilter,
    viewMode,
    cardSize,
    groupBy,
    sortKey,
    sortDir,
    addDialogOpen,
    syncingProjectId,
    checkingProjectId,
    extractingProjectId,
    aiStatus: aiStatusQuery.data ?? null,
    aiApplyCover,
    batchMode,
    selectedProjectIds,
    tasks,
    activeTask,
    recentFinishedTask,
    extensions,
    extensionContext,
    lightbox,
    setActiveLibraryId,
    showAllProjects,
    selectLibrary,
    openProject,
    closeProject,
    selectProject: setSelectedProjectId,
    selectFile: setSelectedFile,
    setOverviewSearchQuery,
    setOverviewTagFilter,
    setOverviewOnlyChanged,
    setOverviewCardZoom,
    setOverviewSortMode,
    setSearchQuery,
    setTagFilter,
    setOnlyChanged,
    setFileSearchQuery,
    setCategoryFilter,
    setViewMode,
    setCardSize,
    setGroupBy,
    setSortKey,
    setSortDir,
    setAddDialogOpen,
    pickAndAddLibrary,
    addLibraryByPath,
    rescanLibrary,
    removeLibrary,
    checkSelectedChanges,
    syncSelectedProject,
    updateProjectMeta,
    openFile,
    revealPath,
    openLightboxForFile,
    setLightboxOpen,
    setLightboxIndex,
    setAiApplyCover,
    previewSelectedAiSample,
    extractSelectedWithAi,
    extractBatchWithAi,
    batchTagProjects,
    batchSyncProjects,
    toggleBatchMode,
    toggleProjectChecked,
    selectAllFilteredProjects,
    selectAllOverviewProjects,
    clearCheckedProjects,
    openFileContextMenu,
    openProjectContextMenu,
    pauseTask,
    resumeTask,
    cancelTask,
    clearFinishedTasks: () => clearFinishedTasks(),
    refreshIndex: indexQuery.refetch,
  }

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>
}
