import * as React from 'react'
import { rpcCall } from '@folio/base-contract/rpc'
import { toast } from '@folio/base-ui-kit/client'
import {
  makePageKey,
  type CatalogResponse,
  type ExportFormat,
  type ExportResult,
  type MaterialDataScope,
  type MaterialFieldCategory,
  type MaterialFields,
  type MaterialFileState,
  type MaterialPageSummary,
  type MaterialProject,
  type MaterialsSettings,
  type MaterialsViewLayer,
  type ProjectsState,
  type VectorCraftStatus,
} from './types.js'

export interface MaterialsContextValue {
  readonly status: VectorCraftStatus | null
  readonly projectsState: ProjectsState
  readonly activeProject: MaterialProject | null
  readonly activeFileFilter: string
  readonly projectFiles: readonly MaterialFileState[]
  readonly visiblePages: readonly MaterialPageSummary[]
  readonly catalog: CatalogResponse
  readonly viewLayer: MaterialsViewLayer
  readonly selectedPageKeys: ReadonlySet<string>
  readonly editorTarget: { readonly fileId: string; readonly artboardIndex: number } | null
  readonly editorPage: MaterialPageSummary | null
  readonly editorFile: MaterialFileState | null
  readonly loading: boolean
  readonly mutating: boolean
  readonly previewRev: number
  readonly newProjectOpen: boolean
  readonly newFileProjectId: string | null
  readonly exportDialogOpen: boolean
  readonly exportDefaultFormat: ExportFormat
  readonly settingsOpen: boolean
  readonly dataScopeDefault: MaterialDataScope

  setViewLayer: (layer: MaterialsViewLayer) => void
  setActiveFileFilter: (fileId: string) => void
  setNewProjectOpen: (open: boolean) => void
  setNewFileProjectId: (projectId: string | null) => void
  setExportDialogOpen: (open: boolean, defaultFormat?: ExportFormat) => void
  setSettingsOpen: (open: boolean) => void
  setDataScopeDefault: (scope: MaterialDataScope) => void

  refreshAll: () => Promise<void>
  selectProject: (projectId: string) => Promise<void>
  createProject: (name: string, description?: string) => Promise<MaterialProject | null>
  renameProject: (projectId: string, name: string) => Promise<void>
  deleteProject: (projectId: string) => Promise<void>
  addFilesViaPicker: (projectId: string) => Promise<void>
  addFilesByPaths: (projectId: string, paths: readonly string[]) => Promise<void>
  createNewA3File: (input: {
    projectId: string
    filePath: string
    title?: string
    artboardCount?: number
  }) => Promise<void>
  pickSaveFilePath: (defaultName?: string) => Promise<string | null>
  pickFolderPath: (initialDir?: string) => Promise<string | null>
  removeFileFromProject: (projectId: string, fileId: string) => Promise<void>
  revealPath: (targetPath: string) => Promise<void>

  togglePageSelection: (page: MaterialPageSummary) => void
  selectAllVisiblePages: () => void
  clearPageSelection: () => void

  enterPageEditor: (fileId: string, artboardIndex: number) => void
  updatePageHeader: (
    fileId: string,
    artboardIndex: number,
    fields: MaterialFields,
    renameArtboard?: boolean,
  ) => Promise<void>
  addPage: (fileId: string, fields?: Partial<MaterialFields>) => Promise<void>
  duplicatePage: (fileId: string, artboardIndex: number) => Promise<void>
  deletePage: (fileId: string, artboardIndex: number) => Promise<void>
  reorderPage: (fileId: string, fromIndex: number, toIndex: number) => Promise<void>
  normalizeFileToA3: (fileId: string, artboardIndex?: number) => Promise<void>
  syncAllHeaders: (fileId: string) => Promise<void>

