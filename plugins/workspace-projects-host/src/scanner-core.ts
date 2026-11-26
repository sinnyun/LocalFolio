import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import {
  classifyProjectFile,
  computeProjectId,
  computeThumbKey,
  isIgnoredEntryName,
  makeFingerprint,
  normalizeProjectPath,
  toPosixRelPath,
} from './classify.js'
import type {
  ProjectArchivedLiveFileItem,
  ProjectArchivedLiveInspection,
} from '@folio/base-contract'
import type {
  ProjectChangeSummary,
  ProjectCheckResult,
  ProjectFileEntry,
  ProjectFolderGroup,
  ProjectManifest,
} from './types.js'

const MAX_SCAN_DEPTH = 12
const MAX_SCAN_FILES = 50_000
const STAT_CONCURRENCY = 6

export interface ScanProgressInfo {
  readonly scannedFiles: number
  readonly scannedDirs: number
  readonly currentDir: string
}

export interface ScanProjectResult {
  readonly manifest: ProjectManifest
  readonly changeSummary: ProjectChangeSummary
  readonly hasChanges: boolean
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor
      cursor += 1
      await worker(items[idx]!)
    }
  })
  await Promise.all(runners)
}

interface WalkedFile {
  readonly relPath: string
  readonly folderRelPath: string
  readonly name: string
  readonly ext: string
  readonly category: ProjectFileEntry['category']
  readonly mime: string
  readonly thumbSupported: boolean
  readonly size: number
  readonly mtimeMs: number
  readonly fingerprint: string
  readonly thumbKey: string
}

async function walkProjectFiles(
  projectPath: string,
  optionsOrProgress?:
    | ((info: ScanProgressInfo) => void)
    | {
        readonly ignoreRootFiles?: ReadonlySet<string>
        readonly supportedThumbExts?: ReadonlySet<string>
        readonly onProgress?: (info: ScanProgressInfo) => void
      },
): Promise<{
  readonly files: WalkedFile[]
  readonly folderRelPaths: Set<string>
}> {
  const onProgress =
    typeof optionsOrProgress === 'function' ? optionsOrProgress : optionsOrProgress?.onProgress
  const ignoreRootFiles =
    typeof optionsOrProgress === 'function' ? undefined : optionsOrProgress?.ignoreRootFiles
  const supportedThumbExts =
    typeof optionsOrProgress === 'function' ? undefined : optionsOrProgress?.supportedThumbExts
  const normalizedRoot = normalizeProjectPath(projectPath)
  const files: WalkedFile[] = []
  const folderRelPaths = new Set<string>()
  const queue: Array<{ absDir: string; relDir: string; depth: number }> = [
    { absDir: normalizedRoot, relDir: '', depth: 0 },
  ]
  let scannedDirs = 0

  while (queue.length > 0 && files.length < MAX_SCAN_FILES) {
    const current = queue.shift()!
    scannedDirs += 1

    let dir: fs.Dir | null = null
    const fileCandidates: Array<{ absPath: string; relPath: string; name: string }> = []

    try {
      dir = await fsp.opendir(current.absDir)
      for await (const entry of dir) {
        if (entry.isSymbolicLink()) continue
        const isDir = entry.isDirectory()
        if (isIgnoredEntryName(entry.name, isDir)) continue
        if (
          !isDir &&
          current.depth === 0 &&
          ignoreRootFiles?.has(entry.name.toLowerCase())
        ) {
          continue
        }

        const childRel = current.relDir ? `${current.relDir}/${entry.name}` : entry.name
        const childAbs = path.join(current.absDir, entry.name)

        if (isDir) {
          if (current.depth < MAX_SCAN_DEPTH) {
            folderRelPaths.add(childRel)
            queue.push({ absDir: childAbs, relDir: childRel, depth: current.depth + 1 })
          }
        } else if (entry.isFile()) {
          fileCandidates.push({ absPath: childAbs, relPath: childRel, name: entry.name })
          if (files.length + fileCandidates.length >= MAX_SCAN_FILES) break
        }
      }
    } catch {
      // Skip unreadable directories gracefully
    } finally {
      await dir?.close().catch(() => {})
    }

    if (fileCandidates.length > 0) {
      await runWithConcurrency(fileCandidates, STAT_CONCURRENCY, async item => {
        try {
          const st = await fsp.stat(item.absPath)
          if (!st.isFile()) return
          const meta = classifyProjectFile(item.name, supportedThumbExts)
          const fingerprint = makeFingerprint(st.size, st.mtimeMs)
          const relPosix = toPosixRelPath(item.relPath)
          const folderRel = current.relDir ? toPosixRelPath(current.relDir) : ''
          files.push({
            relPath: relPosix,
            folderRelPath: folderRel,
            name: item.name,
            ext: meta.ext,
            category: meta.category,
            mime: meta.mime,
            thumbSupported: meta.thumbSupported,
            size: st.size,
            mtimeMs: st.mtimeMs,
            fingerprint,
            thumbKey: computeThumbKey(relPosix, fingerprint),
          })
        } catch {
          // Skip files that disappeared or failed stat
        }
      })
    }

    if (onProgress && (scannedDirs === 1 || scannedDirs % 10 === 0)) {
      onProgress({
        scannedFiles: files.length,
        scannedDirs,
        currentDir: current.relDir || path.basename(normalizedRoot),
      })
    }
  }

  return { files, folderRelPaths }
}

