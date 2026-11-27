import path from 'node:path'
import {
  FolioError,
  type EagleAddFromPathInput,
  type EagleCallOptions,
  type EagleFolderInfo,
  type EagleItemDetail,
  type EagleItemSummary,
  type EagleLibraryInfo,
  type EagleListItemsQuery,
  type EagleRequestOptions,
} from '@folio/base-contract'
import { isValidEagleItemId } from './deeplink.js'

export const DEFAULT_EAGLE_API_BASE = 'http://127.0.0.1:41595'
export const DEFAULT_EAGLE_TIMEOUT_MS = 2500
export const DEFAULT_EAGLE_PING_TIMEOUT_MS = 500

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

interface EagleEnvelope<T> {
  readonly status?: string
  readonly data?: T
  readonly message?: string
}

export interface CreateEagleClientOptions {
  readonly defaultBaseUrl?: string
  readonly fetchImpl?: FetchLike
  readonly defaultTimeoutMs?: number
}

export function safeDecodePercent(encoded: string): string {
  try {
    return decodeURIComponent(encoded)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new FolioError(
      'eagle_thumbnail_decode_failed',
      `invalid Eagle thumbnail path encoding: ${msg}`,
      502,
    )
  }
}

function normalizeBaseUrl(baseUrl: string | undefined, fallback: string): string {
  const raw = (baseUrl ?? fallback).trim() || fallback
  return raw.replace(/\/+$/, '')
}

