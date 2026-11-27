import * as React from 'react'

export interface VirtualListItem {
  readonly index: number
  readonly top: number
  readonly height: number
}

export interface UseVirtualListOptions {
  readonly count: number
  readonly itemHeight: number
  readonly overscan?: number
  readonly fallbackViewportHeight?: number
  readonly resetKey?: string | number | null
}

export function useVirtualList<TContainer extends HTMLElement = HTMLDivElement>(
  options: UseVirtualListOptions,
): {
  readonly containerRef: React.RefCallback<TContainer>
  readonly totalHeight: number
  readonly visibleItems: readonly VirtualListItem[]
} {
  const {
    count,
    itemHeight,
    overscan = 6,
    fallbackViewportHeight = 640,
    resetKey,
  } = options
  const [containerEl, setContainerEl] = React.useState<TContainer | null>(null)
  const containerRef = React.useCallback((node: TContainer | null) => {
    setContainerEl(node)
  }, [])
  const [scrollTop, setScrollTop] = React.useState(0)
  const [viewportHeight, setViewportHeight] = React.useState(fallbackViewportHeight)

  React.useEffect(() => {
    if (!containerEl) return undefined

    const updateSize = (): void => {
      const h = containerEl.clientHeight
      if (h > 0) setViewportHeight(h)
    }
    const onScroll = (): void => {
      setScrollTop(containerEl.scrollTop)
    }

    updateSize()
    setScrollTop(containerEl.scrollTop)
    containerEl.addEventListener('scroll', onScroll, { passive: true })

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateSize)
      ro.observe(containerEl)
    }

    return () => {
      containerEl.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    }
  }, [containerEl])

  React.useEffect(() => {
    if (resetKey === undefined) return
    if (containerEl) containerEl.scrollTop = 0
    setScrollTop(0)
  }, [resetKey, containerEl])

  const safeItemHeight = Math.max(1, itemHeight)
  const totalHeight = Math.max(0, count) * safeItemHeight

  const visibleItems = React.useMemo(() => {
    if (count <= 0) return []
    const startIdx = Math.max(0, Math.floor(scrollTop / safeItemHeight) - overscan)
    const endIdx = Math.min(
      count - 1,
      Math.ceil((scrollTop + viewportHeight) / safeItemHeight) + overscan,
    )
    const items: VirtualListItem[] = []
    for (let i = startIdx; i <= endIdx; i += 1) {
      items.push({ index: i, top: i * safeItemHeight, height: safeItemHeight })
    }
    return items
  }, [count, safeItemHeight, overscan, scrollTop, viewportHeight])

  return { containerRef, totalHeight, visibleItems }
}

export type VirtualGroupRow<TGroup, TItem> =
  | {
      readonly kind: 'header'
      readonly key: string
      readonly groupKey: string
      readonly group: TGroup
      readonly collapsed: boolean
      readonly top: number
      readonly height: number
    }
  | {
      readonly kind: 'cardRow'
      readonly key: string
      readonly groupKey: string
      readonly group: TGroup
      readonly items: readonly TItem[]
      readonly top: number
      readonly height: number
    }

export interface UseVirtualGroupedGridOptions<TGroup, TItem> {
  readonly groups: readonly TGroup[]
  readonly getGroupKey: (group: TGroup) => string
  readonly getGroupItems: (group: TGroup) => readonly TItem[]
  readonly collapsedKeys: ReadonlySet<string>
  readonly minCardWidth: number
  readonly gapPx?: number
  readonly horizontalPaddingPx?: number
  readonly headerHeight?: number
  readonly rowHeight: number
  readonly groupSpacingPx?: number
  readonly overscanPx?: number
  readonly fallbackViewportWidth?: number
  readonly fallbackViewportHeight?: number
  readonly resetKey?: string | number | null
  readonly hasHeader?: (group: TGroup) => boolean
}

export interface UseVirtualGroupedGridResult<
  TGroup,
  TItem,
  TContainer extends HTMLElement = HTMLDivElement,
> {
  readonly containerRef: React.RefCallback<TContainer>
  readonly columnCount: number
  readonly totalHeight: number
  readonly visibleRows: readonly VirtualGroupRow<TGroup, TItem>[]
  readonly activeStickyGroup: TGroup | null
}

export function useVirtualGroupedGrid<
  TGroup,
  TItem,
  TContainer extends HTMLElement = HTMLDivElement,