function pickCoverCandidate(files: readonly ProjectFileEntry[]): ProjectFileEntry | null {
  const thumbable = files.filter(f => f.thumbSupported)
  if (thumbable.length === 0) return null

  const priority = (f: ProjectFileEntry): number => {
    const lowerName = f.name.toLowerCase()
    const coverBoost =
      lowerName.includes('cover') ||
      lowerName.includes('thumb') ||
      lowerName.includes('preview') ||
      lowerName.includes('封面') ||
      lowerName.includes('预览')
        ? 0
        : 10
    if (f.category === 'image') return coverBoost + 1
    if (f.category === 'design') return coverBoost + 2
    if (f.category === 'video') return coverBoost + 3
    if (f.category === 'document') return coverBoost + 4
    return coverBoost + 5
  }

  const sorted = [...thumbable].sort((a, b) => {
    const diff = priority(a) - priority(b)
    if (diff !== 0) return diff
    return a.relPath.localeCompare(b.relPath, undefined, { numeric: true, sensitivity: 'base' })
  })
  return sorted[0] ?? null
}

function diffAgainstManifest(
  currentFiles: readonly WalkedFile[],
  existingManifest: ProjectManifest,
): ProjectChangeSummary {
  const prevMap = new Map<string, string>()
  for (const group of existingManifest.groups) {
    for (const file of group.files) {
      prevMap.set(file.relPath, file.fingerprint)
    }
  }

  let added = 0
  let modified = 0
  const seen = new Set<string>()
  for (const file of currentFiles) {
    seen.add(file.relPath)
    const oldFp = prevMap.get(file.relPath)
    if (oldFp === undefined) added += 1
    else if (oldFp !== file.fingerprint) modified += 1
  }

  let removed = 0
  for (const oldPath of prevMap.keys()) {
    if (!seen.has(oldPath)) removed += 1
  }

  return { added, modified, removed }
}

function buildIgnoredRootFilesSet(existingManifest?: ProjectManifest | null): Set<string> {
  const set = new Set<string>()
  const archiveFile = existingManifest?.archive?.archiveFileName?.trim()
  if (archiveFile) set.add(archiveFile.toLowerCase())
  return set
}

