import { randomUUID } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { FolioError } from '@folio/base-contract'
import { classifyImageFile, inspectLinkedImage } from './image-meta.js'
import type { LinkedImageInspectResult } from './types.js'

/**
 * Browser drops never expose a disk path, so the renderer streams the file here
 * in chunks that fit the shared 2 MB RPC body limit. The host writes the bytes
 * into its own managed `imports/` folder and the canvas then links the resulting
 * absolute path exactly like a file chosen from disk.
 */
export const IMPORT_CHUNK_BYTES = 1024 * 1024
export const MAX_IMPORT_BYTES = 128 * 1024 * 1024

const IMPORT_SESSION_TTL_MS = 10 * 60 * 1000
const MAX_FILE_NAME_LENGTH = 120
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

function avoidReservedBaseName(name: string): string {
  return WINDOWS_RESERVED_NAME.test(name) ? `_${name}` : name
}

const MIME_EXTENSION_PREFERENCE: readonly (readonly [string, string])[] = [
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/jfif', '.jpg'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
  ['image/avif', '.avif'],
  ['image/bmp', '.bmp'],
  ['image/svg+xml', '.svg'],
  ['image/tiff', '.tiff'],
  ['image/heic', '.heic'],
  ['image/heif', '.heif'],
  ['image/x-icon', '.ico'],
  ['image/vnd.microsoft.icon', '.ico'],
  ['image/vnd.adobe.photoshop', '.psd'],
]

function extensionForMime(mime: string | undefined): string | null {
  if (!mime) return null
  const normalized = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  for (const [candidate, ext] of MIME_EXTENSION_PREFERENCE) {
    if (candidate === normalized) return ext
  }
  return null
}

/**
 * Turn a browser-supplied file name into a safe image file name. Names without
 * an extension fall back to the MIME type; names whose extension is not a
 * supported image format are rejected instead of being silently renamed.
 */
export function resolveImportFileName(rawName: string, mime?: string): string | null {
  const flattened = (rawName || '').trim().replace(/\\/g, '/')
  const baseName = path.posix.basename(flattened) || '粘贴图片'
  const cleaned = baseName
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
  const truncated = cleaned.slice(0, MAX_FILE_NAME_LENGTH) || '粘贴图片'
  const parsed = path.parse(truncated)

  if (parsed.ext) {
    return classifyImageFile(parsed.base).isImage
      ? `${avoidReservedBaseName(parsed.name)}${parsed.ext}`
      : null
  }

  const mimeExt = extensionForMime(mime)
  if (!mimeExt) return null
  const stem = parsed.name.slice(0, MAX_FILE_NAME_LENGTH - mimeExt.length) || '粘贴图片'
  return `${avoidReservedBaseName(stem)}${mimeExt}`
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fsp.access(target)
    return true
  } catch {
    return false
  }
}

