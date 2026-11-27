import { execFile } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  FolioError,
  type FsDirEntry,
  type FsDriveInfo,
  type FsListDirectoryOptions,
  type FsListDirectoryResult,
  type FsQuickFolder,
  type FsRootsResult,
} from '@folio/base-contract'
import { classifyFile, getParentPath, normalizePath } from './classify.js'

const execFileAsync = promisify(execFile)

interface WinDiskRow {
  readonly DeviceID?: string
  readonly VolumeName?: string | null
  readonly DriveType?: number
}

let cachedWinLabels: { readonly expiresAt: number; readonly map: Map<string, WinDiskRow> } | null =
  null

async function getWindowsVolumeLabels(): Promise<Map<string, WinDiskRow>> {
  const now = Date.now()
  if (cachedWinLabels && cachedWinLabels.expiresAt > now) {
    return cachedWinLabels.map
  }
  const map = new Map<string, WinDiskRow>()
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,VolumeName,DriveType | ConvertTo-Json -Compress',
      ],
      { timeout: 2500, windowsHide: true },
    )
    const trimmed = stdout.trim()
    if (trimmed) {
      const parsed = JSON.parse(trimmed) as WinDiskRow | WinDiskRow[]
      const rows = Array.isArray(parsed) ? parsed : [parsed]
      for (const row of rows) {
        if (row.DeviceID) {
          map.set(row.DeviceID.toUpperCase(), row)
        }
      }
    }
  } catch {
    // Fall back gracefully to drive letters if WMI/CIM times out
  }
  cachedWinLabels = { expiresAt: now + 30_000, map }
  return map
}

function mapDriveKind(driveType?: number): FsDriveInfo['kind'] {
  if (driveType === 2) return 'removable'
  if (driveType === 4) return 'network'
  return 'fixed'
}

async function probeDriveStats(
  drivePath: string,
): Promise<{ totalBytes: number; freeBytes: number } | null> {
  try {
    const stats = await fsp.statfs(drivePath)
    const bsize = Number(stats.bsize || 0)
    const totalBytes = Number(stats.blocks || 0) * bsize
    const freeBytes = Number(stats.bavail || 0) * bsize
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) {
      return { totalBytes: 0, freeBytes: 0 }
    }
    return { totalBytes, freeBytes: Math.max(0, Math.min(totalBytes, freeBytes)) }
  } catch {
    return null
  }
}

export async function listDrives(): Promise<FsDriveInfo[]> {
  if (process.platform === 'win32') {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    const [labels, statResults] = await Promise.all([
      getWindowsVolumeLabels(),
      Promise.all(
        letters.map(async letter => {
          const driveId = `${letter}:`
          const drivePath = `${driveId}\\`
          const stat = await probeDriveStats(drivePath)
          return stat ? { letter, driveId, drivePath, stat } : null
        }),
      ),
    ])

    const drives: FsDriveInfo[] = []
    for (const item of statResults) {
      if (!item) continue
      const meta = labels.get(item.driveId)
      const label = meta?.VolumeName?.trim() || ''
      const displayName = label ? `${label} (${item.driveId})` : `本地磁盘 (${item.driveId})`
      drives.push({
        id: item.driveId,
        name: displayName,
        path: item.drivePath,
        label,
        kind: mapDriveKind(meta?.DriveType),
        totalBytes: item.stat.totalBytes,
        freeBytes: item.stat.freeBytes,
      })
    }
    return drives
  }

  const candidates: Array<{ id: string; name: string; path: string; kind: FsDriveInfo['kind'] }> =
    [{ id: 'root', name: '根目录 (/)', path: '/', kind: 'fixed' }]
  const mountParent = process.platform === 'darwin' ? '/Volumes' : '/mnt'
  try {
    const entries = await fsp.readdir(mountParent, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const fullPath = path.join(mountParent, entry.name)
      candidates.push({ id: entry.name, name: entry.name, path: fullPath, kind: 'fixed' })
    }
  } catch {
    // ignore missing mount directory
  }

  const drives: FsDriveInfo[] = []
  for (const item of candidates) {
    const stat = await probeDriveStats(item.path)
    if (!stat) continue
    drives.push({
      id: item.id,
      name: item.name,
      path: item.path,
      label: item.name,
      kind: item.kind,
      totalBytes: stat.totalBytes,
      freeBytes: stat.freeBytes,
    })
  }
  return drives
}

