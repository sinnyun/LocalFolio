import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { FolioError, type FolioRouteHandler } from '@folio/base-contract'
import { normalizeLocalPath } from './dialogs.js'
import type { VectorCraftBridge } from './vectorcraft-bridge.js'

const MAX_CACHE_BYTES = 150 * 1024 * 1024
const MAX_CACHE_FILES = 500

export interface CreateMaterialsPreviewRouteOptions {
  readonly cacheDir: string
  readonly bridge: VectorCraftBridge
}

function clampPpi(raw: number): number {
  if (!Number.isFinite(raw)) return 72
  return Math.max(48, Math.min(200, Math.round(raw)))
}

function previewCacheKey(
  filePath: string,
  size: number,
  mtimeMs: number,
  artboard: number,
  ppi: number,
): string {
  return crypto
    .createHash('sha256')
    .update(`${filePath.toLowerCase()}|${size}|${Math.trunc(mtimeMs)}|${artboard}|${ppi}`)
    .digest('hex')
}

export function createMaterialsPreviewRouteHandler(
  options: CreateMaterialsPreviewRouteOptions,
): FolioRouteHandler {
  const previewDir = path.join(options.cacheDir, 'previews')
  const inflight = new Map<string, Promise<Buffer | null>>()
  let activeRenders = 0
  const waitQueue: Array<() => void> = []
  let prunePending = false

  async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (activeRenders >= 2) {
      await new Promise<void>(resolve => waitQueue.push(resolve))
    }
    activeRenders += 1
    try {
      return await fn()
    } finally {
      activeRenders -= 1
      const next = waitQueue.shift()
      if (next) next()
    }
  }

  function schedulePrune(): void {
    if (prunePending) return
    prunePending = true
    setTimeout(() => {
      prunePending = false
      void (async () => {
        try {
          const entries = await fsp.readdir(previewDir, { withFileTypes: true })
          const stats: Array<{ filePath: string; size: number; mtimeMs: number }> = []
          let totalBytes = 0
          for (const e of entries) {
            if (!e.isFile() || !e.name.endsWith('.png')) continue
            const fp = path.join(previewDir, e.name)
            try {
              const st = await fsp.stat(fp)
              stats.push({ filePath: fp, size: st.size, mtimeMs: st.mtimeMs })
              totalBytes += st.size
            } catch {
              // ignore
            }
          }
          if (stats.length <= MAX_CACHE_FILES && totalBytes <= MAX_CACHE_BYTES) return
          stats.sort((a, b) => a.mtimeMs - b.mtimeMs)
          while (
            stats.length > 0 &&
            (stats.length > MAX_CACHE_FILES || totalBytes > MAX_CACHE_BYTES)
          ) {
            const oldest = stats.shift()!
            await fsp.unlink(oldest.filePath).catch(() => {})
            totalBytes -= oldest.size
          }
        } catch {
          // ignore
        }
      })()
    }, 3000)
  }

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url, 'http://127.0.0.1')
    const rawPath = url.searchParams.get('path') ?? ''
    const filePath = normalizeLocalPath(rawPath)
    if (!filePath) {
      throw new FolioError('invalid_path', '缺少 path 参数', 400)
    }

    const artboard = Math.max(0, Math.trunc(Number(url.searchParams.get('artboard') ?? '0') || 0))
    const ppi = clampPpi(Number(url.searchParams.get('ppi') ?? '72'))

    let st: fs.Stats
    try {
      st = await fsp.stat(filePath)
    } catch {
      throw new FolioError('not_found', `文件不存在: ${filePath}`, 404)
    }

    const etag = `"vc-prev-${st.size}-${Math.trunc(st.mtimeMs)}-${artboard}-${ppi}"`
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          'cache-control': 'private, max-age=31536000, immutable',
        },
      })
    }

    const key = previewCacheKey(filePath, st.size, st.mtimeMs, artboard, ppi)
    const cacheFile = path.join(previewDir, `${key}.png`)

    try {
      const cached = await fsp.readFile(cacheFile)
      if (cached.length > 0) {
        return new Response(new Uint8Array(cached), {
          status: 200,
          headers: {
            'content-type': 'image/png',
            'content-length': String(cached.length),
            etag,
            'cache-control': 'private, max-age=31536000, immutable',
            'x-content-type-options': 'nosniff',
          },
        })
      }
    } catch {
      // cache miss
    }

    let pending = inflight.get(key)
    if (!pending) {
      pending = withRenderSlot(async () => {
        await fsp.mkdir(previewDir, { recursive: true })
        const tmpFile = `${cacheFile}.${process.pid}.${Date.now()}.tmp.png`
        try {
          await options.bridge.renderArtboardPng({
            filePath,
            artboardIndex: artboard,
            ppi,
            outputPath: tmpFile,
          })
          const buf = await fsp.readFile(tmpFile)
          if (buf.length === 0) return null
          await fsp.rename(tmpFile, cacheFile)
          schedulePrune()
          return buf
        } catch (err) {
          await fsp.unlink(tmpFile).catch(() => {})
          throw err
        }
      }).finally(() => {
        inflight.delete(key)
      })
      inflight.set(key, pending)
    }

    const rendered = await pending
    if (!rendered) {
      throw new FolioError('preview_render_failed', `无法渲染画板预览: ${filePath}`, 500)
    }

    return new Response(new Uint8Array(rendered), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': String(rendered.length),
        etag,
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    })
  }
}
