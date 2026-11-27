import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import {
  FolioError,
  type FsPruneCacheOptions,
  type FsPruneCacheResult,
  type FsServeDownloadOptions,
  type FsServeMediaOptions,
} from '@folio/base-contract'
import { classifyFile, isStreamableMediaExt, normalizePath } from './classify.js'

const DEFAULT_MAX_IMAGE_STREAM_BYTES = 50 * 1024 * 1024 // 50 MB
const DEFAULT_MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024 // 100 MB

export async function serveMediaFile(
  request: Request,
  rawFilePath: string,
  options: FsServeMediaOptions = {},
): Promise<Response> {
  const filePath = normalizePath(rawFilePath)
  if (!filePath) {
    throw new FolioError('missing_path', '缺少 path 参数', 400)
  }

  let st: fs.Stats
  try {
    st = await fsp.stat(filePath)
  } catch {
    throw new FolioError('not_found', `文件不存在: ${filePath}`, 404)
  }

  if (!st.isFile()) {
    throw new FolioError('not_a_file', '只能流式读取普通文件', 400)
  }

  const meta = classifyFile(path.basename(filePath), false)
  const allowed = options.allowedExts
    ? options.allowedExts.has(meta.ext)
    : isStreamableMediaExt(meta.ext)
  if (!allowed) {
    throw new FolioError('unsupported_media', `不支持预览该媒体类型: ${meta.ext}`, 415)
  }

  const maxImageBytes = options.maxImageBytes ?? DEFAULT_MAX_IMAGE_STREAM_BYTES
  if (meta.category === 'image' && st.size > maxImageBytes) {
    throw new FolioError('payload_too_large', '图片体积超出预览上限', 413)
  }

  const etagPrefix = options.etagPrefix ?? 'media'
  const etag = `"${etagPrefix}-${st.size}-${Math.trunc(st.mtimeMs)}"`
  const cacheControl = options.cacheControl ?? 'private, max-age=300'

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        etag,
        'cache-control': cacheControl,
      },
    })
  }

  const baseHeaders: Record<string, string> = {
    'content-type': meta.mime,
    'accept-ranges': 'bytes',
    etag,
    'cache-control': cacheControl,
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

export async function serveDownloadFile(
  request: Request,
  rawFilePath: string,
  options: FsServeDownloadOptions = {},
): Promise<Response> {
  const filePath = normalizePath(rawFilePath)
  if (!filePath) {
    throw new FolioError('missing_path', '缺少 path 参数', 400)
  }

  let st: fs.Stats
  try {
    st = await fsp.stat(filePath)
  } catch {
    throw new FolioError('not_found', `文件不存在: ${filePath}`, 404)
  }

  if (!st.isFile()) {
    throw new FolioError('not_a_file', '只能下载普通文件', 400)
  }

  const maxBytes = options.maxBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES
  if (st.size > maxBytes) {
    throw new FolioError('payload_too_large', '文件体积超出传输上限', 413)
  }

  const meta = classifyFile(path.basename(filePath), false)
  const etagPrefix = options.etagPrefix ?? 'dl'
  const etag = `"${etagPrefix}-${st.size}-${Math.trunc(st.mtimeMs)}"`
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        etag,
        'cache-control': 'private, no-store',
      },
    })
  }

  const fileName = options.fileName || path.basename(filePath) || 'file'
  const headers: Record<string, string> = {
    'content-type': meta.mime,
    'content-length': String(st.size),
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    etag,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  }
  if (meta.ext === '.svg' || meta.ext === '.html' || meta.ext === '.htm') {
    headers['content-security-policy'] = 'sandbox'
  }

  if (request.method.toUpperCase() === 'HEAD') {
    return new Response(null, { status: 200, headers })
  }

  const stream = fs.createReadStream(filePath)
  const webStream = Readable.toWeb(stream) as ReadableStream<Uint8Array>
  return new Response(webStream, { status: 200, headers })
}

export async function pruneCacheDir(
  dirPath: string,
  options: FsPruneCacheOptions,
): Promise<FsPruneCacheResult> {
  const exts = options.extFilter
    ? new Set(
        (Array.isArray(options.extFilter) ? options.extFilter : [options.extFilter]).map(e =>
          e.toLowerCase(),
        ),
      )
    : null

  let entries: fs.Dirent[]
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true })
  } catch {
    return { removedFiles: 0, remainingFiles: 0, remainingBytes: 0 }
  }

  const stats: Array<{ filePath: string; size: number; mtimeMs: number }> = []
  let totalBytes = 0

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (exts && !exts.has(path.extname(entry.name).toLowerCase())) continue
    const fp = path.join(dirPath, entry.name)
    try {
      const st = await fsp.stat(fp)
      stats.push({ filePath: fp, size: st.size, mtimeMs: st.mtimeMs })
      totalBytes += st.size
    } catch {
      // ignore missing/locked file
    }
  }

  if (stats.length <= options.maxFiles && totalBytes <= options.maxBytes) {
    return {
      removedFiles: 0,
      remainingFiles: stats.length,
      remainingBytes: totalBytes,
    }
  }

  stats.sort((a, b) => a.mtimeMs - b.mtimeMs)
  let removedFiles = 0
  while (
    stats.length > 0 &&
    (stats.length > options.maxFiles || totalBytes > options.maxBytes)
  ) {
    const oldest = stats.shift()!
    await fsp.unlink(oldest.filePath).catch(() => {})
    totalBytes -= oldest.size
    removedFiles += 1
  }

  return {
    removedFiles,
    remainingFiles: stats.length,
    remainingBytes: Math.max(0, totalBytes),
  }
}

export async function writeAtomicFile(
  targetPath: string,
  data: string | Buffer,
): Promise<void> {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true })
  const tmpPath = `${targetPath}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    if (typeof data === 'string') {
      await fsp.writeFile(tmpPath, data, 'utf8')
    } else {
      await fsp.writeFile(tmpPath, data)
    }
    await fsp.rename(tmpPath, targetPath)
  } catch (err) {
    await fsp.unlink(tmpPath).catch(() => {})
    throw err
  }
}
