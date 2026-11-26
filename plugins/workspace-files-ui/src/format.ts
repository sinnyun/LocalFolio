import type {
  CategoryFilter,
  DirChildGroup,
  FileCategory,
  FileEntry,
  FileGroup,
  GroupBy,
  SortBy,
  SortDir,
} from './types.js'

const CATEGORY_LABELS: Readonly<Record<FileCategory, string>> = {
  folder: '文件夹',
  image: '图片',
  video: '视频',
  audio: '音频',
  document: '文档',
  code: '代码',
  archive: '压缩包',
  other: '其他',
}

const CATEGORY_ORDER: readonly FileCategory[] = [
  'folder',
  'image',
  'video',
  'audio',
  'document',
  'code',
  'archive',
  'other',
]

export function categoryLabel(category: FileCategory): string {
  return CATEGORY_LABELS[category]
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const
  let value = bytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  const decimals = idx === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2
  const formatted = decimals === 0 ? String(Math.round(value)) : String(Number(value.toFixed(decimals)))
  return `${formatted} ${units[idx]}`
}

export function formatDateTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function snapThumbBucket(gridSize: number): number {
  const target = Math.round(gridSize * 1.25)
  if (target <= 96) return 96
  if (target <= 160) return 160
  if (target <= 256) return 256
  return 512
}

export function buildThumbUrl(entry: FileEntry, size = 160): string {
  return `/lf/files/thumb?path=${encodeURIComponent(entry.path)}&size=${size}&v=${Math.trunc(entry.mtimeMs)}`
}

export function buildMediaUrl(entry: FileEntry): string {
  return `/lf/files/media?path=${encodeURIComponent(entry.path)}&v=${Math.trunc(entry.mtimeMs)}`
}

export function filterEntries(
  entries: readonly FileEntry[],
  query: string,
  categoryFilter: CategoryFilter,
): FileEntry[] {
  const q = query.trim().toLowerCase()
  return entries.filter(entry => {
    if (categoryFilter !== 'all' && entry.category !== categoryFilter) {
      return false
    }
    if (q && !entry.name.toLowerCase().includes(q)) {
      return false
    }
    return true
  })
}

