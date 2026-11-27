import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { FolioError, type GeneratedThumbMime } from '@folio/base-contract'

export const DEFAULT_EAGLE_API_BASE = 'http://127.0.0.1:41595'
export const PROBE_TIMEOUT_MS = 500
export const BASE_POLL_TIMEOUT_MS = 10_000
export const EXTRA_POLL_MS_PER_100MB = 5_000

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface EagleLibraryInfo {
  readonly path: string
  readonly name: string
}

interface EagleEnvelope<T> {
  readonly status?: string
  readonly data?: T
  readonly message?: string
}

interface EagleListItem {
  readonly id?: string
  readonly name?: string
  readonly isDeleted?: boolean
}

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

export function sniffImageMime(buf: Buffer): GeneratedThumbMime {
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

async function fetchJsonWithTimeout<T>(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const onExternalAbort = (): void => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timer)
      throw new FolioError('aborted', '操作已取消', 499)
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }

  try {
    const resp = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
    })
    if (!resp.ok) {
      throw new FolioError('eagle_http_error', `Eagle API HTTP ${resp.status}`, 502)
    }
    return (await resp.json()) as T
  } finally {
    clearTimeout(timer)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort)
    }
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
  const fetchImpl: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, init))
  const probeTimeoutMs = options.probeTimeoutMs ?? PROBE_TIMEOUT_MS
  const pollIntervalMs = options.pollIntervalMs ?? 250

  const probeLibraryInfo = async (signal?: AbortSignal): Promise<EagleLibraryInfo | null> => {
    try {
      const env = await fetchJsonWithTimeout<
        EagleEnvelope<{ library?: { path?: string; name?: string } }>
      >(fetchImpl, `${apiBase}/api/library/info`, { method: 'GET' }, probeTimeoutMs, signal)
      if (env.status !== 'success' || !env.data?.library?.path) return null
      return {
        path: env.data.library.path,
        name: env.data.library.name ?? path.basename(env.data.library.path),
      }
    } catch {
      return null
    }
  }

  const switchLibrary = async (targetPath: string, signal?: AbortSignal): Promise<boolean> => {
    try {
      await fetchJsonWithTimeout<EagleEnvelope<unknown>>(
        fetchImpl,
        `${apiBase}/api/library/switch`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ libraryPath: targetPath }),
        },
        4000,
        signal,
      )
    } catch {
      return false
    }

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
    await fetchJsonWithTimeout<EagleEnvelope<unknown>>(
      fetchImpl,
      `${apiBase}/api/item/moveToTrash`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemIds: [itemId] }),
      },
      4000,
    ).catch(() => {})
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
      const addResp = await fetchJsonWithTimeout<EagleEnvelope<unknown>>(
        fetchImpl,
        `${apiBase}/api/item/addFromPath`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            path: opts.filePath,
            name: path.basename(opts.filePath),
            tags: [jobTag],
          }),
        },
        10_000,
        opts.signal,
      )
      if (addResp.status !== 'success') {
        return null
      }

      const timeoutMs = computeDynamicPollTimeoutMs(opts.fileSize)
      const deadline = Date.now() + timeoutMs

      while (Date.now() < deadline) {
        if (opts.signal?.aborted) return null

        if (!createdItemId) {
          const listResp = await fetchJsonWithTimeout<EagleEnvelope<EagleListItem[]>>(
            fetchImpl,
            `${apiBase}/api/item/list?tags=${encodeURIComponent(jobTag)}&limit=5`,
            { method: 'GET' },
            4000,
            opts.signal,
          ).catch(() => null)
          const match = listResp?.data?.find(it => it.id && !it.isDeleted)
          if (match?.id) {
            createdItemId = match.id
          }
        }

        if (createdItemId) {
          const thumbResp = await fetchJsonWithTimeout<EagleEnvelope<string>>(
            fetchImpl,
            `${apiBase}/api/item/thumbnail?id=${encodeURIComponent(createdItemId)}`,
            { method: 'GET' },
            4000,
            opts.signal,
          ).catch(() => null)

          if (thumbResp?.status === 'success' && typeof thumbResp.data === 'string' && thumbResp.data) {
            const decodedPath = decodeEagleThumbPath(thumbResp.data)
            if (decodedPath) {
              const st = await fsp.stat(decodedPath).catch(() => null)
              if (st && st.isFile() && st.size > 0) {
                const buffer = await fsp.readFile(decodedPath).catch(() => null)
                if (buffer && buffer.length > 0) {
                  return {
                    buffer,
                    mime: sniffImageMime(buffer),
                    previousLibraryPath,
                  }
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
