import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  FolioError,
  type EagleLibraryInfo,
  type FolioEagleService,
  type FolioFsService,
  type GeneratedThumbMime,
} from '@folio/base-contract'
import {
  createFolioEagleService,
  DEFAULT_EAGLE_API_BASE,
  DEFAULT_EAGLE_PING_TIMEOUT_MS,
  type FetchLike,
} from '../../base-eagle-host/src/host.js'

export { DEFAULT_EAGLE_API_BASE, type EagleLibraryInfo, type FetchLike }
export const PROBE_TIMEOUT_MS = DEFAULT_EAGLE_PING_TIMEOUT_MS
export const BASE_POLL_TIMEOUT_MS = 10_000
export const EXTRA_POLL_MS_PER_100MB = 5_000

export function normalizePathCompare(p: string): string {
  const resolved = path.resolve(p)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function computeDynamicPollTimeoutMs(fileSizeBytes: number): number {
  const chunks = Math.max(0, Math.ceil(fileSizeBytes / (100 * 1024 * 1024)))
  return BASE_POLL_TIMEOUT_MS + chunks * EXTRA_POLL_MS_PER_100MB
}

export function decodeEagleThumbPath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

export function sniffImageMime(buf: Buffer, fsService?: FolioFsService): GeneratedThumbMime {
  const detected = fsService?.sniffImageMime(buf)
  if (detected === 'image/png' || detected === 'image/webp' || detected === 'image/jpeg') {
    return detected
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (
    buf.length >= 4 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'image/png'
  }
  return 'image/jpeg'
}

export async function ensureEmptyEagleLibraryDir(libraryPath: string): Promise<void> {
  const imagesDir = path.join(libraryPath, 'images')
  const metaPath = path.join(libraryPath, 'metadata.json')
  await fsp.mkdir(imagesDir, { recursive: true })
  try {
    await fsp.access(metaPath)
  } catch {
    const initialMeta = {
      folders: [],
      smartFolders: [],
      quickAccess: [],
      tagsGroups: [],
      modificationTime: Date.now(),
      applicationVersion: '4.0.0',
    }
    await fsp.writeFile(metaPath, JSON.stringify(initialMeta, null, 2), 'utf8')
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new FolioError('aborted', '操作已取消', 499))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new FolioError('aborted', '操作已取消', 499))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export interface EagleThumbClientOptions {
  readonly apiBase?: string
  readonly eagle?: FolioEagleService
  readonly fs?: FolioFsService
  readonly fetchImpl?: FetchLike
  readonly probeTimeoutMs?: number
  readonly pollIntervalMs?: number
}

export interface EagleThumbClient {
  probeLibraryInfo(signal?: AbortSignal): Promise<EagleLibraryInfo | null>
  switchLibrary(targetPath: string, signal?: AbortSignal): Promise<boolean>
  extractThumbnail(options: {
    readonly filePath: string
    readonly fileSize: number
    readonly cacheLibraryPath: string
    readonly restoreLibrary?: boolean
    readonly signal?: AbortSignal
  }): Promise<{
    readonly buffer: Buffer
    readonly mime: GeneratedThumbMime
    readonly previousLibraryPath: string | null
  } | null>
}

export function createEagleThumbClient(options: EagleThumbClientOptions = {}): EagleThumbClient {
  const apiBase = (options.apiBase || DEFAULT_EAGLE_API_BASE).replace(/\/+$/, '')
  const baseUrlOverride = options.apiBase ? apiBase : undefined
  const probeTimeoutMs = options.probeTimeoutMs ?? PROBE_TIMEOUT_MS
  const pollIntervalMs = options.pollIntervalMs ?? 250
  const fsService = options.fs
  const eagle: FolioEagleService =
    options.eagle ??
    createFolioEagleService({
      defaultBaseUrl: apiBase,
      fetchImpl: options.fetchImpl,
    })

  const probeLibraryInfo = async (signal?: AbortSignal): Promise<EagleLibraryInfo | null> => {
    try {
      const info = await eagle.getLibraryInfo(baseUrlOverride, {
        timeoutMs: probeTimeoutMs,
        signal,
      })
      if (info) return info
      const alive = await eagle.ping(baseUrlOverride, probeTimeoutMs, signal)
      if (!alive) return null
      return await eagle.getLibraryInfo(baseUrlOverride, {
        timeoutMs: probeTimeoutMs,
        signal,
      })
    } catch {
      return null
    }
  }

  const switchLibrary = async (targetPath: string, signal?: AbortSignal): Promise<boolean> => {
    const ok = await eagle
      .switchLibrary(targetPath, baseUrlOverride, {
        timeoutMs: 4000,
        signal,
      })
      .catch(() => false)
    if (!ok) return false

    const expectedKey = normalizePathCompare(targetPath)
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      const info = await probeLibraryInfo(signal)
      if (info && normalizePathCompare(info.path) === expectedKey) {
        return true
      }
      await sleep(Math.min(pollIntervalMs, 200), signal)
    }
    return false
  }

  const moveItemToTrash = async (itemId: string): Promise<void> => {
    await eagle
      .moveItemsToTrash([itemId], baseUrlOverride, { timeoutMs: 4000 })
      .catch(() => false)
  }

  const extractThumbnail: EagleThumbClient['extractThumbnail'] = async opts => {
    const info = await probeLibraryInfo(opts.signal)
    if (!info) {
      throw new FolioError('eagle_offline', '未检测到正在运行的 Eagle 服务，请先启动 Eagle', 503)
    }

    const cacheLibKey = normalizePathCompare(opts.cacheLibraryPath)
    const currentLibKey = normalizePathCompare(info.path)
    const previousLibraryPath = currentLibKey !== cacheLibKey ? info.path : null

    if (previousLibraryPath) {
      await ensureEmptyEagleLibraryDir(opts.cacheLibraryPath)
      const switched = await switchLibrary(opts.cacheLibraryPath, opts.signal)
      if (!switched) {
        throw new FolioError(
          'eagle_switch_failed',
          `无法切换到 Eagle 专用缓存库：${opts.cacheLibraryPath}`,
          502,
        )
      }
    }

    const jobTag = `lf_thumb_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
    let createdItemId: string | null = null

    try {
      try {
        const addedId = await eagle.addItemFromPath(
          {
            path: opts.filePath,
            name: path.basename(opts.filePath),
            tags: [jobTag],
          },
          baseUrlOverride,
          { timeoutMs: 10_000, signal: opts.signal },
        )
        if (addedId) {
          createdItemId = addedId
        }
      } catch (err) {
        if (opts.signal?.aborted || (err instanceof FolioError && err.code === 'aborted')) {
          throw err
        }
        return null
      }

      const timeoutMs = computeDynamicPollTimeoutMs(opts.fileSize)
      const deadline = Date.now() + timeoutMs

      while (Date.now() < deadline) {
        if (opts.signal?.aborted) return null

        if (!createdItemId) {
          const items = await eagle
            .listItems(
              { tags: jobTag, limit: 5 },
              baseUrlOverride,
              { timeoutMs: 4000, signal: opts.signal },
            )
            .catch(() => null)
          const match = items?.find(it => it.id && !it.isDeleted)
          if (match?.id) {
            createdItemId = match.id
          }
        }

        if (createdItemId) {
          const decodedPath = await eagle
            .getItemThumbnailPath(createdItemId, baseUrlOverride, {
              timeoutMs: 4000,
              signal: opts.signal,
            })
            .catch(() => null)

          if (decodedPath) {
            const st = await fsp.stat(decodedPath).catch(() => null)
            if (st && st.isFile() && st.size > 0) {
              const buffer = await fsp.readFile(decodedPath).catch(() => null)
              if (buffer && buffer.length > 0) {
                return {
                  buffer,
                  mime: sniffImageMime(buffer, fsService),
                  previousLibraryPath,
                }
              }
            }
          }
        }

        await sleep(pollIntervalMs, opts.signal)
      }

      return null
    } finally {
      if (createdItemId) {
        await moveItemToTrash(createdItemId)
      }
      if (opts.restoreLibrary && previousLibraryPath) {
        await switchLibrary(previousLibraryPath).catch(() => false)
      }
    }
  }

  return {
    probeLibraryInfo,
    switchLibrary,
    extractThumbnail,
  }
}
