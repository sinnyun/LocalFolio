import { execFile } from 'node:child_process'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { normalizeBrowsePath } from './classify.js'
import type { DriveInfo, QuickFolder } from './types.js'

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

function mapDriveKind(driveType?: number): DriveInfo['kind'] {
  if (driveType === 2) return 'removable'
  if (driveType === 4) return 'network'
  return 'fixed'
}

async function probeDriveStats(drivePath: string): Promise<{ totalBytes: number; freeBytes: number } | null> {
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

export async function listDrives(): Promise<DriveInfo[]> {
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

    const drives: DriveInfo[] = []
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
        usedBytes: Math.max(0, item.stat.totalBytes - item.stat.freeBytes),
      })
    }
    return drives
  }

  const candidates: Array<{ id: string; name: string; path: string; kind: DriveInfo['kind'] }> = [
    { id: 'root', name: '根目录 (/)', path: '/', kind: 'root' },
  ]
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

  const drives: DriveInfo[] = []
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
      usedBytes: Math.max(0, stat.totalBytes - stat.freeBytes),
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

export async function listQuickFolders(pinnedPaths: readonly string[]): Promise<QuickFolder[]> {
  const home = normalizeBrowsePath(os.homedir())
  const candidates: Array<{
    id: string
    name: string
    path: string
    kind: QuickFolder['kind']
  }> = [
    { id: 'home', name: '主目录', path: home, kind: 'home' },
    { id: 'desktop', name: '桌面', path: path.join(home, 'Desktop'), kind: 'desktop' },
    { id: 'documents', name: '文档', path: path.join(home, 'Documents'), kind: 'documents' },
    { id: 'downloads', name: '下载', path: path.join(home, 'Downloads'), kind: 'downloads' },
    { id: 'pictures', name: '图片', path: path.join(home, 'Pictures'), kind: 'pictures' },
    { id: 'videos', name: '视频', path: path.join(home, 'Videos'), kind: 'videos' },
    { id: 'music', name: '音乐', path: path.join(home, 'Music'), kind: 'music' },
  ]

  const result: QuickFolder[] = []
  const seen = new Set<string>()

  const standardChecks = await Promise.all(
    candidates.map(async item => ({
      item,
      ok: await isAccessibleDir(item.path),
    })),
  )

  for (const { item, ok } of standardChecks) {
    if (!ok) continue
    const normalized = normalizeBrowsePath(item.path)
    seen.add(normalized.toLowerCase())
    result.push({
      id: item.id,
      name: item.name,
      path: normalized,
      kind: item.kind,
      pinned: false,
    })
  }

  for (const rawPin of pinnedPaths) {
    const normalized = normalizeBrowsePath(rawPin)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    if (!(await isAccessibleDir(normalized))) continue
    seen.add(key)
    const parsed = path.parse(normalized)
    const baseName = path.basename(normalized) || parsed.root || normalized
    result.push({
      id: `pin:${normalized}`,
      name: baseName,
      path: normalized,
      kind: 'pinned',
      pinned: true,
    })
  }

  return result
}
