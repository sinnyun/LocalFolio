import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  FolioError,
  type FolioFsService,
  type FolioRouteHandler,
  type FolioThumbsService,
  type GeneratedThumbMime,
} from '@folio/base-contract'
import {
  buildCoverFileName,
  buildReadableThumbRelPath,
  isAlphaThumbExt,
  isPathInside,
  normalizeProjectPath,
} from './classify.js'
import type { ProjectMetaStore } from './meta-store.js'
import type { ProjectFileEntry, ProjectManifest, ProjectSummary } from './types.js'

export const THUMB_MAX_DIM = 360

export interface RenderedThumb {
  readonly buffer: Buffer
  readonly mime: GeneratedThumbMime
  readonly fileName: string
}

function resolveThumbMime(
  buf: Buffer,
  fsService?: FolioFsService,
): 'image/jpeg' | 'image/png' | 'image/webp' {
  const detected = fsService?.sniffImageMime(buf)
  if (detected === 'image/png' || detected === 'image/webp' || detected === 'image/jpeg') {
    return detected
  }
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png'
  }
  return 'image/jpeg'
}

function mimeToExt(mime: GeneratedThumbMime): 'jpg' | 'png' | 'webp' {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'jpg'
}

export interface ProjectThumbService {
  readCachedThumb(
    projectPath: string,
    projectId: string,
    relPath: string,
    thumbKey: string,
  ): Promise<RenderedThumb | null>
  ensureThumb(
    projectPath: string,
    projectId: string,
    relPath: string,
    thumbKey: string,
    options?: { readonly signal?: AbortSignal; readonly hideMetaDir?: boolean },
  ): Promise<RenderedThumb | null>
  ensureProjectCover(
    projectPath: string,
    projectId: string,
    projectName: string,
    coverEntry: ProjectFileEntry | null,
    previousCoverFileName?: string | null,
    options?: { readonly signal?: AbortSignal; readonly hideMetaDir?: boolean },
  ): Promise<RenderedThumb | null>
  warmGroupThumbs(
    projectPath: string,
    projectId: string,
    files: readonly ProjectFileEntry[],
    limit?: number,
    options?: { readonly hideMetaDir?: boolean },
  ): Promise<number>
  warmAllProjectThumbs(
    projectPath: string,
    projectId: string,
    files: readonly ProjectFileEntry[],
    options?: {
      readonly signal?: AbortSignal
      readonly hideMetaDir?: boolean
      readonly onProgress?: (done: number, total: number, currentRelPath: string) => void
    },
  ): Promise<{ readonly total: number; readonly warmed: number }>
  dispose(): void
}