>(
  options: UseVirtualGroupedGridOptions<TGroup, TItem>,
): UseVirtualGroupedGridResult<TGroup, TItem, TContainer> {
  const {
    groups,
    getGroupKey,
    getGroupItems,
    collapsedKeys,
    minCardWidth,
    gapPx = 12,
    horizontalPaddingPx = 32,
    headerHeight = 40,
    rowHeight,
    groupSpacingPx = 8,
    overscanPx = 480,
    fallbackViewportWidth = 960,
    fallbackViewportHeight = 680,
    resetKey,
    hasHeader,
  } = options

  const [containerEl, setContainerEl] = React.useState<TContainer | null>(null)
  const containerRef = React.useCallback((node: TContainer | null) => {
    setContainerEl(node)
  }, [])
  const [scrollTop, setScrollTop] = React.useState(0)
  const [viewportWidth, setViewportWidth] = React.useState(fallbackViewportWidth)
  const [viewportHeight, setViewportHeight] = React.useState(fallbackViewportHeight)

  React.useEffect(() => {
    if (!containerEl) return undefined

    const updateSize = (): void => {
      if (containerEl.clientWidth > 0) setViewportWidth(containerEl.clientWidth)
      if (containerEl.clientHeight > 0) setViewportHeight(containerEl.clientHeight)
    }
    const onScroll = (): void => {
      setScrollTop(containerEl.scrollTop)
    }

    updateSize()
    setScrollTop(containerEl.scrollTop)
    containerEl.addEventListener('scroll', onScroll, { passive: true })

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateSize)
      ro.observe(containerEl)
    }

    return () => {
      containerEl.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    }
  }, [containerEl])

  React.useEffect(() => {
    if (resetKey === undefined) return
    if (containerEl) containerEl.scrollTop = 0
    setScrollTop(0)
  }, [resetKey, containerEl])

  const columnCount = React.useMemo(() => {
    const safeMinWidth = Math.max(1, minCardWidth)
    const usable = Math.max(safeMinWidth, viewportWidth - horizontalPaddingPx)
    return Math.max(1, Math.floor((usable + gapPx) / (safeMinWidth + gapPx)))
  }, [viewportWidth, horizontalPaddingPx, minCardWidth, gapPx])

  const layout = React.useMemo(() => {
    const rows: VirtualGroupRow<TGroup, TItem>[] = []
    const groupOffsets: Array<{ group: TGroup; top: number; hasHeader: boolean }> = []
    let y = 0

    for (const group of groups) {
      const groupKey = getGroupKey(group)
      const items = getGroupItems(group)
      const collapsed = collapsedKeys.has(groupKey)
      const showHeader = hasHeader ? hasHeader(group) : true

      groupOffsets.push({ group, top: y, hasHeader: showHeader })

      if (showHeader) {
        rows.push({
          kind: 'header',
          key: `hdr:${groupKey}`,
          groupKey,
          group,
          collapsed,
          top: y,
          height: headerHeight,
        })
        y += headerHeight
      }

      if (!collapsed && items.length > 0) {
        for (let i = 0; i < items.length; i += columnCount) {
          const slice = items.slice(i, i + columnCount)
          rows.push({
            kind: 'cardRow',
            key: `row:${groupKey}:${i}`,
            groupKey,
            group,
            items: slice,
            top: y,
            height: rowHeight,
          })
          y += rowHeight
        }
      }

      y += groupSpacingPx
    }

    return { rows, groupOffsets, totalHeight: y }
  }, [
    groups,
    getGroupKey,
    getGroupItems,
    collapsedKeys,
    columnCount,
    headerHeight,
    rowHeight,
    groupSpacingPx,
    hasHeader,
  ])

  const visibleRows = React.useMemo(() => {
    const minTop = Math.max(0, scrollTop - overscanPx)
    const maxBottom = scrollTop + viewportHeight + overscanPx
    return layout.rows.filter(row => row.top + row.height >= minTop && row.top <= maxBottom)
  }, [layout.rows, scrollTop, viewportHeight, overscanPx])

  const activeStickyGroup = React.useMemo(() => {
    if (scrollTop <= 8 || layout.groupOffsets.length === 0) return null
    let current: { group: TGroup; hasHeader: boolean } | null = null
    for (const entry of layout.groupOffsets) {
      if (entry.top <= scrollTop + 4) {
        current = entry
      } else {
        break
      }
    }
    if (!current || !current.hasHeader) return null
    return current.group
  }, [layout.groupOffsets, scrollTop])

  return {
    containerRef,
    columnCount,
    totalHeight: layout.totalHeight,
    visibleRows,
    activeStickyGroup,
  }
}
