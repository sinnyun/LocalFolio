import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { FolioNativeService, PluginStorageNamespace } from '@folio/base-contract'
import { META_DIR_NAME, computeProjectId, isPathInside } from './classify.js'
import { ProjectManifestSchema, type ProjectManifest } from './types.js'

const READ_ONLY_CODES = new Set(['EACCES', 'EPERM', 'EROFS'])

function isReadOnlyError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code
  return Boolean(code && READ_ONLY_CODES.has(code))
}

async function writeAtomicFile(targetPath: string, data: string | Buffer): Promise<void> {
  await fsp.mkdir(path.dirname(targetPath), { recursive: true })
  const tmpPath = `${targetPath}.${crypto.randomUUID().slice(0, 8)}.tmp`
  await fsp.writeFile(tmpPath, data)
  await fsp.rename(tmpPath, targetPath)
}

function resolveSubPath(rootDir: string, relPosixPath: string): string | null {
  const segments = relPosixPath
    .split('/')
    .map(s => s.trim())
    .filter(Boolean)
  if (segments.length === 0) return null
  const targetPath = path.join(rootDir, ...segments)
  if (!isPathInside(rootDir, targetPath)) return null
  return targetPath
}

export interface ProjectMetaStore {
  getInPlaceMetaDir(projectPath: string): string
  getFallbackMetaDir(projectId: string): string
  ensureMetaDirHidden(projectPath: string, hidden: boolean): Promise<boolean>
  readManifest(projectPath: string, projectId?: string): Promise<ProjectManifest | null>
  writeManifest(
    projectPath: string,
    manifest: ProjectManifest,
    options?: { readonly hideMetaDir?: boolean },
  ): Promise<{ readonly metaWritable: boolean; readonly manifestPath: string }>
  findCoverFile(
    projectPath: string,
    projectId: string,
    fileName: string,
  ): Promise<{ readonly buffer: Buffer; readonly fullPath: string } | null>
  writeCoverFile(
    projectPath: string,
    projectId: string,
    fileName: string,
    buffer: Buffer,
    previousFileName?: string | null,
    options?: { readonly hideMetaDir?: boolean },
  ): Promise<{ readonly metaWritable: boolean; readonly fullPath: string }>
  findThumbFile(
    projectPath: string,
    projectId: string,
    relPosixPath: string,
  ): Promise<{ readonly buffer: Buffer; readonly fullPath: string } | null>
  writeThumbFile(
    projectPath: string,
    projectId: string,
    relPosixPath: string,
    buffer: Buffer,
    options?: { readonly hideMetaDir?: boolean },
  ): Promise<{ readonly metaWritable: boolean; readonly fullPath: string }>
  pruneOrphanThumbs(
    projectPath: string,
    projectId: string,
    validThumbKeys: ReadonlySet<string>,
  ): Promise<number>
}

