import { compareNaturalName } from '@folio/base-collection-ui/client'
import { categoryLabel, formatBytes, formatDateTime } from '@folio/base-ui-kit/client'
import type {
  ProjectFileEntry,
  ProjectFolderGroup,
  ProjectSummary,
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

export function sortFiles(files: readonly ProjectFileEntry[], mode: SortMode): ProjectFileEntry[] {
  const copy = [...files]
  copy.sort((a, b) => {
    if (mode === 'size') return b.size - a.size || a.name.localeCompare(b.name)
    if (mode === 'mtime') return b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name)
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
