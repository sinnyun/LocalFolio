import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FolioError } from '@folio/base-contract'
import {
  buildBreadcrumbs,
  classifyFile,
  getParentPath,
  isHiddenName,
  isStreamableMediaExt,
  isTextPreviewable,
  normalizeBrowsePath,
  readImageDimensions,
} from './classify.js'
import type {
  DirChildGroup,
  FileEntry,
  FileInspectResult,
  ListDirectoryResult,
  TreeNodeInfo,
} from './types.js'

const MAX_DIR_ENTRIES = 5000
const MAX_SUBDIR_GROUPS = 40
const MAX_SUBDIR_CHILDREN = 100
const STAT_BATCH_SIZE = 32
const TEXT_PREVIEW_BYTES = 8192
const INSPECT_DIR_SCAN_CAP = 10_000

function mapFsError(error: unknown, targetPath: string): FolioError {
  if (error instanceof FolioError) return error
  const code = (error as { code?: string } | null)?.code
  if (code === 'ENOENT') {
    return new FolioError('not_found', `路径不存在: ${targetPath}`, 404)
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new FolioError('permission_denied', `没有访问权限: ${targetPath}`, 403)
  }
  if (code === 'ENOTDIR') {
    return new FolioError('not_a_directory', `目标不是文件夹: ${targetPath}`, 400)
  }
  const msg = error instanceof Error ? error.message : String(error)
  return new FolioError('fs_error', `文件系统访问失败: ${msg}`, 500)
}

export async function buildFileEntry(
  fullPath: string,
  name: string,
  dirent?: fs.Dirent,
): Promise<FileEntry | null> {
  try {
    const lstat = await fsp.lstat(fullPath)
    const isSymlink = lstat.isSymbolicLink()
    let isDir = lstat.isDirectory()
    let size = lstat.size
    let mtimeMs = lstat.mtimeMs
    let ctimeMs = lstat.birthtimeMs || lstat.ctimeMs

    if (isSymlink) {
      try {
        const targetStat = await fsp.stat(fullPath)
        isDir = targetStat.isDirectory()
        size = targetStat.size
        mtimeMs = targetStat.mtimeMs
        ctimeMs = targetStat.birthtimeMs || targetStat.ctimeMs
      } catch {
        // Broken symlink: keep lstat info
      }
    } else if (dirent?.isDirectory()) {
      isDir = true
    }

    const meta = classifyFile(name, isDir)
    return {
      name,
      path: normalizeBrowsePath(fullPath),
      ext: meta.ext,
      isDir,
      isSymlink,
      isHidden: isHiddenName(name),
      size: isDir ? 0 : size,
      mtimeMs,
      ctimeMs,
      category: meta.category,
      mime: meta.mime,
      thumbSupported: meta.thumbSupported,
    }
  } catch {
    return null
  }
}

async function statDirentsInBatches(
  dirPath: string,
  dirents: readonly fs.Dirent[],
  showHidden: boolean,
): Promise<FileEntry[]> {
  const filtered = dirents.filter(d => showHidden || !isHiddenName(d.name))
  const results: FileEntry[] = []
  for (let i = 0; i < filtered.length; i += STAT_BATCH_SIZE) {
    const batch = filtered.slice(i, i + STAT_BATCH_SIZE)
    const entries = await Promise.all(
      batch.map(d => buildFileEntry(path.join(dirPath, d.name), d.name, d)),
    )
    for (const entry of entries) {
      if (entry) results.push(entry)
    }
  }
  return results
}

async function hasSubdirectories(dirPath: string, showHidden: boolean): Promise<boolean> {
  let dir: fs.Dir | null = null
  try {
    dir = await fsp.opendir(dirPath)
    for await (const entry of dir) {
      if (!showHidden && isHiddenName(entry.name)) continue
      if (entry.isDirectory()) return true
    }
    return false
  } catch {
    return false
  } finally {
    await dir?.close().catch(() => {})
  }
}

export interface ListDirectoryOptions {
  readonly path?: string
  readonly showHidden?: boolean
  readonly includeSubdirChildren?: boolean
}

