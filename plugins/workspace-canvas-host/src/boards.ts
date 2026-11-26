import crypto from 'node:crypto'
import { FolioError, type PluginStorageNamespace } from '@folio/base-contract'
import {
  BoardDocumentSchema,
  BoardIndexStateSchema,
  type BoardDocument,
  type BoardIndexState,
  type BoardMeta,
  type BoardSaveResult,
} from './types.js'

const DEFAULT_BOARD_TITLE = '默认画板'

function createBoardId(): string {
  return `board-${crypto.randomBytes(6).toString('hex')}`
}

function createEmptyBoardSnapshot(): Record<string, unknown> {
  return {
    document: {
      store: {},
      schema: {
        schemaVersion: 2,
        sequences: {},
      },
    },
    session: {
      version: 0,
      currentPageId: 'page:page',
      exportBackground: true,
      isFocusMode: false,
      isDebugMode: false,
      isToolLocked: false,
      isGridMode: false,
      pageStates: [
        {
          pageId: 'page:page',
          camera: { x: 0, y: 0, z: 1 },
          selectedShapeIds: [],
          focusedGroupId: null,
        },
      ],
    },
  }
}

function cloneRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

function sanitizeStoreMap(store: Record<string, unknown>): {
  strippedInlineCount: number
  imageCount: number
} {
  let strippedInlineCount = 0
  let imageCount = 0

  for (const rawRecord of Object.values(store)) {
    if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) continue
    const record = rawRecord as Record<string, unknown>
    if (record.typeName !== 'asset' || record.type !== 'image') continue

    const props =
      record.props && typeof record.props === 'object' && !Array.isArray(record.props)
        ? (record.props as Record<string, unknown>)
        : null
    const meta =
      record.meta && typeof record.meta === 'object' && !Array.isArray(record.meta)
        ? (record.meta as Record<string, unknown>)
        : null

    if (props && typeof props.src === 'string') {
      if (props.src.startsWith('data:')) {
        props.src = ''
        strippedInlineCount += 1
      } else if (props.src.startsWith('folio-link://v1/')) {
        props.src = `asset:folio-link/v1/${props.src.slice('folio-link://v1/'.length)}`
      }
    }

    const src = props && typeof props.src === 'string' ? props.src : ''
    const isLinked =
      Boolean(meta?.folioLink) ||
      src.startsWith('asset:folio-link/') ||
      src.startsWith('folio-link://')
    if (isLinked) {
      imageCount += 1
    }
  }

  return { strippedInlineCount, imageCount }
}

/**
 * Enforces the link-only persistence invariant on board snapshots:
 * any inline `data:*` base64 payload on an image asset is stripped before writing to disk.
 */
export function sanitizeBoardSnapshot(snapshot: Record<string, unknown>): {
  readonly sanitized: Record<string, unknown>
  readonly strippedInlineCount: number
  readonly imageCount: number
} {
  const sanitized = cloneRecord(snapshot)
  let strippedInlineCount = 0
  let imageCount = 0

  const doc =
    sanitized.document && typeof sanitized.document === 'object' && !Array.isArray(sanitized.document)
      ? (sanitized.document as Record<string, unknown>)
      : null

  if (doc && doc.store && typeof doc.store === 'object' && !Array.isArray(doc.store)) {
    const res = sanitizeStoreMap(doc.store as Record<string, unknown>)
    strippedInlineCount += res.strippedInlineCount
    imageCount += res.imageCount
  }

  if (sanitized.store && typeof sanitized.store === 'object' && !Array.isArray(sanitized.store)) {
    const res = sanitizeStoreMap(sanitized.store as Record<string, unknown>)
    strippedInlineCount += res.strippedInlineCount
    imageCount += res.imageCount
  }

  return { sanitized, strippedInlineCount, imageCount }
}

export interface BoardsManager {
  list(): Promise<readonly BoardMeta[]>
  get(id: string): Promise<BoardDocument>
  create(input: { readonly title?: string }): Promise<BoardMeta>
  rename(input: { readonly id: string; readonly title: string }): Promise<BoardMeta>
  duplicate(input: { readonly id: string }): Promise<BoardMeta>
  remove(input: { readonly id: string }): Promise<{ readonly deletedId: string; readonly boards: readonly BoardMeta[] }>
  save(input: {
    readonly id: string
    readonly snapshot: Record<string, unknown>
    readonly brokenCount?: number
  }): Promise<BoardSaveResult>
}