function buildRequestUrl(baseUrl: string, apiPath: string): string {
  if (/^https?:\/\//i.test(apiPath)) {
    return apiPath
  }
  const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`
  return `${baseUrl}${normalizedPath}`
}

function extractDataList<T>(
  data: readonly T[] | { readonly data?: readonly T[] } | null | undefined,
): readonly T[] {
  if (Array.isArray(data)) {
    return data
  }
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return (data as { data: readonly T[] }).data
  }
  return []
}

function findFolderInTree(
  nodes: readonly EagleFolderInfo[],
  targetId: string,
): EagleFolderInfo | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return node
    }
    if (Array.isArray(node.children) && node.children.length > 0) {
      const found = findFolderInTree(node.children, targetId)
      if (found) return found
    }
  }
  return null
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: string }).name
  return name === 'AbortError' || (err instanceof FolioError && err.code === 'aborted')
}

export interface EagleClient {
  requestJson<T>(apiPath: string, options?: EagleRequestOptions): Promise<T>
  ping(baseUrl?: string, timeoutMs?: number, signal?: AbortSignal): Promise<boolean>
  getLibraryInfo(baseUrl?: string, options?: EagleCallOptions): Promise<EagleLibraryInfo | null>
  switchLibrary(
    libraryPath: string,
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<boolean>
  getItem(
    itemId: string,
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<EagleItemDetail | null>
  getFolder(
    folderId: string,
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<EagleFolderInfo | null>
  getItemThumbnailPath(
    itemId: string,
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<string | null>
  addItemFromPath(
    input: EagleAddFromPathInput,
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<string | null>
  listItems(
    query: EagleListItemsQuery,
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<readonly EagleItemSummary[]>
  moveItemsToTrash(
    itemIds: readonly string[],
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<boolean>
}

export function createEagleClient(options: CreateEagleClientOptions = {}): EagleClient {
  const defaultBaseUrl = normalizeBaseUrl(options.defaultBaseUrl, DEFAULT_EAGLE_API_BASE)
  const fetchImpl: FetchLike | undefined =
    options.fetchImpl ??
    (typeof globalThis.fetch === 'function'
      ? (url, init) => globalThis.fetch(url, init)
      : undefined)
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_EAGLE_TIMEOUT_MS

  const requestJson = async <T>(
    apiPath: string,
    reqOptions: EagleRequestOptions = {},
  ): Promise<T> => {
    if (typeof fetchImpl !== 'function') {
      throw new FolioError('eagle_fetch_unavailable', 'fetch is unavailable in host runtime', 500)
    }

    const baseUrl = normalizeBaseUrl(reqOptions.baseUrl, defaultBaseUrl)
    const url = buildRequestUrl(baseUrl, apiPath)
    const method = reqOptions.method ?? 'GET'
    const timeoutMs = reqOptions.timeoutMs ?? defaultTimeoutMs
    const externalSignal = reqOptions.signal

    if (externalSignal?.aborted) {
      throw new FolioError('aborted', 'Eagle Web API request aborted', 499)
    }

    const controller = new AbortController()
    let timedOut = false
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true
            controller.abort()
          }, timeoutMs)
        : undefined
    const onExternalAbort = (): void => {
      controller.abort()
    }
    externalSignal?.addEventListener('abort', onExternalAbort, { once: true })

    const init: RequestInit = {
      method,
      signal: controller.signal,
    }
    if (method === 'POST' && reqOptions.body !== undefined) {
      init.headers = { 'content-type': 'application/json' }
      init.body = JSON.stringify(reqOptions.body)
    }

    let response: Response
    try {
      response = await fetchImpl(url, init)
    } catch (err) {
      if (externalSignal?.aborted) {
        throw new FolioError('aborted', 'Eagle Web API request aborted', 499)
      }
      if (timedOut || isAbortError(err)) {
        throw new FolioError(
          'eagle_api_timeout',
          `Eagle Web API request timed out after ${timeoutMs}ms`,
          504,
        )
      }
      const msg = err instanceof Error ? err.message : String(err)
      throw new FolioError('eagle_api_unreachable', `Eagle Web API request failed: ${msg}`, 502)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onExternalAbort)
    }

    if (!response.ok) {
      throw new FolioError(
        'eagle_api_http_error',
        `Eagle Web API HTTP ${response.status}`,
        502,
      )
    }

    let envelope: EagleEnvelope<T>
    try {
      envelope = (await response.json()) as EagleEnvelope<T>
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new FolioError(
        'eagle_api_invalid_json',
        `invalid Eagle Web API response: ${msg}`,
        502,
      )
    }

    if (!envelope || typeof envelope !== 'object' || envelope.status !== 'success') {
      throw new FolioError(
        'eagle_api_error',
        envelope?.message || 'Eagle Web API returned an error',
        502,
      )
    }

    return envelope.data as T
  }

  const getLibraryInfo = async (
    baseUrl?: string,
    callOptions?: EagleCallOptions,
  ): Promise<EagleLibraryInfo | null> => {
    try {
      const data = await requestJson<{ library?: { path?: string; name?: string } }>(
        '/api/library/info',
        {
          baseUrl,
          method: 'GET',
          timeoutMs: callOptions?.timeoutMs ?? DEFAULT_EAGLE_PING_TIMEOUT_MS,
          signal: callOptions?.signal,
        },
      )
      const libPath = data?.library?.path
      if (typeof libPath !== 'string' || !libPath.trim()) {
        return null
      }
      return {
        path: libPath,
        name: data.library?.name?.trim() || path.basename(libPath),
      }
    } catch {
      return null
    }
  }

  const ping = async (
    baseUrl?: string,
    timeoutMs = DEFAULT_EAGLE_PING_TIMEOUT_MS,
    signal?: AbortSignal,
  ): Promise<boolean> => {
    try {
      await requestJson<unknown>('/api/application/info', {
        baseUrl,
        method: 'GET',
        timeoutMs,
        signal,
      })
      return true
    } catch {
      const info = await getLibraryInfo(baseUrl, { timeoutMs, signal })
      return info !== null
    }
  }

  const switchLibrary = async (
    libraryPath: string,
    baseUrl?: string,
    callOptions?: EagleCallOptions,
  ): Promise<boolean> => {
    try {
      await requestJson<unknown>('/api/library/switch', {
        baseUrl,
        method: 'POST',
        body: { libraryPath },
        timeoutMs: callOptions?.timeoutMs ?? 4000,
        signal: callOptions?.signal,
      })
      return true
    } catch {
      return false
    }
  }

  const getItem = async (
    itemId: string,
    baseUrl?: string,
    callOptions?: EagleCallOptions,
  ): Promise<EagleItemDetail | null> => {
    const cleanId = itemId.trim()
    if (!isValidEagleItemId(cleanId)) {
      throw new FolioError('invalid_eagle_item_id', 'Eagle item ID is invalid', 400)
    }

    const params = new URLSearchParams({ id: cleanId })
    const data = await requestJson<
      readonly EagleItemDetail[] | { readonly data?: readonly EagleItemDetail[] }
    >(`/api/v2/item/get?${params.toString()}`, {
      baseUrl,
      method: 'GET',
      timeoutMs: callOptions?.timeoutMs,
      signal: callOptions?.signal,
    })

    const items = extractDataList(data)
    if (items.length === 0) {
      return null
    }
    if (items.length > 1) {
      throw new FolioError(
        'eagle_item_ambiguous',
        'Eagle returned multiple items for one ID',
        409,
      )
    }
    return items[0]!
  }

  const getFolder = async (
    folderId: string,
    baseUrl?: string,
    callOptions?: EagleCallOptions,
  ): Promise<EagleFolderInfo | null> => {
    const cleanId = folderId.trim()
    if (!cleanId) return null

    const params = new URLSearchParams({ ids: cleanId })
    const data = await requestJson<
      readonly EagleFolderInfo[] | { readonly data?: readonly EagleFolderInfo[] }
    >(`/api/v2/folder/get?${params.toString()}`, {
      baseUrl,
      method: 'GET',
      timeoutMs: callOptions?.timeoutMs,
      signal: callOptions?.signal,
    })

    const roots = extractDataList(data)
    return findFolderInTree(roots, cleanId)
  }

  const getItemThumbnailPath = async (
    itemId: string,
    baseUrl?: string,
    callOptions?: EagleCallOptions,
  ): Promise<string | null> => {
    const cleanId = itemId.trim()
    if (!isValidEagleItemId(cleanId)) {
      throw new FolioError('invalid_eagle_item_id', 'Eagle item ID is invalid', 400)
    }

    const params = new URLSearchParams({ id: cleanId })
    const encodedPath = await requestJson<string>(
      `/api/item/thumbnail?${params.toString()}`,
      {
        baseUrl,
        method: 'GET',
        timeoutMs: callOptions?.timeoutMs,
        signal: callOptions?.signal,
      },
    )

    if (typeof encodedPath !== 'string' || !encodedPath.trim()) {
      return null
    }
    const decoded = safeDecodePercent(encodedPath.trim())
    return decoded || null
  }

  const addItemFromPath = async (
    input: EagleAddFromPathInput,
    baseUrl?: string,
    callOptions?: EagleCallOptions,
  ): Promise<string | null> => {
    const data = await requestJson<string | { readonly id?: string } | null>(
      '/api/item/addFromPath',
      {
        baseUrl,
        method: 'POST',
        body: {
          path: input.path,
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.website !== undefined ? { website: input.website } : {}),
          ...(input.tags !== undefined ? { tags: [...input.tags] } : {}),
          ...(input.annotation !== undefined ? { annotation: input.annotation } : {}),
          ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
        },
        timeoutMs: callOptions?.timeoutMs ?? 10_000,
        signal: callOptions?.signal,
      },
    )

    if (typeof data === 'string' && data.trim()) {
      return data.trim()
    }
    if (data && typeof data === 'object' && typeof data.id === 'string' && data.id.trim()) {
      return data.id.trim()
    }
    return null
  }

  const listItems = async (
    query: EagleListItemsQuery,
    baseUrl?: string,
    callOptions?: EagleCallOptions,
  ): Promise<readonly EagleItemSummary[]> => {
    const params = new URLSearchParams()
    if (query.limit !== undefined) params.set('limit', String(query.limit))
    if (query.offset !== undefined) params.set('offset', String(query.offset))
    if (query.orderBy) params.set('orderBy', query.orderBy)
    if (query.keyword) params.set('keyword', query.keyword)
    if (query.ext) params.set('ext', query.ext)
    if (query.tags !== undefined) {
      const tagsStr = typeof query.tags === 'string' ? query.tags : query.tags.join(',')
      if (tagsStr) params.set('tags', tagsStr)
    }
    if (query.folders !== undefined) {
      const foldersStr =
        typeof query.folders === 'string' ? query.folders : query.folders.join(',')
      if (foldersStr) params.set('folders', foldersStr)
    }

    const qs = params.toString()
    const apiPath = qs ? `/api/item/list?${qs}` : '/api/item/list'
    const data = await requestJson<
      readonly EagleItemSummary[] | { readonly data?: readonly EagleItemSummary[] }
    >(apiPath, {
      baseUrl,
      method: 'GET',
      timeoutMs: callOptions?.timeoutMs ?? 4000,
      signal: callOptions?.signal,
    })

    return extractDataList(data)
  }

  const moveItemsToTrash = async (
    itemIds: readonly string[],
    baseUrl?: string,
    callOptions?: EagleCallOptions,
  ): Promise<boolean> => {
    const cleanIds = itemIds.map(id => id.trim()).filter(Boolean)
    if (cleanIds.length === 0) return true

    try {
      await requestJson<unknown>('/api/item/moveToTrash', {
        baseUrl,
        method: 'POST',
        body: { itemIds: cleanIds },
        timeoutMs: callOptions?.timeoutMs ?? 4000,
        signal: callOptions?.signal,
      })
      return true
    } catch {
      return false
    }
  }

  return {
    requestJson,
    ping,
    getLibraryInfo,
    switchLibrary,
    getItem,
    getFolder,
    getItemThumbnailPath,
    addItemFromPath,
    listItems,
    moveItemsToTrash,
  }
}
