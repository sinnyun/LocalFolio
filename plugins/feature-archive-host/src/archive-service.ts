import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { FolioError, type FolioNativeService } from '@folio/base-contract'
import type { ArchiveToolManager } from './archive-tool.js'
import type { ArchiveSourceDisposal } from './types.js'

const META_DIR_NAME = '.folio-meta'

export interface ArchiveCliRunner {
  add(options: {
    readonly binaryPath: string
    readonly projectPath: string
    readonly archiveFileName: string
    readonly entries: readonly string[]
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
    readonly signal?: AbortSignal
    readonly onProgress?: (percent: number | null, detail: string) => void
  }): Promise<void>
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

function normalizePath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.includes('\0')) return ''
  const resolved = path.resolve(trimmed)
  if (/^[a-z]:\\/.test(resolved)) {
    return `${resolved[0]!.toUpperCase()}${resolved.slice(1)}`
  }
  return resolved
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

export function createZpaqfranzRunner(): ArchiveCliRunner {
  return {
    async add({ binaryPath, projectPath, archiveFileName, entries, signal, onProgress }) {
      const args = [
        'a',
        archiveFileName,
        ...entries,
        '-not',
        META_DIR_NAME,
        '-not',
        `${META_DIR_NAME}/*`,
        '-not',
        archiveFileName,
        '-not',
        '*.tmp',
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
      await runZpaqProcess({
        binaryPath,
        args: ['t', archiveFileName],
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
      await fsp.mkdir(destDir, { recursive: true })

      try {
        await runZpaqProcess({
          binaryPath,
          args: ['x', archiveAbsPath, posixRel, '-to', destFilePath, '-force'],
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
          args: ['x', archiveAbsPath, '-only', posixRel, '-force'],
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

    async extractAll({ binaryPath, projectPath, archiveFileName, signal, onProgress }) {
      await runZpaqProcess({
        binaryPath,
        args: ['x', archiveFileName, '-force'],
        cwd: projectPath,
        signal,
        onOutput: (line, pct) => onProgress?.(pct, line),
        errorCode: 'archive_restore_failed',
        errorPrefix: 'zpaqfranz 解包还原失败',
      })
    },
  }
}

export interface ProjectArchiveService {
  readonly runner: ArchiveCliRunner
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
  }): Promise<string>
}

export function createProjectArchiveService(options: {
  readonly toolManager: ArchiveToolManager
  readonly native: FolioNativeService
  readonly runner?: ArchiveCliRunner
}): ProjectArchiveService {
  const { toolManager, native } = options
  const runner = options.runner ?? createZpaqfranzRunner()
  const inflightExtracts = new Map<string, Promise<string>>()

  const collectTopLevelPackEntries = async (
    projectPath: string,
    archiveFileName: string,
  ): Promise<string[]> => {
    const dirEntries = await fsp.readdir(projectPath, { withFileTypes: true })
    const archiveLower = archiveFileName.toLowerCase()
    const entries: string[] = []
    for (const entry of dirEntries) {
      if (entry.isSymbolicLink()) continue
      const lower = entry.name.toLowerCase()
      if (lower === META_DIR_NAME.toLowerCase()) continue
      if (lower === archiveLower) continue
      if (
        lower === 'thumbs.db' ||
        lower === 'desktop.ini' ||
        lower === '.ds_store' ||
        lower.startsWith('~$') ||
        lower.endsWith('.tmp')
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

    const promise = (async () => {
      const binaryPath = await toolManager.requireActiveBinary()
      const archiveAbsPath = normalizePath(path.join(opts.projectPath, opts.archiveFileName))
      try {
        await fsp.access(archiveAbsPath)
      } catch {
        throw new FolioError('archive_missing', `归档包不存在: ${opts.archiveFileName}`, 404)
      }

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
    })().finally(() => {
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
    const archiveAbsPath = normalizePath(path.join(opts.projectPath, opts.archiveFileName))
    await fsp.access(archiveAbsPath).catch(() => {
      throw new FolioError('archive_missing', `归档包不存在: ${opts.archiveFileName}`, 404)
    })

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
    const archiveAbsPath = normalizePath(path.join(opts.projectPath, opts.archiveFileName))
    const srcStat = await fsp.stat(archiveAbsPath).catch(() => null)
    if (!srcStat?.isFile()) {
      throw new FolioError('archive_missing', `归档包不存在: ${opts.archiveFileName}`, 404)
    }

    const normalizedDestDir = normalizePath(opts.destDir)
    if (!normalizedDestDir) {
      throw new FolioError('invalid_path', '导出目录路径无效', 400)
    }

    await fsp.mkdir(normalizedDestDir, { recursive: true })
    const destPath = normalizePath(path.join(normalizedDestDir, path.basename(opts.archiveFileName)))
    if (archiveAbsPath.toLowerCase() === destPath.toLowerCase()) {
      return destPath
    }
    const tmpDest = `${destPath}.${crypto.randomUUID().slice(0, 8)}.tmp`
    try {
      await fsp.copyFile(archiveAbsPath, tmpDest)
      await fsp.rename(tmpDest, destPath)
    } catch (err) {
      await fsp.unlink(tmpDest).catch(() => {})
      throw err
    }
    return destPath
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
    const archiveAbsPath = normalizePath(path.join(opts.projectPath, opts.archiveFileName))
    await fsp.access(archiveAbsPath).catch(() => {
      throw new FolioError('archive_missing', `归档包不存在: ${opts.archiveFileName}`, 404)
    })

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
    collectTopLevelPackEntries,
    disposeSourceEntries,
    removeFilesAndPruneDirs,
    ensureExtractedFile,
    extractFileInPlace,
    extractFileToDestination,
    exportArchiveToDestination,
  }
}