export function createBoardsManager(pluginStorage: PluginStorageNamespace): BoardsManager {
  const indexStore = pluginStorage.jsonStore<BoardIndexState>(
    'boards.json',
    BoardIndexStateSchema,
    () => ({
      version: 1,
      boards: [],
    }),
  )

  const boardDocPath = (id: string): string => {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new FolioError('invalid_board_id', `非法画板 ID: ${id}`, 400)
    }
    return pluginStorage.dataPath('boards', `${id}.json`)
  }

  const writeBoardDocument = async (doc: BoardDocument): Promise<BoardDocument> => {
    const validated = BoardDocumentSchema.parse(doc)
    await pluginStorage.fs.writeText(boardDocPath(validated.id), JSON.stringify(validated, null, 2))
    return validated
  }

  const readBoardDocument = async (id: string): Promise<BoardDocument | null> => {
    const raw = await pluginStorage.fs.readText(boardDocPath(id))
    if (raw === null) return null
    try {
      const parsed = BoardDocumentSchema.parse(JSON.parse(raw))
      return {
        ...parsed,
        snapshot: sanitizeBoardSnapshot(parsed.snapshot).sanitized,
      }
    } catch {
      return null
    }
  }

  const ensureAtLeastOneBoard = async (): Promise<BoardMeta[]> => {
    const state = await indexStore.read()
    if (state.boards.length > 0) {
      return [...state.boards].sort((a, b) => b.updatedAt - a.updatedAt)
    }
    const now = Date.now()
    const initial: BoardMeta = {
      id: createBoardId(),
      title: DEFAULT_BOARD_TITLE,
      createdAt: now,
      updatedAt: now,
      imageCount: 0,
      brokenCount: 0,
    }
    await writeBoardDocument({
      version: 1,
      id: initial.id,
      snapshot: createEmptyBoardSnapshot(),
      updatedAt: now,
    })
    await indexStore.write({ version: 1, boards: [initial] })
    return [initial]
  }

  return {
    async list() {
      return ensureAtLeastOneBoard()
    },

    async get(id: string) {
      const boards = await ensureAtLeastOneBoard()
      const meta = boards.find(b => b.id === id)
      if (!meta) {
        throw new FolioError('board_not_found', `画板不存在: ${id}`, 404)
      }
      const existing = await readBoardDocument(id)
      if (existing) return existing
      const created: BoardDocument = {
        version: 1,
        id,
        snapshot: createEmptyBoardSnapshot(),
        updatedAt: meta.updatedAt,
      }
      return writeBoardDocument(created)
    },

    async create(input) {
      const boards = await ensureAtLeastOneBoard()
      const trimmed = input.title?.trim()
      const now = Date.now()
      const title = trimmed && trimmed.length > 0 ? trimmed : `未命名画板 ${boards.length + 1}`
      const meta: BoardMeta = {
        id: createBoardId(),
        title,
        createdAt: now,
        updatedAt: now,
        imageCount: 0,
        brokenCount: 0,
      }
      await writeBoardDocument({
        version: 1,
        id: meta.id,
        snapshot: createEmptyBoardSnapshot(),
        updatedAt: now,
      })
      await indexStore.write({
        version: 1,
        boards: [meta, ...boards],
      })
      return meta
    },

    async rename(input) {
      const title = input.title.trim()
      if (!title) {
        throw new FolioError('invalid_title', '画板名称不能为空', 400)
      }
      let updatedMeta: BoardMeta | null = null
      await indexStore.update(curr => {
        const nextBoards = curr.boards.map(b => {
          if (b.id !== input.id) return b
          updatedMeta = { ...b, title, updatedAt: Date.now() }
          return updatedMeta
        })
        return { version: 1, boards: nextBoards }
      })
      if (!updatedMeta) {
        throw new FolioError('board_not_found', `画板不存在: ${input.id}`, 404)
      }
      return updatedMeta
    },

    async duplicate(input) {
      const boards = await ensureAtLeastOneBoard()
      const sourceMeta = boards.find(b => b.id === input.id)
      if (!sourceMeta) {
        throw new FolioError('board_not_found', `画板不存在: ${input.id}`, 404)
      }
      const sourceDoc = await readBoardDocument(input.id)
      const now = Date.now()
      const copyMeta: BoardMeta = {
        id: createBoardId(),
        title: `${sourceMeta.title} 副本`,
        createdAt: now,
        updatedAt: now,
        imageCount: sourceMeta.imageCount,
        brokenCount: sourceMeta.brokenCount,
      }
      await writeBoardDocument({
        version: 1,
        id: copyMeta.id,
        snapshot: sourceDoc ? cloneRecord(sourceDoc.snapshot) : createEmptyBoardSnapshot(),
        updatedAt: now,
      })
      await indexStore.write({
        version: 1,
        boards: [copyMeta, ...boards],
      })
      return copyMeta
    },

    async remove(input) {
      const boards = await ensureAtLeastOneBoard()
      const target = boards.find(b => b.id === input.id)
      if (!target) {
        throw new FolioError('board_not_found', `画板不存在: ${input.id}`, 404)
      }
      await pluginStorage.fs.remove(boardDocPath(input.id)).catch(() => {})
      const remaining = boards.filter(b => b.id !== input.id)
      await indexStore.write({ version: 1, boards: remaining })
      const finalBoards = await ensureAtLeastOneBoard()
      return { deletedId: input.id, boards: finalBoards }
    },

    async save(input) {
      const boards = await ensureAtLeastOneBoard()
      const existing = boards.find(b => b.id === input.id)
      if (!existing) {
        throw new FolioError('board_not_found', `画板不存在: ${input.id}`, 404)
      }
      const { sanitized, strippedInlineCount, imageCount } = sanitizeBoardSnapshot(input.snapshot)
      const now = Date.now()
      await writeBoardDocument({
        version: 1,
        id: input.id,
        snapshot: sanitized,
        updatedAt: now,
      })

      const brokenCount =
        typeof input.brokenCount === 'number' && Number.isFinite(input.brokenCount)
          ? Math.max(0, Math.trunc(input.brokenCount))
          : existing.brokenCount

      let updatedMeta: BoardMeta = {
        ...existing,
        updatedAt: now,
        imageCount,
        brokenCount,
      }

      await indexStore.update(curr => ({
        version: 1,
        boards: curr.boards.map(b => {
          if (b.id !== input.id) return b
          updatedMeta = {
            ...b,
            updatedAt: now,
            imageCount,
            brokenCount,
          }
          return updatedMeta
        }),
      }))

      return {
        meta: updatedMeta,
        updatedAt: now,
        strippedInlineCount,
      }
    },
  }
}
