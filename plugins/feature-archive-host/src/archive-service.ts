import { execFile, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  FolioError,
  getProjectArchiveStem,
  isProjectArchiveArtifactName,
  isProjectArchiveVolumeFileName,
  observeTask,
  type FolioNativeService,
  type FolioTasksService,
  type ProjectArchiveCompressionMethod,
  type ProjectArchiveLayout,
  type TemporaryProjectThumbSource,
} from '@folio/base-contract'
import type { ArchiveToolManager } from './archive-tool.js'
import type { ArchiveSourceDisposal } from './types.js'

const META_DIR_NAME = '.folio-meta'

export interface MountedArchiveHandle {
  readonly mountPoint: string | null
  readonly pid: number | null
  readonly onExit: Promise<void>
  unmount(): Promise<void>
}

export interface ArchiveArtifactFile {
  readonly name: string
  readonly absPath: string
  readonly size: number
}

export interface ArchiveArtifactSet {
  readonly allFiles: readonly ArchiveArtifactFile[]
  readonly volumeFiles: readonly ArchiveArtifactFile[]
  readonly transientFiles: readonly ArchiveArtifactFile[]
  readonly totalBytes: number
  readonly primaryRevealPath: string | null
}

export interface ArchiveCliRunner {
  add(options: {
    readonly binaryPath: string
    readonly projectPath: string
    readonly archiveFileName: string
    readonly entries: readonly string[]
    readonly layout?: ProjectArchiveLayout
    readonly chunkSizeGb?: number
    readonly compressionMethod?: ProjectArchiveCompressionMethod
    readonly signal?: AbortSignal
    readonly onProgress?: (percent: number | null, detail: string) => void
  }): Promise<void>
  test(options: {
    readonly binaryPath: string
    readonly projectPath: string
    readonly archiveFileName: string
    readonly signal?: AbortSignal
    readonly onProgress?: (percent: number | null, detail: string) => void
  }): Promise<void>
  extractFile(options: {
    readonly binaryPath: string
    readonly archiveAbsPath: string
    readonly relPath: string
    readonly destFilePath: string
    readonly signal?: AbortSignal
  }): Promise<void>
  extractAll(options: {
    readonly binaryPath: string
    readonly projectPath: string
    readonly archiveFileName: string
    readonly sequential?: boolean
    readonly recover?: boolean
    readonly signal?: AbortSignal
    readonly onProgress?: (percent: number | null, detail: string) => void
  }): Promise<void>
  mount?(options: {
    readonly binaryPath: string
    readonly projectPath: string
    readonly archiveAbsPath: string
    readonly allVersions?: boolean
    readonly driveLetter?: string
  }): Promise<MountedArchiveHandle>
}

export function sanitizeArchiveSegment(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  return cleaned || 'project'
}

export function buildDefaultArchiveFileName(projectName: string): string {
  return `${sanitizeArchiveSegment(projectName)}.zpaq`
}

export function formatChunkSizeArg(chunkSizeGb: number): string {
  const clamped = Number.isFinite(chunkSizeGb) ? Math.min(1024, Math.max(0.25, chunkSizeGb)) : 8
  if (Number.isInteger(clamped)) {
    return `${clamped}GB`
  }
  const mb = Math.max(256, Math.round(clamped * 1024))
  return `${mb}MB`
}

export function compressionMethodToArg(
  method?: ProjectArchiveCompressionMethod,
): string | null {
  if (method === 'm9') return '-m9'
  if (method === 'm7') return '-m7'
  return null
}

function normalizePath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.includes('\0')) return ''
  const resolved = path.resolve(trimmed)
  if (/^[a-z]:\\/.test(resolved)) {
    return `${resolved[0]!.toUpperCase()}${resolved.slice(1)}`
  }
  return resolved
}