async function isAccessibleDir(dirPath: string): Promise<boolean> {
  try {
    const st = await fsp.stat(dirPath)
    return st.isDirectory()
  } catch {
    return false
  }
}

export async function listQuickFolders(): Promise<FsQuickFolder[]> {
  const home = normalizePath(os.homedir())
  const candidates: readonly FsQuickFolder[] = [
    { id: 'home', name: '主目录', path: home, kind: 'home' },
    { id: 'pictures', name: '图片', path: normalizePath(path.join(home, 'Pictures')), kind: 'pictures' },
    { id: 'desktop', name: '桌面', path: normalizePath(path.join(home, 'Desktop')), kind: 'desktop' },
    { id: 'downloads', name: '下载', path: normalizePath(path.join(home, 'Downloads')), kind: 'downloads' },
    { id: 'documents', name: '文档', path: normalizePath(path.join(home, 'Documents')), kind: 'documents' },
  ]

  const checks = await Promise.all(
    candidates.map(async item => ({
      item,
      ok: await isAccessibleDir(item.path),
    })),
  )

  return checks.filter(c => c.ok).map(c => c.item)
}

export async function listRoots(): Promise<FsRootsResult> {
  const homePath = normalizePath(os.homedir())
  const [quickFolders, drives] = await Promise.all([listQuickFolders(), listDrives()])
  return {
    homePath,
    platform: process.platform,
    quickFolders,
    drives,
  }
}

const DEFAULT_LIST_LIMIT = 1200

export async function listDirectory(
  options: FsListDirectoryOptions = {},
): Promise<FsListDirectoryResult> {
  const target = normalizePath(options.path?.trim() || os.homedir())
  const showHidden = Boolean(options.showHidden)
  const onlyDirs = Boolean(options.onlyDirs)
  const limit = Math.max(1, Math.min(5000, options.limit ?? DEFAULT_LIST_LIMIT))
  const extFilter =
    options.extensions && options.extensions.length > 0
      ? new Set(options.extensions.map(e => e.toLowerCase()))
      : null

  let st: fs.Stats
  try {
    st = await fsp.stat(target)
  } catch {
    throw new FolioError('not_found', `目录不存在: ${target}`, 404)
  }
  if (!st.isDirectory()) {
    throw new FolioError('not_a_directory', `目标不是文件夹: ${target}`, 400)
  }

  const dirents = await fsp.readdir(target, { withFileTypes: true })
  const visible = showHidden ? dirents : dirents.filter(d => !d.name.startsWith('.'))
  const dirs: FsDirEntry[] = []
  const files: FsDirEntry[] = []

  for (const dirent of visible) {
    if (dirs.length + files.length >= limit) break
    const fullPath = normalizePath(path.join(target, dirent.name))
    try {
      const entryStat = await fsp.stat(fullPath)
      if (entryStat.isDirectory()) {
        dirs.push({
          name: dirent.name,
          path: fullPath,
          isDir: true,
          ext: '',
          category: 'folder',
          mime: 'inode/directory',
          size: 0,
          mtimeMs: entryStat.mtimeMs,
        })
      } else if (entryStat.isFile() && !onlyDirs) {
        const meta = classifyFile(dirent.name, false)
        if (extFilter && !extFilter.has(meta.ext)) continue
        files.push({
          name: dirent.name,
          path: fullPath,
          isDir: false,
          ext: meta.ext,
          category: meta.category,
          mime: meta.mime,
          size: entryStat.size,
          mtimeMs: entryStat.mtimeMs,
        })
      }
    } catch {
      // skip inaccessible entry
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

  return {
    path: target,
    parentPath: getParentPath(target),
    entries: [...dirs, ...files],
    truncated: visible.length > limit,
  }
}