  openInVectorCraft: (fileId: string, artboardIndex?: number) => Promise<void>
  syncNow: (fileId?: string) => Promise<void>
  exportSelectedPages: (input: {
    format: ExportFormat
    outputDir: string
    ppi: number
    mergedPdfFileName?: string
    revealAfterExport?: boolean
    overrideItems?: readonly { fileId: string; artboardIndex: number }[]
  }) => Promise<ExportResult | null>

  upsertOption: (input: {
    scope: MaterialDataScope
    id?: string
    category: MaterialFieldCategory
    label?: string
    value: string
    description?: string
  }) => Promise<void>
  deleteOptions: (scope: MaterialDataScope, ids: readonly string[]) => Promise<void>
  copyOption: (id: string, fromScope: MaterialDataScope, toScope: MaterialDataScope) => Promise<void>
  upsertTemplate: (input: {
    scope: MaterialDataScope
    id?: string
    name: string
    title?: string
    material?: string
    craft?: string
    size?: string
    quantity?: string
    note?: string
    showProjectName?: boolean
  }) => Promise<void>
  deleteTemplates: (scope: MaterialDataScope, ids: readonly string[]) => Promise<void>
  copyTemplate: (id: string, fromScope: MaterialDataScope, toScope: MaterialDataScope) => Promise<void>
  resetCatalogDefaults: () => Promise<void>
  updateSettings: (patch: Partial<MaterialsSettings>) => Promise<void>
}

const EMPTY_CATALOG: CatalogResponse = {
  defaultOptions: [],
  defaultTemplates: [],
  projectOptions: [],
  projectTemplates: [],
}

const EMPTY_PROJECTS: ProjectsState = {
  version: 1,
  activeProjectId: null,
  projects: [],
}

const MaterialsContext = React.createContext<MaterialsContextValue | null>(null)

export interface MaterialsProviderProps {
  readonly children: React.ReactNode
  readonly pendingTarget?: unknown
  readonly consumePendingTarget?: () => unknown
}