function buildGroupsAndStats(files: readonly ProjectFileEntry[]): {
  readonly groups: ProjectFolderGroup[]
  readonly stats: ProjectManifest['stats']
  readonly fingerprintDigest: string
} {
  const grouped = new Map<string, ProjectFileEntry[]>()
  const categories: Record<string, number> = {}
  let totalBytes = 0

  for (const file of files) {
    totalBytes += file.size
    categories[file.category] = (categories[file.category] ?? 0) + 1
    const bucket = grouped.get(file.folderRelPath)
    if (bucket) bucket.push(file)
    else grouped.set(file.folderRelPath, [file])
  }

  const groups: ProjectFolderGroup[] = Array.from(grouped.entries())
    .sort(([a], [b]) => {
      if (a === '' && b !== '') return -1
      if (a !== '' && b === '') return 1
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    })
    .map(([relPath, groupFiles]) => {
      const sortedFiles = [...groupFiles].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
      )
      const groupBytes = sortedFiles.reduce((acc, f) => acc + f.size, 0)
      return {
        relPath,
        name: relPath === '' ? '根目录' : relPath,
        depth: relPath === '' ? 0 : relPath.split('/').length,
        fileCount: sortedFiles.length,
        totalBytes: groupBytes,
        files: sortedFiles,
      }
    })

  const digestHash = crypto.createHash('sha256')
  const sortedForDigest = [...files].sort((a, b) => a.relPath.localeCompare(b.relPath))
  for (const file of sortedForDigest) {
    digestHash.update(`${file.relPath}=${file.fingerprint}\n`)
  }
  const fingerprintDigest = digestHash.digest('hex')

  return {
    groups,
    stats: {
      fileCount: files.length,
      folderCount: groups.filter(g => g.relPath !== '').length,
      totalBytes,
      categories,
    },
    fingerprintDigest,
  }
}

function classifyLiveAgainstManifest(
  liveFiles: readonly WalkedFile[],
  manifest: ProjectManifest,
): {
  readonly cleanExtracted: ProjectArchivedLiveFileItem[]
  readonly modifiedExtracted: ProjectArchivedLiveFileItem[]
  readonly addedFiles: ProjectArchivedLiveFileItem[]
} {
  const archivedMap = new Map<string, ProjectFileEntry>()
  for (const group of manifest.groups) {
    for (const file of group.files) {
      archivedMap.set(file.relPath, file)
    }
  }
  const extractedMap = new Map(
    (manifest.archive?.extractedFiles ?? []).map(item => [item.relPath, item]),
  )

  const cleanExtracted: ProjectArchivedLiveFileItem[] = []
  const modifiedExtracted: ProjectArchivedLiveFileItem[] = []
  const addedFiles: ProjectArchivedLiveFileItem[] = []

  for (const file of liveFiles) {
    const item: ProjectArchivedLiveFileItem = {
      relPath: file.relPath,
      name: file.name,
      size: file.size,
      mtimeMs: file.mtimeMs,
      fingerprint: file.fingerprint,
      thumbKey: file.thumbKey,
      thumbSupported: file.thumbSupported,
    }
    const archived = archivedMap.get(file.relPath)
    if (!archived) {
      addedFiles.push(item)
      continue
    }
    const tracked = extractedMap.get(file.relPath)
    if (
      file.fingerprint === archived.fingerprint ||
      (tracked && file.fingerprint === tracked.fingerprint)
    ) {
      cleanExtracted.push(item)
    } else {
      modifiedExtracted.push(item)
    }
  }

  return { cleanExtracted, modifiedExtracted, addedFiles }
}

