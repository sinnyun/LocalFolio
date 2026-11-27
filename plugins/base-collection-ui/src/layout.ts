/**
 * Geometry for the four collection view modes:
 *
 * - `grid`      uniform columns and rows (the classic thumbnail wall)
 * - `waterfall` masonry columns; tile height follows the thumbnail aspect ratio
 * - `equal`     justified rows; every row has one height and tiles keep their ratio
 * - `list`      a single dense column
 *
 * The result is a flat, absolutely positioned row list so one virtualization
 * pass covers every mode and grouped headers stay sticky-able.
 */

export type CollectionViewMode = 'grid' | 'waterfall' | 'equal' | 'list'

export interface CollectionHeaderRow<TGroup> {
  readonly kind: 'header'
  readonly key: string
  readonly groupKey: string
  readonly group: TGroup
  readonly collapsed: boolean
  readonly y: number
  readonly height: number
}

export interface CollectionItemRow<TGroup, TItem> {
  readonly kind: 'item'
  readonly key: string
  readonly groupKey: string
  readonly group: TGroup
  readonly item: TItem
  readonly index: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export type CollectionRow<TGroup, TItem> =
  | CollectionHeaderRow<TGroup>
  | CollectionItemRow<TGroup, TItem>

export interface CollectionGroupOffset<TGroup> {
  readonly groupKey: string
  readonly group: TGroup
  readonly top: number
  readonly hasHeader: boolean
}

export interface CollectionLayoutOptions<TGroup, TItem> {
  readonly groups: readonly TGroup[]
  readonly getGroupKey: (group: TGroup) => string
  readonly getGroupItems: (group: TGroup) => readonly TItem[]
  readonly getItemKey: (item: TItem, group: TGroup, index: number) => string
  readonly collapsedKeys: ReadonlySet<string>
  readonly viewMode: CollectionViewMode
  readonly containerWidth: number
  readonly cardSize: number
  readonly gapPx?: number
  readonly horizontalPaddingPx?: number
  readonly headerHeight?: number
  readonly groupSpacingPx?: number
  readonly metaHeight?: number
  readonly listRowHeight?: number
  readonly hasHeader?: (group: TGroup) => boolean
  readonly getAspectRatio?: (item: TItem) => number
}

export interface CollectionLayoutResult<TGroup, TItem> {
  readonly columnCount: number
  readonly totalHeight: number
  readonly rows: readonly CollectionRow<TGroup, TItem>[]
  readonly groupOffsets: readonly CollectionGroupOffset<TGroup>[]
}

const MIN_ASPECT = 0.5
const MAX_ASPECT = 3

function clampAspect(ratio: number | null | undefined): number {
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return 1
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, ratio))
}

function columnCountFor(usable: number, cardSize: number, gap: number): number {
  const minWidth = Math.max(1, cardSize)
  return Math.max(1, Math.floor((Math.max(minWidth, usable) + gap) / (minWidth + gap)))
}

export function resolveCollectionColumnCount(
  containerWidth: number,
  cardSize: number,
  gapPx = 12,
  horizontalPaddingPx = 32,
): number {
  const usable = Math.max(1, containerWidth - horizontalPaddingPx)
  return columnCountFor(usable, cardSize, gapPx)
}

