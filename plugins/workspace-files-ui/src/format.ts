import {
  compareNaturalName,
  groupItemsByCategory,
  groupItemsByNameInitial,
  groupItemsByTime,
} from '@folio/base-collection-ui/client'
import { TAG_COLOR_PALETTE } from '@folio/base-metadata-ui/client'
import { categoryLabel, formatBytes, formatDateTime } from '@folio/base-ui-kit/client'
import type {
  CategoryFilter,
  DirChildGroup,
  FileEntry,
  FileGroup,
  FileMetaRecord,
  GroupBy,
  SortBy,
  SortDir,
} from './types.js'

export { TAG_COLOR_PALETTE, categoryLabel, formatBytes, formatDateTime }

export function toPathKey(filePath: string): string {
  const trimmed = filePath.trim()
  if (!trimmed) return ''
  return trimmed.replace(/[/\\]+$/, (m, offset) => (offset <= 2 ? m : '')).toLowerCase()
}

export function getParentDirLabel(filePath: string): {
  readonly parentPath: string
  readonly parentName: string
} {
  const normalized = filePath.trim()
  const sepIdx = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  if (sepIdx <= 0) {
    return { parentPath: normalized, parentName: normalized || '根目录' }
  }
  let parentPath = normalized.slice(0, sepIdx)
  if (/^[a-zA-Z]:$/.test(parentPath)) {
    parentPath = `${parentPath}\\`
  }
  const parentSep = Math.max(parentPath.lastIndexOf('\\'), parentPath.lastIndexOf('/'))
  const parentName =
    parentSep >= 0 && parentPath.slice(parentSep + 1)
      ? parentPath.slice(parentSep + 1)
      : parentPath
  return { parentPath, parentName }
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

export function buildDownloadUrl(entry: FileEntry): string {
  return `/lf/files/download?path=${encodeURIComponent(entry.path)}&v=${Math.trunc(entry.mtimeMs)}`
}

export function filterEntries(
  entries: readonly FileEntry[],
  query: string,
  categoryFilter: CategoryFilter,
  metadataMap?: Readonly<Record<string, FileMetaRecord>>,
  minRating = 0,
): FileEntry[] {
  const q = query.trim().toLowerCase()
  return entries.filter(entry => {
    if (categoryFilter !== 'all' && entry.category !== categoryFilter) {
      return false
    }
    if (q && !entry.name.toLowerCase().includes(q)) {
      return false
    }
    if (minRating > 0) {
      const rating = metadataMap?.[toPathKey(entry.path)]?.rating ?? 0
      if (rating < minRating) return false
    }
    return true
  })
}

export function sortEntries(
  entries: readonly FileEntry[],
  sortBy: SortBy,
  sortDir: SortDir,
  foldersFirst = true,
  metadataMap?: Readonly<Record<string, FileMetaRecord>>,
): FileEntry[] {
  const dirFactor = sortDir === 'asc' ? 1 : -1
  return [...entries].sort((a, b) => {
    if (foldersFirst && a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1
    }
    let cmp = 0
    if (sortBy === 'name') {
      cmp = compareNaturalName(a.name, b.name)
    } else if (sortBy === 'mtime') {
      cmp = a.mtimeMs - b.mtimeMs
    } else if (sortBy === 'size') {
      cmp = a.size - b.size
    } else if (sortBy === 'type') {
      cmp = a.category.localeCompare(b.category) || a.ext.localeCompare(b.ext)
    } else if (sortBy === 'rating') {
      const ra = metadataMap?.[toPathKey(a.path)]?.rating ?? 0
      const rb = metadataMap?.[toPathKey(b.path)]?.rating ?? 0
      cmp = ra - rb
    }
    if (cmp !== 0) return cmp * dirFactor
    return compareNaturalName(a.name, b.name)
  })
}

/** Legacy `parent` (父子文件夹) still maps to the shared `folder` grouping. */
function normalizeGroupBy(groupBy: GroupBy | 'parent'): GroupBy {
  return groupBy === 'parent' ? 'folder' : groupBy
}

export function groupEntries(
  entries: readonly FileEntry[],
  groupBy: GroupBy | 'parent',
  childGroups: readonly DirChildGroup[],
  sortBy: SortBy,
  sortDir: SortDir,
  filterQuery: string,
  categoryFilter: CategoryFilter,
  now = new Date(),
  metadataMap?: Readonly<Record<string, FileMetaRecord>>,
  minRating = 0,
  mode: 'directory' | 'tag' = 'directory',
): FileGroup[] {
  const effectiveGroupBy = normalizeGroupBy(groupBy)
  const hasFilter = Boolean(filterQuery.trim()) || categoryFilter !== 'all' || minRating > 0

  if (effectiveGroupBy === 'folder') {
    if (mode === 'tag') {
      const filtered = filterEntries(entries, filterQuery, categoryFilter, metadataMap, minRating)
      const byParent = new Map<string, { folderName: string; folderPath: string; items: FileEntry[] }>()
      for (const entry of filtered) {
        const { parentPath, parentName } = getParentDirLabel(entry.path)
        const key = parentPath.toLowerCase()
        const existing = byParent.get(key)
        if (existing) {
          existing.items.push(entry)
        } else {
          byParent.set(key, { folderName: parentName, folderPath: parentPath, items: [entry] })
        }
      }
      return Array.from(byParent.values())
        .sort((a, b) => compareNaturalName(a.folderName, b.folderName))
        .map(g => {
          const sorted = sortEntries(g.items, sortBy, sortDir, true, metadataMap)
          return {
            key: `parent:${g.folderPath}`,
            title: g.folderName,
            folderPath: g.folderPath,
            entries: sorted,
            totalCount: sorted.length,
            truncated: false,
            isSubfolder: true,
          }
        })
    }

    const groups: FileGroup[] = []
    const directFiles = sortEntries(
      filterEntries(
        entries.filter(entry => !entry.isDir),
        filterQuery,
        categoryFilter,
        metadataMap,
        minRating,
      ),
      sortBy,
      sortDir,
      false,
      metadataMap,
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
        filterEntries(cg.entries, filterQuery, categoryFilter, metadataMap, minRating),
        sortBy,
        sortDir,
        true,
        metadataMap,
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

  const filtered = filterEntries(entries, filterQuery, categoryFilter, metadataMap, minRating)
  if (filtered.length === 0) return []

  if (effectiveGroupBy === 'none') {
    const sorted = sortEntries(filtered, sortBy, sortDir, true, metadataMap)
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

  if (effectiveGroupBy === 'type') {
    return groupItemsByCategory(filtered, entry => entry.category).map(bucket => {
      const sorted = sortEntries(bucket.items, sortBy, sortDir, false, metadataMap)
      return {
        key: bucket.key,
        title: bucket.title,
        entries: sorted,
        totalCount: sorted.length,
        truncated: false,
        isSubfolder: false,
      }
    })
  }

  const buckets =
    effectiveGroupBy === 'time'
      ? groupItemsByTime(filtered, entry => entry.mtimeMs, now)
      : groupItemsByNameInitial(filtered, entry => entry.name)

  return buckets.map(bucket => {
    const sorted = sortEntries(bucket.items, sortBy, sortDir, true, metadataMap)
    return {
      key: bucket.key,
      title: bucket.title,
      entries: sorted,
      totalCount: sorted.length,
      truncated: false,
      isSubfolder: false,
    }
  })
}
