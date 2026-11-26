import * as React from 'react'
import { rpcCall, useFolioEvents } from '@folio/base-contract/rpc'
import { toast } from '@folio/base-ui-kit/client'
import {
  AssetRecordType,
  atom,
  createShapeId,
  getSnapshot,
  type Editor,
  type JsonObject,
  type TLAsset,
  type TLAssetId,
  type TLImageAsset,
  type TLImageShape,
  type TLShapeId,
} from 'tldraw'
import {
  buildFolioLinkSrc,
  computeCanvasImageGeometry,
  extractFolioLinkMeta,
  stripInlineImagesFromSnapshot,
} from './lod.js'
import type {
  BatchRelocateResult,
  BoardDocument,
  BoardLinkedImageItem,
  BoardMeta,
  BoardSaveResult,
  CanvasCacheStats,
  LinkCheckEntry,
  LinkStatus,
  LinkedImageInspectResult,
  PickerMode,
  PickerRequest,
} from './types.js'

const ACTIVE_BOARD_STORAGE_KEY = 'folio.canvas.activeBoard'
const SAVE_DEBOUNCE_MS = 800

function readStoredActiveBoardId(): string {
  try {
    return typeof localStorage !== 'undefined'
      ? (localStorage.getItem(ACTIVE_BOARD_STORAGE_KEY) ?? '')
      : ''
  } catch {
    return ''
  }
}

function writeStoredActiveBoardId(id: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ACTIVE_BOARD_STORAGE_KEY, id)
    }
  } catch {
    // ignore storage failures
  }
}

function createLinkId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizePathKey(p: string): string {
  return p.trim().toLowerCase()
}

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

export interface CanvasContextValue {
  readonly boards: readonly BoardMeta[]
  readonly boardsLoading: boolean
  readonly boardsError: string | null
  readonly activeBoardId: string
  readonly activeBoard: BoardMeta | null
  readonly activeDoc: BoardDocument | null
  readonly docLoading: boolean
  readonly saveStatus: SaveStatus
  readonly linkedImages: readonly BoardLinkedImageItem[]
  readonly brokenCount: number
  readonly relinkPanelOpen: boolean
  readonly relinkFilter: 'all' | 'missing'
  readonly selectedBrokenAssetId: string | null
  readonly pickerRequest: PickerRequest | null
  readonly cacheStats: CanvasCacheStats | null
  readonly CanvasStageComponent?: React.ComponentType
  setRelinkPanelOpen(open: boolean): void
  setRelinkFilter(filter: 'all' | 'missing'): void
  setSelectedBrokenAssetId(assetId: string | null): void
  openPicker(request: PickerRequest): void
  closePicker(): void
  refreshBoards(): Promise<void>
  selectBoard(id: string): Promise<void>
  createBoard(title?: string): Promise<BoardMeta | null>
  renameBoard(id: string, title: string): Promise<void>
  duplicateBoard(id: string): Promise<void>
  deleteBoard(id: string): Promise<void>
  attachEditor(editor: Editor | null): void
  syncLinkedImagesFromEditor(): void
  scheduleSave(): void
  saveNow(): Promise<void>
  checkAllLinks(): Promise<void>
  getLinkStatus(linkId: string): LinkStatus
  markLinkMissingByPath(localPath: string): void
  insertLinkedImages(
    paths: readonly string[],
    dropPoint?: { readonly x: number; readonly y: number },
  ): Promise<void>
  pickAndInsertImages(dropPoint?: { readonly x: number; readonly y: number }): Promise<void>
  relinkAsset(assetId: string, newLocalPath: string): Promise<boolean>
  pickAndRelinkImage(assetId: string): Promise<void>
  batchRelocateFromFolder(folderPath: string): Promise<number>
  pickAndBatchRelocate(): Promise<void>
  focusLinkedImage(assetId: string): void
  revealLinkedImage(localPath: string): Promise<void>
  refreshCacheStats(): Promise<void>
  clearLodCache(): Promise<void>
  linkElectronDroppedFile(
    asset: TLAsset,
    localPath: string,
  ): Promise<{ readonly src: string; readonly meta: JsonObject }>
  handleBlockedWebUpload(file: File): void
}

