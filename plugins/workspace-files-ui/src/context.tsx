import * as React from 'react'
import type {
  FolioContextMenuAction,
  FolioInteractionsService,
  FrameProviderProps,
} from '@folio/base-contract'
import { useLightboxState, type LightboxState } from '@folio/base-collection-ui/client'
import { copyTextToClipboard } from '@folio/base-metadata-ui/client'
import { rpcCall } from '@folio/base-contract/rpc'
import { toast } from '@folio/base-ui-kit/client'
import {
  buildDownloadUrl,
  buildMediaUrl,
  getParentDirLabel,
  toPathKey,
} from './format.js'
import type {
  FavoritesState,
  FileEntry,
  FileMetaRecord,
  GroupBy,
  ListDirectoryResult,
  MetadataSnapshot,
  PaneId,
  PaneLocation,
  PaneState,
  RootsResult,
  SortBy,
  SortDir,
  TagDef,
  TagFilesResult,
  TreeNodeInfo,
  ViewMode,
} from './types.js'

const UI_PREFS_STORAGE_KEY = 'folio.files.ui.v1'

interface PersistedFilesPrefs {
  readonly dualPane?: boolean
  readonly viewMode?: ViewMode
  readonly cardSize?: number
  /** Legacy key kept so pre-existing profiles migrate on read. */
  readonly gridSize?: number
  readonly groupBy?: GroupBy | 'parent'
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

function normalizeViewMode(value: unknown): ViewMode {
  return value === 'waterfall' || value === 'equal' || value === 'list' ? value : 'grid'
}

function normalizeGroupBy(value: unknown): GroupBy {
  if (value === 'time' || value === 'type' || value === 'name') return value
  if (value === 'folder' || value === 'parent') return 'folder'
  return 'none'
}

function createInitialPane(id: PaneId, prefs: PersistedFilesPrefs): PaneState {
  const savedPath = id === 'left' ? prefs.leftPath : prefs.rightPath
  const savedCardSize = prefs.cardSize ?? prefs.gridSize
  return {
    id,
    mode: 'directory',
    activeTagId: null,
    missingPaths: [],
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
    minRating: 0,
    viewMode: normalizeViewMode(prefs.viewMode),
    cardSize:
      typeof savedCardSize === 'number' && savedCardSize >= 96 && savedCardSize <= 320
        ? savedCardSize
        : 176,
    groupBy: normalizeGroupBy(prefs.groupBy),
    sortBy:
      prefs.sortBy === 'mtime' ||
      prefs.sortBy === 'size' ||
      prefs.sortBy === 'type' ||
      prefs.sortBy === 'rating'
        ? prefs.sortBy
        : 'name',
    sortDir: prefs.sortDir === 'desc' ? 'desc' : 'asc',
    showHidden: Boolean(prefs.showHidden),
    loading: false,
    error: null,
    selectedPath: null,
  }
}

function computeTagCountsLocal(
  tags: readonly TagDef[],
  files: Readonly<Record<string, FileMetaRecord>>,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const tag of tags) counts[tag.id] = 0
  for (const rec of Object.values(files)) {
    for (const id of rec.tagIds) {
      if (id in counts) counts[id] += 1
    }
  }
  return counts
}

export type { LightboxState }