export async function listArchiveArtifacts(
  projectPath: string,
  archiveFileName: string,
): Promise<ArchiveArtifactSet> {
  const entries = await fsp.readdir(projectPath, { withFileTypes: true }).catch(() => [])
  const allFiles: ArchiveArtifactFile[] = []
  const volumeFiles: ArchiveArtifactFile[] = []
  const transientFiles: ArchiveArtifactFile[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!isProjectArchiveArtifactName(entry.name, archiveFileName)) continue
    const absPath = normalizePath(path.join(projectPath, entry.name))
    const st = await fsp.stat(absPath).catch(() => null)
    if (!st?.isFile()) continue
    const item: ArchiveArtifactFile = { name: entry.name, absPath, size: st.size }
    const lower = entry.name.toLowerCase()
    if (lower.endsWith('.tmp') || lower.endsWith('.spaz')) {
      transientFiles.push(item)
      continue
    }
    allFiles.push(item)
    if (isProjectArchiveVolumeFileName(entry.name, archiveFileName)) {
      volumeFiles.push(item)
    }
  }

  const byName = (a: ArchiveArtifactFile, b: ArchiveArtifactFile) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  allFiles.sort(byName)
  volumeFiles.sort(byName)
  transientFiles.sort(byName)

  const totalBytes = allFiles.reduce((acc, f) => acc + f.size, 0)
  const primaryRevealPath = volumeFiles[0]?.absPath ?? allFiles[0]?.absPath ?? null
  return {
    allFiles,
    volumeFiles,
    transientFiles,
    totalBytes,
    primaryRevealPath,
  }
}

function isPathInside(rootDir: string, candidatePath: string): boolean {
  const normRoot = normalizePath(rootDir)
  const normCand = normalizePath(candidatePath)
  if (!normRoot || !normCand) return false
  const rel =
    process.platform === 'win32'
      ? path.relative(normRoot.toLowerCase(), normCand.toLowerCase())
      : path.relative(normRoot, normCand)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function runZpaqProcess(options: {
  readonly binaryPath: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly signal?: AbortSignal
  readonly onOutput?: (line: string, percent: number | null) => void
  readonly errorCode: string
  readonly errorPrefix: string
}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new FolioError('aborted', '归档任务已取消', 499))
      return
    }

    const child = spawn(options.binaryPath, [...options.args], {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let tailLines: string[] = []
    let settled = false

    const handleText = (chunk: string): void => {
      const lines = chunk.split(/\r?\n/)
      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue
        tailLines.push(line)
        if (tailLines.length > 20) tailLines = tailLines.slice(-20)
        const pctMatch = /(\d{1,3}(?:\.\d+)?)%/.exec(line)
        const percent = pctMatch ? Math.min(100, Math.max(0, Number(pctMatch[1]))) : null
        options.onOutput?.(line, percent)
      }
    }

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', handleText)
    child.stderr.on('data', handleText)

    const onAbort = (): void => {
      if (settled) return
      settled = true
      try {
        child.kill('SIGTERM')
      } catch {
        // ignore
      }
      reject(new FolioError('aborted', '归档任务已取消', 499))
    }

    options.signal?.addEventListener('abort', onAbort, { once: true })

    child.on('error', err => {
      options.signal?.removeEventListener('abort', onAbort)
      if (settled) return
      settled = true
      reject(new FolioError(options.errorCode, `${options.errorPrefix}: ${err.message}`, 500))
    })

    child.on('close', code => {
      options.signal?.removeEventListener('abort', onAbort)
      if (settled) return
      settled = true
      if (code === 0) {
        resolve()
        return
      }
      const tail = tailLines.slice(-4).join(' | ')
      reject(
        new FolioError(
          options.errorCode,
          `${options.errorPrefix} (exit=${code})${tail ? `: ${tail}` : ''}`,
          500,
        ),
      )
    })
  })
}

