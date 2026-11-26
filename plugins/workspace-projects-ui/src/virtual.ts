import * as React from 'react'
import type { ProjectFileEntry, ProjectFolderGroup } from './types.js'

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

  const totalHeight = count * itemHeight

  const visibleItems = React.useMemo(() => {
    if (count <= 0) return []
    const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const endIdx = Math.min(
      count - 1,
      Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan,
    )
    const items: VirtualListItem[] = []
    for (let i = startIdx; i <= endIdx; i += 1) {
      items.push({ index: i, top: i * itemHeight, height: itemHeight })
    }
    return items
  }, [count, itemHeight, overscan, scrollTop, viewportHeight])

  return { containerRef, totalHeight, visibleItems }
}

export type VirtualGroupRow =
  | {
      readonly kind: 'header'
      readonly key: string
      readonly group: ProjectFolderGroup
      readonly collapsed: boolean
      readonly top: number
      readonly height: number
    }
  | {
      readonly kind: 'cardRow'
      readonly key: string
      readonly groupRelPath: string
      readonly files: readonly ProjectFileEntry[]
      readonly top: number
      readonly height: number
    }

export interface UseVirtualGroupedGridOptions {
  readonly groups: readonly ProjectFolderGroup[]
  readonly collapsedKeys: ReadonlySet<string>
  readonly minCardWidth: number
  readonly gapPx?: number
  readonly horizontalPaddingPx?: number
  readonly headerHeight?: number
  readonly rowHeight: number
  readonly overscanPx?: number
  readonly resetKey?: string | number | null
}

export function useVirtualGroupedGrid<TContainer extends HTMLElement = HTMLDivElement>(
  options: UseVirtualGroupedGridOptions,
): {
  readonly containerRef: React.RefCallback<TContainer>
  readonly columnCount: number
  readonly totalHeight: number
  readonly visibleRows: readonly VirtualGroupRow[]
  readonly activeStickyGroup: ProjectFolderGroup | null
} {
  const {
    groups,
    collapsedKeys,
    minCardWidth,
    gapPx = 12,
    horizontalPaddingPx = 32,
    headerHeight = 40,
    rowHeight,
    overscanPx = 480,
    resetKey,
  } = options

  const [containerEl, setContainerEl] = React.useState<TContainer | null>(null)
  const containerRef = React.useCallback((node: TContainer | null) => {
    setContainerEl(node)
  }, [])
  const [scrollTop, setScrollTop] = React.useState(0)
  const [viewportWidth, setViewportWidth] = React.useState(960)
  const [viewportHeight, setViewportHeight] = React.useState(680)

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
    const usable = Math.max(minCardWidth, viewportWidth - horizontalPaddingPx)
    return Math.max(1, Math.floor((usable + gapPx) / (minCardWidth + gapPx)))
  }, [viewportWidth, horizontalPaddingPx, minCardWidth, gapPx])

  const layout = React.useMemo(() => {
    const rows: VirtualGroupRow[] = []
    const groupOffsets: Array<{ group: ProjectFolderGroup; top: number }> = []
    let y = 0

    for (const group of groups) {
      const collapsed = collapsedKeys.has(group.relPath)
      groupOffsets.push({ group, top: y })
      rows.push({
        kind: 'header',
        key: `hdr:${group.relPath}`,
        group,
        collapsed,
        top: y,
        height: headerHeight,
      })
      y += headerHeight

      if (!collapsed && group.files.length > 0) {
        for (let i = 0; i < group.files.length; i += columnCount) {
          const slice = group.files.slice(i, i + columnCount)
          rows.push({
            kind: 'cardRow',
            key: `row:${group.relPath}:${i}`,
            groupRelPath: group.relPath,
            files: slice,
            top: y,
            height: rowHeight,
          })
          y += rowHeight
        }
      }
      y += 8
    }

    return { rows, groupOffsets, totalHeight: y }
  }, [groups, collapsedKeys, columnCount, headerHeight, rowHeight])

  const visibleRows = React.useMemo(() => {
    const minTop = Math.max(0, scrollTop - overscanPx)
    const maxBottom = scrollTop + viewportHeight + overscanPx
    return layout.rows.filter(row => row.top + row.height >= minTop && row.top <= maxBottom)
  }, [layout.rows, scrollTop, viewportHeight, overscanPx])

  const activeStickyGroup = React.useMemo(() => {
    if (scrollTop <= 8 || layout.groupOffsets.length === 0) return null
    let current: ProjectFolderGroup | null = null
    for (const item of layout.groupOffsets) {
      if (item.top <= scrollTop + 4) {
        current = item.group
      } else {
        break
      }
    }
    return current
  }, [layout.groupOffsets, scrollTop])

  return {
    containerRef,
    columnCount,
    totalHeight: layout.totalHeight,
    visibleRows,
    activeStickyGroup,
  }
}