export async function listDirectory(options: ListDirectoryOptions): Promise<ListDirectoryResult> {
  const rawPath = options.path?.trim() || os.homedir()
  const dirPath = normalizeBrowsePath(rawPath)
  const showHidden = Boolean(options.showHidden)

  let st: fs.Stats
  try {
    st = await fsp.stat(dirPath)
  } catch (error) {
    throw mapFsError(error, dirPath)
  }
  if (!st.isDirectory()) {
    throw new FolioError('not_a_directory', `目标不是文件夹: ${dirPath}`, 400)
  }

  let dirents: fs.Dirent[]
  try {
    dirents = await fsp.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    throw mapFsError(error, dirPath)
  }

  const visibleDirents = showHidden ? dirents : dirents.filter(d => !isHiddenName(d.name))
  const truncated = visibleDirents.length > MAX_DIR_ENTRIES
  const sliced = truncated ? visibleDirents.slice(0, MAX_DIR_ENTRIES) : visibleDirents
  const entries = await statDirentsInBatches(dirPath, sliced, true)

  const childGroups: DirChildGroup[] = []
  if (options.includeSubdirChildren) {
    const subdirs = entries
      .filter(entry => entry.isDir)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
      .slice(0, MAX_SUBDIR_GROUPS)

    for (const subdir of subdirs) {
      try {
        const subDirents = await fsp.readdir(subdir.path, { withFileTypes: true })
        const visibleSub = showHidden
          ? subDirents
          : subDirents.filter(d => !isHiddenName(d.name))
        const subTruncated = visibleSub.length > MAX_SUBDIR_CHILDREN
        const subSliced = subTruncated ? visibleSub.slice(0, MAX_SUBDIR_CHILDREN) : visibleSub
        const subEntries = await statDirentsInBatches(subdir.path, subSliced, true)
        childGroups.push({
          folderName: subdir.name,
          folderPath: subdir.path,
          entries: subEntries,
          totalChildren: visibleSub.length,
          truncated: subTruncated,
        })
      } catch {
        // Skip unreadable subdirectory
      }
    }
  }

  return {
    path: dirPath,
    parentPath: getParentPath(dirPath),
    breadcrumbs: buildBreadcrumbs(dirPath),
    entries,
    childGroups,
    totalEntries: visibleDirents.length,
    truncated,
  }
}

export async function listTreeChildren(options: {
  readonly path: string
  readonly showHidden?: boolean
}): Promise<TreeNodeInfo[]> {
  const dirPath = normalizeBrowsePath(options.path)
  const showHidden = Boolean(options.showHidden)

  let dirents: fs.Dirent[]
  try {
    dirents = await fsp.readdir(dirPath, { withFileTypes: true })
  } catch (error) {
    throw mapFsError(error, dirPath)
  }

  const dirCandidates: Array<{ name: string; fullPath: string }> = []
  for (const d of dirents) {
    if (!showHidden && isHiddenName(d.name)) continue
    const fullPath = normalizeBrowsePath(path.join(dirPath, d.name))
    if (d.isDirectory()) {
      dirCandidates.push({ name: d.name, fullPath })
    } else if (d.isSymbolicLink()) {
      try {
        const target = await fsp.stat(fullPath)
        if (target.isDirectory()) dirCandidates.push({ name: d.name, fullPath })
      } catch {
        // ignore broken link
      }
    }
  }

  dirCandidates.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
  )

  const nodes: TreeNodeInfo[] = []
  for (let i = 0; i < dirCandidates.length; i += STAT_BATCH_SIZE) {
    const batch = dirCandidates.slice(i, i + STAT_BATCH_SIZE)
    const resolved = await Promise.all(
      batch.map(async item => ({
        name: item.name,
        path: item.fullPath,
        hasSubdirs: await hasSubdirectories(item.fullPath, showHidden),
      })),
    )
    nodes.push(...resolved)
  }

  return nodes
}