function escapeRegExpLiteral(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Resolves the archive filename to pass to `zpaqfranz` read commands (`t`, `x`, `xx`, `mount`).
 * For `backup -chunk` archives (`<stem>_00000001.zpaq`, …), returns `<stem>_????????.zpaq`
 * (matching the actual digit width) so operations succeed reliably even if `_00000000_backup.index`
 * is absent or when extracting from another working directory.
 * For legacy single-file archives (`<stem>.zpaq`), returns `archiveFileName` unchanged.
 */
export async function resolveArchiveReadFileName(
  projectPath: string,
  archiveFileName: string,
): Promise<string> {
  const stem = getProjectArchiveStem(archiveFileName)
  if (!stem) return archiveFileName
  const entries = await fsp.readdir(projectPath, { withFileTypes: true }).catch(() => [])
  const numberedRe = new RegExp(`^${escapeRegExpLiteral(stem)}_(\\d+)\\.zpaq$`, 'i')
  let digitWidth = 0
  let hasSingleFile = false
  const lowerArchive = archiveFileName.trim().toLowerCase()

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (entry.name.toLowerCase() === lowerArchive) {
      hasSingleFile = true
    }
    const m = numberedRe.exec(entry.name)
    if (m?.[1]) {
      digitWidth = Math.max(digitWidth, m[1].length)
    }
  }

  if (digitWidth > 0) {
    return `${stem}_${'?'.repeat(digitWidth)}.zpaq`
  }
  return hasSingleFile ? archiveFileName : archiveFileName
}

export async function resolveArchiveReadPath(archiveAbsPath: string): Promise<string> {
  const dir = path.dirname(archiveAbsPath)
  const base = path.basename(archiveAbsPath)
  const resolvedName = await resolveArchiveReadFileName(dir, base)
  return path.join(dir, resolvedName)
}

