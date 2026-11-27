import {
  compareNaturalName,
  groupItemsByCategory,
  groupItemsByNameInitial,
  groupItemsByTime,
} from '@folio/base-collection-ui/client'
import { categoryLabel, formatBytes, formatDateTime } from '@folio/base-ui-kit/client'
import type {
  CategoryFilter,
  FileGroupBy,
  FileSortKey,
  ProjectFileEntry,
  ProjectFolderGroup,
  ProjectSummary,
  SortDir,
  SortMode,
} from './types.js'

export { categoryLabel, formatBytes, formatDateTime }

export function buildProjectThumbUrl(
  projectId: string,
  relPath: string,
  thumbKey: string,
  revision?: string,
): string {
  const params = new URLSearchParams({
    projectId,
    relPath,
    tk: thumbKey,
  })
  if (revision) params.set('rev', revision)
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

export function sortProjectFiles(
  files: readonly ProjectFileEntry[],
  key: FileSortKey,
  dir: SortDir = 'asc',
): ProjectFileEntry[] {
  const factor = dir === 'asc' ? 1 : -1
  const copy = [...files]
  copy.sort((a, b) => {
    let cmp = 0
    if (key === 'mtime') cmp = a.mtimeMs - b.mtimeMs
    else if (key === 'size') cmp = a.size - b.size
    else if (key === 'type') {
      cmp = a.category.localeCompare(b.category) || a.ext.localeCompare(b.ext)
    } else {
      cmp = compareNaturalName(a.name, b.name)
    }
    if (cmp !== 0) return cmp * factor
    return compareNaturalName(a.name, b.name)
  })
  return copy
}

export function matchProject(
  project: ProjectSummary,
  query: string,
  tagFilter: string | null,
  onlyChanged: boolean,
): boolean {
  if (onlyChanged && !project.hasChanges) return false
  if (tagFilter && !project.tags.includes(tagFilter)) return false
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay =
    `${project.name} ${project.projectType} ${project.summary} ${project.tags.join(' ')}`.toLowerCase()
  return hay.includes(q)
}

export function filterProjects(
  projects: readonly ProjectSummary[],
  query: string,
  tagFilter: string | null,
  onlyChanged: boolean,
): ProjectSummary[] {
  return projects.filter(project => matchProject(project, query, tagFilter, onlyChanged))
}

export function sortProjects(
  projects: readonly ProjectSummary[],
  mode: SortMode,
): ProjectSummary[] {
  const copy = [...projects]
  copy.sort((a, b) => {
    if (mode === 'size') return b.totalBytes - a.totalBytes || compareNaturalName(a.name, b.name)
    if (mode === 'mtime') {
      return b.lastScannedAt - a.lastScannedAt || compareNaturalName(a.name, b.name)
    }
    return compareNaturalName(a.name, b.name)
  })
  return copy
}

function matchesProjectFile(
  file: ProjectFileEntry,
  folderName: string,
  query: string,
  categoryFilter: CategoryFilter,
): boolean {
  if (categoryFilter !== 'all' && file.category !== categoryFilter) return false
  if (!query) return true
  return (
    file.name.toLowerCase().includes(query) || folderName.toLowerCase().includes(query)
  )
}

function withFiles(
  group: Pick<ProjectFolderGroup, 'relPath' | 'name' | 'depth'>,
  files: readonly ProjectFileEntry[],
): ProjectFolderGroup {
  return {
    ...group,
    fileCount: files.length,
    totalBytes: files.reduce((acc, file) => acc + file.size, 0),
    files,
  }
}

export interface BuildProjectFileGroupsOptions {
  readonly groupBy: FileGroupBy
  readonly query: string
  readonly categoryFilter: CategoryFilter
  readonly sortKey: FileSortKey
  readonly sortDir: SortDir
  readonly now?: Date
}

/**
 * Turns the manifest's folder groups into the grouped collection every view
 * mode consumes: `folder` keeps the real directory structure, the rest flatten
 * and bucket through the shared grouping helpers.
 */
export function buildProjectFileGroups(
  groups: readonly ProjectFolderGroup[],
  options: BuildProjectFileGroupsOptions,
): ProjectFolderGroup[] {
  const query = options.query.trim().toLowerCase()
  const { categoryFilter, sortKey, sortDir } = options

  if (options.groupBy === 'folder') {
    const result: ProjectFolderGroup[] = []
    for (const group of groups) {
      const files = group.files.filter(file =>
        matchesProjectFile(file, group.name, query, categoryFilter),
      )
      if (files.length === 0) continue
      result.push(withFiles(group, sortProjectFiles(files, sortKey, sortDir)))
    }
    return result
  }

  const flat: ProjectFileEntry[] = []
  for (const group of groups) {
    for (const file of group.files) {
      if (matchesProjectFile(file, group.name, query, categoryFilter)) flat.push(file)
    }
  }
  if (flat.length === 0) return []

  if (options.groupBy === 'none') {
    return [
      withFiles(
        { relPath: 'all', name: '', depth: 0 },
        sortProjectFiles(flat, sortKey, sortDir),
      ),
    ]
  }

  const buckets =
    options.groupBy === 'time'
      ? groupItemsByTime(flat, file => file.mtimeMs, options.now ?? new Date())
      : options.groupBy === 'type'
        ? groupItemsByCategory(flat, file => file.category)
        : groupItemsByNameInitial(flat, file => file.name)

  return buckets.map(bucket =>
    withFiles(
      { relPath: bucket.key, name: bucket.title, depth: 0 },
      sortProjectFiles(bucket.items, sortKey, sortDir),
    ),
  )
}