export interface FilesContextValue {
  readonly interactions: FolioInteractionsService | undefined
  readonly roots: RootsResult | null
  readonly rootsLoading: boolean
  readonly favorites: FavoritesState
  readonly metadata: MetadataSnapshot
  readonly panes: Readonly<Record<PaneId, PaneState>>
  readonly activePaneId: PaneId
  readonly dualPane: boolean
  readonly selectedEntry: FileEntry | null
  readonly selectedPaneId: PaneId
  readonly treeChildren: Readonly<Record<string, readonly TreeNodeInfo[]>>
  readonly treeExpanded: ReadonlySet<string>
  readonly treeLoading: ReadonlySet<string>
  readonly lightbox: LightboxState
  readonly favoritesManagerOpen: boolean
  readonly tagManagerOpen: boolean
  setFavoritesManagerOpen: (open: boolean) => void
  setTagManagerOpen: (open: boolean) => void
  setActivePane: (paneId: PaneId) => void
  toggleDualPane: () => void
  closeSecondaryPane: () => void
  navigatePane: (paneId: PaneId, path: string, options?: { pushHistory?: boolean }) => Promise<void>
  navigateActivePane: (path: string) => Promise<void>
  openInOtherPane: (dirPath: string) => Promise<void>
  openTagView: (paneId: PaneId, tagId: string, options?: { pushHistory?: boolean }) => Promise<void>
  openTagViewActivePane: (tagId: string) => Promise<void>
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
  isFavoritePath: (dirPath: string) => boolean
  addFavorite: (dirPath: string, name?: string, groupId?: string) => Promise<void>
  updateFavorite: (input: {
    id: string
    name?: string
    groupId?: string
    order?: number
  }) => Promise<void>
  removeFavorite: (input: { id?: string; path?: string }) => Promise<void>
  createFavoriteGroup: (name: string, color?: string) => Promise<void>
  updateFavoriteGroup: (input: {
    id: string
    name?: string
    color?: string
    order?: number
  }) => Promise<void>
  deleteFavoriteGroup: (id: string, mode?: 'move-to-default' | 'delete-items') => Promise<void>
  getFileMeta: (filePath: string) => FileMetaRecord | null
  setFileMeta: (
    filePath: string,
    patch: { rating?: number; tagIds?: readonly string[]; note?: string },
  ) => Promise<void>
  createTag: (name: string, color?: string, description?: string) => Promise<TagDef | null>
  updateTag: (input: {
    id: string
    name?: string
    color?: string
    description?: string
  }) => Promise<void>
  deleteTag: (id: string) => Promise<void>
  pruneMissingTaggedFiles: (paneId: PaneId) => Promise<void>
}

const FilesContext = React.createContext<FilesContextValue | null>(null)

export function useFiles(): FilesContextValue {
  const value = React.useContext(FilesContext)
  if (!value) throw new Error('useFiles must be used inside FilesProvider')
  return value
}

const DEFAULT_FAVORITES: FavoritesState = {
  version: 1,
  groups: [{ id: 'default', name: '常用收藏', color: '#3b82f6', order: 0 }],
  items: [],
}

const DEFAULT_METADATA: MetadataSnapshot = {
  tags: [],
  files: {},
  tagCounts: {},
}

export interface FilesProviderProps extends FrameProviderProps {
  readonly getInteractions?: () => FolioInteractionsService | undefined
}