export function createZpaqfranzRunner(): ArchiveCliRunner {
  return {
    async add({
      binaryPath,
      projectPath,
      archiveFileName,
      entries,
      layout = 'backup-chunk',
      chunkSizeGb = 8,
      compressionMethod = 'default',
      signal,
      onProgress,
    }) {
      const stem = getProjectArchiveStem(archiveFileName)
      const methodArg = compressionMethodToArg(compressionMethod)
      const args: string[] =
        layout === 'backup-chunk'
          ? [
              'backup',
              archiveFileName,
              ...entries,
              '-chunk',
              formatChunkSizeArg(chunkSizeGb),
              ...(methodArg ? [methodArg] : []),
              '-not',
              META_DIR_NAME,
              '-not',
              `${META_DIR_NAME}/*`,
              '-not',
              archiveFileName,
              '-not',
              `${stem}_*.zpaq`,
              '-not',
              `${stem}_backup.txt`,
              '-not',
              `${stem}_backup.index`,
              '-not',
              `${stem}_*_backup.txt`,
              '-not',
              `${stem}_*_backup.index`,
              '-not',
              '*.tmp',
              '-not',
              '*.spaz',
              '-not',
              'Thumbs.db',
              '-not',
              'desktop.ini',
            ]
          : [
              'a',
              archiveFileName,
              ...entries,
              ...(methodArg ? [methodArg] : []),
              '-not',
              META_DIR_NAME,
              '-not',
              `${META_DIR_NAME}/*`,
              '-not',
              archiveFileName,
              '-not',
              '*.tmp',
              '-not',
              '*.spaz',
              '-not',
              'Thumbs.db',
              '-not',
              'desktop.ini',
            ]

      await runZpaqProcess({
        binaryPath,
        args,
        cwd: projectPath,
        signal,
        onOutput: (line, pct) => onProgress?.(pct, line),
        errorCode: 'archive_pack_failed',
        errorPrefix: 'zpaqfranz 打包失败',
      })
    },

    async test({ binaryPath, projectPath, archiveFileName, signal, onProgress }) {
      const readTarget = await resolveArchiveReadFileName(projectPath, archiveFileName)
      await runZpaqProcess({
        binaryPath,
        args: ['t', readTarget],
        cwd: projectPath,
        signal,
        onOutput: (line, pct) => onProgress?.(pct, line),
        errorCode: 'archive_verify_failed',
        errorPrefix: 'zpaqfranz 完整性校验失败',
      })
    },

    async extractFile({ binaryPath, archiveAbsPath, relPath, destFilePath, signal }) {
      const posixRel = relPath.split(path.sep).join('/')
      const destDir = path.dirname(destFilePath)
      const readTargetAbs = await resolveArchiveReadPath(archiveAbsPath)
      await fsp.mkdir(destDir, { recursive: true })

      try {
        await runZpaqProcess({
          binaryPath,
          args: ['x', readTargetAbs, posixRel, '-to', destFilePath, '-force'],
          cwd: destDir,
          signal,
          errorCode: 'archive_extract_failed',
          errorPrefix: 'zpaqfranz 单文件提取失败',
        })
        const st = await fsp.stat(destFilePath).catch(() => null)
        if (st?.isFile()) return
      } catch (err) {
        if (signal?.aborted) throw err
      }

      const stageDir = path.join(destDir, `.stage-${crypto.randomUUID().slice(0, 8)}`)
      await fsp.mkdir(stageDir, { recursive: true })
      try {
        await runZpaqProcess({
          binaryPath,
          args: ['x', readTargetAbs, '-only', posixRel, '-force'],
          cwd: stageDir,
          signal,
          errorCode: 'archive_extract_failed',
          errorPrefix: 'zpaqfranz 单文件提取失败',
        })
        const extractedInStage = path.join(stageDir, ...posixRel.split('/'))
        const st = await fsp.stat(extractedInStage).catch(() => null)
        if (!st?.isFile()) {
          throw new FolioError(
            'archive_extract_missing',
            `归档包内未找到目标文件: ${posixRel}`,
            404,
          )
        }
        await fsp.rename(extractedInStage, destFilePath)
      } finally {
        await fsp.rm(stageDir, { recursive: true, force: true }).catch(() => {})
      }
    },

    async extractAll({
      binaryPath,
      projectPath,
      archiveFileName,
      sequential = true,
      recover = false,
      signal,
      onProgress,
    }) {
      const readTarget = await resolveArchiveReadFileName(projectPath, archiveFileName)
      const args = recover
        ? ['x', readTarget, '-recover', '-force']
        : [sequential ? 'xx' : 'x', readTarget, '-force']

      await runZpaqProcess({
        binaryPath,
        args,
        cwd: projectPath,
        signal,
        onOutput: (line, pct) => onProgress?.(pct, line),
        errorCode: recover ? 'archive_recover_failed' : 'archive_restore_failed',
        errorPrefix: recover ? 'zpaqfranz 坏包抢救失败' : 'zpaqfranz 解包还原失败',
      })
    },

    async mount({ binaryPath, projectPath, archiveAbsPath, allVersions = false, driveLetter }) {
      const normalizedDrive = driveLetter?.trim()
      const readTargetAbs = await resolveArchiveReadPath(archiveAbsPath)
      const args = [
        'mount',
        readTargetAbs,
        ...(normalizedDrive ? [normalizedDrive] : []),
        ...(allVersions ? ['-all'] : []),
      ]

      return await new Promise<MountedArchiveHandle>((resolve, reject) => {
        const child = spawn(binaryPath, args, {
          cwd: projectPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })

        let settled = false
        let exited = false
        let detectedMountPoint: string | null = normalizedDrive || null
        let tailLines: string[] = []
        let resolveExit: () => void = () => {}
        const onExit = new Promise<void>(res => {
          resolveExit = res
        })

        const buildHandle = (): MountedArchiveHandle => ({
          mountPoint: detectedMountPoint,
          pid: child.pid ?? null,
          onExit,
          async unmount() {
            if (exited) return
            try {
              child.kill('SIGINT')
            } catch {
              // ignore
            }
            const timer = setTimeout(() => {
              if (exited) return
              try {
                child.kill('SIGTERM')
              } catch {
                // ignore
              }
              if (process.platform === 'win32' && child.pid) {
                execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {})
              }
            }, 1500)
            await Promise.race([
              onExit,
              new Promise<void>(res => setTimeout(res, 3500)),
            ])
            clearTimeout(timer)
          },
        })

        const finishSuccess = (): void => {
          if (settled) return
          settled = true
          clearTimeout(startupTimer)
          resolve(buildHandle())
        }

        const startupTimer = setTimeout(() => {
          finishSuccess()
        }, 1800)

        const handleText = (chunk: string): void => {
          const lines = chunk.split(/\r?\n/)
          for (const raw of lines) {
            const line = raw.trim()
            if (!line) continue
            tailLines.push(line)
            if (tailLines.length > 20) tailLines = tailLines.slice(-20)
            const mountMatch =
              /(?:mount(?:ed)?(?:\s+(?:on|at|to))?\s+|drive\s+)([D-Z]:\\?|\/[^\s]+)/i.exec(line) ??
              /\b([D-Z]:\\)\b/.exec(line)
            if (mountMatch?.[1]) {
              detectedMountPoint = mountMatch[1].toUpperCase().endsWith(':')
                ? `${mountMatch[1].toUpperCase()}\\`
                : mountMatch[1]
              finishSuccess()
            }
          }
        }

        child.stdout.setEncoding('utf8')
        child.stderr.setEncoding('utf8')
        child.stdout.on('data', handleText)
        child.stderr.on('data', handleText)

        child.on('error', err => {
          exited = true
          clearTimeout(startupTimer)
          resolveExit()
          if (settled) return
          settled = true
          reject(
            new FolioError(
              'archive_mount_failed',
              `启动虚拟盘挂载失败: ${err.message}`,
              500,
            ),
          )
        })

        child.on('close', code => {
          exited = true
          clearTimeout(startupTimer)
          resolveExit()
          if (settled) return
          settled = true
          const tail = tailLines.slice(-4).join(' | ')
          const hint =
            /winfsp|fuse|unknown command|not supported/i.test(tail)
              ? '（请确认已更新为 zpaqfranz-full.exe 并已安装 WinFsp 驱动）'
              : ''
          reject(
            new FolioError(
              'archive_mount_failed',
              `虚拟盘挂载失败 (exit=${code})${tail ? `: ${tail}` : ''}${hint}`,
              500,
            ),
          )
        })
      })
    },
  }
}