export async function classifyArchivedLiveFiles(
  rawProjectPath: string,
  manifest: ProjectManifest,
  supportedThumbExts?: readonly string[],
): Promise<ProjectArchivedLiveInspection> {
  const projectPath = normalizeProjectPath(rawProjectPath)
  if (manifest.archive?.mode !== 'archived') {
    return {
      projectId: manifest.projectId,
      archived: false,
      cleanExtracted: [],
      modifiedExtracted: [],
      addedFiles: [],
    }
  }

  const ignoreRootFiles = buildIgnoredRootFilesSet(manifest)
  const extSet = supportedThumbExts
    ? new Set(supportedThumbExts.map(e => e.toLowerCase()))
    : undefined
  const { files: liveFiles } = await walkProjectFiles(projectPath, {
    ignoreRootFiles,
    supportedThumbExts: extSet,
  })
  const classified = classifyLiveAgainstManifest(liveFiles, manifest)
  return {
    projectId: manifest.projectId,
    archived: true,
    ...classified,
  }
}

export async function buildEntriesForRelPaths(
  rawProjectPath: string,
  relPaths: readonly string[],
  supportedThumbExts?: readonly string[],
): Promise<ProjectFileEntry[]> {
  const projectPath = normalizeProjectPath(rawProjectPath)
  const extSet = supportedThumbExts
    ? new Set(supportedThumbExts.map(e => e.toLowerCase()))
    : undefined
  const entries: ProjectFileEntry[] = []

  for (const rawRel of relPaths) {
    const relPosix = toPosixRelPath(rawRel)
    const absPath = path.join(projectPath, ...relPosix.split('/'))
    try {
      const st = await fsp.stat(absPath)
      if (!st.isFile()) continue
      const name = path.basename(absPath)
      const meta = classifyProjectFile(name, extSet)
      const fingerprint = makeFingerprint(st.size, st.mtimeMs)
      const slashIdx = relPosix.lastIndexOf('/')
      const folderRelPath = slashIdx > 0 ? relPosix.slice(0, slashIdx) : ''
      entries.push({
        relPath: relPosix,
        folderRelPath,
        name,
        ext: meta.ext,
        category: meta.category,
        mime: meta.mime,
        thumbSupported: meta.thumbSupported,
        size: st.size,
        mtimeMs: st.mtimeMs,
        fingerprint,
        thumbKey: computeThumbKey(relPosix, fingerprint),
      })
    } catch {
      // ignore missing path
    }
  }

  return entries
}

export async function mergeDeltaFilesIntoManifest(
  rawProjectPath: string,
  existingManifest: ProjectManifest,
  deltaRelPaths: readonly string[],
  supportedThumbExts?: readonly string[],
): Promise<ProjectManifest> {
  const deltaEntries = await buildEntriesForRelPaths(
    rawProjectPath,
    deltaRelPaths,
    supportedThumbExts,
  )
  const mergedMap = new Map<string, ProjectFileEntry>()
  for (const group of existingManifest.groups) {
    for (const file of group.files) {
      mergedMap.set(file.relPath, file)
    }
  }
  for (const entry of deltaEntries) {
    mergedMap.set(entry.relPath, entry)
  }

  const allFiles = Array.from(mergedMap.values())
  const { groups, stats, fingerprintDigest } = buildGroupsAndStats(allFiles)
  const coverRelPath =
    existingManifest.coverRelPath && mergedMap.has(existingManifest.coverRelPath)
      ? existingManifest.coverRelPath
      : pickCoverCandidate(allFiles)?.relPath ?? null

  const now = Date.now()
  return {
    ...existingManifest,
    updatedAt: now,
    lastScannedAt: now,
    coverRelPath,
    stats,
    fingerprintDigest,
    groups,
  }
}