export async function inspectFile(targetRawPath: string): Promise<FileInspectResult> {
  const targetPath = normalizeBrowsePath(targetRawPath)
  if (!targetPath) {
    throw new FolioError('invalid_path', '文件路径不能为空', 400)
  }

  let entry: FileEntry | null
  try {
    await fsp.lstat(targetPath)
    entry = await buildFileEntry(targetPath, path.basename(targetPath) || targetPath)
  } catch (error) {
    throw mapFsError(error, targetPath)
  }
  if (!entry) {
    throw new FolioError('not_found', `无法读取文件信息: ${targetPath}`, 404)
  }

  let resolvedPath = entry.path
  try {
    resolvedPath = normalizeBrowsePath(await fsp.realpath(targetPath))
  } catch {
    // Keep normalized path if realpath fails
  }

  let readonly = false
  try {
    await fsp.access(targetPath, fs.constants.W_OK)
  } catch {
    readonly = true
  }

  let childCount: number | null = null
  let folderChildCount: number | null = null
  let fileChildCount: number | null = null
  let imageDimensions: { readonly width: number; readonly height: number } | null = null
  let textPreview: string | null = null
  let textTruncated = false

  if (entry.isDir) {
    let dir: fs.Dir | null = null
    try {
      dir = await fsp.opendir(entry.path)
      let total = 0
      let folders = 0
      let files = 0
      for await (const item of dir) {
        total += 1
        if (item.isDirectory()) folders += 1
        else files += 1
        if (total >= INSPECT_DIR_SCAN_CAP) break
      }
      childCount = total
      folderChildCount = folders
      fileChildCount = files
    } catch {
      // Unreadable directory contents
    } finally {
      await dir?.close().catch(() => {})
    }
  } else {
    if (entry.category === 'image') {
      imageDimensions = await readImageDimensions(entry.path, entry.ext)
    }
    if (isTextPreviewable(entry.ext)) {
      let handle: fsp.FileHandle | null = null
      try {
        handle = await fsp.open(entry.path, 'r')
        const buf = Buffer.allocUnsafe(TEXT_PREVIEW_BYTES)
        const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
        const slice = buf.subarray(0, bytesRead)
        if (!slice.includes(0)) {
          textPreview = slice.toString('utf8')
          textTruncated = entry.size > TEXT_PREVIEW_BYTES
        }
      } catch {
        // Ignore unreadable text preview
      } finally {
        await handle?.close().catch(() => {})
      }
    }
  }

  const version = Math.trunc(entry.mtimeMs)
  const encodedPath = encodeURIComponent(entry.path)
  const mediaUrl =
    !entry.isDir && isStreamableMediaExt(entry.ext)
      ? `/lf/files/media?path=${encodedPath}&v=${version}`
      : null
  const thumbUrl = entry.thumbSupported
    ? `/lf/files/thumb?path=${encodedPath}&size=512&v=${version}`
    : null

  return {
    entry,
    resolvedPath,
    parentPath: getParentPath(entry.path),
    readonly,
    childCount,
    folderChildCount,
    fileChildCount,
    imageDimensions,
    textPreview,
    textTruncated,
    mediaUrl,
    thumbUrl,
  }
}

function launchDetached(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    const onError = (err: Error): void => {
      reject(new FolioError('reveal_failed', `无法打开系统资源管理器: ${err.message}`, 500))
    }
    child.once('error', onError)
    child.once('spawn', () => {
      child.off('error', onError)
      child.unref()
      resolve()
    })
  })
}

export async function revealInExplorer(targetRawPath: string): Promise<{ readonly revealedPath: string }> {
  const targetPath = normalizeBrowsePath(targetRawPath)
  if (!targetPath) {
    throw new FolioError('invalid_path', '目标路径不能为空', 400)
  }

  let st: fs.Stats
  try {
    st = await fsp.stat(targetPath)
  } catch (error) {
    throw mapFsError(error, targetPath)
  }

  const isDir = st.isDirectory()
  if (process.platform === 'win32') {
    const args = isDir ? [targetPath] : [`/select,${targetPath}`]
    await launchDetached('explorer.exe', args)
  } else if (process.platform === 'darwin') {
    const args = isDir ? [targetPath] : ['-R', targetPath]
    await launchDetached('open', args)
  } else {
    await launchDetached('xdg-open', [isDir ? targetPath : path.dirname(targetPath)])
  }

  return { revealedPath: targetPath }
}
