import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { FolioError } from '@folio/base-contract'

const execFileAsync = promisify(execFile)
import type {
  EagleFolderSource,
  EagleImageSource,
  EagleOpenItemResult,
} from './types.js'

export const DEFAULT_EAGLE_API_BASE = 'http://127.0.0.1:41595'
const DEFAULT_EAGLE_TIMEOUT_MS = 2500
const EAGLE_ITEM_ID_RE = /^[A-Za-z0-9]+$/
const EAGLE_DEEP_LINK_RE = /^eagle:\/\/item\/([A-Za-z0-9]+)(?:\/(?:[?#].*)?|[?#].*)?$/i

interface EagleEnvelope<T> {
  status?: string
  data?: T
  message?: string
}

interface EagleItemRaw {
  id: string
  name: string
  ext: string
  size: number
  folders?: readonly string[]
  isDeleted?: boolean
  noThumbnail?: boolean
}

interface EagleFolderRaw {
  id: string
  name: string
  children?: readonly EagleFolderRaw[]
}

export function isValidEagleItemId(itemId: string): boolean {
  return EAGLE_ITEM_ID_RE.test(itemId.trim())
}

export function extractEagleItemIdFromDeepLink(raw: string): string | null {
  const match = raw.trim().match(EAGLE_DEEP_LINK_RE)
  if (!match?.[1]) return null
  return isValidEagleItemId(match[1]) ? match[1] : null
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

  const resolved = path.resolve(trimmed)
  if (/^[a-z]:\\/.test(resolved)) {
    return `${resolved[0].toUpperCase()}${resolved.slice(1)}`
  }
  return resolved
}

export function extractEagleItemIdFromPath(rawPath: string): string | null {
  const normalized = normalizeEagleLocalPath(rawPath)
  if (!normalized) return null
  const parentName = path.basename(path.dirname(normalized))
  if (!parentName.toLowerCase().endsWith('.info')) return null
  const prefix = parentName.slice(0, -'.info'.length)
  return isValidEagleItemId(prefix) ? prefix : null
}

function canonicalPathKey(filePath: string): string {
  const clean = stripWindowsExtendedPrefix(filePath)
  return process.platform === 'win32' ? clean.toLowerCase() : clean
}

function safeDecodePercent(encoded: string): string {
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

const STRIPPED_ELECTRON_ENV_KEYS = new Set([
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'NODE_OPTIONS',
  'NODE_CHANNEL_FD',
  'NODE_CHANNEL_SERIALIZATION_MODE',
])

/**
 * Strip Electron/Node host inheritance flags (notably ELECTRON_RUN_AS_NODE=1 from
 * DeepSeek Harness Desktop) so launching Eagle.exe via protocol handler boots Eagle's
 * GUI process cleanly instead of falling back to Node.js CLI mode.
 */
export function buildCleanLaunchEnv(
  baseEnv: Readonly<Record<string, string | undefined>> = process.env,
): {
  readonly env: Record<string, string | undefined>
  readonly strippedElectronRunAsNode: boolean
} {
  const env: Record<string, string | undefined> = {}
  let strippedElectronRunAsNode = false
  for (const [key, value] of Object.entries(baseEnv)) {
    const upper = key.toUpperCase()
    if (STRIPPED_ELECTRON_ENV_KEYS.has(upper)) {
      if (upper === 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
        strippedElectronRunAsNode = true
      }
      continue
    }
    env[key] = value
  }
  return { env, strippedElectronRunAsNode }
}

function launchDetached(
  command: string,
  args: readonly string[],
  errorPrefix: string,
  env: Record<string, string | undefined>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env,
    })
    const onError = (err: Error): void => {
      reject(new FolioError('eagle_open_failed', `${errorPrefix}: ${err.message}`, 500))
    }
    child.once('error', onError)
    child.once('spawn', () => {
      child.off('error', onError)
      child.unref()
      resolve()
    })
  })
}

export async function openEagleDeepLink(
  deepLink: string,
): Promise<{ readonly strippedElectronRunAsNode: boolean }> {
  if (!extractEagleItemIdFromDeepLink(deepLink)) {
    throw new FolioError('invalid_eagle_item_id', 'Eagle item ID is invalid', 400)
  }

  const { env, strippedElectronRunAsNode } = buildCleanLaunchEnv()

  if (process.platform === 'win32') {
    try {
      await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "$ErrorActionPreference = 'Stop'; Start-Process -FilePath $env:FOLIO_EAGLE_URI",
        ],
        {
          env: { ...env, FOLIO_EAGLE_URI: deepLink },
          timeout: 8000,
          windowsHide: true,
        },
      )
      return { strippedElectronRunAsNode }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new FolioError('eagle_open_failed', `cannot open ${deepLink}: ${msg}`, 500)
    }
  }

  if (process.platform === 'darwin') {
    await launchDetached('open', [deepLink], `cannot open ${deepLink}`, env)
    return { strippedElectronRunAsNode }
  }

  await launchDetached('xdg-open', [deepLink], `cannot open ${deepLink}`, env)
  return { strippedElectronRunAsNode }
}

