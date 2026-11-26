import * as React from 'react'
import type { FrameProviderProps } from '@folio/base-contract'
import { rpcCall } from '@folio/base-contract/rpc'
import { toast, type LightboxItem } from '@folio/base-ui-kit/client'
import { buildMediaUrl } from './format.js'
import type {
  CategoryFilter,
  FileEntry,
  GroupBy,
  ListDirectoryResult,
  PaneId,
  PaneState,
  RootsResult,
  SortBy,
  SortDir,
  TreeNodeInfo,
  ViewMode,
} from './types.js'

const UI_PREFS_STORAGE_KEY = 'folio.files.ui.v1'

interface PersistedFilesPrefs {
  readonly dualPane?: boolean
  readonly viewMode?: ViewMode
  readonly gridSize?: number
  readonly groupBy?: GroupBy
  readonly sortBy?: SortBy
  readonly sortDir?: SortDir
  readonly showHidden?: boolean
  readonly leftPath?: string
  readonly rightPath?: string
}

function readPersistedPrefs(): PersistedFilesPrefs {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(UI_PREFS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as PersistedFilesPrefs
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writePersistedPrefs(prefs: PersistedFilesPrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore quota / storage errors
  }
}

function createInitialPane(id: PaneId, prefs: PersistedFilesPrefs): PaneState {
  const savedPath = id === 'left' ? prefs.leftPath : prefs.rightPath
  return {
    id,
    path: typeof savedPath === 'string' ? savedPath : '',
    parentPath: null,
    breadcrumbs: [],
    entries: [],
    childGroups: [],
    totalEntries: 0,
    truncated: false,
    history: [],
    historyIndex: -1,
    filterQuery: '',
    categoryFilter: 'all',
    viewMode: prefs.viewMode === 'list' ? 'list' : 'grid',
    gridSize:
      typeof prefs.gridSize === 'number' && prefs.gridSize >= 96 && prefs.gridSize <= 240
        ? prefs.gridSize
        : 144,
    groupBy:
      prefs.groupBy === 'time' ||
      prefs.groupBy === 'type' ||
      prefs.groupBy === 'name' ||
      prefs.groupBy === 'parent'
        ? prefs.groupBy
        : 'none',
    sortBy:
      prefs.sortBy === 'mtime' || prefs.sortBy === 'size' || prefs.sortBy === 'type'
        ? prefs.sortBy
        : 'name',
    sortDir: prefs.sortDir === 'desc' ? 'desc' : 'asc',
    showHidden: Boolean(prefs.showHidden),
    loading: false,
    error: null,
    selectedPath: null,
  }
}

export interface LightboxState {
  readonly open: boolean
  readonly items: readonly LightboxItem[]
  readonly index: number
}

export interface FilesContextValue {
  readonly roots: RootsResult | null
  readonly rootsLoading: boolean
  readonly panes: Readonly<Record<PaneId, PaneState>>
  readonly activePaneId: PaneId
  readonly dualPane: boolean
  readonly selectedEntry: FileEntry | null
  readonly selectedPaneId: PaneId
  readonly treeChildren: Readonly<Record<string, readonly TreeNodeInfo[]>>
  readonly treeExpanded: ReadonlySet<string>
  readonly treeLoading: ReadonlySet<string>
  readonly lightbox: LightboxState
  setActivePane: (paneId: PaneId) => void
  toggleDualPane: () => void
  closeSecondaryPane: () => void
  navigatePane: (paneId: PaneId, path: string, options?: { pushHistory?: boolean }) => Promise<void>
  navigateActivePane: (path: string) => Promise<void>
  goBack: (paneId: PaneId) => Promise<void>
  goForward: (paneId: PaneId) => Promise<void>
  goUp: (paneId: PaneId) => Promise<void>
  refreshPane: (paneId: PaneId) => Promise<void>
  updatePane: (paneId: PaneId, patch: Partial<PaneState>) => void
  setGroupBy: (paneId: PaneId, groupBy: GroupBy) => Promise<void>
  setShowHidden: (paneId: PaneId, showHidden: boolean) => Promise<void>
  selectEntry: (paneId: PaneId, entry: FileEntry | null) => void
  toggleTreeNode: (dirPath: string) => Promise<void>
  locateInTree: (dirPath: string) => Promise<void>
  pinFolder: (dirPath: string) => Promise<void>
  unpinFolder: (dirPath: string) => Promise<void>
  revealInExplorer: (targetPath: string) => Promise<void>
  openLightboxForEntry: (paneId: PaneId, entry: FileEntry) => void
  setLightboxOpen: (open: boolean) => void
  setLightboxIndex: (index: number) => void
}

const FilesContext = React.createContext<FilesContextValue | null>(null)

export function useFiles(): FilesContextValue {
  const value = React.useContext(FilesContext)
  if (!value) throw new Error('useFiles must be used inside FilesProvider')
  return value
}

export function FilesProvider({ children }: FrameProviderProps): React.ReactElement {
  const initialPrefs = React.useMemo(() => readPersistedPrefs(), [])
  const [roots, setRoots] = React.useState<RootsResult | null>(null)
  const [rootsLoading, setRootsLoading] = React.useState<boolean>(true)
  const [dualPane, setDualPane] = React.useState<boolean>(Boolean(initialPrefs.dualPane))
  const [activePaneId, setActivePaneId] = React.useState<PaneId>('left')
  const [panes, setPanes] = React.useState<Record<PaneId, PaneState>>(() => ({
    left: createInitialPane('left', initialPrefs),
    right: createInitialPane('right', initialPrefs),
  }))
  const panesRef = React.useRef(panes)
  panesRef.current = panes

  const [selectedPaneId, setSelectedPaneId] = React.useState<PaneId>('left')
  const [selectedEntry, setSelectedEntry] = React.useState<FileEntry | null>(null)

  const [treeChildren, setTreeChildren] = React.useState<Record<string, readonly TreeNodeInfo[]>>({})
  const treeChildrenRef = React.useRef(treeChildren)
  treeChildrenRef.current = treeChildren
  const [treeExpanded, setTreeExpanded] = React.useState<Set<string>>(() => new Set())
  const [treeLoading, setTreeLoading] = React.useState<Set<string>>(() => new Set())

  const [lightbox, setLightbox] = React.useState<LightboxState>({
    open: false,
    items: [],
    index: 0,
  })

  const navControllersRef = React.useRef<Record<PaneId, AbortController | null>>({
    left: null,
    right: null,
  })

  const persistFromState = React.useCallback(
    (nextPanes: Record<PaneId, PaneState>, nextDualPane: boolean, focusPaneId: PaneId) => {
      const refPane = nextPanes[focusPaneId]
      writePersistedPrefs({
        dualPane: nextDualPane,
        viewMode: refPane.viewMode,
        gridSize: refPane.gridSize,
        groupBy: refPane.groupBy,
        sortBy: refPane.sortBy,
        sortDir: refPane.sortDir,
        showHidden: refPane.showHidden,
        leftPath: nextPanes.left.path,
        rightPath: nextPanes.right.path,
      })
    },
    [],
  )

  const refreshRoots = React.useCallback(async () => {
    setRootsLoading(true)
    try {
      const res = await rpcCall<RootsResult>('files.roots', {})
      setRoots(res)
    } catch (err) {
      toast({
        title: '无法加载驱动器与快捷目录',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    } finally {
      setRootsLoading(false)
    }
  }, [])

  const loadDirectory = React.useCallback(
    async (
      paneId: PaneId,
      targetPath: string,
      options: {
        pushHistory?: boolean
        historyIndex?: number
        overrideGroupBy?: GroupBy
        overrideShowHidden?: boolean
      } = {},
    ) => {
      navControllersRef.current[paneId]?.abort()
      const controller = new AbortController()
      navControllersRef.current[paneId] = controller

      const currentPane = panesRef.current[paneId]
      const groupBy = options.overrideGroupBy ?? currentPane.groupBy
      const showHidden = options.overrideShowHidden ?? currentPane.showHidden

      setPanes(prev => ({
        ...prev,
        [paneId]: {
          ...prev[paneId],
          loading: true,
          error: null,
        },
      }))

      try {
        const result = await rpcCall<ListDirectoryResult>(
          'files.list',
          {
            path: targetPath || undefined,
            showHidden,
            includeSubdirChildren: groupBy === 'parent',
          },
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return

        setPanes(prev => {
          const prevPane = prev[paneId]
          let history = [...prevPane.history]
          let historyIndex = prevPane.historyIndex

          if (options.historyIndex !== undefined) {
            historyIndex = options.historyIndex
          } else if (options.pushHistory !== false) {
            const currentAtCursor = history[historyIndex]
            if (currentAtCursor?.toLowerCase() !== result.path.toLowerCase()) {
              history = [...history.slice(0, historyIndex + 1), result.path]
              historyIndex = history.length - 1
            }
          } else if (history.length === 0) {
            history = [result.path]
            historyIndex = 0
          }

          const updatedPane: PaneState = {
            ...prevPane,
            path: result.path,
            parentPath: result.parentPath,
            breadcrumbs: result.breadcrumbs,
            entries: result.entries,
            childGroups: result.childGroups,
            totalEntries: result.totalEntries,
            truncated: result.truncated,
            history,
            historyIndex,
            groupBy,
            showHidden,
            loading: false,
            error: null,
          }
          const next = { ...prev, [paneId]: updatedPane }
          persistFromState(next, dualPane, paneId)
          return next
        })
      } catch (err) {
        if (controller.signal.aborted) return
        const msg = err instanceof Error ? err.message : String(err)
        setPanes(prev => ({
          ...prev,
          [paneId]: {
            ...prev[paneId],
            loading: false,
            error: msg,
          },
        }))
      }
    },
    [dualPane, persistFromState],
  )

  React.useEffect(() => {
    void refreshRoots()
    void loadDirectory('left', panesRef.current.left.path, { pushHistory: false })
    if (initialPrefs.dualPane) {
      void loadDirectory('right', panesRef.current.right.path || panesRef.current.left.path, {
        pushHistory: false,
      })
    }
    return () => {
      navControllersRef.current.left?.abort()
      navControllersRef.current.right?.abort()
    }
  }, [initialPrefs.dualPane, loadDirectory, refreshRoots])

  const navigatePane = React.useCallback(
    async (paneId: PaneId, targetPath: string, options?: { pushHistory?: boolean }) => {
      setActivePaneId(paneId)
      await loadDirectory(paneId, targetPath, { pushHistory: options?.pushHistory ?? true })
    },
    [loadDirectory],
  )

  const navigateActivePane = React.useCallback(
    async (targetPath: string) => {
      await navigatePane(activePaneId, targetPath)
    },
    [activePaneId, navigatePane],
  )

  const goBack = React.useCallback(
    async (paneId: PaneId) => {
      const pane = panesRef.current[paneId]
      if (pane.historyIndex <= 0) return
      const nextIdx = pane.historyIndex - 1
      const target = pane.history[nextIdx]
      if (!target) return
      setActivePaneId(paneId)
      await loadDirectory(paneId, target, { pushHistory: false, historyIndex: nextIdx })
    },
    [loadDirectory],
  )

  const goForward = React.useCallback(
    async (paneId: PaneId) => {
      const pane = panesRef.current[paneId]
      if (pane.historyIndex >= pane.history.length - 1) return
      const nextIdx = pane.historyIndex + 1
      const target = pane.history[nextIdx]
      if (!target) return
      setActivePaneId(paneId)
      await loadDirectory(paneId, target, { pushHistory: false, historyIndex: nextIdx })
    },
    [loadDirectory],
  )

  const goUp = React.useCallback(
    async (paneId: PaneId) => {
      const pane = panesRef.current[paneId]
      if (!pane.parentPath) return
      await navigatePane(paneId, pane.parentPath)
    },
    [navigatePane],
  )

  const refreshPane = React.useCallback(
    async (paneId: PaneId) => {
      const pane = panesRef.current[paneId]
      await loadDirectory(paneId, pane.path, { pushHistory: false })
    },
    [loadDirectory],
  )

  const updatePane = React.useCallback(
    (paneId: PaneId, patch: Partial<PaneState>) => {
      setPanes(prev => {
        const next = { ...prev, [paneId]: { ...prev[paneId], ...patch } }
        persistFromState(next, dualPane, paneId)
        return next
      })
    },
    [dualPane, persistFromState],
  )

  const setGroupBy = React.useCallback(
    async (paneId: PaneId, groupBy: GroupBy) => {
      const pane = panesRef.current[paneId]
      const needsSubdirFetch = groupBy === 'parent' && pane.childGroups.length === 0
      updatePane(paneId, { groupBy })
      if (needsSubdirFetch || groupBy === 'parent') {
        await loadDirectory(paneId, pane.path, {
          pushHistory: false,
          overrideGroupBy: groupBy,
        })
      }
    },
    [loadDirectory, updatePane],
  )

  const setShowHidden = React.useCallback(
    async (paneId: PaneId, showHidden: boolean) => {
      const pane = panesRef.current[paneId]
      updatePane(paneId, { showHidden })
      await loadDirectory(paneId, pane.path, {
        pushHistory: false,
        overrideShowHidden: showHidden,
      })
    },
    [loadDirectory, updatePane],
  )

  const toggleDualPane = React.useCallback(() => {
    setDualPane(prev => {
      const next = !prev
      if (next) {
        const rightPath = panesRef.current.right.path || panesRef.current.left.path
        void loadDirectory('right', rightPath, { pushHistory: false })
      } else {
        setActivePaneId('left')
      }
      persistFromState(panesRef.current, next, activePaneId)
      return next
    })
  }, [activePaneId, loadDirectory, persistFromState])

  const closeSecondaryPane = React.useCallback(() => {
    setDualPane(false)
    setActivePaneId('left')
    persistFromState(panesRef.current, false, 'left')
  }, [persistFromState])

  const selectEntry = React.useCallback((paneId: PaneId, entry: FileEntry | null) => {
    setActivePaneId(paneId)
    setSelectedPaneId(paneId)
    setSelectedEntry(entry)
    setPanes(prev => ({
      ...prev,
      [paneId]: {
        ...prev[paneId],
        selectedPath: entry?.path ?? null,
      },
    }))
  }, [])

  const loadTreeChildren = React.useCallback(async (dirPath: string) => {
    setTreeLoading(prev => {
      const next = new Set(prev)
      next.add(dirPath)
      return next
    })
    try {
      const res = await rpcCall<{ path: string; children: readonly TreeNodeInfo[] }>('files.tree', {
        path: dirPath,
        showHidden: panesRef.current.left.showHidden,
      })
      setTreeChildren(prev => ({ ...prev, [dirPath]: res.children }))
    } catch {
      // ignore tree load errors
    } finally {
      setTreeLoading(prev => {
        const next = new Set(prev)
        next.delete(dirPath)
        return next
      })
    }
  }, [])

  const toggleTreeNode = React.useCallback(
    async (dirPath: string) => {
      let shouldLoad = false
      setTreeExpanded(prev => {
        const next = new Set(prev)
        if (next.has(dirPath)) {
          next.delete(dirPath)
        } else {
          next.add(dirPath)
          if (!treeChildrenRef.current[dirPath]) shouldLoad = true
        }
        return next
      })
      if (shouldLoad) {
        await loadTreeChildren(dirPath)
      }
    },
    [loadTreeChildren],
  )

  const locateInTree = React.useCallback(
    async (dirPath: string) => {
      const pane = panesRef.current[activePaneId]
      const crumbs = pane.path.toLowerCase() === dirPath.toLowerCase() ? pane.breadcrumbs : []
      const ancestors = crumbs.map(c => c.path)
      if (ancestors.length === 0) return

      setTreeExpanded(prev => {
        const next = new Set(prev)
        for (const anc of ancestors) next.add(anc)
        return next
      })

      await Promise.all(
        ancestors
          .filter(anc => !treeChildrenRef.current[anc])
          .map(anc => loadTreeChildren(anc)),
      )
    },
    [activePaneId, loadTreeChildren],
  )

  const pinFolder = React.useCallback(
    async (dirPath: string) => {
      try {
        await rpcCall('files.prefs.pin', { path: dirPath })
        await refreshRoots()
        toast({ title: '已添加到快捷文件夹', description: dirPath, tone: 'success' })
      } catch (err) {
        toast({
          title: '添加快捷文件夹失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
      }
    },
    [refreshRoots],
  )

  const unpinFolder = React.useCallback(
    async (dirPath: string) => {
      try {
        await rpcCall('files.prefs.unpin', { path: dirPath })
        await refreshRoots()
      } catch (err) {
        toast({
          title: '移除快捷文件夹失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
      }
    },
    [refreshRoots],
  )

  const revealInExplorer = React.useCallback(async (targetPath: string) => {
    try {
      await rpcCall('files.reveal', { path: targetPath })
    } catch (err) {
      toast({
        title: '无法打开系统资源管理器',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    }
  }, [])

  const openLightboxForEntry = React.useCallback((paneId: PaneId, entry: FileEntry) => {
    const pane = panesRef.current[paneId]
    const pool = [
      ...pane.entries.filter(e => !e.isDir && e.category === 'image'),
      ...pane.childGroups.flatMap(g => g.entries.filter(e => !e.isDir && e.category === 'image')),
    ]
    const dedup = new Map<string, FileEntry>()
    for (const item of pool) {
      if (!dedup.has(item.path)) dedup.set(item.path, item)
    }
    if (!dedup.has(entry.path)) dedup.set(entry.path, entry)
    const imageList = Array.from(dedup.values())
    const idx = Math.max(
      0,
      imageList.findIndex(item => item.path === entry.path),
    )
    setLightbox({
      open: true,
      index: idx,
      items: imageList.map(item => ({
        src: buildMediaUrl(item),
        alt: item.name,
        caption: item.name,
      })),
    })
  }, [])

  const setLightboxOpen = React.useCallback((open: boolean) => {
    setLightbox(prev => ({ ...prev, open }))
  }, [])

  const setLightboxIndex = React.useCallback((index: number) => {
    setLightbox(prev => ({ ...prev, index }))
  }, [])

  const value = React.useMemo<FilesContextValue>(
    () => ({
      roots,
      rootsLoading,
      panes,
      activePaneId,
      dualPane,
      selectedEntry,
      selectedPaneId,
      treeChildren,
      treeExpanded,
      treeLoading,
      lightbox,
      setActivePane: setActivePaneId,
      toggleDualPane,
      closeSecondaryPane,
      navigatePane,
      navigateActivePane,
      goBack,
      goForward,
      goUp,
      refreshPane,
      updatePane,
      setGroupBy,
      setShowHidden,
      selectEntry,
      toggleTreeNode,
      locateInTree,
      pinFolder,
      unpinFolder,
      revealInExplorer,
      openLightboxForEntry,
      setLightboxOpen,
      setLightboxIndex,
    }),
    [
      roots,
      rootsLoading,
      panes,
      activePaneId,
      dualPane,
      selectedEntry,
      selectedPaneId,
      treeChildren,
      treeExpanded,
      treeLoading,
      lightbox,
      toggleDualPane,
      closeSecondaryPane,
      navigatePane,
      navigateActivePane,
      goBack,
      goForward,
      goUp,
      refreshPane,
      updatePane,
      setGroupBy,
      setShowHidden,
      selectEntry,
      toggleTreeNode,
      locateInTree,
      pinFolder,
      unpinFolder,
      revealInExplorer,
      openLightboxForEntry,
      setLightboxOpen,
      setLightboxIndex,
    ],
  )

  return <FilesContext.Provider value={value}>{children}</FilesContext.Provider>
}
