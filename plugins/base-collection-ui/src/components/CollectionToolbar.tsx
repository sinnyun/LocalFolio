import * as React from 'react'
import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Columns3,
  LayoutGrid,
  List,
  Rows3,
  Search,
  X,
} from 'lucide-react'
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@folio/base-ui-kit/client'
import type { LucideIcon } from 'lucide-react'
import type { CollectionGroupBy } from '../grouping.js'
import type { CollectionViewMode } from '../layout.js'

export interface CollectionOption<TValue extends string = string> {
  readonly value: TValue
  readonly label: string
}

export const COLLECTION_VIEW_OPTIONS: readonly CollectionOption<CollectionViewMode>[] = [
  { value: 'grid', label: '网格视图' },
  { value: 'waterfall', label: '瀑布视图' },
  { value: 'equal', label: '等高视图' },
  { value: 'list', label: '列表视图' },
]

export const COLLECTION_GROUP_OPTIONS: readonly CollectionOption<CollectionGroupBy>[] = [
  { value: 'none', label: '不分组' },
  { value: 'time', label: '按时间分组' },
  { value: 'type', label: '按类型分组' },
  { value: 'name', label: '按名称分组' },
  { value: 'folder', label: '按文件夹分组' },
]

export interface CollectionSortState {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly options: readonly CollectionOption[]
  readonly dir: 'asc' | 'desc'
  readonly onDirChange: (dir: 'asc' | 'desc') => void
  readonly dataAttr?: Record<string, string>
  readonly dirDataAttr?: Record<string, string>
}

export interface CollectionCategoryState {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly options: readonly CollectionOption[]
  readonly dataAttr?: Record<string, string>
}

export interface CollectionGroupByState {
  readonly value: CollectionGroupBy
  readonly onChange: (value: CollectionGroupBy) => void
  readonly options?: readonly CollectionOption<CollectionGroupBy>[]
  readonly dataAttr?: Record<string, string>
}

export interface CollectionFilterState {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
  readonly ariaLabel?: string
  readonly dataAttr?: Record<string, string>
}

export interface CollectionToolbarProps {
  readonly leading?: React.ReactNode
  readonly actions?: React.ReactNode
  readonly filter?: CollectionFilterState
  readonly category?: CollectionCategoryState
  readonly extraFilters?: React.ReactNode
  readonly groupBy?: CollectionGroupByState
  readonly sort?: CollectionSortState
  readonly viewMode: CollectionViewMode
  readonly onViewModeChange: (mode: CollectionViewMode) => void
  readonly cardSize: number
  readonly onCardSizeChange: (size: number) => void
  readonly cardSizeRange?: { readonly min: number; readonly max: number; readonly step: number }
  readonly cardSizeDataAttr?: Record<string, string>
  readonly viewDataAttrPrefix?: string
  readonly viewDataAttrValue?: string
  readonly className?: string
}

const VIEW_ICONS: Record<CollectionViewMode, LucideIcon> = {
  grid: LayoutGrid,
  waterfall: Columns3,
  equal: Rows3,
  list: List,
}

export function CollectionToolbar({
  leading,
  actions,
  filter,
  category,
  extraFilters,
  groupBy,
  sort,
  viewMode,
  onViewModeChange,
  cardSize,
  onCardSizeChange,
  cardSizeRange = { min: 96, max: 256, step: 16 },
  cardSizeDataAttr,
  viewDataAttrPrefix,
  viewDataAttrValue,
  className,
}: CollectionToolbarProps): React.ReactElement {
  const viewAttr = (mode: CollectionViewMode): Record<string, string> =>
    viewDataAttrPrefix
      ? { [`${viewDataAttrPrefix}-view-${mode}`]: viewDataAttrValue ?? '' }
      : {}

  return (
    <div
      data-lf-collection-toolbar=""
      className={cn(
        'flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-2 py-1.5',
        className,
      )}
    >
      {leading}

      {filter ? (
        <div className="relative flex min-w-32 flex-1 items-center sm:max-w-52">
          <Search
            size={13}
            className="pointer-events-none absolute left-2 text-muted-foreground"
          />
          <Input
            value={filter.value}
            onChange={event => filter.onChange(event.target.value)}
            placeholder={filter.placeholder ?? '筛选文件…'}
            aria-label={filter.ariaLabel ?? '筛选文件'}
            className="h-7 pl-7 pr-6 text-xs"
            {...filter.dataAttr}
          />
          {filter.value ? (
            <button
              type="button"
              aria-label="清除筛选"
              onClick={() => filter.onChange('')}
              className="absolute right-1.5 flex size-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>
      ) : null}

      {category && category.options.length > 0 ? (
        <Select value={category.value} onValueChange={category.onChange}>
          <SelectTrigger
            size="sm"
            aria-label="按类型筛选"
            className="h-7 w-24 px-2 text-xs"
            {...category.dataAttr}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="pointer-events-auto">
            {category.options.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {extraFilters}

      {groupBy ? (
        <Select
          value={groupBy.value}
          onValueChange={value => groupBy.onChange(value as CollectionGroupBy)}
        >
          <SelectTrigger
            size="sm"
            aria-label="分组方式"
            className="h-7 w-28 px-2 text-xs"
            {...groupBy.dataAttr}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="pointer-events-auto">
            {(groupBy.options ?? COLLECTION_GROUP_OPTIONS).map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      {sort ? (
        <div className="flex items-center gap-0.5">
          <Select value={sort.value} onValueChange={sort.onChange}>
            <SelectTrigger
              size="sm"
              aria-label="排序依据"
              className="h-7 w-24 px-2 text-xs"
              {...sort.dataAttr}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="pointer-events-auto">
              {sort.options.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={sort.dir === 'asc' ? '切换为降序' : '切换为升序'}
            title={sort.dir === 'asc' ? '当前升序，点击降序' : '当前降序，点击升序'}
            onClick={() => sort.onDirChange(sort.dir === 'asc' ? 'desc' : 'asc')}
            {...sort.dirDataAttr}
          >
            {sort.dir === 'asc' ? (
              <ArrowUpNarrowWide size={13} />
            ) : (
              <ArrowDownNarrowWide size={13} />
            )}
          </Button>
        </div>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5">
        {viewMode !== 'list' ? (
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5">
            <span className="text-[10px] text-muted-foreground">缩略图</span>
            <input
              type="range"
              min={cardSizeRange.min}
              max={cardSizeRange.max}
              step={cardSizeRange.step}
              aria-label="调整卡片大小"
              value={cardSize}
              onChange={event => onCardSizeChange(Number(event.target.value))}
              className="h-1.5 w-20 cursor-pointer accent-primary"
              {...cardSizeDataAttr}
            />
            <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {cardSize}
            </span>
          </div>
        ) : null}

        <div className="flex items-center rounded-md border border-border bg-background p-0.5">
          {COLLECTION_VIEW_OPTIONS.map(option => {
            const Icon = VIEW_ICONS[option.value]
            const active = viewMode === option.value
            return (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                aria-pressed={active}
                title={option.label}
                onClick={() => onViewModeChange(option.value)}
                className={cn(
                  'flex size-6 items-center justify-center rounded-sm transition-colors',
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                {...viewAttr(option.value)}
              >
                <Icon size={13} />
              </button>
            )
          })}
        </div>

        {actions}
      </div>
    </div>
  )
}
