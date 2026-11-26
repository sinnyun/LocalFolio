import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { Readable } from 'node:stream'
import { FolioError, type FolioRouteHandler } from '@folio/base-contract'
import { classifyFile, isStreamableMediaExt, normalizeBrowsePath } from './classify.js'
import type { ShellThumbProvider } from './win-thumb.js'

const MAX_IMAGE_STREAM_BYTES = 50 * 1024 * 1024 // 50 MB
const THUMB_BUCKETS = [96, 160, 256, 512] as const

function snapThumbBucket(rawSize: number): number {
  const clamped = Math.max(48, Math.min(512, Math.round(rawSize)))
  for (const bucket of THUMB_BUCKETS) {
    if (clamped <= bucket) return bucket
  }
  return 512
}

export function createThumbRouteHandler(thumbProvider: ShellThumbProvider): FolioRouteHandler {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const rawPath = url.searchParams.get('path')
    if (!rawPath) {
      throw new FolioError('missing_path', '缺少 path 参数', 400)
    }

    const filePath = normalizeBrowsePath(rawPath)
    let st: fs.Stats
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

    const png = await thumbProvider.getThumbnail(filePath, bucketSize, {
      allowIconFallback,
      signal: request.signal,
    })

    if (!png || png.length === 0) {
      return new Response(null, {
        status: 204,
        headers: {
          'cache-control': 'private, max-age=60',
        },
      })
    }

    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        'content-type': 'image/png',
        'content-length': String(png.length),
        etag,
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
      },
    })
  }
}

export function createMediaRouteHandler(): FolioRouteHandler {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const rawPath = url.searchParams.get('path')
    if (!rawPath) {
      throw new FolioError('missing_path', '缺少 path 参数', 400)
    }

    const filePath = normalizeBrowsePath(rawPath)
    let st: fs.Stats
    try {
      st = await fsp.stat(filePath)
    } catch {
      throw new FolioError('not_found', `文件不存在: ${filePath}`, 404)
    }

    if (!st.isFile()) {
      throw new FolioError('not_a_file', '只能流式读取普通文件', 400)
    }

    const meta = classifyFile(filePath, false)
    if (!isStreamableMediaExt(meta.ext)) {
      throw new FolioError('unsupported_media', `不支持预览该媒体类型: ${meta.ext}`, 415)
    }
    if (meta.category === 'image' && st.size > MAX_IMAGE_STREAM_BYTES) {
      throw new FolioError('payload_too_large', '图片体积超出 50MB 预览上限', 413)
    }

    const etag = `"media-${st.size}-${Math.trunc(st.mtimeMs)}"`
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          'cache-control': 'private, max-age=300',
        },
      })
    }

    const baseHeaders: Record<string, string> = {
      'content-type': meta.mime,
      'accept-ranges': 'bytes',
      etag,
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
    }
    if (meta.ext === '.svg') {
      baseHeaders['content-security-policy'] = 'sandbox'
    }

    if (request.method.toUpperCase() === 'HEAD') {
      baseHeaders['content-length'] = String(st.size)
      return new Response(null, { status: 200, headers: baseHeaders })
    }

    const rangeHeader = request.headers.get('range')
    if (rangeHeader && st.size > 0) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
      if (!match) {
        return new Response(null, {
          status: 416,
          headers: { 'content-range': `bytes */${st.size}` },
        })
      }
      const start = match[1] ? Number(match[1]) : 0
      const end = match[2] ? Math.min(st.size - 1, Number(match[2])) : st.size - 1
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= st.size) {
        return new Response(null, {
          status: 416,
          headers: { 'content-range': `bytes */${st.size}` },
        })
      }

      const chunkSize = end - start + 1
      const stream = fs.createReadStream(filePath, { start, end })
      const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>
      return new Response(webStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          'content-range': `bytes ${start}-${end}/${st.size}`,
          'content-length': String(chunkSize),
        },
      })
    }

    baseHeaders['content-length'] = String(st.size)
    const stream = fs.createReadStream(filePath)
    const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>
    return new Response(webStream, { status: 200, headers: baseHeaders })
  }
}
