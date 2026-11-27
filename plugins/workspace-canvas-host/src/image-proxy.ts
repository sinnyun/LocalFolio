import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  FolioError,
  observeTask,
  type FolioFsService,
  type FolioNativeService,
  type FolioRouteHandler,
  type FolioTasksService,
} from '@folio/base-contract'
import { classifyImageFile, normalizeLocalPath } from './image-meta.js'
import type { CanvasCacheStats } from './types.js'

export const LOD_TIERS = [256, 512, 1024, 2048] as const
export type LodTier = (typeof LOD_TIERS)[number]

export const MAX_CACHE_BYTES = 256 * 1024 * 1024 // 256 MB
export const MAX_CACHE_FILES = 1500
const MAX_SVG_STREAM_BYTES = 2 * 1024 * 1024 // 2 MB

const ALPHA_EXTS = new Set(['.png', '.webp', '.gif', '.ico', '.svg'])

export function snapLodTier(rawPx: number): LodTier {
  const safe = Number.isFinite(rawPx) ? rawPx : 512
  const clamped = Math.max(64, Math.min(2048, Math.round(safe)))
  for (const tier of LOD_TIERS) {
    if (clamped <= tier) return tier
  }
  return 2048
}

export interface ImageProxyOptions {
  readonly preferPng?: boolean
  readonly signal?: AbortSignal
}

export interface ImageProxyResult {
  readonly buffer: Buffer
  readonly mime: 'image/jpeg' | 'image/png' | 'image/svg+xml'
}

export interface ImageProxyProvider {
  renderProxy(
    filePath: string,
    tier: number,
    options?: ImageProxyOptions,
  ): Promise<ImageProxyResult | null>
  dispose(): void
}

export function createNoopImageProxyProvider(): ImageProxyProvider {
  return {
    async renderProxy(): Promise<ImageProxyResult | null> {
      return null
    },
    dispose(): void {
      // no-op
    },
  }
}

export function createWindowsWicImageProxyProvider(
  native?: FolioNativeService,
): ImageProxyProvider {
  if (!native || process.platform !== 'win32') {
    return createNoopImageProxyProvider()
  }
  return {
    renderProxy: (filePath, tier, opts) => native.renderImageProxy(filePath, tier, opts),
    dispose(): void {
      // Lifecycle is owned by @folio/base-native-host
    },
  }
}

function getLodDir(cacheDir: string): string {
  return path.join(cacheDir, 'lod')
}

function cacheKeyHash(filePath: string, size: number, mtimeMs: number, tier: LodTier): string {
  return crypto
    .createHash('sha256')
    .update(`${filePath.toLowerCase()}|${size}|${Math.trunc(mtimeMs)}|${tier}`)
    .digest('hex')
}