export function MaterialsProvider({
  children,
  pendingTarget,
  consumePendingTarget,
}: MaterialsProviderProps): React.ReactElement {
  const [status, setStatus] = React.useState<VectorCraftStatus | null>(null)
  const [projectsState, setProjectsState] = React.useState<ProjectsState>(EMPTY_PROJECTS)
  const [projectFiles, setProjectFiles] = React.useState<readonly MaterialFileState[]>([])
  const [catalog, setCatalog] = React.useState<CatalogResponse>(EMPTY_CATALOG)
  const [activeFileFilter, setActiveFileFilter] = React.useState<string>('all')
  const [viewLayer, setViewLayer] = React.useState<MaterialsViewLayer>('pages')
  const [selectedPageKeys, setSelectedPageKeys] = React.useState<Set<string>>(() => new Set())
  const [editorTarget, setEditorTarget] = React.useState<{
    readonly fileId: string
    readonly artboardIndex: number
  } | null>(null)
  const [loading, setLoading] = React.useState<boolean>(true)
  const [mutating, setMutating] = React.useState<boolean>(false)
  const [previewRev, setPreviewRev] = React.useState<number>(() => Date.now())
  const [newProjectOpen, setNewProjectOpen] = React.useState(false)
  const [newFileProjectId, setNewFileProjectId] = React.useState<string | null>(null)
  const [exportDialogOpen, setExportDialogOpenState] = React.useState(false)
  const [exportDefaultFormat, setExportDefaultFormat] = React.useState<ExportFormat>('png')
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [dataScopeDefault, setDataScopeDefault] = React.useState<MaterialDataScope>('project')

  const activeProject = React.useMemo(() => {
    const id = projectsState.activeProjectId
    return (
      projectsState.projects.find(p => p.id === id) ??
      projectsState.projects[0] ??
      null
    )
  }, [projectsState])

  const activeProjectIdRef = React.useRef<string | null>(null)
  activeProjectIdRef.current = activeProject?.id ?? null

  const refreshProjectData = React.useCallback(async (projectId: string | null) => {
    const [nextStatus, nextCatalog] = await Promise.all([
      rpcCall<VectorCraftStatus>('materials.status', {}),
      rpcCall<CatalogResponse>('materials.catalog.get', { projectId }),
    ])
    setStatus(nextStatus)
    setCatalog(nextCatalog)
    if (!projectId) {
      setProjectFiles([])
      return
    }
    const inspected = await rpcCall<{
      project: MaterialProject
      files: readonly MaterialFileState[]
    }>('materials.project.inspect', { projectId })
    setProjectFiles(inspected.files)
    setPreviewRev(Date.now())
  }, [])

  const refreshAll = React.useCallback(async () => {
    try {
      const nextProjects = await rpcCall<ProjectsState>('materials.projects.list', {})
      setProjectsState(nextProjects)
      const targetProjectId =
        nextProjects.activeProjectId ?? nextProjects.projects[0]?.id ?? null
      await refreshProjectData(targetProjectId)
    } catch (err) {
      toast({ title: '加载物料工作区失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
    } finally {
      setLoading(false)
    }
  }, [refreshProjectData])

  React.useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  // Subscribe to host SSE invalidation events for bidirectional sync
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onInvalidate = (ev: Event) => {
      const detail = (ev as CustomEvent<{ scope?: string }>).detail
      if (!detail) return
      if (detail.scope === 'materials' || detail.scope === '*' || detail.scope === 'all') {
        void refreshAll()
      }
    }
    window.addEventListener('folio:invalidate', onInvalidate)
    return () => {
      window.removeEventListener('folio:invalidate', onInvalidate)
    }
  }, [refreshAll])

  // Handle file-routing target when opening a .vectorcraft file from Files workspace
  React.useEffect(() => {
    if (!pendingTarget || !consumePendingTarget) return
    const target = consumePendingTarget()
    const filePath =
      typeof target === 'string'
        ? target
        : target && typeof target === 'object' && 'path' in target
          ? String((target as { path?: unknown }).path ?? '')
          : ''
    if (!filePath || !filePath.toLowerCase().endsWith('.vectorcraft')) return

    void (async () => {
      let projId = activeProjectIdRef.current
      if (!projId) {
        const created = await rpcCall<{ state: ProjectsState; project: MaterialProject }>(
          'materials.projects.create',
          { name: '默认物料项目' },
        )
        setProjectsState(created.state)
        projId = created.project.id
      }
      await rpcCall('materials.files.add', {
        projectId: projId,
        paths: [filePath],
      })
      await refreshAll()
    })()
  }, [pendingTarget, consumePendingTarget, refreshAll])

  const visiblePages = React.useMemo(() => {
    const files =
      activeFileFilter === 'all'
        ? projectFiles
        : projectFiles.filter(f => f.fileId === activeFileFilter)
    return files.flatMap(f => f.pages)
  }, [projectFiles, activeFileFilter])

  const editorFile = React.useMemo(() => {
    if (!editorTarget) return null
    return projectFiles.find(f => f.fileId === editorTarget.fileId) ?? null
  }, [projectFiles, editorTarget])

  const editorPage = React.useMemo(() => {
    if (!editorTarget || !editorFile) return null
    return (
      editorFile.pages.find(p => p.artboardIndex === editorTarget.artboardIndex) ??
      editorFile.pages[0] ??
      null
    )
  }, [editorFile, editorTarget])

  const setExportDialogOpen = React.useCallback((open: boolean, defaultFormat?: ExportFormat) => {
    if (defaultFormat) setExportDefaultFormat(defaultFormat)
    setExportDialogOpenState(open)
  }, [])

  const selectProject = React.useCallback(
    async (projectId: string) => {
      setActiveFileFilter('all')
      setSelectedPageKeys(new Set())
      setEditorTarget(null)
      if (viewLayer === 'editor') setViewLayer('pages')
      const res = await rpcCall<{ state: ProjectsState }>('materials.projects.update', {
        id: projectId,
        setActive: true,
      })
      setProjectsState(res.state)
      await refreshProjectData(projectId)
    },
    [refreshProjectData, viewLayer],
  )

  const createProject = React.useCallback(
    async (name: string, description?: string): Promise<MaterialProject | null> => {
      setMutating(true)
      try {
        const res = await rpcCall<{ state: ProjectsState; project: MaterialProject }>(
          'materials.projects.create',
          { name, description },
        )
        setProjectsState(res.state)
        setActiveFileFilter('all')
        setSelectedPageKeys(new Set())
        setEditorTarget(null)
        await refreshProjectData(res.project.id)
        toast({ title: `已创建项目「${res.project.name}」`, tone: "success" })
        return res.project
      } catch (err) {
        toast({ title: '新建项目失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
        return null
      } finally {
        setMutating(false)
      }
    },
    [refreshProjectData],
  )

  const renameProject = React.useCallback(
    async (projectId: string, name: string) => {
      const res = await rpcCall<{ state: ProjectsState }>('materials.projects.update', {
        id: projectId,
        name,
      })
      setProjectsState(res.state)
      toast({ title: '项目名称已更新', tone: "success" })
    },
    [],
  )

  const deleteProject = React.useCallback(
    async (projectId: string) => {
      const res = await rpcCall<{ state: ProjectsState }>('materials.projects.delete', {
        id: projectId,
      })
      setProjectsState(res.state)
      const nextId = res.state.activeProjectId ?? res.state.projects[0]?.id ?? null
      setActiveFileFilter('all')
      setSelectedPageKeys(new Set())
      setEditorTarget(null)
      setViewLayer('pages')
      await refreshProjectData(nextId)
      toast({ title: '项目已删除', tone: "success" })
    },
    [refreshProjectData],
  )

  const addFilesByPaths = React.useCallback(
    async (projectId: string, paths: readonly string[]) => {
      if (paths.length === 0) return
      setMutating(true)
      try {
        await rpcCall('materials.files.add', { projectId, paths })
        await refreshAll()
        toast({ title: `已添加 ${paths.length} 个 VectorCraft 文件`, tone: "success" })
      } catch (err) {
        toast({ title: '添加文件失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
      } finally {
        setMutating(false)
      }
    },
    [refreshAll],
  )

  const addFilesViaPicker = React.useCallback(
    async (projectId: string) => {
      const pick = await rpcCall<{ supported: boolean; cancelled: boolean; paths: string[] }>(
        'materials.dialog.pickFiles',
        { multi: true },
      )
      if (!pick.supported) {
        toast({ title: '当前环境不支持原生文件对话框，请使用路径输入', tone: "info" })
        return
      }
      if (pick.cancelled || pick.paths.length === 0) return
      await addFilesByPaths(projectId, pick.paths)
    },
    [addFilesByPaths],
  )

  const pickSaveFilePath = React.useCallback(async (defaultName?: string) => {
    const pick = await rpcCall<{
      supported: boolean
      cancelled: boolean
      filePath: string | null
    }>('materials.dialog.pickSaveFile', { defaultName })
    if (!pick.supported || pick.cancelled) return null
    return pick.filePath
  }, [])

  const pickFolderPath = React.useCallback(async (initialDir?: string) => {
    const pick = await rpcCall<{
      supported: boolean
      cancelled: boolean
      folderPath: string | null
    }>('materials.dialog.pickFolder', { initialDir })
    if (!pick.supported || pick.cancelled) return null
    return pick.folderPath
  }, [])

  const createNewA3File = React.useCallback(
    async (input: {
      projectId: string
      filePath: string
      title?: string
      artboardCount?: number
    }) => {
      setMutating(true)
      try {
        await rpcCall('materials.files.create', input)
        await refreshAll()
        toast({ title: '已新建 A3 横版 VectorCraft 文件', tone: "success" })
      } catch (err) {
        toast({ title: '新建文件失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
      } finally {
        setMutating(false)
      }
    },
    [refreshAll],
  )

  const removeFileFromProject = React.useCallback(
    async (projectId: string, fileId: string) => {
      await rpcCall('materials.files.remove', { projectId, fileId })
      if (activeFileFilter === fileId) setActiveFileFilter('all')
      if (editorTarget?.fileId === fileId) {
        setEditorTarget(null)
        setViewLayer('pages')
      }
      await refreshAll()
      toast({ title: '已从项目中移除文件', tone: "success" })
    },
    [activeFileFilter, editorTarget, refreshAll],
  )

  const revealPath = React.useCallback(async (targetPath: string) => {
    await rpcCall('materials.files.reveal', { path: targetPath })
  }, [])

  const togglePageSelection = React.useCallback((page: MaterialPageSummary) => {
    const key = makePageKey(page.fileId, page.artboardIndex)
    setSelectedPageKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectAllVisiblePages = React.useCallback(() => {
    setSelectedPageKeys(new Set(visiblePages.map(p => makePageKey(p.fileId, p.artboardIndex))))
  }, [visiblePages])

  const clearPageSelection = React.useCallback(() => {
    setSelectedPageKeys(new Set())
  }, [])

  const enterPageEditor = React.useCallback((fileId: string, artboardIndex: number) => {
    setEditorTarget({ fileId, artboardIndex })
    setViewLayer('editor')
  }, [])

  const applyUpdatedFileState = React.useCallback((updatedFile: MaterialFileState) => {
    setProjectFiles(prev => prev.map(f => (f.fileId === updatedFile.fileId ? updatedFile : f)))
    setPreviewRev(Date.now())
  }, [])

  const updatePageHeader = React.useCallback(
    async (
      fileId: string,
      artboardIndex: number,
      fields: MaterialFields,
      renameArtboard = true,
    ) => {
      const projectId = activeProjectIdRef.current
      if (!projectId) return
      setMutating(true)
      try {
        const res = await rpcCall<{ file: MaterialFileState; usedLiveControl: boolean }>(
          'materials.pages.updateHeader',
          { projectId, fileId, artboardIndex, fields, renameArtboard },
        )
        applyUpdatedFileState(res.file)
      } catch (err) {
        toast({ title: '写入画板物料信息失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
      } finally {
        setMutating(false)
      }
    },
    [applyUpdatedFileState],
  )

  const addPage = React.useCallback(
    async (fileId: string, fields?: Partial<MaterialFields>) => {
      const projectId = activeProjectIdRef.current
      if (!projectId) return
      setMutating(true)
      try {
        const res = await rpcCall<{ file: MaterialFileState; addedIndex: number }>(
          'materials.pages.add',
          {
            projectId,
            fileId,
            fields: fields
              ? {
                  title: fields.title ?? '',
                  showProjectName: fields.showProjectName ?? false,
                  projectNameOverride: fields.projectNameOverride ?? '',
                  material: fields.material ?? '',
                  craft: fields.craft ?? '',
                  size: fields.size ?? '',
                  quantity: fields.quantity ?? '',
                  note: fields.note ?? '',
                }
              : undefined,
          },
        )
        applyUpdatedFileState(res.file)
        if (viewLayer === 'editor') {
          setEditorTarget({ fileId, artboardIndex: res.addedIndex })
        }
        toast({
          title: `已新增第 ${String(res.addedIndex + 1).padStart(2, '0')} 页（A3 横版）`,
          tone: 'success',
        })
      } catch (err) {
        toast({ title: '新增页面失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
      } finally {
        setMutating(false)
      }
    },
    [applyUpdatedFileState, viewLayer],
  )

  const duplicatePage = React.useCallback(
    async (fileId: string, artboardIndex: number) => {
      const projectId = activeProjectIdRef.current
      if (!projectId) return
      setMutating(true)
      try {
        const res = await rpcCall<{ file: MaterialFileState }>('materials.pages.duplicate', {
          projectId,
          fileId,
          artboardIndex,
        })
        applyUpdatedFileState(res.file)
        toast({ title: '已复制页面并更新序号', tone: "success" })
      } catch (err) {
        toast({ title: '复制页面失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
      } finally {
        setMutating(false)
      }
    },
    [applyUpdatedFileState],
  )

  const deletePage = React.useCallback(
    async (fileId: string, artboardIndex: number) => {
      const projectId = activeProjectIdRef.current
      if (!projectId) return
      setMutating(true)
      try {
        const res = await rpcCall<{ file: MaterialFileState }>('materials.pages.delete', {
          projectId,
          fileId,
          artboardIndex,
        })
        applyUpdatedFileState(res.file)
        if (editorTarget?.fileId === fileId) {
          const nextIdx = Math.min(artboardIndex, Math.max(0, res.file.pages.length - 1))
          setEditorTarget({ fileId, artboardIndex: nextIdx })
        }
        toast({ title: '已删除页面并更新其余页码', tone: "success" })
      } catch (err) {
        toast({ title: '删除页面失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
      } finally {
        setMutating(false)
      }
    },
    [applyUpdatedFileState, editorTarget],
  )

  const reorderPage = React.useCallback(
    async (fileId: string, fromIndex: number, toIndex: number) => {
      const projectId = activeProjectIdRef.current
      if (!projectId || fromIndex === toIndex) return
      setMutating(true)
      try {
        const res = await rpcCall<{ file: MaterialFileState }>('materials.pages.reorder', {
          projectId,
          fileId,
          fromIndex,
          toIndex,
        })
        applyUpdatedFileState(res.file)
        if (editorTarget?.fileId === fileId) {
          if (editorTarget.artboardIndex === fromIndex) {
            setEditorTarget({ fileId, artboardIndex: toIndex })
          } else if (
            fromIndex < toIndex &&
            editorTarget.artboardIndex > fromIndex &&
            editorTarget.artboardIndex <= toIndex
          ) {
            setEditorTarget({ fileId, artboardIndex: editorTarget.artboardIndex - 1 })
          } else if (
            fromIndex > toIndex &&
            editorTarget.artboardIndex >= toIndex &&
            editorTarget.artboardIndex < fromIndex
          ) {
            setEditorTarget({ fileId, artboardIndex: editorTarget.artboardIndex + 1 })
          }
        }
        toast({ title: '已调整画板顺序并自动更新序号', tone: "success" })
      } catch (err) {
        toast({ title: '调整顺序失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
      } finally {
        setMutating(false)
      }
    },
    [applyUpdatedFileState, editorTarget],
  )

  const normalizeFileToA3 = React.useCallback(
    async (fileId: string, artboardIndex?: number) => {
      const projectId = activeProjectIdRef.current
      if (!projectId) return
      setMutating(true)
      try {
        const res = await rpcCall<{ file: MaterialFileState }>('materials.pages.normalizeA3', {
          projectId,
          fileId,
          artboardIndex,
        })
        applyUpdatedFileState(res.file)
        toast({ title: '已统一为固定 A3 横版尺寸 (420×297mm)', tone: 'success' })
      } catch (err) {
        toast({ title: '调整 A3 尺寸失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
      } finally {
        setMutating(false)
      }
    },
    [applyUpdatedFileState],
  )

  const syncAllHeaders = React.useCallback(
    async (fileId: string) => {
      const projectId = activeProjectIdRef.current
      if (!projectId) return
      setMutating(true)
      try {
        const res = await rpcCall<{ file: MaterialFileState }>('materials.pages.syncAllHeaders', {
          projectId,
          fileId,
        })
        applyUpdatedFileState(res.file)
        toast({ title: '已刷新全部画板物料头', tone: "success" })
      } catch (err) {
        toast({ title: '刷新画板失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
      } finally {
        setMutating(false)
      }
    },
    [applyUpdatedFileState],
  )

  const openInVectorCraft = React.useCallback(
    async (fileId: string, artboardIndex?: number) => {
      const projectId = activeProjectIdRef.current
      if (!projectId) return
      try {
        const res = await rpcCall<{ usedExistingControl: boolean }>('materials.vc.open', {
          projectId,
          fileId,
          artboardIndex,
        })
        await refreshProjectData(projectId)
        toast({
          title: res.usedExistingControl
            ? '已在当前 VectorCraft 窗口激活并跳转画板'
            : '已启动 VectorCraft 并开启实时双向控制通道',
          tone: 'success',
        })
      } catch (err) {
        toast({ title: '打开 VectorCraft 失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
      }
    },
    [refreshProjectData],
  )

  const syncNow = React.useCallback(
    async (fileId?: string) => {
      const projectId = activeProjectIdRef.current
      if (!projectId) return
      setMutating(true)
      try {
        await rpcCall('materials.vc.syncNow', { projectId, fileId })
        await refreshProjectData(projectId)
        toast({ title: '已完成双向同步', tone: "success" })
      } catch (err) {
        toast({ title: '同步失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
      } finally {
        setMutating(false)
      }
    },
    [refreshProjectData],
  )

  const exportSelectedPages = React.useCallback(
    async (input: {
      format: ExportFormat
      outputDir: string
      ppi: number
      mergedPdfFileName?: string
      revealAfterExport?: boolean
      overrideItems?: readonly { fileId: string; artboardIndex: number }[]
    }): Promise<ExportResult | null> => {
      const projectId = activeProjectIdRef.current
      if (!projectId) return null

      const items =
        input.overrideItems ??
        visiblePages
          .filter(p => selectedPageKeys.has(makePageKey(p.fileId, p.artboardIndex)))
          .map(p => ({ fileId: p.fileId, artboardIndex: p.artboardIndex }))

      if (items.length === 0) {
        toast({ title: '请先选择至少一个要导出的页面', tone: "info" })
        return null
      }

      setMutating(true)
      try {
        const result = await rpcCall<ExportResult>('materials.export', {
          projectId,
          items,
          format: input.format,
          outputDir: input.outputDir,
          ppi: input.ppi,
          mergedPdfFileName: input.mergedPdfFileName ?? '',
          revealAfterExport: input.revealAfterExport ?? true,
        })
        toast({ title: `导出完成，共生成 ${result.exported.length} 个文件`, tone: "success" })
        return result
      } catch (err) {
        toast({ title: 'VectorCraft 导出失败', description: err instanceof Error ? err.message : String(err), tone: "danger" })
        return null
      } finally {
        setMutating(false)
      }
    },
    [selectedPageKeys, visiblePages],
  )

  const upsertOption = React.useCallback(
    async (input: {
      scope: MaterialDataScope
      id?: string
      category: MaterialFieldCategory
      label?: string
      value: string
      description?: string
    }) => {
      const projectId = activeProjectIdRef.current ?? undefined
      const next = await rpcCall<CatalogResponse>('materials.catalog.option.upsert', {
        ...input,
        projectId,
      })
      setCatalog(next)
    },
    [],
  )

  const deleteOptions = React.useCallback(
    async (scope: MaterialDataScope, ids: readonly string[]) => {
      if (ids.length === 0) return
      const projectId = activeProjectIdRef.current ?? undefined
      const next = await rpcCall<CatalogResponse>('materials.catalog.option.delete', {
        scope,
        projectId,
        ids,
      })
      setCatalog(next)
    },
    [],
  )

  const copyOption = React.useCallback(
    async (id: string, fromScope: MaterialDataScope, toScope: MaterialDataScope) => {
      const projectId = activeProjectIdRef.current
      if (!projectId) return
      const next = await rpcCall<CatalogResponse>('materials.catalog.option.copy', {
        id,
        fromScope,
        toScope,
        projectId,
      })
      setCatalog(next)
      toast({ title: toScope === 'project' ? '已复制到当前项目数据' : '已提升到全局默认数据', tone: "success" })
    },
    [],
  )

  const upsertTemplate = React.useCallback(
    async (input: {
      scope: MaterialDataScope
      id?: string
      name: string
      title?: string
      material?: string
      craft?: string
      size?: string
      quantity?: string
      note?: string
      showProjectName?: boolean
    }) => {
      const projectId = activeProjectIdRef.current ?? undefined
      const next = await rpcCall<CatalogResponse>('materials.catalog.template.upsert', {
        ...input,
        projectId,
      })
      setCatalog(next)
    },
    [],
  )

  const deleteTemplates = React.useCallback(
    async (scope: MaterialDataScope, ids: readonly string[]) => {
      if (ids.length === 0) return
      const projectId = activeProjectIdRef.current ?? undefined
      const next = await rpcCall<CatalogResponse>('materials.catalog.template.delete', {
        scope,
        projectId,
        ids,
      })
      setCatalog(next)
    },
    [],
  )

  const copyTemplate = React.useCallback(
    async (id: string, fromScope: MaterialDataScope, toScope: MaterialDataScope) => {
      const projectId = activeProjectIdRef.current
      if (!projectId) return
      const next = await rpcCall<CatalogResponse>('materials.catalog.template.copy', {
        id,
        fromScope,
        toScope,
        projectId,
      })
      setCatalog(next)
      toast({ title: toScope === 'project' ? '模板已复制到项目数据' : '模板已提升到全局默认数据', tone: "success" })
    },
    [],
  )

  const resetCatalogDefaults = React.useCallback(async () => {
    const projectId = activeProjectIdRef.current ?? undefined
    const next = await rpcCall<CatalogResponse>('materials.catalog.resetDefaults', { projectId })
    setCatalog(next)
    toast({ title: '已恢复全局默认物料数据', tone: "success" })
  }, [])

  const updateSettings = React.useCallback(async (patch: Partial<MaterialsSettings>) => {
    const res = await rpcCall<{ settings: MaterialsSettings; status: VectorCraftStatus }>(
      'materials.settings.update',
      patch,
    )
    setStatus(res.status)
    toast({ title: 'VectorCraft 设置已保存', tone: "success" })
  }, [])

  const value: MaterialsContextValue = {
    status,
    projectsState,
    activeProject,
    activeFileFilter,
    projectFiles,
    visiblePages,
    catalog,
    viewLayer,
    selectedPageKeys,
    editorTarget,
    editorPage,
    editorFile,
    loading,
    mutating,
    previewRev,
    newProjectOpen,
    newFileProjectId,
    exportDialogOpen,
    exportDefaultFormat,
    settingsOpen,
    dataScopeDefault,
    setViewLayer,
    setActiveFileFilter,
    setNewProjectOpen,
    setNewFileProjectId,
    setExportDialogOpen,
    setSettingsOpen,
    setDataScopeDefault,
    refreshAll,
    selectProject,
    createProject,
    renameProject,
    deleteProject,
    addFilesViaPicker,
    addFilesByPaths,
    createNewA3File,
    pickSaveFilePath,
    pickFolderPath,
    removeFileFromProject,
    revealPath,
    togglePageSelection,
    selectAllVisiblePages,
    clearPageSelection,
    enterPageEditor,
    updatePageHeader,
    addPage,
    duplicatePage,
    deletePage,
    reorderPage,
    normalizeFileToA3,
    syncAllHeaders,
    openInVectorCraft,
    syncNow,
    exportSelectedPages,
    upsertOption,
    deleteOptions,
    copyOption,
    upsertTemplate,
    deleteTemplates,
    copyTemplate,
    resetCatalogDefaults,
    updateSettings,
  }

  return <MaterialsContext.Provider value={value}>{children}</MaterialsContext.Provider>
}

export function useMaterials(): MaterialsContextValue {
  const ctx = React.useContext(MaterialsContext)
  if (!ctx) {
    throw new Error('useMaterials must be used inside MaterialsProvider')
  }
  return ctx
}