export function createProjectThumbService(options: {
  readonly metaStore: ProjectMetaStore
  readonly thumbs: FolioThumbsService
  readonly fs?: FolioFsService
}): ProjectThumbService {
  const { metaStore, thumbs, fs: fsService } = options
  const inflight = new Map<string, Promise<RenderedThumb | null>>()

  const readCachedThumb = async (
    projectPath: string,
    projectId: string,
    relPath: string,
    thumbKey: string,
  ): Promise<RenderedThumb | null> => {
    const candidates: Array<{ fileName: string; mime: 'image/jpeg' | 'image/png' | 'image/webp' }> = [
      {
        fileName: buildReadableThumbRelPath(relPath, thumbKey, 'jpg', projectPath),
        mime: 'image/jpeg',
      },
      {
        fileName: buildReadableThumbRelPath(relPath, thumbKey, 'png', projectPath),
        mime: 'image/png',
      },
      {
        fileName: buildReadableThumbRelPath(relPath, thumbKey, 'webp', projectPath),
        mime: 'image/webp',
      },
      { fileName: `360-${thumbKey}.jpg`, mime: 'image/jpeg' },
      { fileName: `360-${thumbKey}.png`, mime: 'image/png' },
      { fileName: `120-${thumbKey}.jpg`, mime: 'image/jpeg' },
      { fileName: `120-${thumbKey}.png`, mime: 'image/png' },
    ]

    for (const candidate of candidates) {
      const hit = await metaStore.findThumbFile(projectPath, projectId, candidate.fileName)
      if (hit) {
        return { buffer: hit.buffer, mime: candidate.mime, fileName: candidate.fileName }
      }
    }
    return null
  }

  const ensureThumb = async (
    projectPath: string,
    projectId: string,
    relPath: string,
    thumbKey: string,
    opts: { readonly signal?: AbortSignal; readonly hideMetaDir?: boolean } = {},
  ): Promise<RenderedThumb | null> => {
    const absPath = normalizeProjectPath(path.join(projectPath, relPath))
    if (!isPathInside(projectPath, absPath)) {
      throw new FolioError('forbidden_path', '非法文件相对路径', 403)
    }

    const cached = await readCachedThumb(projectPath, projectId, relPath, thumbKey)
    if (cached) return cached

    // Graceful no-op when live file is absent on disk (e.g., archived) and cache missed
    let existsOnDisk = false
    try {
      const st = await fsp.stat(absPath)
      existsOnDisk = st.isFile()
    } catch {
      existsOnDisk = false
    }
    if (!existsOnDisk) return null

    const inflightKey = `${projectId}|360|${thumbKey}`
    const existing = inflight.get(inflightKey)
    if (existing) return existing

    const ext = path.extname(relPath).toLowerCase()
    const preferPng = isAlphaThumbExt(ext)
    const pending = thumbs
      .generate({
        filePath: absPath,
        maxDim: THUMB_MAX_DIM,
        preferPng,
        signal: opts.signal,
      })
      .then(async rendered => {
        if (!rendered || rendered.buffer.length === 0) return null
        if (rendered.mime === 'image/svg+xml') {
          return {
            buffer: rendered.buffer,
            mime: rendered.mime,
            fileName: buildReadableThumbRelPath(relPath, thumbKey, 'png', projectPath),
          }
        }
        const outExt = mimeToExt(rendered.mime)
        const fileName = buildReadableThumbRelPath(relPath, thumbKey, outExt, projectPath)
        await metaStore.writeThumbFile(projectPath, projectId, fileName, rendered.buffer, {
          hideMetaDir: opts.hideMetaDir,
        })
        return { buffer: rendered.buffer, mime: rendered.mime, fileName }
      })
      .catch(() => null)
      .finally(() => {
        inflight.delete(inflightKey)
      })

    inflight.set(inflightKey, pending)
    return pending
  }

  const ensureProjectCover = async (
    projectPath: string,
    projectId: string,
    projectName: string,
    coverEntry: ProjectFileEntry | null,
    previousCoverFileName?: string | null,
    opts: { readonly signal?: AbortSignal; readonly hideMetaDir?: boolean } = {},
  ): Promise<RenderedThumb | null> => {
    const coverFileName = buildCoverFileName(projectName)
    if (!coverEntry || !coverEntry.thumbSupported) {
      const existing = await metaStore.findCoverFile(projectPath, projectId, coverFileName)
      if (existing) {
        return {
          buffer: existing.buffer,
          mime: resolveThumbMime(existing.buffer, fsService),
          fileName: coverFileName,
        }
      }
      return null
    }

    const absPath = normalizeProjectPath(path.join(projectPath, coverEntry.relPath))
    if (!isPathInside(projectPath, absPath)) return null

    let buffer: Buffer | null = null
    let mime: GeneratedThumbMime = 'image/jpeg'

    let existsOnDisk = false
    try {
      const st = await fsp.stat(absPath)
      existsOnDisk = st.isFile()
    } catch {
      existsOnDisk = false
    }

    if (existsOnDisk) {
      const rendered = await thumbs
        .generate({
          filePath: absPath,
          maxDim: THUMB_MAX_DIM,
          preferPng: false,
          signal: opts.signal,
        })
        .catch(() => null)
      if (rendered && rendered.buffer.length > 0 && rendered.mime !== 'image/svg+xml') {
        buffer = rendered.buffer
        mime = rendered.mime
      }
    }

    // Zero-decompression reuse when archived
    if (!buffer) {
      const cachedThumb = await readCachedThumb(
        projectPath,
        projectId,
        coverEntry.relPath,
        coverEntry.thumbKey,
      )
      if (cachedThumb && cachedThumb.buffer.length > 0 && cachedThumb.mime !== 'image/svg+xml') {
        buffer = cachedThumb.buffer
        mime = cachedThumb.mime
      }
    }

    if (!buffer && previousCoverFileName) {
      const prevHit = await metaStore.findCoverFile(projectPath, projectId, previousCoverFileName)
      if (prevHit) {
        buffer = prevHit.buffer
        mime = resolveThumbMime(prevHit.buffer, fsService)
      }
    }

    if (!buffer || buffer.length === 0) return null

    await metaStore.writeCoverFile(
      projectPath,
      projectId,
      coverFileName,
      buffer,
      previousCoverFileName,
      { hideMetaDir: opts.hideMetaDir },
    )
    return { buffer, mime, fileName: coverFileName }
  }

  return {
    readCachedThumb,
    ensureThumb,
    ensureProjectCover,
    async warmGroupThumbs(projectPath, projectId, files, limit = 24, opts = {}): Promise<number> {
      const targets = files.filter(f => f.thumbSupported).slice(0, limit)
      let generated = 0
      await Promise.all(
        targets.map(async file => {
          const hit = await readCachedThumb(projectPath, projectId, file.relPath, file.thumbKey)
          if (hit) return
          const res = await ensureThumb(projectPath, projectId, file.relPath, file.thumbKey, opts)
          if (res) generated += 1
        }),
      )
      return generated
    },
    async warmAllProjectThumbs(projectPath, projectId, files, opts = {}) {
      const targets = files.filter(f => f.thumbSupported)
      const total = targets.length
      if (total === 0) return { total: 0, warmed: 0 }
      let done = 0
      let warmed = 0
      await Promise.all(
        targets.map(async file => {
          if (opts.signal?.aborted) return
          const hit = await readCachedThumb(projectPath, projectId, file.relPath, file.thumbKey)
          if (!hit) {
            const res = await ensureThumb(projectPath, projectId, file.relPath, file.thumbKey, {
              signal: opts.signal,
              hideMetaDir: opts.hideMetaDir,
            })
            if (res) warmed += 1
          }
          done += 1
          opts.onProgress?.(done, total, file.relPath)
        }),
      )
      return { total, warmed }
    },
    dispose(): void {
      inflight.clear()
    },
  }
}

