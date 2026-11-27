import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { FolioError, type FolioFsService } from '@folio/base-contract'
import { normalizeBrowsePath } from './classify.js'
import type { DriveInfo, QuickFolder } from './types.js'

export async function listDrives(fsService?: FolioFsService): Promise<DriveInfo[]> {
  if (!fsService) {
    throw new FolioError('fs_unavailable', '基础文件系统服务未就绪', 503)
  }
  const baseDrives = await fsService.listDrives()
  return baseDrives.map(d => ({
    id: d.id,
    name: d.name,
    path: d.path,
    label: d.label,
    kind: d.id === 'root' ? 'root' : d.kind,
    totalBytes: d.totalBytes,
    freeBytes: d.freeBytes,
    usedBytes: Math.max(0, d.totalBytes - d.freeBytes),
  }))
}

async function isAccessibleDir(dirPath: string): Promise<boolean> {
  try {
    const st = await fsp.stat(dirPath)
    return st.isDirectory()
  } catch {
    return false
  }
}

export async function listQuickFolders(
  pinnedPaths: readonly string[],
  fsService?: FolioFsService,
): Promise<QuickFolder[]> {
  const home = normalizeBrowsePath(os.homedir())
  const baseFolders = fsService ? await fsService.listQuickFolders() : []
  const result: QuickFolder[] = []
  const seen = new Set<string>()

  for (const item of baseFolders) {
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

  const extraCandidates: Array<{
    id: string
    name: string
    path: string
    kind: QuickFolder['kind']
  }> = [
    ...(baseFolders.length === 0
      ? [
          { id: 'home', name: '主目录', path: home, kind: 'home' as const },
          { id: 'desktop', name: '桌面', path: path.join(home, 'Desktop'), kind: 'desktop' as const },
          { id: 'documents', name: '文档', path: path.join(home, 'Documents'), kind: 'documents' as const },
          { id: 'downloads', name: '下载', path: path.join(home, 'Downloads'), kind: 'downloads' as const },
          { id: 'pictures', name: '图片', path: path.join(home, 'Pictures'), kind: 'pictures' as const },
        ]
      : []),
    { id: 'videos', name: '视频', path: path.join(home, 'Videos'), kind: 'videos' },
    { id: 'music', name: '音乐', path: path.join(home, 'Music'), kind: 'music' },
  ]

  const extraChecks = await Promise.all(
    extraCandidates.map(async item => ({
      item,
      ok: await isAccessibleDir(item.path),
    })),
  )

  for (const { item, ok } of extraChecks) {
    if (!ok) continue
    const normalized = normalizeBrowsePath(item.path)
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
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