export interface ProjectArchiveService {
  extractTemporaryThumbSource(options: {
    readonly projectPath: string
    readonly archiveFileName: string
    readonly relPath: string
    readonly signal?: AbortSignal
  }): Promise<TemporaryProjectThumbSource>
  readonly runner: ArchiveCliRunner
  listArchiveArtifacts(projectPath: string, archiveFileName: string): Promise<ArchiveArtifactSet>
  collectTopLevelPackEntries(projectPath: string, archiveFileName: string): Promise<string[]>
  disposeSourceEntries(
    projectPath: string,
    entries: readonly string[],
    mode: ArchiveSourceDisposal,
  ): Promise<number>
  removeFilesAndPruneDirs(
    projectPath: string,
    relPaths: readonly string[],
    mode: ArchiveSourceDisposal,
  ): Promise<number>
  ensureExtractedFile(options: {
    readonly projectPath: string
    readonly projectId: string
    readonly projectName?: string
    readonly archiveFileName: string
    readonly relPath: string
    readonly thumbKey: string
    readonly signal?: AbortSignal
  }): Promise<string>
  extractFileInPlace(options: {
    readonly projectPath: string
    readonly archiveFileName: string
    readonly relPath: string
    readonly signal?: AbortSignal
  }): Promise<{
    readonly extractedPath: string
    readonly alreadyOnDisk: boolean
    readonly fingerprint: string
  }>
  extractFileToDestination(options: {
    readonly projectPath: string
    readonly archiveFileName: string
    readonly relPath: string
    readonly destDir: string
    readonly signal?: AbortSignal
  }): Promise<string>
  exportArchiveToDestination(options: {
    readonly projectPath: string
    readonly archiveFileName: string
    readonly destDir: string
  }): Promise<{
    readonly exportedPath: string
    readonly exportedFiles: readonly string[]
  }>
}

