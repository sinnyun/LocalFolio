import type { FileCategory, ProjectFileEntry, ProjectFolderGroup, SortMode } from './types.js'

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let val = bytes
  let idx = 0
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024
    idx += 1
  }
  const digits = idx === 0 ? 0 : val >= 100 ? 0 : val >= 10 ? 1 : 2
  return `${val.toFixed(digits)} ${units[idx]}`
}

export function formatDateTime(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return '—'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function categoryLabel(category: FileCategory): string {
  switch (category) {
    case 'image':
      return '图片'
    case 'video':
      return '视频'
    case 'audio':
      return '音频'
    case 'document':
      return '文档'
    case 'design':
      return '设计工程'
    case 'code':
      return '代码配置'
    case 'archive':
      return '压缩包'
    default:
      return '其他'
  }
}

export function buildProjectThumbUrl(
  projectId: string,
  relPath: string,
  thumbKey: string,
): string {
  const params = new URLSearchParams({
    projectId,
    relPath,
    tk: thumbKey,
  })
  return `/lf/projects/thumb?${params.toString()}`
}

export function buildProjectCoverUrl(
  projectId: string,
  coverThumbKey: string | null | undefined,
): string {
  const params = new URLSearchParams({
    projectId,
    kind: 'cover',
    v: coverThumbKey || 'cover',
  })
  return `/lf/projects/thumb?${params.toString()}`
}

export function buildProjectMediaUrl(projectId: string, relPath: string): string {
  const params = new URLSearchParams({
    projectId,
    relPath,
  })
  return `/lf/projects/media?${params.toString()}`
}

export function sortFiles(files: readonly ProjectFileEntry[], mode: SortMode): ProjectFileEntry[] {
  const copy = [...files]
  copy.sort((a, b) => {
    if (mode === 'size') return b.size - a.size || a.name.localeCompare(b.name)
    if (mode === 'mtime') return b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name)
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
  return copy
}

export function filterAndSortGroups(
  groups: readonly ProjectFolderGroup[],
  query: string,
  categoryFilter: string,
  sortMode: SortMode,
): ProjectFolderGroup[] {
  const q = query.trim().toLowerCase()
  const filtered: ProjectFolderGroup[] = []

  for (const group of groups) {
    const files = group.files.filter(f => {
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false
      if (q && !f.name.toLowerCase().includes(q) && !group.name.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
    if (files.length === 0) continue
    const sorted = sortFiles(files, sortMode)
    filtered.push({
      ...group,
      fileCount: sorted.length,
      totalBytes: sorted.reduce((acc, f) => acc + f.size, 0),
      files: sorted,
    })
  }
  return filtered
}