export function FilesProvider({
  children,
  getInteractions,
}: FilesProviderProps): React.ReactElement {
  const interactions = React.useMemo(() => getInteractions?.(), [getInteractions])
  const initialPrefs = React.useMemo(() => readPersistedPrefs(), [])
  const [roots, setRoots] = React.useState<RootsResult | null>(null)
  const [rootsLoading, setRootsLoading] = React.useState<boolean>(true)
  const [favorites, setFavorites] = React.useState<FavoritesState>(DEFAULT_FAVORITES)
  const favoritesRef = React.useRef(favorites)
  favoritesRef.current = favorites
  const [metadata, setMetadata] = React.useState<MetadataSnapshot>(DEFAULT_METADATA)
  const metadataRef = React.useRef(metadata)
  metadataRef.current = metadata

  const [favoritesManagerOpen, setFavoritesManagerOpen] = React.useState(false)
  const [tagManagerOpen, setTagManagerOpen] = React.useState(false)

  const [dualPane, setDualPane] = React.useState<boolean>(Boolean(initialPrefs.dualPane))
  const [activePaneId, setActivePaneId] = React.useState<PaneId>('left')
  const activePaneIdRef = React.useRef(activePaneId)
  activePaneIdRef.current = activePaneId
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

  const {
    lightbox,
    openLightbox,
    setLightboxOpen,
    setLightboxIndex,
  } = useLightboxState()

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
        cardSize: refPane.cardSize,
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

  const refreshFavorites = React.useCallback(async () => {
    try {
      const res = await rpcCall<FavoritesState>('files.favorites.get', {})
      if (res && Array.isArray(res.groups)) {
        setFavorites(res)
      }
    } catch {
      // Optional in older hosts or mocked tests
    }
  }, [])

  const refreshMetadata = React.useCallback(async () => {
    try {
      const res = await rpcCall<MetadataSnapshot>('files.meta.get', {})
      if (res && Array.isArray(res.tags)) {
        setMetadata(res)
      }
    } catch {
      // Optional in older hosts or mocked tests
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
            includeSubdirChildren: groupBy === 'folder',
          },
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return

        setPanes(prev => {
          const prevPane = prev[paneId]
          let history = [...prevPane.history]
          let historyIndex = prevPane.historyIndex

          const nextLoc: PaneLocation = { kind: 'directory', path: result.path }
          if (options.historyIndex !== undefined) {
            historyIndex = options.historyIndex
          } else if (options.pushHistory !== false) {
            const currentAtCursor = history[historyIndex]
            const sameDir =
              currentAtCursor?.kind === 'directory' &&
              currentAtCursor.path.toLowerCase() === result.path.toLowerCase()
            if (!sameDir) {
              history = [...history.slice(0, historyIndex + 1), nextLoc]
              historyIndex = history.length - 1
            }
          } else if (history.length === 0) {
            history = [nextLoc]
            historyIndex = 0
          }

          const updatedPane: PaneState = {
            ...prevPane,
            mode: 'directory',
            activeTagId: null,
            missingPaths: [],
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

  const loadTagView = React.useCallback(
    async (
      paneId: PaneId,
      tagId: string,
      options: { pushHistory?: boolean; historyIndex?: number } = {},
    ) => {
      navControllersRef.current[paneId]?.abort()
      const controller = new AbortController()
      navControllersRef.current[paneId] = controller

      setPanes(prev => ({
        ...prev,
        [paneId]: {
          ...prev[paneId],
          loading: true,
          error: null,
        },
      }))

      try {
        const result = await rpcCall<TagFilesResult>(
          'files.tags.files',
          { tagId },
          { signal: controller.signal },
        )
        if (controller.signal.aborted) return

        setPanes(prev => {
          const prevPane = prev[paneId]
          let history = [...prevPane.history]
          let historyIndex = prevPane.historyIndex
          const nextLoc: PaneLocation = { kind: 'tag', tagId }

          if (options.historyIndex !== undefined) {
            historyIndex = options.historyIndex
          } else if (options.pushHistory !== false) {
            const currentAtCursor = history[historyIndex]
            const sameTag = currentAtCursor?.kind === 'tag' && currentAtCursor.tagId === tagId
            if (!sameTag) {
              history = [...history.slice(0, historyIndex + 1), nextLoc]
              historyIndex = history.length - 1
            }
          } else if (history.length === 0) {
            history = [nextLoc]
            historyIndex = 0
          }

          const updatedPane: PaneState = {
            ...prevPane,
            mode: 'tag',
            activeTagId: tagId,
            missingPaths: result.missingPaths,
            parentPath: null,
            breadcrumbs: [],
            entries: result.entries,
            childGroups: [],
            totalEntries: result.totalCount,
            truncated: false,
            history,
            historyIndex,
            loading: false,
            error: null,
          }
          return { ...prev, [paneId]: updatedPane }
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
    [],
  )

  React.useEffect(() => {
    void refreshRoots()
    void refreshFavorites()
    void refreshMetadata()
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
  }, [initialPrefs.dualPane, loadDirectory, refreshFavorites, refreshMetadata, refreshRoots])

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

  const openTagView = React.useCallback(
    async (paneId: PaneId, tagId: string, options?: { pushHistory?: boolean }) => {
      setActivePaneId(paneId)
      await loadTagView(paneId, tagId, { pushHistory: options?.pushHistory ?? true })
    },
    [loadTagView],
  )

  const openTagViewActivePane = React.useCallback(
    async (tagId: string) => {
      await openTagView(activePaneId, tagId)
    },
    [activePaneId, openTagView],
  )

  const navigateHistoryIndex = React.useCallback(
    async (paneId: PaneId, nextIdx: number) => {
      const pane = panesRef.current[paneId]
      const loc = pane.history[nextIdx]
      if (!loc) return
      setActivePaneId(paneId)
      if (loc.kind === 'tag') {
        await loadTagView(paneId, loc.tagId, { pushHistory: false, historyIndex: nextIdx })
      } else {
        await loadDirectory(paneId, loc.path, { pushHistory: false, historyIndex: nextIdx })
      }
    },
    [loadDirectory, loadTagView],
  )

  const goBack = React.useCallback(
    async (paneId: PaneId) => {
      const pane = panesRef.current[paneId]
      if (pane.historyIndex <= 0) return
      await navigateHistoryIndex(paneId, pane.historyIndex - 1)
    },
    [navigateHistoryIndex],
  )

  const goForward = React.useCallback(
    async (paneId: PaneId) => {
      const pane = panesRef.current[paneId]
      if (pane.historyIndex >= pane.history.length - 1) return
      await navigateHistoryIndex(paneId, pane.historyIndex + 1)
    },
    [navigateHistoryIndex],
  )

  const goUp = React.useCallback(
    async (paneId: PaneId) => {
      const pane = panesRef.current[paneId]
      if (pane.mode === 'tag') {
        const lastDir = [...pane.history]
          .slice(0, Math.max(0, pane.historyIndex + 1))
          .reverse()
          .find((loc): loc is { kind: 'directory'; path: string } => loc.kind === 'directory')
        const fallback = lastDir?.path || pane.path || roots?.homePath || ''
        await navigatePane(paneId, fallback)
        return
      }
      if (!pane.parentPath) return
      await navigatePane(paneId, pane.parentPath)
    },
    [navigatePane, roots?.homePath],
  )

  const refreshPane = React.useCallback(
    async (paneId: PaneId) => {
      const pane = panesRef.current[paneId]
      if (pane.mode === 'tag' && pane.activeTagId) {
        await loadTagView(paneId, pane.activeTagId, { pushHistory: false })
      } else {
        await loadDirectory(paneId, pane.path, { pushHistory: false })
      }
    },
    [loadDirectory, loadTagView],
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
      updatePane(paneId, { groupBy })
      if (pane.mode === 'directory' && groupBy === 'folder') {
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
      if (pane.mode === 'directory') {
        await loadDirectory(paneId, pane.path, {
          pushHistory: false,
          overrideShowHidden: showHidden,
        })
      }
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

  // Favorites actions
  const isFavoritePath = React.useCallback(
    (dirPath: string) => {
      const key = toPathKey(dirPath)
      if (!key) return false
      return favorites.items.some(item => toPathKey(item.path) === key)
    },
    [favorites.items],
  )

  const addFavorite = React.useCallback(
    async (dirPath: string, name?: string, groupId?: string) => {
      try {
        const res = await rpcCall<FavoritesState>('files.favorites.add', {
          path: dirPath,
          name,
          groupId,
        })
        setFavorites(res)
        toast({ title: '已添加到收藏夹', description: name || dirPath, tone: 'success' })
      } catch (err) {
        toast({
          title: '收藏失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
      }
    },
    [],
  )

  const updateFavorite = React.useCallback(
    async (input: { id: string; name?: string; groupId?: string; order?: number }) => {
      try {
        const res = await rpcCall<FavoritesState>('files.favorites.update', input)
        setFavorites(res)
      } catch (err) {
        toast({
          title: '更新收藏失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
      }
    },
    [],
  )

  const removeFavorite = React.useCallback(async (input: { id?: string; path?: string }) => {
    try {
      const res = await rpcCall<FavoritesState>('files.favorites.remove', input)
      setFavorites(res)
      toast({ title: '已从收藏夹移除', tone: 'neutral' })
    } catch (err) {
      toast({
        title: '移除收藏失败',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    }
  }, [])

  const createFavoriteGroup = React.useCallback(async (name: string, color?: string) => {
    try {
      const res = await rpcCall<FavoritesState>('files.favorites.group.create', { name, color })
      setFavorites(res)
      toast({ title: '已创建收藏分组', description: name, tone: 'success' })
    } catch (err) {
      toast({
        title: '创建分组失败',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    }
  }, [])

  const updateFavoriteGroup = React.useCallback(
    async (input: { id: string; name?: string; color?: string; order?: number }) => {
      try {
        const res = await rpcCall<FavoritesState>('files.favorites.group.update', input)
        setFavorites(res)
      } catch (err) {
        toast({
          title: '更新分组失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
      }
    },
    [],
  )

  const deleteFavoriteGroup = React.useCallback(
    async (id: string, mode: 'move-to-default' | 'delete-items' = 'move-to-default') => {
      try {
        const res = await rpcCall<FavoritesState>('files.favorites.group.delete', { id, mode })
        setFavorites(res)
        toast({ title: '已删除收藏分组', tone: 'neutral' })
      } catch (err) {
        toast({
          title: '删除分组失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
      }
    },
    [],
  )

  // Metadata & Tag actions
  const getFileMeta = React.useCallback(
    (filePath: string): FileMetaRecord | null => {
      const key = toPathKey(filePath)
      return key ? (metadata.files[key] ?? null) : null
    },
    [metadata.files],
  )

  const setFileMeta = React.useCallback(
    async (
      filePath: string,
      patch: { rating?: number; tagIds?: readonly string[]; note?: string },
    ) => {
      const key = toPathKey(filePath)
      if (!key) return

      // Optimistic local state update
      setMetadata(prev => {
        const existing = prev.files[key]
        const nextRating = patch.rating !== undefined ? patch.rating : (existing?.rating ?? 0)
        const nextTagIds = patch.tagIds !== undefined ? [...patch.tagIds] : (existing?.tagIds ?? [])
        const nextNote = patch.note !== undefined ? patch.note : (existing?.note ?? '')
        const nextFiles = { ...prev.files }
        if (nextRating === 0 && nextTagIds.length === 0 && nextNote.trim() === '') {
          delete nextFiles[key]
        } else {
          nextFiles[key] = {
            path: filePath,
            rating: nextRating,
            tagIds: nextTagIds,
            note: nextNote,
            updatedAt: Date.now(),
          }
        }
        return {
          ...prev,
          files: nextFiles,
          tagCounts: computeTagCountsLocal(prev.tags, nextFiles),
        }
      })

      // Keep open tag-aggregation panes synchronized when tags are modified
      if (patch.tagIds !== undefined) {
        for (const pId of ['left', 'right'] as const) {
          const pane = panesRef.current[pId]
          if (pane.mode === 'tag' && pane.activeTagId) {
            if (!patch.tagIds.includes(pane.activeTagId)) {
              setPanes(prev => {
                const target = prev[pId]
                const nextEntries = target.entries.filter(e => toPathKey(e.path) !== key)
                return {
                  ...prev,
                  [pId]: {
                    ...target,
                    entries: nextEntries,
                    totalEntries: nextEntries.length,
                  },
                }
              })
            } else {
              void loadTagView(pId, pane.activeTagId, { pushHistory: false })
            }
          }
        }
      }

      try {
        const res = await rpcCall<{
          readonly key: string
          readonly record: FileMetaRecord | null
          readonly tagCounts: Readonly<Record<string, number>>
        }>('files.meta.set', {
          path: filePath,
          ...patch,
        })
        setMetadata(prev => {
          const nextFiles = { ...prev.files }
          if (res.record) {
            nextFiles[res.key] = res.record
          } else {
            delete nextFiles[res.key]
          }
          return {
            ...prev,
            files: nextFiles,
            tagCounts: res.tagCounts,
          }
        })
      } catch (err) {
        toast({
          title: '保存文件标记失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
        await refreshMetadata()
      }
    },
    [loadTagView, refreshMetadata],
  )

  const createTag = React.useCallback(
    async (name: string, color?: string, description?: string): Promise<TagDef | null> => {
      try {
        const res = await rpcCall<{
          readonly tag: TagDef
          readonly tags: readonly TagDef[]
          readonly tagCounts: Readonly<Record<string, number>>
        }>('files.tags.create', { name, color, description })
        setMetadata(prev => ({
          ...prev,
          tags: res.tags,
          tagCounts: res.tagCounts,
        }))
        return res.tag
      } catch (err) {
        toast({
          title: '创建标签失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
        return null
      }
    },
    [],
  )

  const updateTag = React.useCallback(
    async (input: { id: string; name?: string; color?: string; description?: string }) => {
      try {
        const res = await rpcCall<{
          readonly tag: TagDef
          readonly tags: readonly TagDef[]
          readonly tagCounts: Readonly<Record<string, number>>
        }>('files.tags.update', input)
        setMetadata(prev => ({
          ...prev,
          tags: res.tags,
          tagCounts: res.tagCounts,
        }))
      } catch (err) {
        toast({
          title: '更新标签失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
      }
    },
    [],
  )

  const deleteTag = React.useCallback(
    async (id: string) => {
      try {
        const res = await rpcCall<MetadataSnapshot>('files.tags.delete', { id })
        setMetadata(res)
        for (const pId of ['left', 'right'] as const) {
          const pane = panesRef.current[pId]
          if (pane.mode === 'tag' && pane.activeTagId === id) {
            await goUp(pId)
          }
        }
        toast({ title: '已删除标签', tone: 'neutral' })
      } catch (err) {
        toast({
          title: '删除标签失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
      }
    },
    [goUp],
  )

  const pruneMissingTaggedFiles = React.useCallback(
    async (paneId: PaneId) => {
      const pane = panesRef.current[paneId]
      if (pane.missingPaths.length === 0) return
      try {
        const res = await rpcCall<{
          readonly removedCount: number
          readonly files: Readonly<Record<string, FileMetaRecord>>
          readonly tagCounts: Readonly<Record<string, number>>
        }>('files.meta.pruneMissing', { paths: pane.missingPaths })
        setMetadata(prev => ({
          ...prev,
          files: res.files,
          tagCounts: res.tagCounts,
        }))
        setPanes(prev => ({
          ...prev,
          [paneId]: {
            ...prev[paneId],
            missingPaths: [],
          },
        }))
        toast({ title: `已清理 ${res.removedCount} 条失效记录`, tone: 'success' })
      } catch (err) {
        toast({
          title: '清理失效记录失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
      }
    },
    [],
  )

  const openLightboxForEntry = React.useCallback(
    (paneId: PaneId, entry: FileEntry) => {
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
      openLightbox(
        imageList.map(item => ({
          src: buildMediaUrl(item),
          alt: item.name,
          caption: item.name,
        })),
        idx,
      )
    },
    [openLightbox],
  )

  const openInOtherPane = React.useCallback(
    async (dirPath: string) => {
      const otherPane: PaneId = activePaneIdRef.current === 'left' ? 'right' : 'left'
      setDualPane(true)
      await loadDirectory(otherPane, dirPath, { pushHistory: true })
    },
    [loadDirectory],
  )

  React.useEffect(() => {
    if (!interactions) return undefined
    return interactions.registerContextMenu({
      id: 'workspace-files.entry-menu',
      target: 'folio.files.entry',
      order: 10,
      resolve: value => {
        const paneId = value.paneId === 'right' ? 'right' : 'left'
        const targetPath = typeof value.path === 'string' ? value.path : ''
        if (!targetPath) return []

        const pane = panesRef.current[paneId]
        const entry =
          pane.entries.find(item => item.path === targetPath) ??
          pane.childGroups.flatMap(g => g.entries).find(item => item.path === targetPath)
        if (!entry) return []

        const key = toPathKey(entry.path)
        const meta = metadataRef.current.files[key]
        const currentRating = meta?.rating ?? 0
        const currentTagIds = meta?.tagIds ?? []
        const isFav =
          entry.isDir && favoritesRef.current.items.some(item => toPathKey(item.path) === key)

        const actions: FolioContextMenuAction[] = []

        if (entry.isDir) {
          actions.push({
            id: 'files.open-folder',
            label: '进入文件夹',
            run: () => navigatePane(paneId, entry.path),
          })
        } else if (entry.category === 'image') {
          actions.push({
            id: 'files.open-lightbox',
            label: '查看大图',
            run: () => openLightboxForEntry(paneId, entry),
          })
        }

        const otherTargetDir = entry.isDir ? entry.path : getParentDirLabel(entry.path).parentPath
        actions.push({
          id: 'files.open-other-pane',
          label: '在另一栏中打开',
          run: () => openInOtherPane(otherTargetDir),
        })

        if (entry.isDir) {
          actions.push({
            id: 'files.toggle-favorite',
            label: isFav ? '取消收藏文件夹' : '收藏文件夹',
            run: () => (isFav ? removeFavorite({ path: entry.path }) : addFavorite(entry.path)),
          })
        }

        actions.push({
          id: 'files.rating',
          label: currentRating > 0 ? `星级评分 (${currentRating}★)` : '星级评分',
          separatorBefore: true,
          children: [
            {
              id: 'files.rating.clear',
              label: currentRating === 0 ? '✓ 无星级' : '清除星级',
              disabled: currentRating === 0,
              run: () => setFileMeta(entry.path, { rating: 0 }),
            },
            ...[5, 4, 3, 2, 1].map(star => ({
              id: `files.rating.${star}`,
              label: `${currentRating === star ? '✓ ' : ''}${'★'.repeat(star)} ${star} 星`,
              run: () => setFileMeta(entry.path, { rating: star }),
            })),
          ],
        })

        const tagChildren: FolioContextMenuAction[] = metadataRef.current.tags.map(tag => {
          const hasTag = currentTagIds.includes(tag.id)
          return {
            id: `files.tag.${tag.id}`,
            label: `${hasTag ? '✓ ' : ''}${tag.name}`,
            run: () =>
              setFileMeta(entry.path, {
                tagIds: hasTag
                  ? currentTagIds.filter(id => id !== tag.id)
                  : [...currentTagIds, tag.id],
              }),
          }
        })
        tagChildren.push({
          id: 'files.tag.manage',
          label: '管理标签…',
          separatorBefore: tagChildren.length > 0,
          run: () => setTagManagerOpen(true),
        })
        actions.push({
          id: 'files.tags',
          label: '标签',
          children: tagChildren,
        })

        if (!entry.isDir) {
          if (entry.category === 'image') {
            actions.push({
              id: 'files.copy-image',
              label: '复制图片',
              separatorBefore: true,
              failureLabel: '复制图片失败',
              run: () =>
                interactions.copyImage({
                  url: buildMediaUrl(entry),
                  name: entry.name,
                  mediaType: entry.mime,
                }),
            })
          }
          actions.push({
            id: 'files.download',
            label: '下载原文件',
            separatorBefore: entry.category !== 'image',
            failureLabel: '下载文件失败',
            run: () =>
              interactions.saveFile(
                {
                  url: buildDownloadUrl(entry),
                  name: entry.name,
                  mediaType: entry.mime,
                },
                'download',
              ),
          })
          if (interactions.canSaveAs()) {
            actions.push({
              id: 'files.save-as',
              label: '另存为…',
              failureLabel: '保存文件失败',
              run: () =>
                interactions.saveFile(
                  {
                    url: buildDownloadUrl(entry),
                    name: entry.name,
                    mediaType: entry.mime,
                  },
                  'saveAs',
                ),
            })
          }
        }

        actions.push(
          {
            id: 'files.copy-path',
            label: '复制完整路径',
            separatorBefore: true,
            run: async () => {
              const ok = await copyTextToClipboard(entry.path)
              if (ok) {
                toast({ title: '已复制文件路径', description: entry.path, tone: 'success' })
              }
            },
          },
          {
            id: 'files.reveal',
            label: '在系统资源管理器中打开',
            run: () => revealInExplorer(entry.path),
          },
        )

        return actions
      },
    })
  }, [
    interactions,
    navigatePane,
    openLightboxForEntry,
    openInOtherPane,
    addFavorite,
    removeFavorite,
    setFileMeta,
    revealInExplorer,
  ])

  const value = React.useMemo<FilesContextValue>(
    () => ({
      interactions,
      roots,
      rootsLoading,
      favorites,
      metadata,
      panes,
      activePaneId,
      dualPane,
      selectedEntry,
      selectedPaneId,
      treeChildren,
      treeExpanded,
      treeLoading,
      lightbox,
      favoritesManagerOpen,
      tagManagerOpen,
      setFavoritesManagerOpen,
      setTagManagerOpen,
      setActivePane: setActivePaneId,
      toggleDualPane,
      closeSecondaryPane,
      navigatePane,
      navigateActivePane,
      openInOtherPane,
      openTagView,
      openTagViewActivePane,
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
      isFavoritePath,
      addFavorite,
      updateFavorite,
      removeFavorite,
      createFavoriteGroup,
      updateFavoriteGroup,
      deleteFavoriteGroup,
      getFileMeta,
      setFileMeta,
      createTag,
      updateTag,
      deleteTag,
      pruneMissingTaggedFiles,
    }),
    [
      interactions,
      roots,
      rootsLoading,
      favorites,
      metadata,
      panes,
      activePaneId,
      dualPane,
      selectedEntry,
      selectedPaneId,
      treeChildren,
      treeExpanded,
      treeLoading,
      lightbox,
      favoritesManagerOpen,
      tagManagerOpen,
      toggleDualPane,
      closeSecondaryPane,
      navigatePane,
      navigateActivePane,
      openInOtherPane,
      openTagView,
      openTagViewActivePane,
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
      isFavoritePath,
      addFavorite,
      updateFavorite,
      removeFavorite,
      createFavoriteGroup,
      updateFavoriteGroup,
      deleteFavoriteGroup,
      getFileMeta,
      setFileMeta,
      createTag,
      updateTag,
      deleteTag,
      pruneMissingTaggedFiles,
    ],
  )

  return <FilesContext.Provider value={value}>{children}</FilesContext.Provider>
}