export function createProjectArchiveService(options: {
  readonly toolManager: ArchiveToolManager
  readonly native: FolioNativeService
  readonly runner?: ArchiveCliRunner
  readonly tasks?: FolioTasksService
}): ProjectArchiveService {
  const { toolManager, native } = options
  const runner = options.runner ?? createZpaqfranzRunner()
  const inflightExtracts = new Map<string, Promise<string>>()

  const ensureArchivePresent = async (
    projectPath: string,
    archiveFileName: string,
  ): Promise<ArchiveArtifactSet> => {
    const artifacts = await listArchiveArtifacts(projectPath, archiveFileName)
    if (artifacts.volumeFiles.length === 0) {
      throw new FolioError('archive_missing', `归档包不存在: ${archiveFileName}`, 404)
    }
    return artifacts
  }

  const extractTemporaryThumbSource: ProjectArchiveService['extractTemporaryThumbSource'] = async opts => {
    opts.signal?.throwIfAborted()
    if (!isPathInside(opts.projectPath, path.resolve(opts.projectPath, opts.relPath))) {
      throw new FolioError('forbidden_path', '非法归档文件路径', 403)
    }
    const binaryPath = await toolManager.requireActiveBinary()
    await ensureArchivePresent(opts.projectPath, opts.archiveFileName)
    const root = path.join(path.dirname(toolManager.extractCacheDir), 'thumb-sources')
    await fsp.mkdir(root, { recursive: true })
    const resolvedRoot = await fsp.realpath(root)
    const dir = await fsp.mkdtemp(path.join(resolvedRoot, 'item-'))
    const release = async (): Promise<void> => {
      const resolvedDir = await fsp.realpath(dir).catch(err => {
        if (err.code === 'ENOENT') return null
        throw err
      })
      if (resolvedDir === dir && path.dirname(resolvedDir) === resolvedRoot) {
        await fsp.rm(resolvedDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
      }
    }
    const localPath = path.join(dir, path.basename(opts.relPath))
    try {
      await runner.extractFile({
        binaryPath,
        archiveAbsPath: normalizePath(path.join(opts.projectPath, opts.archiveFileName)),
        relPath: opts.relPath,
        destFilePath: localPath,
        signal: opts.signal,
      })
      return { localPath, release }
    } catch (err) {
      await release()
      throw err
    }
  }

  const collectTopLevelPackEntries = async (
    projectPath: string,
    archiveFileName: string,
  ): Promise<string[]> => {
    const dirEntries = await fsp.readdir(projectPath, { withFileTypes: true })
    const entries: string[] = []
    for (const entry of dirEntries) {
      if (entry.isSymbolicLink()) continue
      const lower = entry.name.toLowerCase()
      if (lower === META_DIR_NAME.toLowerCase()) continue
      if (isProjectArchiveArtifactName(entry.name, archiveFileName)) continue
      if (
        lower === 'thumbs.db' ||
        lower === 'desktop.ini' ||
        lower === '.ds_store' ||
        lower.startsWith('~$') ||
        lower.endsWith('.tmp') ||
        lower.endsWith('.spaz')
      ) {
        continue
      }
      entries.push(entry.name)
    }
    return entries
  }

  const disposeSourceEntries = async (
    projectPath: string,
    entries: readonly string[],
    mode: ArchiveSourceDisposal,
  ): Promise<number> => {
    if (mode === 'keep' || entries.length === 0) return 0
    const absPaths = entries
      .map(name => normalizePath(path.join(projectPath, name)))
      .filter(abs => isPathInside(projectPath, abs))
    if (absPaths.length === 0) return 0

    if (mode === 'recycle' && native.recyclePaths) {
      const res = await native.recyclePaths(absPaths)
      return res.recycled
    }

    let removed = 0
    for (const abs of absPaths) {
      await fsp.rm(abs, { recursive: true, force: true })
      removed += 1
    }
    return removed
  }

  const ensureExtractedFile: ProjectArchiveService['ensureExtractedFile'] = async opts => {
    const safeName = path.basename(opts.relPath)
    const keySlice = opts.thumbKey.slice(0, 12) || 'file'
    const cacheTarget = path.join(toolManager.extractCacheDir, opts.projectId, keySlice, safeName)

    try {
      const st = await fsp.stat(cacheTarget)
      if (st.isFile() && st.size > 0) {
        const now = new Date()
        await fsp.utimes(cacheTarget, now, now).catch(() => {})
        return cacheTarget
      }
    } catch {
      // Cache miss
    }

    const inflightKey = `${opts.projectId}|${keySlice}|${opts.relPath}`
    const existing = inflightExtracts.get(inflightKey)
    if (existing) return existing

    const promise = observeTask(options.tasks, {
      scope: 'projects',
      key: `extract:${opts.projectId}`,
      title: `归档文件提取：${opts.projectName ?? opts.projectId}`,
      item: opts.relPath,
      meta: { projectId: opts.projectId, projectName: opts.projectName },
      signal: opts.signal,
    }, async () => {
      const binaryPath = await toolManager.requireActiveBinary()
      await ensureArchivePresent(opts.projectPath, opts.archiveFileName)
      const archiveAbsPath = normalizePath(path.join(opts.projectPath, opts.archiveFileName))

      const dir = path.dirname(cacheTarget)
      await fsp.mkdir(dir, { recursive: true })
      const tmpDest = `${cacheTarget}.${crypto.randomUUID().slice(0, 8)}.tmp`
      try {
        await runner.extractFile({
          binaryPath,
          archiveAbsPath,
          relPath: opts.relPath,
          destFilePath: tmpDest,
          signal: opts.signal,
        })
        await fsp.rename(tmpDest, cacheTarget)
      } catch (err) {
        await fsp.unlink(tmpDest).catch(() => {})
        throw err
      }

      void toolManager.pruneExtractCache(cacheTarget).catch(() => {})
      return cacheTarget
    }).finally(() => {
      inflightExtracts.delete(inflightKey)
    })

    inflightExtracts.set(inflightKey, promise)
    return promise
  }

  const extractFileToDestination: ProjectArchiveService['extractFileToDestination'] = async opts => {
    const safeBase = path.basename(opts.relPath)
    const destPath = normalizePath(path.join(opts.destDir, safeBase))
    if (!destPath) {
      throw new FolioError('invalid_path', '目标保存路径无效', 400)
    }

    const liveAbs = normalizePath(path.join(opts.projectPath, opts.relPath))
    const liveStat = await fsp.stat(liveAbs).catch(() => null)
    if (liveStat?.isFile()) {
      await fsp.mkdir(opts.destDir, { recursive: true })
      if (liveAbs.toLowerCase() !== destPath.toLowerCase()) {
        await fsp.copyFile(liveAbs, destPath)
      }
      return destPath
    }

    const binaryPath = await toolManager.requireActiveBinary()
    await ensureArchivePresent(opts.projectPath, opts.archiveFileName)
    const archiveAbsPath = normalizePath(path.join(opts.projectPath, opts.archiveFileName))

    await runner.extractFile({
      binaryPath,
      archiveAbsPath,
      relPath: opts.relPath,
      destFilePath: destPath,
      signal: opts.signal,
    })
    return destPath
  }

  const exportArchiveToDestination: ProjectArchiveService['exportArchiveToDestination'] = async opts => {
    const artifacts = await ensureArchivePresent(opts.projectPath, opts.archiveFileName)
    const normalizedDestDir = normalizePath(opts.destDir)
    if (!normalizedDestDir) {
      throw new FolioError('invalid_path', '导出目录路径无效', 400)
    }

    await fsp.mkdir(normalizedDestDir, { recursive: true })
    const exportedFiles: string[] = []

    for (const file of artifacts.allFiles) {
      const destPath = normalizePath(path.join(normalizedDestDir, path.basename(file.name)))
      if (file.absPath.toLowerCase() === destPath.toLowerCase()) {
        exportedFiles.push(destPath)
        continue
      }
      const tmpDest = `${destPath}.${crypto.randomUUID().slice(0, 8)}.tmp`
      try {
        await fsp.copyFile(file.absPath, tmpDest)
        await fsp.rename(tmpDest, destPath)
        exportedFiles.push(destPath)
      } catch (err) {
        await fsp.unlink(tmpDest).catch(() => {})
        throw err
      }
    }

    const exportedPath = exportedFiles[0] ?? normalizePath(path.join(normalizedDestDir, path.basename(opts.archiveFileName)))
    return { exportedPath, exportedFiles }
  }

  const removeEmptyParentDirs = async (projectPath: string, startDir: string): Promise<void> => {
    const normRoot = normalizePath(projectPath).toLowerCase()
    const metaDirLower = normalizePath(path.join(projectPath, META_DIR_NAME)).toLowerCase()
    let current = normalizePath(startDir)

    while (current) {
      const currentLower = current.toLowerCase()
      if (currentLower === normRoot || currentLower === metaDirLower) break
      if (!isPathInside(projectPath, current)) break
      try {
        const remaining = await fsp.readdir(current)
        if (remaining.length > 0) break
        await fsp.rmdir(current)
        current = normalizePath(path.dirname(current))
      } catch {
        break
      }
    }
  }

  const removeFilesAndPruneDirs: ProjectArchiveService['removeFilesAndPruneDirs'] = async (
    projectPath,
    relPaths,
    mode,
  ) => {
    if (mode === 'keep' || relPaths.length === 0) return 0
    const absPaths: string[] = []
    for (const rel of relPaths) {
      const target = normalizePath(path.join(projectPath, ...rel.split('/')))
      if (!isPathInside(projectPath, target)) continue
      const st = await fsp.stat(target).catch(() => null)
      if (st?.isFile()) absPaths.push(target)
    }
    if (absPaths.length === 0) return 0

    let removed = 0
    if (mode === 'recycle' && native.recyclePaths) {
      const res = await native.recyclePaths(absPaths)
      removed = res.recycled
    } else {
      for (const abs of absPaths) {
        await fsp.unlink(abs).catch(() => {})
        removed += 1
      }
    }

    const parentDirs = new Set(absPaths.map(p => path.dirname(p)))
    for (const dir of parentDirs) {
      await removeEmptyParentDirs(projectPath, dir)
    }
    return removed
  }

  const extractFileInPlace: ProjectArchiveService['extractFileInPlace'] = async opts => {
    const posixRel = opts.relPath.split(path.sep).join('/')
    const targetPath = normalizePath(path.join(opts.projectPath, ...posixRel.split('/')))
    if (!isPathInside(opts.projectPath, targetPath)) {
      throw new FolioError('forbidden_path', '拒绝越权路径访问', 403)
    }

    const existingStat = await fsp.stat(targetPath).catch(() => null)
    if (existingStat?.isFile()) {
      return {
        extractedPath: targetPath,
        alreadyOnDisk: true,
        fingerprint: `${existingStat.size}:${Math.trunc(existingStat.mtimeMs)}`,
      }
    }

    const binaryPath = await toolManager.requireActiveBinary()
    await ensureArchivePresent(opts.projectPath, opts.archiveFileName)
    const archiveAbsPath = normalizePath(path.join(opts.projectPath, opts.archiveFileName))

    const targetDir = path.dirname(targetPath)
    await fsp.mkdir(targetDir, { recursive: true })
    const tmpDest = `${targetPath}.${crypto.randomUUID().slice(0, 8)}.tmp`
    try {
      await runner.extractFile({
        binaryPath,
        archiveAbsPath,
        relPath: posixRel,
        destFilePath: tmpDest,
        signal: opts.signal,
      })
      await fsp.rename(tmpDest, targetPath)
    } catch (err) {
      await fsp.unlink(tmpDest).catch(() => {})
      throw err
    }

    const st = await fsp.stat(targetPath)
    return {
      extractedPath: targetPath,
      alreadyOnDisk: false,
      fingerprint: `${st.size}:${Math.trunc(st.mtimeMs)}`,
    }
  }

  return {
    runner,
    listArchiveArtifacts,
    collectTopLevelPackEntries,
    disposeSourceEntries,
    removeFilesAndPruneDirs,
    ensureExtractedFile,
    extractTemporaryThumbSource,
    extractFileInPlace,
    extractFileToDestination,
    exportArchiveToDestination,
  }
}