export function createProjectThumbRouteHandler(options: {
  readonly fs?: FolioFsService
  readonly resolveProjectSummary: (projectId: string) => Promise<ProjectSummary | null>
  readonly resolveProjectManifest: (
    projectPath: string,
    projectId: string,
  ) => Promise<ProjectManifest | null>
  readonly thumbService: ProjectThumbService
  readonly metaStore: ProjectMetaStore
}): FolioRouteHandler {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')?.trim()
    const kind = url.searchParams.get('kind')?.trim()
    if (!projectId) {
      throw new FolioError('invalid_params', '缺少 projectId 参数', 400)
    }

    const summary = await options.resolveProjectSummary(projectId)
    if (!summary) {
      throw new FolioError('project_not_found', `项目不存在: ${projectId}`, 404)
    }

    if (kind === 'cover') {
      const version = url.searchParams.get('v')?.trim() || summary.coverThumbKey || 'cover'
      const etag = `"pc-${projectId}-${version}"`
      if (request.headers.get('if-none-match') === etag) {
        return new Response(null, {
          status: 304,
          headers: {
            etag,
            'cache-control': 'public, max-age=31536000, immutable',
          },
        })
      }

      const coverFileName = buildCoverFileName(summary.name)
      const hit = await options.metaStore.findCoverFile(summary.path, projectId, coverFileName)
      let buffer = hit?.buffer ?? null
      let mime: GeneratedThumbMime = buffer ? resolveThumbMime(buffer, options.fs) : 'image/jpeg'

      if (!buffer) {
        const manifest = await options.resolveProjectManifest(summary.path, projectId)
        const coverEntry =
          manifest?.coverRelPath
            ? manifest.groups
                .flatMap(g => g.files)
                .find(f => f.relPath === manifest.coverRelPath) ?? null
            : null
        const ensured = await options.thumbService.ensureProjectCover(
          summary.path,
          projectId,
          summary.name,
          coverEntry,
          manifest?.coverThumbFile,
          { signal: request.signal },
        )
        if (ensured) {
          buffer = ensured.buffer
          mime = ensured.mime
        }
      }

      if (!buffer || buffer.length === 0) {
        return new Response(null, {
          status: 204,
          headers: { 'cache-control': 'private, max-age=60' },
        })
      }

      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'content-type': mime,
          'content-length': String(buffer.length),
          etag,
          'cache-control': 'public, max-age=31536000, immutable',
          'x-content-type-options': 'nosniff',
        },
      })
    }

    const relPath = url.searchParams.get('relPath')?.trim()
    const thumbKey = url.searchParams.get('tk')?.trim()
    if (!relPath || !thumbKey) {
      throw new FolioError('invalid_params', '缺少 relPath / tk 参数', 400)
    }

    const absPath = normalizeProjectPath(path.join(summary.path, relPath))
    if (!isPathInside(summary.path, absPath)) {
      throw new FolioError('forbidden_path', '拒绝越权路径访问', 403)
    }

    const etag = `"pt-${projectId}-360-${thumbKey}"`
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          etag,
          'cache-control': 'public, max-age=31536000, immutable',
        },
      })
    }

    const result = await options.thumbService.ensureThumb(
      summary.path,
      projectId,
      relPath,
      thumbKey,
      { signal: request.signal },
    )

    if (!result || result.buffer.length === 0) {
      return new Response(null, {
        status: 204,
        headers: { 'cache-control': 'private, max-age=60' },
      })
    }

    const headers: Record<string, string> = {
      'content-type': result.mime,
      'content-length': String(result.buffer.length),
      etag,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    }
    if (result.mime === 'image/svg+xml') {
      headers['content-security-policy'] = 'sandbox'
    }
    return new Response(new Uint8Array(result.buffer), { status: 200, headers })
  }
}

