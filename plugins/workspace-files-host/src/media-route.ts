import fsp from 'node:fs/promises'
import {
  FolioError,
  type FolioFsService,
  type FolioNativeService,
  type FolioRouteHandler,
  type FolioThumbsService,
} from '@folio/base-contract'
import { normalizeBrowsePath } from './classify.js'
import type { ShellThumbProvider } from './win-thumb.js'

const THUMB_BUCKETS = [96, 160, 256, 512] as const

function snapThumbBucket(rawSize: number): number {
  const clamped = Math.max(48, Math.min(512, Math.round(rawSize)))
  for (const bucket of THUMB_BUCKETS) {
    if (clamped <= bucket) return bucket
  }
  return 512
}

export interface ThumbRouteHandlerDeps {
  readonly thumbs?: FolioThumbsService
  readonly native?: FolioNativeService
  readonly thumbProvider?: ShellThumbProvider
}

export function createThumbRouteHandler(
  depsOrProvider: ShellThumbProvider | ThumbRouteHandlerDeps,
): FolioRouteHandler {
  const deps: ThumbRouteHandlerDeps =
    'getThumbnail' in depsOrProvider ? { thumbProvider: depsOrProvider } : depsOrProvider

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const rawPath = url.searchParams.get('path')
    if (!rawPath) {
      throw new FolioError('missing_path', '缺少 path 参数', 400)
    }

    const filePath = normalizeBrowsePath(rawPath)
    let st
    try {
      st = await fsp.stat(filePath)
    } catch {
      throw new FolioError('not_found', `文件不存在: ${filePath}`, 404)
    }

    const rawSize = Number(url.searchParams.get('size') ?? '256')
    const bucketSize = snapThumbBucket(Number.isFinite(rawSize) ? rawSize : 256)
    const allowIconFallback = url.searchParams.get('fallback') === 'icon'
    const etag = `W/"thumb-${st.size}-${Math.trunc(st.mtimeMs)}-${bucketSize}-${allowIconFallback ? 1 : 0}"`

    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          'cache-control': 'private, max-age=300',
        },
      })
    }

    let payload: { readonly buffer: Buffer; readonly mime: string } | null = null

    if (deps.thumbs && st.isFile()) {
      const rendered = await deps.thumbs
        .generate({
          filePath,
          maxDim: bucketSize,
          signal: request.signal,
          activity: { scope: 'files', key: 'thumbnails', title: '文件浏览器缩略图', item: filePath },
        })
        .catch(() => null)
      if (rendered && rendered.buffer.length > 0) {
        payload = { buffer: rendered.buffer, mime: rendered.mime }
      }
    }

    if (!payload && deps.native && (allowIconFallback || st.isDirectory())) {
      const nativeRes = await deps.native
        .getThumbnail(filePath, bucketSize, {
          allowIconFallback,
          signal: request.signal,
        })
        .catch(() => null)
      if (nativeRes && nativeRes.buffer.length > 0) {
        payload = { buffer: nativeRes.buffer, mime: nativeRes.mime }
      }
    }

    if (!payload && deps.thumbProvider) {
      const png = await deps.thumbProvider.getThumbnail(filePath, bucketSize, {
        allowIconFallback,
        signal: request.signal,
      })
      if (png && png.length > 0) {
        payload = { buffer: png, mime: 'image/png' }
      }
    }

    if (!payload || payload.buffer.length === 0) {
      return new Response(null, {
        status: 204,
        headers: {
          'cache-control': 'private, max-age=60',
        },
      })
    }

    return new Response(new Uint8Array(payload.buffer), {
      status: 200,
      headers: {
        'content-type': payload.mime,
        'content-length': String(payload.buffer.length),
        etag,
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
      },
    })
  }
}

export function createMediaRouteHandler(fsService?: FolioFsService): FolioRouteHandler {
  return async (request: Request): Promise<Response> => {
    if (!fsService) {
      throw new FolioError('fs_unavailable', '基础文件系统服务未就绪', 503)
    }
    const url = new URL(request.url)
    const rawPath = url.searchParams.get('path')
    if (!rawPath) {
      throw new FolioError('missing_path', '缺少 path 参数', 400)
    }
    return fsService.serveMediaFile(request, rawPath, { etagPrefix: 'media' })
  }
}

export function createDownloadRouteHandler(fsService?: FolioFsService): FolioRouteHandler {
  return async (request: Request): Promise<Response> => {
    if (!fsService) {
      throw new FolioError('fs_unavailable', '基础文件系统服务未就绪', 503)
    }
    const url = new URL(request.url)
    const rawPath = url.searchParams.get('path')
    if (!rawPath) {
      throw new FolioError('missing_path', '缺少 path 参数', 400)
    }
    return fsService.serveDownloadFile(request, rawPath, { etagPrefix: 'dl' })
  }
}
