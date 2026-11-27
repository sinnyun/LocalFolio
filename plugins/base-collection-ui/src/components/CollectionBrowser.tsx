import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  cn,
} from '@folio/base-ui-kit/client'
import {
  normalizeAspectRatio,
  readCachedAspectRatio,
  writeCachedAspectRatio,
} from '../aspect.js'
import { layoutCollection, type CollectionViewMode } from '../layout.js'
import {
  CollectionToolbar,
  type CollectionToolbarProps,
} from './CollectionToolbar.js'

export interface CollectionItemRenderLayout {
  readonly mode: CollectionViewMode
  readonly width: number
  readonly height: number
  readonly thumbHeight: number
  readonly aspectKey: string
  /** Feed the decoded thumbnail's natural size back so masonry/justified relayout once. */
  readonly reportAspectRatio: (naturalWidth: number, naturalHeight: number) => void
}

export interface CollectionGroupRenderState {
  readonly collapsed: boolean
  readonly sticky: boolean
}

export interface CollectionBrowserProps<TGroup, TItem> extends CollectionToolbarProps {
  readonly groups: readonly TGroup[]
  readonly getGroupKey: (group: TGroup) => string
  readonly getGroupItems: (group: TGroup) => readonly TItem[]
  readonly getGroupTitle?: (group: TGroup) => React.ReactNode
  readonly getGroupMeta?: (group: TGroup) => React.ReactNode
  readonly hasHeader?: (group: TGroup) => boolean
  readonly getItemKey: (item: TItem, group: TGroup, index: number) => string
  readonly getItemAspectKey?: (item: TItem) => string
  readonly getItemAspect?: (item: TItem) => number
  readonly renderItem: (
    item: TItem,
    group: TGroup,
    layout: CollectionItemRenderLayout,
  ) => React.ReactNode
  readonly renderGroupActions?: (
    group: TGroup,
    state: CollectionGroupRenderState,
  ) => React.ReactNode
  readonly collapsedKeys: ReadonlySet<string>
  readonly onToggleGroupCollapsed: (groupKey: string) => void
  readonly metaHeight?: number
  readonly listRowHeight?: number
  readonly listHeader?: React.ReactNode
  readonly banner?: React.ReactNode
  readonly loading?: boolean
  readonly skeletonCount?: number
  readonly emptyTitle?: string
  readonly emptyDescription?: string
  readonly emptyState?: React.ReactNode
  readonly stickyHeader?: boolean
  readonly resetKey?: string | number | null
  readonly scrollDataAttr?: Record<string, string>
  readonly fallbackViewportWidth?: number
  readonly fallbackViewportHeight?: number
}

