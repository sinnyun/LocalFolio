import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  FolioError,
  type EagleFolderInfo,
  type EagleItemDetail,
  type FolioEagleService,
} from '@folio/base-contract'
import {
  buildCleanLaunchEnv,
  createFolioEagleService,
  DEFAULT_EAGLE_API_BASE,
  extractItemIdFromDeepLink,
  isValidEagleItemId,
  openDeepLinkUri,
  type FetchLike,
} from '../../base-eagle-host/src/host.js'
import type {
  EagleFolderSource,
  EagleImageSource,
  EagleOpenItemResult,
} from './types.js'

export {
  buildCleanLaunchEnv,
  DEFAULT_EAGLE_API_BASE,
  extractItemIdFromDeepLink as extractEagleItemIdFromDeepLink,
  isValidEagleItemId,
}

function stripWindowsExtendedPrefix(filePath: string): string {
  if (filePath.startsWith('\\\\?\\UNC\\')) {
    return `\\\\${filePath.slice('\\\\?\\UNC\\'.length)}`
  }
  if (filePath.startsWith('\\\\?\\')) {
    return filePath.slice('\\\\?\\'.length)
  }
  return filePath
}

export function normalizeEagleLocalPath(rawPath: string): string {
  let trimmed = rawPath.trim()
  if (!trimmed) return ''

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim()
  }
  if (!trimmed) return ''

  if (trimmed.toLowerCase().startsWith('file://')) {
    try {
      trimmed = fileURLToPath(trimmed)
    } catch {
      trimmed = trimmed.replace(/^file:\/\/\/?/i, '')
    }
  }

  trimmed = stripWindowsExtendedPrefix(trimmed)
  if (/^[a-zA-Z]:$/.test(trimmed)) {
    return `${trimmed.toUpperCase()}\\`
  }

  const pathStyle = path.win32.isAbsolute(trimmed) && !path.posix.isAbsolute(trimmed) ? path.win32 : path
  const resolved = pathStyle.resolve(trimmed)
  if (/^[a-z]:\\/.test(resolved)) {
    return `${resolved[0].toUpperCase()}${resolved.slice(1)}`
  }
  return resolved
}

export function extractEagleItemIdFromPath(rawPath: string): string | null {
  const normalized = normalizeEagleLocalPath(rawPath)
  if (!normalized) return null
  const pathStyle = path.isAbsolute(normalized) ? path : path.win32
  const parentName = pathStyle.basename(pathStyle.dirname(normalized))
  if (!parentName.toLowerCase().endsWith('.info')) return null
  const prefix = parentName.slice(0, -'.info'.length)
  return isValidEagleItemId(prefix) ? prefix : null
}

function canonicalPathKey(filePath: string): string {
  const clean = stripWindowsExtendedPrefix(filePath)
  return process.platform === 'win32' ? clean.toLowerCase() : clean
}

export async function openEagleDeepLink(
  deepLink: string,
): Promise<{ readonly strippedElectronRunAsNode: boolean }> {
  return openDeepLinkUri(deepLink)
}

export interface CreateEagleLinksServiceOptions {
  readonly eagle?: FolioEagleService
  readonly apiBaseUrl?: string
  readonly fetchImpl?: FetchLike
  readonly timeoutMs?: number
  readonly openUrlImpl?: (
    deepLink: string,
  ) => Promise<{ readonly strippedElectronRunAsNode?: boolean } | void>
}

export interface EagleLinksService {
  resolveDroppedPath(rawPath: string): Promise<EagleImageSource | null>
  resolveByItemId(rawIdOrDeepLink: string): Promise<EagleImageSource>
  openItem(rawIdOrDeepLink: string): Promise<EagleOpenItemResult>
}