export function layoutCollection<TGroup, TItem>(
  options: CollectionLayoutOptions<TGroup, TItem>,
): CollectionLayoutResult<TGroup, TItem> {
  const {
    groups,
    getGroupKey,
    getGroupItems,
    getItemKey,
    collapsedKeys,
    viewMode,
    containerWidth,
    cardSize,
    gapPx = 12,
    horizontalPaddingPx = 32,
    headerHeight = 38,
    groupSpacingPx = 8,
    metaHeight = 56,
    listRowHeight = 36,
    hasHeader,
    getAspectRatio,
  } = options

  const usable = Math.max(1, containerWidth - horizontalPaddingPx)
  const columnCount = viewMode === 'list' ? 1 : columnCountFor(usable, cardSize, gapPx)
  const tileWidth =
    viewMode === 'list'
      ? usable
      : Math.max(1, (usable - gapPx * (columnCount - 1)) / columnCount)
  const gridRowHeight = Math.max(1, Math.round(cardSize * 1.24))

  const rows: CollectionRow<TGroup, TItem>[] = []
  const groupOffsets: CollectionGroupOffset<TGroup>[] = []
  let y = 0

  for (const group of groups) {
    const groupKey = getGroupKey(group)
    const items = getGroupItems(group)
    const collapsed = collapsedKeys.has(groupKey)
    const showHeader = hasHeader ? hasHeader(group) : true
    const groupTop = y
    groupOffsets.push({ groupKey, group, top: groupTop, hasHeader: showHeader })

    if (showHeader) {
      rows.push({
        kind: 'header',
        key: `header:${groupKey}`,
        groupKey,
        group,
        collapsed,
        y,
        height: headerHeight,
      })
      y += headerHeight
    }

    if (!collapsed && items.length > 0) {
      if (viewMode === 'grid' || viewMode === 'list') {
        const rowHeight = viewMode === 'list' ? listRowHeight : gridRowHeight
        // Grid rows keep the shared gap vertically as well as horizontally;
        // list rows stay dense so the table reads as one block.
        const rowPitch = viewMode === 'list' ? rowHeight : rowHeight + gapPx
        const perRow = viewMode === 'list' ? 1 : columnCount
        const itemTop = y
        for (let i = 0; i < items.length; i += 1) {
          const item = items[i]!
          const rowIndex = Math.floor(i / perRow)
          const columnIndex = i % perRow
          rows.push({
            kind: 'item',
            key: getItemKey(item, group, i),
            groupKey,
            group,
            item,
            index: i,
            x: viewMode === 'list' ? 0 : columnIndex * (tileWidth + gapPx),
            y: itemTop + rowIndex * rowPitch,
            width: viewMode === 'list' ? usable : tileWidth,
            height: rowHeight,
          })
        }
        y =
          itemTop +
          Math.ceil(items.length / perRow) * rowPitch -
          (viewMode === 'list' ? 0 : gapPx)
      } else if (viewMode === 'waterfall') {
        const itemTop = y
        const columnHeights = new Array<number>(columnCount).fill(0)
        for (let i = 0; i < items.length; i += 1) {
          const item = items[i]!
          let targetColumn = 0
          for (let c = 1; c < columnCount; c += 1) {
            if (columnHeights[c]! < columnHeights[targetColumn]!) targetColumn = c
          }
          const aspect = clampAspect(getAspectRatio?.(item))
          const thumbHeight = Math.max(48, Math.round(tileWidth / aspect))
          const height = thumbHeight + metaHeight
          rows.push({
            kind: 'item',
            key: getItemKey(item, group, i),
            groupKey,
            group,
            item,
            index: i,
            x: targetColumn * (tileWidth + gapPx),
            y: itemTop + columnHeights[targetColumn]!,
            width: tileWidth,
            height,
          })
          columnHeights[targetColumn] = columnHeights[targetColumn]! + height + gapPx
        }
        const tallest = Math.max(0, ...columnHeights)
        y = itemTop + Math.max(0, tallest - gapPx)
      } else {
        // equal: justify rows so every row shares one height and fills the width.
        const itemTop = y
        const targetHeight = Math.max(72, Math.round(cardSize * 0.88))
        let pending: Array<{ item: TItem; index: number; aspect: number }> = []
        let aspectSum = 0
        let rowTop = itemTop

        const flush = (): void => {
          if (pending.length === 0) return
          const count = pending.length
          const avail = Math.max(1, usable - gapPx * (count - 1))
          let height = avail / aspectSum
          if (count === 1) {
            height = Math.min(height, targetHeight * 1.5)
          }
          height = Math.max(56, Math.min(height, targetHeight * 2.2))
          let x = 0
          pending.forEach((entry, idx) => {
            const last = idx === count - 1
            const width = last ? Math.max(1, usable - x) : Math.max(48, entry.aspect * height)
            rows.push({
              kind: 'item',
              key: getItemKey(entry.item, group, entry.index),
              groupKey,
              group,
              item: entry.item,
              index: entry.index,
              x,
              y: rowTop,
              width,
              height: height + metaHeight,
            })
            x += width + gapPx
          })
          rowTop += height + metaHeight + gapPx
          pending = []
          aspectSum = 0
        }

        for (let i = 0; i < items.length; i += 1) {
          const item = items[i]!
          const aspect = clampAspect(getAspectRatio?.(item))
          pending.push({ item, index: i, aspect })
          aspectSum += aspect
          const estimated = aspectSum * targetHeight + gapPx * (pending.length - 1)
          if (estimated >= usable) flush()
        }
        flush()
        y = Math.max(itemTop, rowTop - gapPx)
      }
    }

    y += groupSpacingPx
  }

  return {
    columnCount,
    totalHeight: Math.max(0, y),
    rows,
    groupOffsets,
  }
}
