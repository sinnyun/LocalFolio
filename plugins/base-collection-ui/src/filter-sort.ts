export type CollectionSortDirection = 'asc' | 'desc'

export function compareNaturalName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export interface FilterItemsOptions<TItem> {
  readonly query?: string
  readonly getName?: (item: TItem) => string
  readonly category?: string
  readonly getCategory?: (item: TItem) => string
  readonly predicate?: (item: TItem) => boolean
}

export function filterItems<TItem>(
  items: readonly TItem[],
  options: FilterItemsOptions<TItem> = {},
): TItem[] {
  const { query, getName, category, getCategory, predicate } = options
  const normalizedQuery = query?.trim().toLowerCase() ?? ''
  const hasCategoryFilter = Boolean(category && category !== 'all')

  return items.filter(item => {
    if (hasCategoryFilter && getCategory && getCategory(item) !== category) {
      return false
    }
    if (normalizedQuery && getName && !getName(item).toLowerCase().includes(normalizedQuery)) {
      return false
    }
    if (predicate && !predicate(item)) {
      return false
    }
    return true
  })
}

export interface SortByNaturalNameOptions<TItem> {
  readonly getName: (item: TItem) => string
  readonly direction?: CollectionSortDirection
  readonly isFolder?: (item: TItem) => boolean
  readonly foldersFirst?: boolean
}

export function sortByNaturalName<TItem>(
  items: readonly TItem[],
  options: SortByNaturalNameOptions<TItem>,
): TItem[] {
  const {
    getName,
    direction = 'asc',
    isFolder,
    foldersFirst = false,
  } = options
  const factor = direction === 'asc' ? 1 : -1

  return [...items].sort((a, b) => {
    if (foldersFirst && isFolder) {
      const aFolder = isFolder(a)
      const bFolder = isFolder(b)
      if (aFolder !== bFolder) return aFolder ? -1 : 1
    }
    return compareNaturalName(getName(a), getName(b)) * factor
  })
}

export interface FilterAndSortItemsOptions<TItem> extends FilterItemsOptions<TItem> {
  readonly getName: (item: TItem) => string
  readonly direction?: CollectionSortDirection
  readonly isFolder?: (item: TItem) => boolean
  readonly foldersFirst?: boolean
  readonly compare?: (a: TItem, b: TItem) => number
}

export function filterAndSortItems<TItem>(
  items: readonly TItem[],
  options: FilterAndSortItemsOptions<TItem>,
): TItem[] {
  const {
    query,
    getName,
    category,
    getCategory,
    predicate,
    direction = 'asc',
    isFolder,
    foldersFirst = false,
    compare,
  } = options

  const filtered = filterItems(items, {
    query,
    getName,
    category,
    getCategory,
    predicate,
  })

  if (!compare) {
    return sortByNaturalName(filtered, {
      getName,
      direction,
      isFolder,
      foldersFirst,
    })
  }

  const factor = direction === 'asc' ? 1 : -1
  return [...filtered].sort((a, b) => {
    if (foldersFirst && isFolder) {
      const aFolder = isFolder(a)
      const bFolder = isFolder(b)
      if (aFolder !== bFolder) return aFolder ? -1 : 1
    }
    const cmp = compare(a, b)
    if (cmp !== 0) return cmp * factor
    return compareNaturalName(getName(a), getName(b))
  })
}

export interface FilterAndSortGroupsOptions<TGroup, TItem> {
  readonly getItems: (group: TGroup) => readonly TItem[]
  readonly withItems: (group: TGroup, items: readonly TItem[]) => TGroup
  readonly itemOptions: FilterAndSortItemsOptions<TItem>
  readonly keepEmptyGroups?: boolean
  readonly compareGroups?: (a: TGroup, b: TGroup) => number
}

export function filterAndSortGroups<TGroup, TItem>(
  groups: readonly TGroup[],
  options: FilterAndSortGroupsOptions<TGroup, TItem>,
): TGroup[] {
  const {
    getItems,
    withItems,
    itemOptions,
    keepEmptyGroups = false,
    compareGroups,
  } = options

  const nextGroups: TGroup[] = []
  for (const group of groups) {
    const nextItems = filterAndSortItems(getItems(group), itemOptions)
    if (!keepEmptyGroups && nextItems.length === 0) continue
    nextGroups.push(withItems(group, nextItems))
  }

  if (compareGroups) {
    nextGroups.sort(compareGroups)
  }

  return nextGroups
}