export function createEagleLinksService(
  options: CreateEagleLinksServiceOptions = {},
): EagleLinksService {
  const apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_EAGLE_API_BASE).replace(/\/+$/, '')
  const baseUrlOverride = options.apiBaseUrl ? apiBaseUrl : undefined
  const callOptions = options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : undefined

  let lastStrippedElectronRunAsNode = false
  const eagle: FolioEagleService =
    options.eagle ??
    createFolioEagleService({
      defaultBaseUrl: apiBaseUrl,
      defaultTimeoutMs: options.timeoutMs,
      fetchImpl: options.fetchImpl,
      openDeepLinkImpl: options.openUrlImpl
        ? async deepLink => {
            const res = await options.openUrlImpl!(deepLink)
            lastStrippedElectronRunAsNode = res?.strippedElectronRunAsNode ?? false
            return res
          }
        : async deepLink => {
            const res = await openDeepLinkUri(deepLink)
            lastStrippedElectronRunAsNode = res.strippedElectronRunAsNode
            return res
          },
    })

  const buildItemApiUrl = (itemId: string): string => {
    const url = new URL(`${apiBaseUrl}/api/v2/item/get`)
    url.searchParams.set('id', itemId)
    return url.toString()
  }

  const fetchEagleItem = async (itemId: string): Promise<EagleItemDetail> => {
    const cleanId = itemId.trim()
    if (!isValidEagleItemId(cleanId)) {
      throw new FolioError('invalid_eagle_item_id', 'Eagle item ID is invalid', 400)
    }

    const item = await eagle.getItem(cleanId, baseUrlOverride, callOptions)
    if (!item) {
      throw new FolioError('eagle_item_not_found', 'Eagle item was not found', 404)
    }
    if (item.isDeleted) {
      throw new FolioError('eagle_item_deleted', 'Eagle item is in the trash', 410)
    }
    return item
  }

  const fetchEagleThumbnailPath = async (itemId: string): Promise<string> => {
    const decodedPath = await eagle.getItemThumbnailPath(itemId.trim(), baseUrlOverride, callOptions)
    if (!decodedPath) {
      throw new FolioError(
        'eagle_thumbnail_unavailable',
        'Eagle thumbnail file is unavailable',
        404,
      )
    }
    const normalized = normalizeEagleLocalPath(decodedPath)
    let st: fs.Stats
    try {
      st = await fsp.stat(normalized)
    } catch {
      throw new FolioError(
        'eagle_thumbnail_unavailable',
        'Eagle thumbnail file is unavailable',
        404,
      )
    }
    if (!st.isFile()) {
      throw new FolioError(
        'eagle_thumbnail_unavailable',
        'Eagle thumbnail file is unavailable',
        404,
      )
    }
    return normalized
  }

  const resolveOriginalFromItem = async (
    item: EagleItemDetail,
    thumbnailPath: string,
  ): Promise<string> => {
    if (item.noThumbnail) {
      return thumbnailPath
    }

    const parentDir = path.dirname(thumbnailPath)
    const expectedDir = `${item.id}.info`
    if (path.basename(parentDir).toLowerCase() !== expectedDir.toLowerCase()) {
      throw new FolioError(
        'eagle_unexpected_dir',
        'Eagle thumbnail is not in the expected item directory',
        409,
      )
    }

    const targetExt = item.ext.replace(/^\./, '').toLowerCase()
    const thumbKey = canonicalPathKey(thumbnailPath)
    const dirents = await fsp.readdir(parentDir, { withFileTypes: true })
    const matches: string[] = []

    for (const dirent of dirents) {
      if (!dirent.isFile()) continue
      const candidatePath = normalizeEagleLocalPath(path.join(parentDir, dirent.name))
      if (canonicalPathKey(candidatePath) === thumbKey) continue

      const candidateExt = path.extname(dirent.name).replace(/^\./, '').toLowerCase()
      if (candidateExt !== targetExt) continue

      try {
        const st = await fsp.stat(candidatePath)
        if (st.isFile() && st.size === item.size) {
          matches.push(candidatePath)
        }
      } catch {
        // skip unreadable sibling
      }
    }

    if (matches.length === 1) {
      return matches[0]!
    }
    if (matches.length === 0) {
      throw new FolioError(
        'eagle_original_missing',
        'could not identify Eagle original beside its thumbnail',
        404,
      )
    }
    throw new FolioError(
      'eagle_original_ambiguous',
      'multiple Eagle sibling files match the original item',
      409,
    )
  }

  const fetchEagleFolders = async (
    folderIds: readonly string[] | undefined,
  ): Promise<EagleFolderSource[]> => {
    const cleanIds = (folderIds ?? []).map(id => id.trim()).filter(Boolean)
    if (cleanIds.length === 0) return []

    const uniqueIds = Array.from(new Set(cleanIds))
    const resolved: Array<EagleFolderInfo | null> = await Promise.all(
      uniqueIds.map(id => eagle.getFolder(id, baseUrlOverride, callOptions)),
    )
    const result: EagleFolderSource[] = []
    for (const folder of resolved) {
      if (folder) {
        result.push({ id: folder.id, name: folder.name })
      }
    }
    return result
  }

  const buildImageSource = async (
    item: EagleItemDetail,
    originalPath: string,
    thumbnailPath: string,
  ): Promise<EagleImageSource> => {
    const cleanOriginal = normalizeEagleLocalPath(stripWindowsExtendedPrefix(originalPath))
    const cleanThumb = normalizeEagleLocalPath(stripWindowsExtendedPrefix(thumbnailPath))
    const folders = await fetchEagleFolders(item.folders)

    return {
      itemId: item.id,
      apiUrl: buildItemApiUrl(item.id),
      name: item.name,
      ext: item.ext,
      size: item.size,
      originalPath: cleanOriginal,
      originalUri: pathToFileURL(cleanOriginal).href,
      thumbnailPath: cleanThumb,
      folders,
    }
  }

  return {
    async resolveDroppedPath(rawPath: string): Promise<EagleImageSource | null> {
      const itemId = extractEagleItemIdFromPath(rawPath)
      if (!itemId) return null

      const normalizedDropped = normalizeEagleLocalPath(rawPath)
      const canonicalDropped = await fsp.realpath(normalizedDropped)
      const item = await fetchEagleItem(itemId)
      const thumbnailPath = await fetchEagleThumbnailPath(itemId)
      const originalPath = await resolveOriginalFromItem(item, thumbnailPath)
      const canonicalOriginal = await fsp.realpath(originalPath)

      if (canonicalPathKey(canonicalDropped) !== canonicalPathKey(canonicalOriginal)) {
        return null
      }

      return buildImageSource(item, canonicalOriginal, thumbnailPath)
    },

    async resolveByItemId(rawIdOrDeepLink: string): Promise<EagleImageSource> {
      const trimmed = rawIdOrDeepLink.trim()
      const itemId = eagle.extractItemIdFromDeepLink(trimmed) ?? trimmed
      if (!isValidEagleItemId(itemId)) {
        throw new FolioError('invalid_eagle_item_id', 'Eagle item ID is invalid', 400)
      }

      const item = await fetchEagleItem(itemId)
      const thumbnailPath = await fetchEagleThumbnailPath(itemId)
      const originalPath = await resolveOriginalFromItem(item, thumbnailPath)
      const canonicalOriginal = await fsp.realpath(originalPath)

      return buildImageSource(item, canonicalOriginal, thumbnailPath)
    },

    async openItem(rawIdOrDeepLink: string): Promise<EagleOpenItemResult> {
      const trimmed = rawIdOrDeepLink.trim()
      const itemId = eagle.extractItemIdFromDeepLink(trimmed) ?? trimmed
      if (!isValidEagleItemId(itemId)) {
        throw new FolioError('invalid_eagle_item_id', 'Eagle item ID is invalid', 400)
      }

      const deepLink = `eagle://item/${itemId}`
      const startedAt = Date.now()
      lastStrippedElectronRunAsNode = false
      await eagle.openDeepLink(deepLink)
      const stripped = options.eagle
        ? buildCleanLaunchEnv().strippedElectronRunAsNode
        : lastStrippedElectronRunAsNode
      return {
        itemId,
        deepLink,
        durationMs: Date.now() - startedAt,
        strippedElectronRunAsNode: stripped,
      }
    },
  }
}