export async function scanProjectDirectory(
  rawProjectPath: string,
  existingManifest?: ProjectManifest | null,
  onProgress?: (info: ScanProgressInfo) => void,
  options?: { readonly supportedThumbExts?: readonly string[] },
): Promise<ScanProjectResult> {
  const projectPath = normalizeProjectPath(rawProjectPath)
  const st = await fsp.stat(projectPath)
  if (!st.isDirectory()) {
    throw new Error(`项目路径不是有效文件夹: ${projectPath}`)
  }

  const ignoreRootFiles = buildIgnoredRootFilesSet(existingManifest)
  const supportedThumbExts = options?.supportedThumbExts
    ? new Set(options.supportedThumbExts.map(e => e.toLowerCase()))
    : undefined
  const { files } = await walkProjectFiles(projectPath, {
    ignoreRootFiles,
    supportedThumbExts,
    onProgress,
  })

  // For archived projects (sources compacted/recycled), preserve archived entries and merge live delta
  if (
    existingManifest?.archive?.mode === 'archived' &&
    existingManifest.archive.sourceDisposal !== 'keep'
  ) {
    let archiveExists = false
    try {
      const ast = await fsp.stat(path.join(projectPath, existingManifest.archive.archiveFileName))
      archiveExists = ast.isFile()
    } catch {
      archiveExists = false
    }
    if (archiveExists) {
      if (files.length === 0) {
        const now = Date.now()
        return {
          manifest: {
            ...existingManifest,
            updatedAt: now,
            lastScannedAt: now,
          },
          changeSummary: { added: 0, modified: 0, removed: 0 },
          hasChanges: false,
        }
      }

      const classified = classifyLiveAgainstManifest(files, existingManifest)
      const mergedMap = new Map<string, ProjectFileEntry>()
      for (const group of existingManifest.groups) {
        for (const file of group.files) {
          mergedMap.set(file.relPath, file)
        }
      }
      const deltaPaths = new Set([
        ...classified.addedFiles.map(f => f.relPath),
        ...classified.modifiedExtracted.map(f => f.relPath),
      ])
      for (const file of files) {
        if (deltaPaths.has(file.relPath)) {
          mergedMap.set(file.relPath, file)
        }
      }
      const allFiles = Array.from(mergedMap.values())
      const { groups, stats, fingerprintDigest } = buildGroupsAndStats(allFiles)
      const coverRelPath =
        existingManifest.coverRelPath && mergedMap.has(existingManifest.coverRelPath)
          ? existingManifest.coverRelPath
          : pickCoverCandidate(allFiles)?.relPath ?? null
      const now = Date.now()
      return {
        manifest: {
          ...existingManifest,
          updatedAt: now,
          lastScannedAt: now,
          coverRelPath,
          stats,
          fingerprintDigest,
          groups,
        },
        changeSummary: {
          added: classified.addedFiles.length,
          modified: classified.modifiedExtracted.length,
          removed: 0,
        },
        hasChanges: classified.addedFiles.length > 0 || classified.modifiedExtracted.length > 0,
      }
    }
  }

  const changeSummary = existingManifest
    ? diffAgainstManifest(files, existingManifest)
    : { added: files.length, modified: 0, removed: 0 }
  const hasChanges =
    existingManifest !== null &&
    existingManifest !== undefined &&
    (changeSummary.added > 0 || changeSummary.modified > 0 || changeSummary.removed > 0)

  const { groups, stats, fingerprintDigest } = buildGroupsAndStats(files)

  const existingCoverStillExists =
    existingManifest?.coverRelPath &&
    files.some(f => f.relPath === existingManifest.coverRelPath)
  const coverRelPath = existingCoverStillExists
    ? existingManifest!.coverRelPath
    : pickCoverCandidate(files)?.relPath ?? null

  const now = Date.now()
  const manifest: ProjectManifest = {
    version: 1,
    projectId: existingManifest?.projectId ?? computeProjectId(projectPath),
    name: existingManifest?.name ?? path.basename(projectPath),
    createdAt: existingManifest?.createdAt ?? now,
    updatedAt: now,
    lastScannedAt: now,
    coverRelPath,
    coverThumbFile:
      existingCoverStillExists && existingManifest?.coverThumbFile
        ? existingManifest.coverThumbFile
        : null,
    summary: existingManifest?.summary ?? '',
    projectType: existingManifest?.projectType ?? '',
    tags: existingManifest?.tags ?? [],
    aiExtractedAt: existingManifest?.aiExtractedAt ?? null,
    aiLastTrace: existingManifest?.aiLastTrace ?? null,
    archive: existingManifest?.archive ?? null,
    stats,
    fingerprintDigest,
    groups,
  }

  return {
    manifest,
    changeSummary,
    hasChanges,
  }
}