export async function getLodCacheStats(cacheDir: string): Promise<CanvasCacheStats> {
  const lodDir = getLodDir(cacheDir)
  let fileCount = 0
  let totalBytes = 0
  try {
    const names = await fsp.readdir(lodDir)
    for (const name of names) {
      if (!name.endsWith('.jpg') && !name.endsWith('.png')) continue
      try {
        const st = await fsp.stat(path.join(lodDir, name))
        if (st.isFile()) {
          fileCount += 1
          totalBytes += st.size
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // lod dir may not exist yet
  }

  return {
    fileCount,
    totalBytes,
    maxBytes: MAX_CACHE_BYTES,
    maxFiles: MAX_CACHE_FILES,
    tiers: [...LOD_TIERS],
  }
}

export async function clearLodCache(cacheDir: string): Promise<CanvasCacheStats> {
  const lodDir = getLodDir(cacheDir)
  try {
    await fsp.rm(lodDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
  await fsp.mkdir(lodDir, { recursive: true }).catch(() => {})
  return getLodCacheStats(cacheDir)
}

export interface CanvasProxyRouteOptions {
  readonly cacheDir: string
  readonly provider: ImageProxyProvider
  readonly fs?: FolioFsService
  readonly tasks?: FolioTasksService
}

export function createCanvasProxyRouteHandler(
  options: CanvasProxyRouteOptions,
): FolioRouteHandler {
  const lodDir = getLodDir(options.cacheDir)
  const inflight = new Map<string, Promise<ImageProxyResult | null>>()
  let pruneScheduled = false

  const schedulePrune = (): void => {
    if (!options.fs || pruneScheduled) return
    pruneScheduled = true
    const fsService = options.fs
    setTimeout(() => {
      pruneScheduled = false
      void fsService
        .pruneCacheDir(lodDir, {
          maxFiles: MAX_CACHE_FILES,
          maxBytes: MAX_CACHE_BYTES,
          extFilter: ['.jpg', '.png'],
        })
        .catch(() => {})
    }, 500).unref?.()
  }

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const rawPath = url.searchParams.get('path')
    if (!rawPath) {
      throw new FolioError('missing_path', '缺少 path 参数', 400)
    }

    const filePath = normalizeLocalPath(rawPath)
    let st: fs.Stats
    try {
      st = await fsp.stat(filePath)
    } catch {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'link_missing', message: `链接图片不存在或已被移动: ${filePath}` },
        }),
        {
          status: 404,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'x-folio-link-status': 'missing',
            'cache-control': 'no-store',
          },
        },
      )
    }

    if (!st.isFile()) {
      throw new FolioError('not_a_file', '目标路径不是有效图片文件', 400)
    }

    const classified = classifyImageFile(path.basename(filePath))
    if (!classified.isImage) {
      throw new FolioError('unsupported_media', `不支持的图片格式: ${classified.ext}`, 415)
    }

    const rawTier = Number(url.searchParams.get('tier') ?? '512')
    const tier = snapLodTier(rawTier)
    const etag = `"lod-${st.size}-${Math.trunc(st.mtimeMs)}-${tier}"`

    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          'cache-control': 'private, max-age=31536000, immutable',
          'x-folio-lod-tier': String(tier),
          'x-folio-link-status': 'ok',
        },
      })
    }

    // Serve lightweight SVG directly with sandbox CSP
    if (classified.ext === '.svg' && st.size <= MAX_SVG_STREAM_BYTES) {
      const svgBuffer = await fsp.readFile(filePath)
      return new Response(new Uint8Array(svgBuffer), {
        status: 200,
        headers: {
          'content-type': 'image/svg+xml',
          'content-length': String(svgBuffer.length),
          'content-security-policy': 'sandbox',
          etag,
          'cache-control': 'private, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
          'x-folio-lod-tier': String(tier),
          'x-folio-link-status': 'ok',
        },
      })
    }

    const hash = cacheKeyHash(filePath, st.size, st.mtimeMs, tier)
    const jpgPath = path.join(lodDir, `${hash}.jpg`)
    const pngPath = path.join(lodDir, `${hash}.png`)

    for (const candidate of [
      { path: jpgPath, mime: 'image/jpeg' as const },
      { path: pngPath, mime: 'image/png' as const },
    ]) {
      try {
        const cached = await fsp.readFile(candidate.path)
        if (cached.length > 0) {
          return new Response(new Uint8Array(cached), {
            status: 200,
            headers: {
              'content-type': candidate.mime,
              'content-length': String(cached.length),
              etag,
              'cache-control': 'private, max-age=31536000, immutable',
              'x-content-type-options': 'nosniff',
              'x-folio-lod-tier': String(tier),
              'x-folio-link-status': 'ok',
            },
          })
        }
      } catch {
        // cache miss
      }
    }

    const preferPng = ALPHA_EXTS.has(classified.ext)
    let pending = inflight.get(hash)
    if (!pending) {
      pending = observeTask(options.tasks, {
        scope: 'canvas', key: 'previews', title: '画板图片预览',
        item: path.basename(filePath), isSuccessful: Boolean,
      }, async () => {
        const rendered = await options.provider.renderProxy(filePath, tier, { preferPng })
        if (!rendered || rendered.buffer.length === 0) return null
        const ext = rendered.mime === 'image/png' ? 'png' : 'jpg'
        const target = path.join(lodDir, `${hash}.${ext}`)
        try {
          if (options.fs) {
            await options.fs.writeAtomicFile(target, rendered.buffer)
          } else {
            await fsp.mkdir(lodDir, { recursive: true })
            const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
            try {
              await fsp.writeFile(tmp, rendered.buffer)
              await fsp.rename(tmp, target)
            } catch (writeErr) {
              await fsp.unlink(tmp).catch(() => {})
              throw writeErr
            }
          }
          schedulePrune()
        } catch {
          // ignore cache write failure
        }
        return rendered
      }).finally(() => {
        inflight.delete(hash)
      })
      inflight.set(hash, pending)
    }

    const rendered = await pending
    if (!rendered) {
      throw new FolioError('proxy_render_failed', `无法生成图片代理缩略图: ${filePath}`, 500)
    }

    return new Response(new Uint8Array(rendered.buffer), {
      status: 200,
      headers: {
        'content-type': rendered.mime,
        'content-length': String(rendered.buffer.length),
        etag,
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'x-folio-lod-tier': String(tier),
        'x-folio-link-status': 'ok',
      },
    })
  }
}