export function createProjectMediaRouteHandler(options: {
  readonly fs?: FolioFsService
  readonly resolveProjectPath: (projectId: string) => Promise<string | null>
  readonly resolveMediaFilePath?: (
    projectId: string,
    relPath: string,
    signal?: AbortSignal,
  ) => Promise<string | null>
}): FolioRouteHandler {
  return async (request: Request): Promise<Response> => {
    if (!options.fs) {
      throw new FolioError('fs_unavailable', '基础文件系统服务未就绪', 503)
    }
    const url = new URL(request.url)
    const projectId = url.searchParams.get('projectId')?.trim()
    const relPath = url.searchParams.get('relPath')?.trim()
    if (!projectId || !relPath) {
      throw new FolioError('invalid_params', '缺少 projectId 或 relPath 参数', 400)
    }

    const projectPath = await options.resolveProjectPath(projectId)
    if (!projectPath) {
      throw new FolioError('project_not_found', `项目不存在: ${projectId}`, 404)
    }

    const absPath = normalizeProjectPath(path.join(projectPath, relPath))
    if (!isPathInside(projectPath, absPath)) {
      throw new FolioError('forbidden_path', '拒绝越权路径访问', 403)
    }

    let resolvedPath = absPath
    let st: fs.Stats | null = null
    try {
      st = await fsp.stat(absPath)
    } catch {
      st = null
    }

    if (!st && options.resolveMediaFilePath) {
      const resolved = await options.resolveMediaFilePath(projectId, relPath, request.signal)
      if (resolved) {
        try {
          st = await fsp.stat(resolved)
          resolvedPath = resolved
        } catch {
          st = null
        }
      }
    }

    if (!st) {
      throw new FolioError('not_found', `文件不存在: ${relPath}`, 404)
    }

    return options.fs.serveMediaFile(request, resolvedPath, { etagPrefix: 'pm' })
  }
}