export function sortEntries(
  entries: readonly FileEntry[],
  sortBy: SortBy,
  sortDir: SortDir,
  foldersFirst = true,
): FileEntry[] {
  const dirFactor = sortDir === 'asc' ? 1 : -1
  return [...entries].sort((a, b) => {
    if (foldersFirst && a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1
    }
    let cmp = 0
    if (sortBy === 'name') {
      cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    } else if (sortBy === 'mtime') {
      cmp = a.mtimeMs - b.mtimeMs
    } else if (sortBy === 'size') {
      cmp = a.size - b.size
    } else if (sortBy === 'type') {
      cmp = a.category.localeCompare(b.category) || a.ext.localeCompare(b.ext)
    }
    if (cmp !== 0) return cmp * dirFactor
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function resolveTimeBucket(ms: number, now: Date): { key: string; title: string; order: number } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayMs = 86_400_000
  if (ms >= startOfToday) return { key: 'today', title: '今天', order: 0 }
  if (ms >= startOfToday - dayMs) return { key: 'yesterday', title: '昨天', order: 1 }
  if (ms >= startOfToday - 7 * dayMs) return { key: 'week', title: '本周', order: 2 }
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  if (ms >= startOfMonth) return { key: 'month', title: '本月', order: 3 }
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime()
  if (ms >= startOfYear) return { key: 'year', title: '今年', order: 4 }
  return { key: 'earlier', title: '更早', order: 5 }
}

function resolveNameBucket(name: string): { key: string; title: string; order: number } {
  const first = name.trim().charAt(0).toUpperCase()
  if (!first) return { key: 'other', title: '其他', order: 99 }
  if (first >= '0' && first <= '9') return { key: '0-9', title: '0-9', order: 0 }
  if (first >= 'A' && first <= 'Z') {
    return { key: first, title: first, order: 1 + (first.charCodeAt(0) - 65) }
  }
  return { key: 'symbol', title: '中文与符号', order: 50 }
}

export function groupEntries(
  entries: readonly FileEntry[],
  groupBy: GroupBy,
  childGroups: readonly DirChildGroup[],
  sortBy: SortBy,
  sortDir: SortDir,
  filterQuery: string,
  categoryFilter: CategoryFilter,
  now = new Date(),
): FileGroup[] {
  const hasFilter = Boolean(filterQuery.trim()) || categoryFilter !== 'all'

  if (groupBy === 'parent') {
    const groups: FileGroup[] = []
    const directFiles = sortEntries(
      filterEntries(
        entries.filter(entry => !entry.isDir),
        filterQuery,
        categoryFilter,
      ),
      sortBy,
      sortDir,
      false,
    )
    if (directFiles.length > 0) {
      groups.push({
        key: 'parent:current',
        title: '当前目录文件',
        entries: directFiles,
        totalCount: directFiles.length,
        truncated: false,
        isSubfolder: false,
      })
    }

    for (const cg of childGroups) {
      const matched = sortEntries(
        filterEntries(cg.entries, filterQuery, categoryFilter),
        sortBy,
        sortDir,
        true,
      )
      if (hasFilter && matched.length === 0) continue
      groups.push({
        key: `parent:${cg.folderPath}`,
        title: cg.folderName,
        folderPath: cg.folderPath,
        entries: matched,
        totalCount: hasFilter ? matched.length : cg.totalChildren,
        truncated: !hasFilter && cg.truncated,
        isSubfolder: true,
      })
    }
    return groups
  }

  const filtered = filterEntries(entries, filterQuery, categoryFilter)
  if (filtered.length === 0) return []

  if (groupBy === 'none') {
    const sorted = sortEntries(filtered, sortBy, sortDir, true)
    return [
      {
        key: 'all',
        title: '',
        entries: sorted,
        totalCount: sorted.length,
        truncated: false,
        isSubfolder: false,
      },
    ]
  }

  if (groupBy === 'type') {
    const buckets = new Map<FileCategory, FileEntry[]>()
    for (const entry of filtered) {
      const list = buckets.get(entry.category) ?? []
      list.push(entry)
      buckets.set(entry.category, list)
    }
    const groups: FileGroup[] = []
    for (const cat of CATEGORY_ORDER) {
      const list = buckets.get(cat)
      if (!list || list.length === 0) continue
      const sorted = sortEntries(list, sortBy, sortDir, false)
      groups.push({
        key: `type:${cat}`,
        title: categoryLabel(cat),
        entries: sorted,
        totalCount: sorted.length,
        truncated: false,
        isSubfolder: false,
      })
    }
    return groups
  }

  if (groupBy === 'time') {
    const map = new Map<string, { title: string; order: number; items: FileEntry[] }>()
    for (const entry of filtered) {
      const bucket = resolveTimeBucket(entry.mtimeMs, now)
      const existing = map.get(bucket.key)
      if (existing) {
        existing.items.push(entry)
      } else {
        map.set(bucket.key, { title: bucket.title, order: bucket.order, items: [entry] })
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, bucket]) => {
        const sorted = sortEntries(bucket.items, sortBy, sortDir, true)
        return {
          key: `time:${key}`,
          title: bucket.title,
          entries: sorted,
          totalCount: sorted.length,
          truncated: false,
          isSubfolder: false,
        }
      })
  }

  // groupBy === 'name'
  const map = new Map<string, { title: string; order: number; items: FileEntry[] }>()
  for (const entry of filtered) {
    const bucket = resolveNameBucket(entry.name)
    const existing = map.get(bucket.key)
    if (existing) {
      existing.items.push(entry)
    } else {
      map.set(bucket.key, { title: bucket.title, order: bucket.order, items: [entry] })
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, bucket]) => {
      const sorted = sortEntries(bucket.items, sortBy, sortDir, true)
      return {
        key: `name:${key}`,
        title: bucket.title,
        entries: sorted,
        totalCount: sorted.length,
        truncated: false,
        isSubfolder: false,
      }
    })
}
