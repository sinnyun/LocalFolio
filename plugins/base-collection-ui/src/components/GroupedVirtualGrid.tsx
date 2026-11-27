import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle, Skeleton, cn } from '@folio/base-ui-kit/client'
import { useVirtualGroupedGrid } from '../virtual.js'

export interface GroupedVirtualGridProps<TGroup, TItem> {
  readonly groups: readonly TGroup[]
  readonly getGroupKey: (group: TGroup) => string
  readonly getGroupItems: (group: TGroup) => readonly TItem[]
  readonly getGroupTitle?: (group: TGroup) => React.ReactNode
  readonly getGroupMeta?: (group: TGroup) => React.ReactNode
  readonly getItemKey?: (item: TItem, group: TGroup, index: number) => string
  readonly collapsedKeys: ReadonlySet<string>
  readonly onToggleGroupCollapsed: (groupKey: string) => void
  readonly renderItem: (item: TItem, group: TGroup) => React.ReactNode
  readonly renderHeader?: (
    group: TGroup,
    state: { readonly collapsed: boolean; readonly sticky: boolean },
  ) => React.ReactNode
  readonly renderHeaderActions?: (
    group: TGroup,
    state: { readonly collapsed: boolean; readonly sticky: boolean },
  ) => React.ReactNode
  readonly hasHeader?: (group: TGroup) => boolean
  readonly minCardWidth: number
  readonly rowHeight: number
  readonly gapPx?: number
  readonly rowPaddingTopPx?: number
  readonly horizontalPaddingPx?: number
  readonly headerHeight?: number
  readonly groupSpacingPx?: number
  readonly overscanPx?: number
  readonly resetKey?: string | number | null
  readonly loading?: boolean
  readonly skeletonCount?: number
  readonly renderSkeleton?: () => React.ReactNode
  readonly emptyState?: React.ReactNode
  readonly emptyTitle?: string
  readonly emptyDescription?: string
  readonly stickyHeader?: boolean
  readonly stickyContainerClassName?: string
  readonly className?: string
  readonly scrollContainerClassName?: string
  readonly scrollContainerDataAttr?: string
  readonly topBanner?: React.ReactNode
}

export function GroupedVirtualGrid<TGroup, TItem>({
  groups,
  getGroupKey,
  getGroupItems,
  getGroupTitle,
  getGroupMeta,
  getItemKey,
  collapsedKeys,
  onToggleGroupCollapsed,
  renderItem,
  renderHeader,
  renderHeaderActions,
  hasHeader,
  minCardWidth,
  rowHeight,
  gapPx = 12,
  rowPaddingTopPx = 10,
  horizontalPaddingPx = 32,
  headerHeight = 40,
  groupSpacingPx = 8,
  overscanPx = 480,
  resetKey,
  loading = false,
  skeletonCount = 8,
  renderSkeleton,
  emptyState,
  emptyTitle = '没有匹配的文件',
  emptyDescription = '尝试调整筛选条件或切换其他分类。',
  stickyHeader = true,
  stickyContainerClassName,
  className,
  scrollContainerClassName,
  scrollContainerDataAttr,
  topBanner,
}: GroupedVirtualGridProps<TGroup, TItem>): React.ReactElement {
  const {
    containerRef,
    columnCount,
    totalHeight,
    visibleRows,
    activeStickyGroup,
  } = useVirtualGroupedGrid<TGroup, TItem, HTMLDivElement>({
    groups,
    getGroupKey,
    getGroupItems,
    collapsedKeys,
    minCardWidth,
    gapPx,
    horizontalPaddingPx,
    headerHeight,
    rowHeight,
    groupSpacingPx,
    overscanPx,
    resetKey,
    hasHeader,
  })

  const renderHeaderRowContent = (group: TGroup, collapsed: boolean, sticky: boolean): React.ReactNode => {
    const groupKey = getGroupKey(group)
    const actions = renderHeaderActions?.(group, { collapsed, sticky })
    const titleNode = renderHeader
      ? renderHeader(group, { collapsed, sticky })
      : (
        <>
          <span className="truncate">{getGroupTitle ? getGroupTitle(group) : groupKey}</span>
          {getGroupMeta ? (
            <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
              {getGroupMeta(group)}
            </span>
          ) : null}
        </>
      )

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
          {titleNode}
        </button>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </>
    )
  }

  const scrollerDataProps = scrollContainerDataAttr
    ? { [scrollContainerDataAttr]: '' }
    : undefined

  return (
    <div data-lf-collection-grid="" className={cn('relative min-h-0 flex-1 overflow-hidden', className)}>
      {stickyHeader && activeStickyGroup ? (
        <div
          data-lf-collection-sticky-header={getGroupKey(activeStickyGroup)}
          className={cn(
            'pointer-events-auto absolute left-0 right-4 top-0 z-10 flex h-9 items-center justify-between gap-2 border-b border-border bg-background/95 px-4 backdrop-blur-sm',
            stickyContainerClassName,
          )}
        >
          {renderHeaderRowContent(
            activeStickyGroup,
            collapsedKeys.has(getGroupKey(activeStickyGroup)),
            true,
          )}
        </div>
      ) : null}

      <div
        ref={containerRef}
        data-lf-collection-scroll-container=""
        {...scrollerDataProps}
        className={cn('h-full overflow-y-auto px-4 py-2', scrollContainerClassName)}
      >
        {topBanner}
        {loading ? (
          renderSkeleton ? (
            renderSkeleton()
          ) : (
            <div data-lf-collection-skeleton="" className="grid grid-cols-4 gap-3 pt-2">
              {Array.from({ length: skeletonCount }).map((_, idx) => (
                <Skeleton key={idx} className="h-44 rounded-lg" />
              ))}
            </div>
          )
        ) : groups.length === 0 ? (
          emptyState ?? (
            <div data-lf-collection-empty="" className="flex h-full items-center justify-center">
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{emptyTitle}</EmptyTitle>
                  <EmptyDescription>{emptyDescription}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          )
        ) : (
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            {visibleRows.map(row => {
              if (row.kind === 'header') {
                return (
                  <div
                    key={row.key}
                    data-lf-collection-group={row.groupKey}
                    style={{
                      position: 'absolute',
                      top: `${row.top}px`,
                      left: 0,
                      right: 0,
                      height: `${row.height}px`,
                    }}
                    className="flex items-center justify-between gap-2 border-b border-border/60"
                  >
                    {renderHeaderRowContent(row.group, row.collapsed, false)}
                  </div>
                )
              }

              return (
                <div
                  key={row.key}
                  style={{
                    position: 'absolute',
                    top: `${row.top}px`,
                    left: 0,
                    right: 0,
                    height: `${row.height}px`,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                    gap: `${gapPx}px`,
                    paddingTop: `${rowPaddingTopPx}px`,
                  }}
                >
                  {row.items.map((item, idx) => (
                    <React.Fragment
                      key={getItemKey ? getItemKey(item, row.group, idx) : `${row.key}:${idx}`}
                    >
                      {renderItem(item, row.group)}
                    </React.Fragment>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