export function CollectionBrowser<TGroup, TItem>({
  groups,
  getGroupKey,
  getGroupItems,
  getGroupTitle,
  getGroupMeta,
  hasHeader,
  getItemKey,
  getItemAspectKey,
  getItemAspect,
  renderItem,
  renderGroupActions,
  collapsedKeys,
  onToggleGroupCollapsed,
  metaHeight = 56,
  listRowHeight = 36,
  listHeader,
  banner,
  loading = false,
  skeletonCount = 8,
  emptyTitle = '没有匹配的文件',
  emptyDescription = '尝试清空筛选关键词或切换筛选条件。',
  emptyState,
  stickyHeader = true,
  resetKey,
  scrollDataAttr,
  fallbackViewportWidth = 960,
  fallbackViewportHeight = 680,
  viewMode,
  viewDataAttrPrefix,
  viewDataAttrValue,
  ...toolbarProps
}: CollectionBrowserProps<TGroup, TItem>): React.ReactElement {
  const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = React.useState(0)
  const [viewportWidth, setViewportWidth] = React.useState(fallbackViewportWidth)
  const [viewportHeight, setViewportHeight] = React.useState(fallbackViewportHeight)
  const [aspectVersion, setAspectVersion] = React.useState(0)
  const pendingAspectRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    return () => {
      if (pendingAspectRef.current !== null) clearTimeout(pendingAspectRef.current)
    }
  }, [])

  React.useEffect(() => {
    if (!scrollEl) return undefined
    const updateSize = (): void => {
      if (scrollEl.clientWidth > 0) setViewportWidth(scrollEl.clientWidth)
      if (scrollEl.clientHeight > 0) setViewportHeight(scrollEl.clientHeight)
    }
    const onScroll = (): void => setScrollTop(scrollEl.scrollTop)
    updateSize()
    setScrollTop(scrollEl.scrollTop)
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateSize)
      observer.observe(scrollEl)
    }
    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      observer?.disconnect()
    }
  }, [scrollEl])

  React.useEffect(() => {
    if (resetKey === undefined) return
    if (scrollEl) scrollEl.scrollTop = 0
    setScrollTop(0)
  }, [resetKey, scrollEl])

  const reportAspectRatio = React.useCallback(
    (key: string, naturalWidth: number, naturalHeight: number) => {
      const ratio = normalizeAspectRatio(naturalWidth, naturalHeight)
      if (ratio === null) return
      if (!writeCachedAspectRatio(key, ratio)) return
      // A freshly rendered grid reports many thumbnails in the same tick; one
      // batched relayout keeps masonry/justified views from thrashing.
      if (pendingAspectRef.current !== null) return
      pendingAspectRef.current = setTimeout(() => {
        pendingAspectRef.current = null
        setAspectVersion(version => version + 1)
      }, 16)
    },
    [],
  )

  const aspectFor = React.useCallback(
    (item: TItem): number => {
      const key = getItemAspectKey?.(item)
      return (key ? readCachedAspectRatio(key) : null) ?? getItemAspect?.(item) ?? 1
    },
    // aspectVersion deliberately invalidates the memo once a thumbnail is measured.
    [getItemAspectKey, getItemAspect, aspectVersion],
  )

  const layout = React.useMemo(
    () =>
      layoutCollection<TGroup, TItem>({
        groups,
        getGroupKey,
        getGroupItems,
        getItemKey,
        collapsedKeys,
        viewMode,
        containerWidth: viewportWidth,
        cardSize: toolbarProps.cardSize,
        metaHeight,
        listRowHeight,
        hasHeader,
        getAspectRatio: aspectFor,
      }),
    [
      groups,
      getGroupKey,
      getGroupItems,
      getItemKey,
      collapsedKeys,
      viewMode,
      viewportWidth,
      toolbarProps.cardSize,
      metaHeight,
      listRowHeight,
      hasHeader,
      aspectFor,
    ],
  )

  const overscanPx = 560
  const visibleRows = React.useMemo(
    () =>
      layout.rows.filter(
        row =>
          row.y + row.height >= scrollTop - overscanPx &&
          row.y <= scrollTop + viewportHeight + overscanPx,
      ),
    [layout.rows, scrollTop, viewportHeight],
  )

  const activeStickyGroup = React.useMemo(() => {
    if (scrollTop <= 8 || layout.groupOffsets.length === 0) return null
    let current: (typeof layout.groupOffsets)[number] | null = null
    for (const offset of layout.groupOffsets) {
      if (offset.top <= scrollTop + 4) current = offset
      else break
    }
    if (!current || !current.hasHeader) return null
    return current.group
  }, [layout.groupOffsets, scrollTop])

  const renderHeaderContent = (
    group: TGroup,
    collapsed: boolean,
    sticky: boolean,
  ): React.ReactNode => {
    const groupKey = getGroupKey(group)
    return (
      <>
        <button
          type="button"
          data-lf-collection-group-toggle={groupKey}
          onClick={() => onToggleGroupCollapsed(groupKey)}
          className={cn(
            'flex min-w-0 items-center gap-1.5 text-xs hover:text-primary',
            sticky ? 'font-medium text-foreground' : 'font-semibold text-foreground',
          )}
        >
          {collapsed ? (
            <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">
            {getGroupTitle ? getGroupTitle(group) : groupKey}
          </span>
          {getGroupMeta ? (
            <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
              {getGroupMeta(group)}
            </span>
          ) : null}
        </button>
        {renderGroupActions ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {renderGroupActions(group, { collapsed, sticky })}
          </div>
        ) : null}
      </>
    )
  }

  const itemLayout = (item: TItem, width: number, height: number): CollectionItemRenderLayout => {
    const aspectKey = getItemAspectKey?.(item) ?? ''
    return {
      mode: viewMode,
      width,
      height,
      thumbHeight: Math.max(24, height - metaHeight),
      aspectKey,
      reportAspectRatio: (naturalWidth, naturalHeight) => {
        if (aspectKey) reportAspectRatio(aspectKey, naturalWidth, naturalHeight)
      },
    }
  }

  const prefix = viewDataAttrPrefix
  const viewAttrValue = viewDataAttrValue ?? ''
  const modeDataAttrs: Record<string, string> = prefix
    ? viewMode === 'grid'
      ? { [`${prefix}-grid`]: viewAttrValue }
      : viewMode === 'list'
        ? { [`${prefix}-list`]: viewAttrValue }
        : { [`${prefix}-${viewMode}`]: viewAttrValue }
    : {}

  return (
    <div
      data-lf-collection-browser=""
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
    >
      <CollectionToolbar
        {...toolbarProps}
        viewMode={viewMode}
        viewDataAttrPrefix={prefix}
        viewDataAttrValue={viewAttrValue}
      />

      {banner}

      {viewMode === 'list' && listHeader ? (
        <div className="shrink-0 px-4 pt-2">{listHeader}</div>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {stickyHeader && activeStickyGroup ? (
          <div
            data-lf-collection-sticky-header={getGroupKey(activeStickyGroup)}
            className="pointer-events-auto absolute left-0 right-4 top-0 z-10 flex h-9 items-center justify-between gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-sm"
          >
            {renderHeaderContent(
              activeStickyGroup,
              collapsedKeys.has(getGroupKey(activeStickyGroup)),
              true,
            )}
          </div>
        ) : null}

        <div
          ref={setScrollEl}
          data-lf-collection-scroll-container=""
          {...scrollDataAttr}
          className="h-full overflow-y-auto px-4 py-2"
        >
          {loading ? (
            <div
              data-lf-collection-skeleton=""
              aria-busy="true"
              aria-label="正在加载"
              className="grid grid-cols-4 gap-3 pt-2"
            >
              {Array.from({ length: skeletonCount }).map((_, idx) => (
                <Skeleton key={idx} className="h-44 rounded-lg" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div data-lf-collection-empty="" className="flex h-full items-center justify-center">
              {emptyState ?? (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>{emptyTitle}</EmptyTitle>
                    <EmptyDescription>{emptyDescription}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          ) : (
            <div
              data-lf-collection-grid=""
              {...modeDataAttrs}
              style={{ height: `${layout.totalHeight}px`, position: 'relative' }}
            >
              {visibleRows.map(row => {
                if (row.kind === 'header') {
                  return (
                    <div
                      key={row.key}
                      data-lf-collection-group={row.groupKey}
                      style={{
                        position: 'absolute',
                        top: `${row.y}px`,
                        left: 0,
                        right: 0,
                        height: `${row.height}px`,
                      }}
                      className="flex items-center justify-between gap-2 border-b border-border/60"
                    >
                      {renderHeaderContent(row.group, row.collapsed, false)}
                    </div>
                  )
                }

                return (
                  <div
                    key={row.key}
                    data-lf-collection-item={row.key}
                    style={{
                      position: 'absolute',
                      left: `${row.x}px`,
                      top: `${row.y}px`,
                      width: `${row.width}px`,
                      height: `${row.height}px`,
                    }}
                  >
                    {renderItem(
                      row.item,
                      row.group,
                      itemLayout(row.item, row.width, row.height),
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