async function allocateDestination(dir: string, fileName: string): Promise<string> {
  const { name, ext } = path.parse(fileName)
  for (let index = 1; index < 1000; index += 1) {
    const candidateName = index === 1 ? fileName : `${name} (${index})${ext}`
    const candidate = path.join(dir, candidateName)
    if (!(await pathExists(candidate))) return candidate
  }
  return path.join(dir, `${name}-${Date.now()}${ext}`)
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export interface ImportBeginInput {
  readonly fileName: string
  readonly mime?: string
  readonly size?: number
}

export interface ImportBeginResult {
  readonly importId: string
  readonly chunkBytes: number
  readonly maxBytes: number
}

export interface DropImportManagerOptions {
  readonly importsDir: string
  readonly stagingDir?: string
  readonly maxBytes?: number
  readonly chunkBytes?: number
  readonly sessionTtlMs?: number
}

interface ImportSession {
  readonly importId: string
  readonly stagingPath: string
  readonly fileName: string
  readonly maxBytes: number
  readonly handle: fsp.FileHandle
  receivedBytes: number
  lastUsedAt: number
  queue: Promise<void>
  closed: boolean
}

export interface DropImportManager {
  readonly importsDir: string
  begin(input: ImportBeginInput): Promise<ImportBeginResult>
  append(importId: string, dataBase64: string): Promise<{ readonly receivedBytes: number }>
  finish(importId: string): Promise<LinkedImageInspectResult>
  abort(importId: string): Promise<void>
  dispose(): void
}

export function createDropImportManager(options: DropImportManagerOptions): DropImportManager {
  const importsDir = path.resolve(options.importsDir)
  const stagingDir = path.resolve(options.stagingDir ?? path.join(importsDir, '.staging'))
  const maxBytes = options.maxBytes ?? MAX_IMPORT_BYTES
  const chunkBytes = options.chunkBytes ?? IMPORT_CHUNK_BYTES
  const sessionTtlMs = options.sessionTtlMs ?? IMPORT_SESSION_TTL_MS
  const sessions = new Map<string, ImportSession>()
  let stagingCleanupDone = false

  const ensureDirs = async (): Promise<void> => {
    await fsp.mkdir(importsDir, { recursive: true })
    await fsp.mkdir(stagingDir, { recursive: true })
    if (stagingCleanupDone) return
    stagingCleanupDone = true
    const names = await fsp.readdir(stagingDir).catch(() => [] as string[])
    const now = Date.now()
    await Promise.all(
      names
        .filter(name => name.endsWith('.part'))
        .map(async name => {
          const stagedPath = path.join(stagingDir, name)
          const stat = await fsp.stat(stagedPath).catch(() => null)
          if (stat && now - stat.mtimeMs > sessionTtlMs) {
            await fsp.unlink(stagedPath).catch(() => {})
          }
        }),
    )
  }

  const requireSession = (importId: string): ImportSession => {
    const session = sessions.get(importId)
    if (!session) {
      throw new FolioError(
        'import_session_missing',
        '导入会话不存在或已过期，请重新拖入图片',
        404,
      )
    }
    return session
  }

  const runExclusive = <T>(session: ImportSession, task: () => Promise<T>): Promise<T> => {
    const run = session.queue.then(task, task)
    session.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  const closeSession = async (session: ImportSession): Promise<void> => {
    session.closed = true
    sessions.delete(session.importId)
    await runExclusive(session, async () => undefined).catch(() => {})
    await session.handle.close().catch(() => {})
  }

  const abort = async (importId: string): Promise<void> => {
    const session = sessions.get(importId)
    if (!session) return
    await closeSession(session)
    await fsp.unlink(session.stagingPath).catch(() => {})
  }

  const purgeExpiredSessions = (): void => {
    const now = Date.now()
    for (const session of Array.from(sessions.values())) {
      if (now - session.lastUsedAt > sessionTtlMs) {
        void abort(session.importId).catch(() => {})
      }
    }
  }

  return {
    importsDir,

    async begin(input: ImportBeginInput): Promise<ImportBeginResult> {
      purgeExpiredSessions()
      await ensureDirs()

      const fileName = resolveImportFileName(input.fileName, input.mime)
      if (!fileName) {
        throw new FolioError(
          'unsupported_file_type',
          '仅支持导入常见图片格式（PNG / JPG / WebP / GIF / SVG 等）',
          400,
        )
      }
      if (typeof input.size === 'number' && input.size > maxBytes) {
        throw new FolioError(
          'file_too_large',
          `图片大小超过 ${Math.round(maxBytes / (1024 * 1024))} MB 导入上限`,
          413,
        )
      }

      const importId = randomUUID()
      const stagingPath = path.join(stagingDir, `${importId}.part`)
      let handle: fsp.FileHandle
      try {
        handle = await fsp.open(stagingPath, 'wx')
      } catch (err) {
        throw new FolioError(
          'import_failed',
          `无法创建导入临时文件: ${describeError(err)}`,
          500,
        )
      }

      sessions.set(importId, {
        importId,
        stagingPath,
        fileName,
        maxBytes,
        handle,
        receivedBytes: 0,
        lastUsedAt: Date.now(),
        queue: Promise.resolve(),
        closed: false,
      })
      return { importId, chunkBytes, maxBytes }
    },

    async append(
      importId: string,
      dataBase64: string,
    ): Promise<{ readonly receivedBytes: number }> {
      const session = requireSession(importId)
      session.lastUsedAt = Date.now()

      const encoded = typeof dataBase64 === 'string' ? dataBase64.trim() : ''
      if (!encoded) return { receivedBytes: session.receivedBytes }
      const maxEncodedLength = Math.ceil((chunkBytes * 4) / 3) + 16
      if (encoded.length > maxEncodedLength) {
        throw new FolioError('chunk_too_large', '单次导入分片超出大小限制', 413)
      }
      const bytes = Buffer.from(encoded, 'base64')
      if (bytes.length === 0) return { receivedBytes: session.receivedBytes }
      if (bytes.length > chunkBytes) {
        throw new FolioError('chunk_too_large', '单次导入分片超出大小限制', 413)
      }

      return runExclusive(session, async () => {
        if (session.closed) {
          throw new FolioError('import_session_closed', '导入会话已结束', 409)
        }
        if (session.receivedBytes + bytes.length > session.maxBytes) {
          throw new FolioError(
            'file_too_large',
            `图片大小超过 ${Math.round(session.maxBytes / (1024 * 1024))} MB 导入上限`,
            413,
          )
        }
        await session.handle.write(bytes, 0, bytes.length, session.receivedBytes)
        session.receivedBytes += bytes.length
        return { receivedBytes: session.receivedBytes }
      })
    },

    async finish(importId: string): Promise<LinkedImageInspectResult> {
      const session = requireSession(importId)
      await closeSession(session)

      try {
        const stat = await fsp.stat(session.stagingPath)
        if (!stat.isFile() || stat.size === 0) {
          throw new FolioError('empty_file', '导入的图片内容为空', 400)
        }

        const destination = await allocateDestination(importsDir, session.fileName)
        await fsp.rename(session.stagingPath, destination)

        const inspected = await inspectLinkedImage(destination)
        if (!inspected.exists || !inspected.isImage) {
          await fsp.unlink(destination).catch(() => {})
          throw new FolioError('unsupported_file_type', '导入文件不是受支持的图片格式', 400)
        }
        return inspected
      } catch (err) {
        await fsp.unlink(session.stagingPath).catch(() => {})
        throw err
      }
    },

    abort,

    dispose(): void {
      for (const session of Array.from(sessions.values())) {
        session.closed = true
        void session.handle.close().catch(() => {})
        void fsp.unlink(session.stagingPath).catch(() => {})
      }
      sessions.clear()
    },
  }
}