const CanvasContext = React.createContext<CanvasContextValue | null>(null)

export function useCanvas(): CanvasContextValue {
  const ctx = React.useContext(CanvasContext)
  if (!ctx) throw new Error('useCanvas 必须在 CanvasProvider 内使用')
  return ctx
}

export interface CanvasProviderProps {
  readonly children: React.ReactNode
  readonly CanvasStageComponent?: React.ComponentType
}

export function CanvasProvider({
  children,
  CanvasStageComponent,
}: CanvasProviderProps): React.ReactElement {
  const [boards, setBoards] = React.useState<readonly BoardMeta[]>([])
  const [boardsLoading, setBoardsLoading] = React.useState(true)
  const [boardsError, setBoardsError] = React.useState<string | null>(null)
  const [activeBoardId, setActiveBoardId] = React.useState<string>(() => readStoredActiveBoardId())
  const [activeDoc, setActiveDoc] = React.useState<BoardDocument | null>(null)
  const [docLoading, setDocLoading] = React.useState(false)
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>('saved')

  const [linkedImages, setLinkedImages] = React.useState<readonly BoardLinkedImageItem[]>([])
  const [linkStatuses, setLinkStatuses] = React.useState<Readonly<Record<string, LinkStatus>>>({})
  const linkStatusesRef = React.useRef<Readonly<Record<string, LinkStatus>>>({})
  linkStatusesRef.current = linkStatuses
  const linkStatusesAtomRef = React.useRef(
    atom<Readonly<Record<string, LinkStatus>>>('folioLinkStatuses', {}),
  )

  const updateLinkStatuses = React.useCallback(
    (
      nextOrUpdater:
        | Readonly<Record<string, LinkStatus>>
        | ((prev: Readonly<Record<string, LinkStatus>>) => Readonly<Record<string, LinkStatus>>),
    ) => {
      const next =
        typeof nextOrUpdater === 'function'
          ? nextOrUpdater(linkStatusesRef.current)
          : nextOrUpdater
      linkStatusesRef.current = next
      linkStatusesAtomRef.current.set(next)
      setLinkStatuses(next)
    },
    [],
  )

  const [relinkPanelOpen, setRelinkPanelOpen] = React.useState(false)
  const [relinkFilter, setRelinkFilter] = React.useState<'all' | 'missing'>('all')
  const [selectedBrokenAssetId, setSelectedBrokenAssetId] = React.useState<string | null>(null)
  const [pickerRequest, setPickerRequest] = React.useState<PickerRequest | null>(null)
  const [cacheStats, setCacheStats] = React.useState<CanvasCacheStats | null>(null)

  const editorRef = React.useRef<Editor | null>(null)
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = React.useRef(false)
  const activeBoardIdRef = React.useRef(activeBoardId)
  activeBoardIdRef.current = activeBoardId
  const linkedImagesRef = React.useRef(linkedImages)
  linkedImagesRef.current = linkedImages

  const activeBoard = React.useMemo(
    () => boards.find(b => b.id === activeBoardId) ?? null,
    [boards, activeBoardId],
  )

  const brokenCount = React.useMemo(
    () => linkedImages.filter(item => item.status === 'missing').length,
    [linkedImages],
  )

  const refreshCacheStats = React.useCallback(async () => {
    try {
      const stats = await rpcCall<CanvasCacheStats>('canvas.cache.stats', {})
      setCacheStats(stats)
    } catch {
      // ignore non-fatal stats failure
    }
  }, [])

  const clearLodCache = React.useCallback(async () => {
    try {
      const stats = await rpcCall<CanvasCacheStats>('canvas.cache.clear', {})
      setCacheStats(stats)
      toast({ title: '已清空 LOD 代理图缓存', tone: 'success' })
    } catch (err) {
      toast({
        title: '清空缓存失败',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    }
  }, [])

  const checkAllLinksWithItems = React.useCallback(
    async (items: readonly BoardLinkedImageItem[]) => {
      if (items.length === 0) {
        updateLinkStatuses({})
        return
      }
      const paths = items.map(i => i.meta.localPath)
      try {
        const res = await rpcCall<{ readonly items: readonly LinkCheckEntry[] }>(
          'canvas.links.check',
          { paths },
        )
        const byPath = new Map<string, boolean>()
        for (const entry of res.items) {
          byPath.set(normalizePathKey(entry.path), entry.exists)
        }
        const nextStatuses: Record<string, LinkStatus> = {}
        let nextBroken = 0
        for (const item of items) {
          const exists = byPath.get(normalizePathKey(item.meta.localPath))
          const status: LinkStatus = exists === false ? 'missing' : 'ok'
          nextStatuses[item.meta.linkId] = status
          if (status === 'missing') nextBroken += 1
        }
        updateLinkStatuses(nextStatuses)
        setLinkedImages(prev =>
          prev.map(item => ({
            ...item,
            status: nextStatuses[item.meta.linkId] ?? item.status,
          })),
        )
        setBoards(prev =>
          prev.map(b =>
            b.id === activeBoardIdRef.current
              ? { ...b, imageCount: items.length, brokenCount: nextBroken }
              : b,
          ),
        )
      } catch {
        // Keep current status on transient error
      }
    },
    [updateLinkStatuses],
  )

  const collectLinkedImagesFromEditor = React.useCallback((): BoardLinkedImageItem[] => {
    const editor = editorRef.current
    if (!editor) return []

    const allRecords = editor.store.allRecords()
    const shapesByAsset = new Map<string, string[]>()
    const assets: TLImageAsset[] = []

    for (const rec of allRecords) {
      if (rec.typeName === 'shape' && rec.type === 'image') {
        const shape = rec as TLImageShape
        const assetId = shape.props?.assetId
        if (assetId) {
          const list = shapesByAsset.get(assetId)
          if (list) list.push(shape.id)
          else shapesByAsset.set(assetId, [shape.id])
        }
      } else if (rec.typeName === 'asset' && rec.type === 'image') {
        assets.push(rec as TLImageAsset)
      }
    }

    const items: BoardLinkedImageItem[] = []
    for (const asset of assets) {
      const meta = extractFolioLinkMeta(asset)
      if (!meta) continue
      const shapeIds = shapesByAsset.get(asset.id) ?? []
      if (shapeIds.length === 0) continue
      items.push({
        assetId: asset.id,
        shapeIds,
        meta,
        status: linkStatusesRef.current[meta.linkId] ?? 'ok',
      })
    }
    return items
  }, [])

  const syncLinkedImagesFromEditor = React.useCallback(() => {
    const items = collectLinkedImagesFromEditor()
    setLinkedImages(items)
    return items
  }, [collectLinkedImagesFromEditor])

  const checkAllLinks = React.useCallback(async () => {
    const items = collectLinkedImagesFromEditor()
    setLinkedImages(items)
    await checkAllLinksWithItems(items)
  }, [collectLinkedImagesFromEditor, checkAllLinksWithItems])

  const saveNow = React.useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const editor = editorRef.current
    const boardId = activeBoardIdRef.current
    if (!editor || !boardId) return

    dirtyRef.current = false
    setSaveStatus('saving')
    try {
      const rawSnapshot = getSnapshot(editor.store) as unknown as Record<string, unknown>
      const snapshot = stripInlineImagesFromSnapshot(rawSnapshot)
      const items = collectLinkedImagesFromEditor()
      const currentBroken = items.filter(
        i => (linkStatusesRef.current[i.meta.linkId] ?? i.status) === 'missing',
      ).length
      const res = await rpcCall<BoardSaveResult>('canvas.boards.save', {
        id: boardId,
        snapshot,
        brokenCount: currentBroken,
      })
      setSaveStatus('saved')
      setBoards(prev =>
        prev
          .map(b => (b.id === res.meta.id ? res.meta : b))
          .sort((a, b) => b.updatedAt - a.updatedAt),
      )
    } catch {
      setSaveStatus('error')
    }
  }, [collectLinkedImagesFromEditor])

  const scheduleSave = React.useCallback(() => {
    dirtyRef.current = true
    setSaveStatus('dirty')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void saveNow()
    }, SAVE_DEBOUNCE_MS)
  }, [saveNow])

  const loadBoardDocument = React.useCallback(async (boardId: string) => {
    if (!boardId) {
      setActiveDoc(null)
      return
    }
    setDocLoading(true)
    try {
      const doc = await rpcCall<BoardDocument>('canvas.boards.get', { id: boardId })
      if (activeBoardIdRef.current === boardId) {
        setActiveDoc(doc)
        setSaveStatus('saved')
      }
    } catch (err) {
      toast({
        title: '读取画板失败',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    } finally {
      if (activeBoardIdRef.current === boardId) {
        setDocLoading(false)
      }
    }
  }, [])

  const refreshBoards = React.useCallback(async () => {
    setBoardsLoading(true)
    setBoardsError(null)
    try {
      const res = await rpcCall<{ readonly boards: readonly BoardMeta[] }>('canvas.boards.list', {})
      setBoards(res.boards)
      const current = activeBoardIdRef.current
      const chosen = res.boards.some(b => b.id === current)
        ? current
        : (res.boards[0]?.id ?? '')
      if (chosen && chosen !== current) {
        setActiveBoardId(chosen)
        activeBoardIdRef.current = chosen
        writeStoredActiveBoardId(chosen)
      }
      if (chosen) {
        await loadBoardDocument(chosen)
      }
    } catch (err) {
      setBoardsError(err instanceof Error ? err.message : String(err))
    } finally {
      setBoardsLoading(false)
    }
  }, [loadBoardDocument])

  React.useEffect(() => {
    void refreshBoards()
    void refreshCacheStats()
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      if (dirtyRef.current) {
        void saveNow()
      }
    }
  }, [refreshBoards, refreshCacheStats, saveNow])

  useFolioEvents({
    onInvalidate: ev => {
      if (ev.scope === 'canvas' || ev.scope === '*') {
        void rpcCall<{ readonly boards: readonly BoardMeta[] }>('canvas.boards.list', {})
          .then(res => setBoards(res.boards))
          .catch(() => {})
      }
    },
  })

  // Re-check linked files whenever window regains focus (catches external moves in Explorer)
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onFocus = () => {
      if (linkedImagesRef.current.length > 0) {
        void checkAllLinks()
      }
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [checkAllLinks])

  const selectBoard = React.useCallback(
    async (id: string) => {
      if (id === activeBoardIdRef.current && activeDoc?.id === id) return
      if (dirtyRef.current) {
        await saveNow()
      }
      setLinkedImages([])
      updateLinkStatuses({})
      setSelectedBrokenAssetId(null)
      setActiveBoardId(id)
      activeBoardIdRef.current = id
      writeStoredActiveBoardId(id)
      await loadBoardDocument(id)
    },
    [activeDoc?.id, loadBoardDocument, saveNow],
  )

  const createBoard = React.useCallback(
    async (title?: string): Promise<BoardMeta | null> => {
      try {
        if (dirtyRef.current) {
          await saveNow()
        }
        const res = await rpcCall<{ readonly board: BoardMeta }>('canvas.boards.create', {
          title,
        })
        setBoards(prev => [res.board, ...prev])
        await selectBoard(res.board.id)
        return res.board
      } catch (err) {
        toast({
          title: '创建画板失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
        return null
      }
    },
    [saveNow, selectBoard],
  )

  const renameBoard = React.useCallback(async (id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      const res = await rpcCall<{ readonly board: BoardMeta }>('canvas.boards.rename', {
        id,
        title: trimmed,
      })
      setBoards(prev => prev.map(b => (b.id === id ? res.board : b)))
    } catch (err) {
      toast({
        title: '重命名画板失败',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    }
  }, [])

  const duplicateBoard = React.useCallback(
    async (id: string) => {
      try {
        if (id === activeBoardIdRef.current && dirtyRef.current) {
          await saveNow()
        }
        const res = await rpcCall<{ readonly board: BoardMeta }>('canvas.boards.duplicate', {
          id,
        })
        setBoards(prev => [res.board, ...prev])
        await selectBoard(res.board.id)
      } catch (err) {
        toast({
          title: '复制画板失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
      }
    },
    [saveNow, selectBoard],
  )

  const deleteBoard = React.useCallback(
    async (id: string) => {
      try {
        const res = await rpcCall<{
          readonly deletedId: string
          readonly boards: readonly BoardMeta[]
        }>('canvas.boards.delete', { id })
        setBoards(res.boards)
        if (activeBoardIdRef.current === id) {
          const nextId = res.boards[0]?.id ?? ''
          setActiveBoardId(nextId)
          activeBoardIdRef.current = nextId
          writeStoredActiveBoardId(nextId)
          if (nextId) await loadBoardDocument(nextId)
        }
      } catch (err) {
        toast({
          title: '删除画板失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
      }
    },
    [loadBoardDocument],
  )

  const attachEditor = React.useCallback(
    (editor: Editor | null) => {
      editorRef.current = editor
      if (!editor) return
      const items = collectLinkedImagesFromEditor()
      setLinkedImages(items)
      void checkAllLinksWithItems(items)
    },
    [checkAllLinksWithItems, collectLinkedImagesFromEditor],
  )

  const getLinkStatus = React.useCallback(
    (linkId: string): LinkStatus => linkStatusesAtomRef.current.get()[linkId] ?? 'ok',
    [],
  )

  const markLinkMissingByPath = React.useCallback((localPath: string) => {
    const targetKey = normalizePathKey(localPath)
    const affectedLinkIds: string[] = []
    for (const item of linkedImagesRef.current) {
      if (normalizePathKey(item.meta.localPath) === targetKey) {
        affectedLinkIds.push(item.meta.linkId)
      }
    }
    if (affectedLinkIds.length === 0) return

    updateLinkStatuses(prev => {
      const next = { ...prev }
      for (const id of affectedLinkIds) next[id] = 'missing'
      return next
    })
    setLinkedImages(prev =>
      prev.map(item =>
        affectedLinkIds.includes(item.meta.linkId) ? { ...item, status: 'missing' } : item,
      ),
    )
  }, [updateLinkStatuses])

  const insertLinkedImages = React.useCallback(
    async (
      paths: readonly string[],
      dropPoint?: { readonly x: number; readonly y: number },
    ) => {
      const editor = editorRef.current
      if (!editor || paths.length === 0) return

      try {
        const res = await rpcCall<{ readonly items: readonly LinkedImageInspectResult[] }>(
          'canvas.links.inspect',
          { paths },
        )
        const validItems = res.items.filter(item => item.exists && item.isImage)
        if (validItems.length === 0) {
          toast({
            title: '未找到可用的本地图片文件',
            description: '请选择常见的图片格式（PNG / JPG / WebP / GIF / SVG 等）。',
            tone: 'danger',
          })
          return
        }

        const anchor = dropPoint ?? editor.getViewportPageBounds().center
        const assetsToCreate: TLAsset[] = []
        const shapesToCreate: Array<{
          id: TLShapeId
          type: 'image'
          x: number
          y: number
          props: { assetId: TLAssetId; w: number; h: number }
        }> = []

        validItems.forEach((info, index) => {
          const linkId = createLinkId()
          const { assetW, assetH, shapeW, shapeH } = computeCanvasImageGeometry(
            info.naturalWidth,
            info.naturalHeight,
          )
          const assetId = AssetRecordType.createId()
          const shapeId = createShapeId()
          const offset = index * 28

          const asset = AssetRecordType.create({
            id: assetId,
            type: 'image',
            props: {
              name: info.fileName,
              src: buildFolioLinkSrc(linkId),
              w: assetW,
              h: assetH,
              mimeType: info.mime,
              isAnimated: info.ext === '.gif',
              fileSize: info.size,
            },
            meta: {
              folioLink: true,
              linkId,
              localPath: info.path,
              fileName: info.fileName,
              fileSize: info.size,
              mtimeMs: info.mtimeMs,
              naturalWidth: info.naturalWidth,
              naturalHeight: info.naturalHeight,
              mime: info.mime,
              relinkRev: 0,
            },
          })

          assetsToCreate.push(asset)
          shapesToCreate.push({
            id: shapeId,
            type: 'image',
            x: anchor.x - shapeW / 2 + offset,
            y: anchor.y - shapeH / 2 + offset,
            props: {
              assetId,
              w: shapeW,
              h: shapeH,
            },
          })
        })

        editor.run(() => {
          editor.createAssets(assetsToCreate)
          editor.createShapes(shapesToCreate)
          editor.select(...shapesToCreate.map(s => s.id))
        })

        const nextItems = syncLinkedImagesFromEditor()
        await checkAllLinksWithItems(nextItems)
        await saveNow()
        void refreshCacheStats()
      } catch (err) {
        toast({
          title: '链接图片失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
      }
    },
    [checkAllLinksWithItems, refreshCacheStats, saveNow, syncLinkedImagesFromEditor],
  )

  const pickAndInsertImages = React.useCallback(
    async (dropPoint?: { readonly x: number; readonly y: number }) => {
      try {
        const res = await rpcCall<{
          readonly supported: boolean
          readonly cancelled: boolean
          readonly paths: readonly string[]
        }>('canvas.dialog.pickImages', { multi: true })
        if (res.supported) {
          if (!res.cancelled && res.paths.length > 0) {
            await insertLinkedImages(res.paths, dropPoint)
          }
          return
        }
      } catch {
        // Fallback to built-in picker dialog
      }
      setPickerRequest({ mode: 'insert', dropPoint })
    },
    [insertLinkedImages],
  )

  const applyRelinkToEditor = React.useCallback(
    (assetId: string, inspected: LinkedImageInspectResult): boolean => {
      const editor = editorRef.current
      if (!editor) return false

      const assetRecord = editor.getAsset(assetId as TLAssetId)
      if (!assetRecord || assetRecord.type !== 'image') return false

      const prevMeta = extractFolioLinkMeta(assetRecord)
      const nextRev = (prevMeta?.relinkRev ?? 0) + 1
      const linkId = prevMeta?.linkId || createLinkId()
      const { assetW, assetH } = computeCanvasImageGeometry(
        inspected.naturalWidth,
        inspected.naturalHeight,
      )

      const referencingShapes = editor
        .getCurrentPageShapes()
        .filter((s): s is TLImageShape => s.type === 'image' && s.props.assetId === assetId)

      editor.run(() => {
        editor.updateAssets([
          {
            id: assetRecord.id,
            typeName: 'asset',
            type: 'image',
            props: {
              ...assetRecord.props,
              name: inspected.fileName,
              src: buildFolioLinkSrc(linkId),
              w: assetW,
              h: assetH,
              mimeType: inspected.mime,
              fileSize: inspected.size,
              isAnimated: inspected.ext === '.gif',
            },
            meta: {
              ...(assetRecord.meta ?? {}),
              folioLink: true,
              linkId,
              localPath: inspected.path,
              fileName: inspected.fileName,
              fileSize: inspected.size,
              mtimeMs: inspected.mtimeMs,
              naturalWidth: inspected.naturalWidth,
              naturalHeight: inspected.naturalHeight,
              mime: inspected.mime,
              relinkRev: nextRev,
            },
          },
        ])

        if (referencingShapes.length > 0) {
          editor.updateShapes(
            referencingShapes.map(shape => ({
              id: shape.id,
              type: 'image' as const,
              props: {
                w: shape.props.w,
                h: Math.max(24, Math.round(shape.props.w * (assetH / assetW))),
              },
            })),
          )
        }
      })

      updateLinkStatuses(prev => ({ ...prev, [linkId]: 'ok' }))
      return true
    },
    [updateLinkStatuses],
  )

  const relinkAsset = React.useCallback(
    async (assetId: string, newLocalPath: string): Promise<boolean> => {
      try {
        const res = await rpcCall<{ readonly items: readonly LinkedImageInspectResult[] }>(
          'canvas.links.inspect',
          { paths: [newLocalPath] },
        )
        const inspected = res.items[0]
        if (!inspected || !inspected.exists || !inspected.isImage) {
          toast({
            title: '无法重新链接图片',
            description: '目标文件不存在或不是受支持的图片格式。',
            tone: 'danger',
          })
          return false
        }

        const updated = applyRelinkToEditor(assetId, inspected)
        if (!updated) return false

        const nextItems = syncLinkedImagesFromEditor()
        await checkAllLinksWithItems(nextItems)
        await saveNow()
        void refreshCacheStats()
        toast({ title: `已重新链接: ${inspected.fileName}`, tone: 'success' })
        return true
      } catch (err) {
        toast({
          title: '重新链接失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
        return false
      }
    },
    [
      applyRelinkToEditor,
      checkAllLinksWithItems,
      refreshCacheStats,
      saveNow,
      syncLinkedImagesFromEditor,
    ],
  )

  const pickAndRelinkImage = React.useCallback(
    async (assetId: string) => {
      const target = linkedImagesRef.current.find(i => i.assetId === assetId)
      const initialDir = target?.meta.localPath
        ? target.meta.localPath.replace(/[\\/][^\\/]+$/, '')
        : undefined
      try {
        const res = await rpcCall<{
          readonly supported: boolean
          readonly cancelled: boolean
          readonly paths: readonly string[]
        }>('canvas.dialog.pickImages', {
          multi: false,
          initialDir,
        })
        if (res.supported) {
          if (!res.cancelled && res.paths[0]) {
            await relinkAsset(assetId, res.paths[0])
          }
          return
        }
      } catch {
        // Fallback to built-in picker
      }
      setPickerRequest({
        mode: 'relink',
        targetAssetId: assetId,
        targetFileName: target?.meta.fileName,
        initialDir,
      })
    },
    [relinkAsset],
  )

  const batchRelocateFromFolder = React.useCallback(
    async (folderPath: string): Promise<number> => {
      const missingItems = linkedImagesRef.current
        .filter(item => item.status === 'missing')
        .map(item => ({
          linkId: item.meta.linkId,
          fileName: item.meta.fileName,
          expectedSize: item.meta.fileSize > 0 ? item.meta.fileSize : undefined,
        }))

      if (missingItems.length === 0) {
        toast({ title: '当前画板没有失效的图片链接', tone: 'info' })
        return 0
      }

      try {
        const res = await rpcCall<BatchRelocateResult>('canvas.links.relocateInFolder', {
          folderPath,
          missingItems,
        })

        let matchedCount = 0
        const editor = editorRef.current
        if (editor && res.matches.length > 0) {
          editor.run(() => {
            for (const match of res.matches) {
              const target = linkedImagesRef.current.find(
                item => item.meta.linkId === match.linkId,
              )
              if (target && applyRelinkToEditor(target.assetId, match.inspected)) {
                matchedCount += 1
              }
            }
          })
        }

        if (matchedCount > 0) {
          const nextItems = syncLinkedImagesFromEditor()
          await checkAllLinksWithItems(nextItems)
          await saveNow()
          void refreshCacheStats()
        }

        toast({
          title: `已自动重新链接 ${matchedCount} / ${missingItems.length} 张图片`,
          description: `共扫描 ${res.scannedFiles} 个本地文件`,
          tone: matchedCount > 0 ? 'success' : 'info',
        })
        return matchedCount
      } catch (err) {
        toast({
          title: '批量重定位失败',
          description: err instanceof Error ? err.message : String(err),
          tone: 'danger',
        })
        return 0
      }
    },
    [
      applyRelinkToEditor,
      checkAllLinksWithItems,
      refreshCacheStats,
      saveNow,
      syncLinkedImagesFromEditor,
    ],
  )

  const pickAndBatchRelocate = React.useCallback(async () => {
    try {
      const res = await rpcCall<{
        readonly supported: boolean
        readonly cancelled: boolean
        readonly folderPath: string | null
      }>('canvas.dialog.pickFolder', {})
      if (res.supported) {
        if (!res.cancelled && res.folderPath) {
          await batchRelocateFromFolder(res.folderPath)
        }
        return
      }
    } catch {
      // Fallback to built-in folder picker
    }
    setPickerRequest({ mode: 'relocate-folder' })
  }, [batchRelocateFromFolder])

  const focusLinkedImage = React.useCallback((assetId: string) => {
    const editor = editorRef.current
    const target = linkedImagesRef.current.find(item => item.assetId === assetId)
    if (!editor || !target || target.shapeIds.length === 0) return
    editor.select(target.shapeIds[0] as TLShapeId)
    editor.zoomToSelection({ animation: { duration: 240 } })
  }, [])

  const revealLinkedImage = React.useCallback(async (localPath: string) => {
    try {
      await rpcCall('canvas.links.reveal', { path: localPath })
    } catch (err) {
      toast({
        title: '无法打开所在位置',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      })
    }
  }, [])

  const linkElectronDroppedFile = React.useCallback(
    async (_asset: TLAsset, localPath: string) => {
      const res = await rpcCall<{ readonly items: readonly LinkedImageInspectResult[] }>(
        'canvas.links.inspect',
        { paths: [localPath] },
      )
      const inspected = res.items[0]
      if (!inspected || !inspected.exists || !inspected.isImage) {
        throw new Error('拖拽的文件不存在或不是受支持的图片格式')
      }
      const linkId = createLinkId()
      updateLinkStatuses(prev => ({ ...prev, [linkId]: 'ok' }))
      return {
        src: buildFolioLinkSrc(linkId),
        meta: {
          folioLink: true,
          linkId,
          localPath: inspected.path,
          fileName: inspected.fileName,
          fileSize: inspected.size,
          mtimeMs: inspected.mtimeMs,
          naturalWidth: inspected.naturalWidth,
          naturalHeight: inspected.naturalHeight,
          mime: inspected.mime,
          relinkRev: 0,
        },
      }
    },
    [],
  )

  const handleBlockedWebUpload = React.useCallback((file: File) => {
    toast({
      title: `画板仅支持文件链接（已阻止嵌入 ${file.name}）`,
      description: '浏览器拖入的文件缺少磁盘绝对路径，请通过「链接图片」选择器或从文件浏览器拖入。',
      tone: 'info',
    })
    setPickerRequest(curr => curr ?? { mode: 'insert' })
  }, [])

  const value: CanvasContextValue = React.useMemo(
    () => ({
      boards,
      boardsLoading,
      boardsError,
      activeBoardId,
      activeBoard,
      activeDoc,
      docLoading,
      saveStatus,
      linkedImages,
      brokenCount,
      relinkPanelOpen,
      relinkFilter,
      selectedBrokenAssetId,
      pickerRequest,
      cacheStats,
      CanvasStageComponent,
      setRelinkPanelOpen,
      setRelinkFilter,
      setSelectedBrokenAssetId,
      openPicker: req => setPickerRequest(req),
      closePicker: () => setPickerRequest(null),
      refreshBoards,
      selectBoard,
      createBoard,
      renameBoard,
      duplicateBoard,
      deleteBoard,
      attachEditor,
      syncLinkedImagesFromEditor,
      scheduleSave,
      saveNow,
      checkAllLinks,
      getLinkStatus,
      markLinkMissingByPath,
      insertLinkedImages,
      pickAndInsertImages,
      relinkAsset,
      pickAndRelinkImage,
      batchRelocateFromFolder,
      pickAndBatchRelocate,
      focusLinkedImage,
      revealLinkedImage,
      refreshCacheStats,
      clearLodCache,
      linkElectronDroppedFile,
      handleBlockedWebUpload,
    }),
    [
      boards,
      boardsLoading,
      boardsError,
      activeBoardId,
      activeBoard,
      activeDoc,
      docLoading,
      saveStatus,
      linkedImages,
      brokenCount,
      relinkPanelOpen,
      relinkFilter,
      selectedBrokenAssetId,
      pickerRequest,
      cacheStats,
      CanvasStageComponent,
      refreshBoards,
      selectBoard,
      createBoard,
      renameBoard,
      duplicateBoard,
      deleteBoard,
      attachEditor,
      syncLinkedImagesFromEditor,
      scheduleSave,
      saveNow,
      checkAllLinks,
      getLinkStatus,
      markLinkMissingByPath,
      insertLinkedImages,
      pickAndInsertImages,
      relinkAsset,
      pickAndRelinkImage,
      batchRelocateFromFolder,
      pickAndBatchRelocate,
      focusLinkedImage,
      revealLinkedImage,
      refreshCacheStats,
      clearLodCache,
      linkElectronDroppedFile,
      handleBlockedWebUpload,
    ],
  )

  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>
}

export type { PickerMode }