export async function checkProjectChanges(
  rawProjectPath: string,
  manifest: ProjectManifest,
): Promise<ProjectCheckResult> {
  const projectPath = normalizeProjectPath(rawProjectPath)
  try {
    const st = await fsp.stat(projectPath)
    if (!st.isDirectory()) {
      return {
        projectId: manifest.projectId,
        hasChanges: true,
        changeSummary: { added: 0, modified: 0, removed: manifest.stats.fileCount },
        missing: true,
      }
    }
  } catch {
    return {
      projectId: manifest.projectId,
      hasChanges: true,
      changeSummary: { added: 0, modified: 0, removed: manifest.stats.fileCount },
      missing: true,
    }
  }

  const ignoreRootFiles = buildIgnoredRootFilesSet(manifest)
  if (manifest.archive?.mode === 'archived') {
    const archivePath = path.join(projectPath, manifest.archive.archiveFileName)
    let archiveExists = false
    try {
      const ast = await fsp.stat(archivePath)
      archiveExists = ast.isFile()
    } catch {
      archiveExists = false
    }
    if (!archiveExists) {
      return {
        projectId: manifest.projectId,
        hasChanges: true,
        changeSummary: { added: 0, modified: 0, removed: manifest.stats.fileCount },
        missing: true,
      }
    }
    const { files: liveFiles } = await walkProjectFiles(projectPath, { ignoreRootFiles })
    if (manifest.archive.sourceDisposal === 'keep') {
      const changeSummary = diffAgainstManifest(liveFiles, manifest)
      const hasChanges =
        changeSummary.added > 0 || changeSummary.modified > 0 || changeSummary.removed > 0
      return {
        projectId: manifest.projectId,
        hasChanges,
        changeSummary,
        missing: false,
      }
    }
    const classified = classifyLiveAgainstManifest(liveFiles, manifest)
    const added = classified.addedFiles.length
    const modified = classified.modifiedExtracted.length
    return {
      projectId: manifest.projectId,
      hasChanges: added > 0 || modified > 0,
      changeSummary: { added, modified, removed: 0 },
      missing: false,
      extractedUnmodified: classified.cleanExtracted.length,
    }
  }

  const { files } = await walkProjectFiles(projectPath, { ignoreRootFiles })
  const changeSummary = diffAgainstManifest(files, manifest)
  const hasChanges =
    changeSummary.added > 0 || changeSummary.modified > 0 || changeSummary.removed > 0
  return {
    projectId: manifest.projectId,
    hasChanges,
    changeSummary,
    missing: false,
  }
}

export async function discoverLibraryProjects(
  rawRootPath: string,
): Promise<Array<{ readonly name: string; readonly path: string }>> {
  const rootPath = normalizeProjectPath(rawRootPath)
  const st = await fsp.stat(rootPath)
  if (!st.isDirectory()) {
    throw new Error(`库目录不存在或不是文件夹: ${rootPath}`)
  }

  const projects: Array<{ readonly name: string; readonly path: string }> = []
  let dir: fs.Dir | null = null
  try {
    dir = await fsp.opendir(rootPath)
    for await (const entry of dir) {
      if (entry.isSymbolicLink()) continue
      if (!entry.isDirectory()) continue
      if (isIgnoredEntryName(entry.name, true)) continue
      projects.push({
        name: entry.name,
        path: normalizeProjectPath(path.join(rootPath, entry.name)),
      })
    }
  } finally {
    await dir?.close().catch(() => {})
  }

  projects.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  )
  return projects
}
