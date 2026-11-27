/**
 * Grouping buckets shared by every collection surface (file browser, project
 * library, future workspaces). The helpers only bucket items; filtering and
 * sorting stay with the caller because each surface filters on its own fields.
 */

export type CollectionGroupBy = 'none' | 'time' | 'type' | 'name' | 'folder'

export interface CollectionGroupBucket<TItem> {
  readonly key: string
  readonly title: string
  readonly order: number
  readonly items: readonly TItem[]
}

const CATEGORY_ORDER = [
  'folder',
  'image',
  'video',
  'audio',
  'document',
  'design',
  'code',
  'archive',
  'other',
] as const

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  folder: '文件夹',
  image: '图片',
  video: '视频',
  audio: '音频',
  document: '文档',
  design: '设计工程',
  code: '代码',
  archive: '压缩包',
  other: '其他',
}

const DAY_MS = 86_400_000

export function collectionCategoryOrder(): readonly string[] {
  return CATEGORY_ORDER
}

export function collectionCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? CATEGORY_LABELS.other!
}

export interface TimeBucket {
  readonly key: string
  readonly title: string
  readonly order: number
}

export function resolveTimeBucket(ms: number, now: Date = new Date()): TimeBucket {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ms >= startOfToday) return { key: 'today', title: '今天', order: 0 }
  if (ms >= startOfToday - DAY_MS) return { key: 'yesterday', title: '昨天', order: 1 }
  if (ms >= startOfToday - 7 * DAY_MS) return { key: 'week', title: '本周', order: 2 }
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  if (ms >= startOfMonth) return { key: 'month', title: '本月', order: 3 }
  const startOfYear = new Date(now.getFullYear(), 0, 1).getTime()
  if (ms >= startOfYear) return { key: 'year', title: '今年', order: 4 }
  return { key: 'earlier', title: '更早', order: 5 }
}

export interface NameBucket {
  readonly key: string
  readonly title: string
  readonly order: number
}

export function resolveNameBucket(name: string): NameBucket {
  const first = name.trim().charAt(0).toUpperCase()
  if (!first) return { key: 'other', title: '其他', order: 99 }
  if (first >= '0' && first <= '9') return { key: '0-9', title: '0-9', order: 0 }
  if (first >= 'A' && first <= 'Z') {
    return { key: first, title: first, order: 1 + (first.charCodeAt(0) - 65) }
  }
  return { key: 'symbol', title: '中文与符号', order: 50 }
}

function bucketize<TItem>(
  items: readonly TItem[],
  prefix: string,
  resolve: (item: TItem) => { key: string; title: string; order: number },
): CollectionGroupBucket<TItem>[] {
  const map = new Map<string, { title: string; order: number; items: TItem[] }>()
  for (const item of items) {
    const bucket = resolve(item)
    const existing = map.get(bucket.key)
    if (existing) existing.items.push(item)
    else map.set(bucket.key, { title: bucket.title, order: bucket.order, items: [item] })
  }
  return Array.from(map.entries())
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, bucket]) => ({
      key: `${prefix}:${key}`,
      title: bucket.title,
      order: bucket.order,
      items: bucket.items,
    }))
}

export function groupItemsByTime<TItem>(
  items: readonly TItem[],
  getMtimeMs: (item: TItem) => number,
  now: Date = new Date(),
): CollectionGroupBucket<TItem>[] {
  return bucketize(items, 'time', item => resolveTimeBucket(getMtimeMs(item), now))
}

export function groupItemsByCategory<TItem>(
  items: readonly TItem[],
  getCategory: (item: TItem) => string,
  options: {
    readonly getLabel?: (category: string) => string
    readonly order?: readonly string[]
  } = {},
): CollectionGroupBucket<TItem>[] {
  const { getLabel = collectionCategoryLabel, order = CATEGORY_ORDER } = options
  const map = new Map<string, TItem[]>()
  for (const item of items) {
    const category = getCategory(item)
    const list = map.get(category)
    if (list) list.push(item)
    else map.set(category, [item])
  }
  const keys = [...order]
  for (const category of map.keys()) {
    if (!keys.includes(category)) keys.push(category)
  }
  return keys
    .filter(category => (map.get(category)?.length ?? 0) > 0)
    .map(category => ({
      key: `type:${category}`,
      title: getLabel(category),
      order: 0,
      items: map.get(category)!,
    }))
}

export function groupItemsByNameInitial<TItem>(
  items: readonly TItem[],
  getName: (item: TItem) => string,
): CollectionGroupBucket<TItem>[] {
  return bucketize(items, 'name', item => resolveNameBucket(getName(item)))
}

export interface GroupItemsOptions<TItem> {
  readonly groupBy: Exclude<CollectionGroupBy, 'folder'>
  readonly getMtimeMs?: (item: TItem) => number
  readonly getCategory?: (item: TItem) => string
  readonly getName: (item: TItem) => string
  readonly now?: Date
  readonly getCategoryLabel?: (category: string) => string
}

/**
 * Buckets a flat item list for the modes every collection can derive without
 * surface-specific data. `folder` grouping needs real folder metadata, so the
 * caller owns it.
 */
export function groupItems<TItem>(
  items: readonly TItem[],
  options: GroupItemsOptions<TItem>,
): CollectionGroupBucket<TItem>[] {
  const { groupBy, getName } = options
  if (groupBy === 'none') {
    return items.length === 0
      ? []
      : [{ key: 'all', title: '', order: 0, items: [...items] }]
  }
  if (groupBy === 'time') {
    return groupItemsByTime(items, options.getMtimeMs ?? (() => 0), options.now ?? new Date())
  }
  if (groupBy === 'type') {
    return groupItemsByCategory(items, options.getCategory ?? (() => 'other'), {
      getLabel: options.getCategoryLabel,
    })
  }
  return groupItemsByNameInitial(items, getName)
}