export interface CreateEagleLinksServiceOptions {
  readonly apiBaseUrl?: string
  readonly fetchImpl?: typeof fetch
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
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_EAGLE_TIMEOUT_MS
  const openUrlImpl = options.openUrlImpl ?? openEagleDeepLink

  const requestEagleJson = async <T>(urlString: string): Promise<T> => {
    if (typeof fetchImpl !== 'function') {
      throw new FolioError('eagle_fetch_unavailable', 'fetch is unavailable in host runtime', 500)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetchImpl(urlString, {
        method: 'GET',
        signal: controller.signal,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new FolioError('eagle_api_unreachable', `Eagle Web API request failed: ${msg}`, 502)
    } finally {
      clearTimeout(timer)
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

    if (envelope.status !== 'success') {
      throw new FolioError(
        'eagle_api_error',
        envelope.message || 'Eagle Web API returned an error',
        502,
      )
    }

    return envelope.data as T
  }

  const buildItemApiUrl = (itemId: string): string => {
    const url = new URL(`${apiBaseUrl}/api/v2/item/get`)
    url.searchParams.set('id', itemId)
    return url.toString()
  }

  const fetchEagleItem = async (itemId: string): Promise<EagleItemRaw> => {
    const cleanId = itemId.trim()
    if (!isValidEagleItemId(cleanId)) {
      throw new FolioError('invalid_eagle_item_id', 'Eagle item ID is invalid', 400)
    }

    const data = await requestEagleJson<
      readonly EagleItemRaw[] | { readonly data?: readonly EagleItemRaw[] }
    >(buildItemApiUrl(cleanId))

    const items = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
        ? (data as { data: readonly EagleItemRaw[] }).data
        : []

    if (items.length === 0) {
      throw new FolioError('eagle_item_not_found', 'Eagle item was not found', 404)
    }
    if (items.length > 1) {
      throw new FolioError(
        'eagle_item_ambiguous',
        'Eagle returned multiple items for one ID',
        409,
      )
    }

    const item = items[0]!
    if (item.isDeleted) {
      throw new FolioError('eagle_item_deleted', 'Eagle item is in the trash', 410)
    }
    return item
  }

  const fetchEagleThumbnailPath = async (itemId: string): Promise<string> => {
    const url = new URL(`${apiBaseUrl}/api/item/thumbnail`)
    url.searchParams.set('id', itemId.trim())
    const encodedPath = await requestEagleJson<string>(url.toString())
    if (typeof encodedPath !== 'string' || !encodedPath.trim()) {
      throw new FolioError(
        'eagle_thumbnail_unavailable',
        'Eagle thumbnail file is unavailable',
        404,
      )
    }
    const decodedPath = safeDecodePercent(encodedPath)
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
    item: EagleItemRaw,
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

    const url = new URL(`${apiBaseUrl}/api/v2/folder/get`)
    url.searchParams.set('ids', cleanIds.join(','))
    const data = await requestEagleJson<
      readonly EagleFolderRaw[] | { readonly data?: readonly EagleFolderRaw[] }
    >(url.toString())

    const roots = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)
        ? (data as { data: readonly EagleFolderRaw[] }).data
        : []

    const wanted = new Set(cleanIds)
    const seen = new Set<string>()
    const result: EagleFolderSource[] = []

    const flatten = (nodes: readonly EagleFolderRaw[]) => {
      for (const node of nodes) {
        if (wanted.has(node.id) && !seen.has(node.id)) {
          seen.add(node.id)
          result.push({ id: node.id, name: node.name })
        }
        if (Array.isArray(node.children) && node.children.length > 0) {
          flatten(node.children)
        }
      }
    }

    flatten(roots)
    return result
  }

  const buildImageSource = async (
    item: EagleItemRaw,
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
      const itemId = extractEagleItemIdFromDeepLink(trimmed) ?? trimmed
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
      const itemId = extractEagleItemIdFromDeepLink(trimmed) ?? trimmed
      if (!isValidEagleItemId(itemId)) {
        throw new FolioError('invalid_eagle_item_id', 'Eagle item ID is invalid', 400)
      }

      const deepLink = `eagle://item/${itemId}`
      const startedAt = Date.now()
      const result = await openUrlImpl(deepLink)
      return {
        itemId,
        deepLink,
        durationMs: Date.now() - startedAt,
        strippedElectronRunAsNode: result?.strippedElectronRunAsNode ?? false,
      }
    },
  }
}