export function createProjectMetaStore(
  storage: PluginStorageNamespace,
  native: FolioNativeService,
): ProjectMetaStore {
  const getInPlaceMetaDir = (projectPath: string): string => path.join(projectPath, META_DIR_NAME)
  const getFallbackMetaDir = (projectId: string): string =>
    storage.cachePath('fallback-meta', projectId)

  const ensureInPlaceMetaDir = async (
    projectPath: string,
    hideMetaDir = true,
  ): Promise<string> => {
    const metaDir = getInPlaceMetaDir(projectPath)
    let existed = false
    try {
      await fsp.access(metaDir)
      existed = true
    } catch {
      existed = false
    }
    await fsp.mkdir(metaDir, { recursive: true })
    if (!existed && hideMetaDir) {
      await native.setHiddenAttribute(metaDir, true).catch(() => false)
    }
    return metaDir
  }

  const readJsonIfValid = async (filePath: string): Promise<ProjectManifest | null> => {
    try {
      const raw = await fsp.readFile(filePath, 'utf8')
      const parsed = ProjectManifestSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  const removeOldCoverIfNeeded = async (
    baseDir: string,
    nextFileName: string,
    previousFileName?: string | null,
  ): Promise<void> => {
    if (!previousFileName || previousFileName === nextFileName) return
    const safePrev = path.basename(previousFileName)
    if (!safePrev || safePrev !== previousFileName) return
    await fsp.unlink(path.join(baseDir, safePrev)).catch(() => {})
  }

  return {
    getInPlaceMetaDir,
    getFallbackMetaDir,

    async ensureMetaDirHidden(projectPath: string, hidden: boolean): Promise<boolean> {
      const metaDir = getInPlaceMetaDir(projectPath)
      try {
        await fsp.access(metaDir)
      } catch {
        return false
      }
      return native.setHiddenAttribute(metaDir, hidden).catch(() => false)
    },

    async readManifest(projectPath: string, projectId?: string): Promise<ProjectManifest | null> {
      const inPlacePath = path.join(getInPlaceMetaDir(projectPath), 'manifest.json')
      const inPlace = await readJsonIfValid(inPlacePath)
      if (inPlace) return inPlace
      const pid = projectId ?? computeProjectId(projectPath)
      const fallbackPath = path.join(getFallbackMetaDir(pid), 'manifest.json')
      return readJsonIfValid(fallbackPath)
    },

    async writeManifest(
      projectPath: string,
      manifest: ProjectManifest,
      options = {},
    ): Promise<{ readonly metaWritable: boolean; readonly manifestPath: string }> {
      const json = `${JSON.stringify(manifest, null, 2)}\n`
      try {
        const metaDir = await ensureInPlaceMetaDir(projectPath, options.hideMetaDir ?? true)
        const manifestPath = path.join(metaDir, 'manifest.json')
        await writeAtomicFile(manifestPath, json)
        return { metaWritable: true, manifestPath }
      } catch (err) {
        if (!isReadOnlyError(err)) {
          // Even unexpected permission failures fall back cleanly if possible
        }
        const fallbackPath = path.join(getFallbackMetaDir(manifest.projectId), 'manifest.json')
        await writeAtomicFile(fallbackPath, json)
        return { metaWritable: false, manifestPath: fallbackPath }
      }
    },

    async findCoverFile(
      projectPath: string,
      projectId: string,
      fileName: string,
    ): Promise<{ readonly buffer: Buffer; readonly fullPath: string } | null> {
      const safeName = path.basename(fileName)
      if (!safeName || safeName !== fileName) return null
      const candidates = [
        path.join(getInPlaceMetaDir(projectPath), safeName),
        path.join(getFallbackMetaDir(projectId), safeName),
        path.join(getInPlaceMetaDir(projectPath), 'thumbs', safeName),
        path.join(getFallbackMetaDir(projectId), 'thumbs', safeName),
      ]
      for (const candidate of candidates) {
        try {
          const buf = await fsp.readFile(candidate)
          if (buf.length > 0) return { buffer: buf, fullPath: candidate }
        } catch {
          // miss
        }
      }
      return null
    },

    async writeCoverFile(
      projectPath: string,
      projectId: string,
      fileName: string,
      buffer: Buffer,
      previousFileName?: string | null,
      options = {},
    ): Promise<{ readonly metaWritable: boolean; readonly fullPath: string }> {
      const safeName = path.basename(fileName)
      try {
        const metaDir = await ensureInPlaceMetaDir(projectPath, options.hideMetaDir ?? true)
        const coverPath = path.join(metaDir, safeName)
        await writeAtomicFile(coverPath, buffer)
        await removeOldCoverIfNeeded(metaDir, safeName, previousFileName)
        return { metaWritable: true, fullPath: coverPath }
      } catch {
        const fallbackDir = getFallbackMetaDir(projectId)
        const fallbackCoverPath = path.join(fallbackDir, safeName)
        await writeAtomicFile(fallbackCoverPath, buffer)
        await removeOldCoverIfNeeded(fallbackDir, safeName, previousFileName)
        return { metaWritable: false, fullPath: fallbackCoverPath }
      }
    },

    async findThumbFile(
      projectPath: string,
      projectId: string,
      relPosixPath: string,
    ): Promise<{ readonly buffer: Buffer; readonly fullPath: string } | null> {
      const roots = [
        path.join(getInPlaceMetaDir(projectPath), 'thumbs'),
        path.join(getFallbackMetaDir(projectId), 'thumbs'),
      ]
      for (const rootDir of roots) {
        const target = resolveSubPath(rootDir, relPosixPath)
        if (!target) continue
        try {
          const buf = await fsp.readFile(target)
          if (buf.length > 0) return { buffer: buf, fullPath: target }
        } catch {
          // miss
        }
      }
      return null
    },

    async writeThumbFile(
      projectPath: string,
      projectId: string,
      relPosixPath: string,
      buffer: Buffer,
      options = {},
    ): Promise<{ readonly metaWritable: boolean; readonly fullPath: string }> {
      try {
        const metaDir = await ensureInPlaceMetaDir(projectPath, options.hideMetaDir ?? true)
        const thumbsRoot = path.join(metaDir, 'thumbs')
        const thumbPath = resolveSubPath(thumbsRoot, relPosixPath)
        if (!thumbPath) {
          throw new Error(`Invalid thumbnail relative path: ${relPosixPath}`)
        }
        await writeAtomicFile(thumbPath, buffer)
        return { metaWritable: true, fullPath: thumbPath }
      } catch {
        const fallbackThumbsRoot = path.join(getFallbackMetaDir(projectId), 'thumbs')
        const fallbackThumbPath =
          resolveSubPath(fallbackThumbsRoot, relPosixPath) ??
          path.join(fallbackThumbsRoot, path.basename(relPosixPath))
        await writeAtomicFile(fallbackThumbPath, buffer)
        return { metaWritable: false, fullPath: fallbackThumbPath }
      }
    },

    async pruneOrphanThumbs(
      projectPath: string,
      projectId: string,
      validThumbKeys: ReadonlySet<string>,
    ): Promise<number> {
      let removed = 0
      const validShortKeys = new Set(Array.from(validThumbKeys, k => k.slice(0, 8)))
      const roots = [
        path.join(getInPlaceMetaDir(projectPath), 'thumbs'),
        path.join(getFallbackMetaDir(projectId), 'thumbs'),
      ]

      const walkAndPrune = async (dir: string, isRoot: boolean): Promise<boolean> => {
        let entries: import('node:fs').Dirent[]
        try {
          entries = await fsp.readdir(dir, { withFileTypes: true })
        } catch {
          return true
        }
        let remaining = 0
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            const emptyChild = await walkAndPrune(fullPath, false)
            if (emptyChild) {
              await fsp.rmdir(fullPath).catch(() => {})
            } else {
              remaining += 1
            }
            continue
          }
          if (!entry.isFile()) {
            remaining += 1
            continue
          }

          const readableMatch = /__([a-f0-9]{8})\.(?:jpg|png|webp)$/i.exec(entry.name)
          if (readableMatch) {
            if (!validShortKeys.has(readableMatch[1]!.toLowerCase())) {
              await fsp.unlink(fullPath).catch(() => {})
              removed += 1
            } else {
              remaining += 1
            }
            continue
          }

          const legacyMatch = /^(?:120|360)-([a-f0-9]+)\.(?:jpg|png)$/i.exec(entry.name)
          if (legacyMatch) {
            if (!validThumbKeys.has(legacyMatch[1]!.toLowerCase())) {
              await fsp.unlink(fullPath).catch(() => {})
              removed += 1
            } else {
              remaining += 1
            }
            continue
          }

          remaining += 1
        }
        return !isRoot && remaining === 0
      }

      for (const root of roots) {
        await walkAndPrune(root, true)
      }
      return removed
    },
  }
}
