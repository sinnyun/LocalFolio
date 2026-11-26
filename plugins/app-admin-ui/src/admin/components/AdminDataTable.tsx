import * as React from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  ListFilter,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@folio/core-ui-kit/client'
import type { AdminIcon } from '../routes'

export interface AdminColumn<T> {
  readonly id: string
  readonly header: string
  readonly cell: (row: T) => React.ReactNode
  readonly sortValue?: (row: T) => string | number
  readonly className?: string
  readonly headClassName?: string
  readonly hideable?: boolean
  readonly defaultHidden?: boolean
}

export interface AdminFacetOption {
  readonly label: string
  readonly value: string
  readonly icon?: AdminIcon
}

export interface AdminFacet<T> {
  readonly id: string
  readonly title: string
  readonly options: readonly AdminFacetOption[]
  readonly match: (row: T, selected: ReadonlySet<string>) => boolean
}

export interface AdminDataTableProps<T> {
  readonly data: readonly T[]
  readonly columns: readonly AdminColumn<T>[]
  readonly getRowId: (row: T) => string
  readonly searchText: (row: T) => string
  readonly searchPlaceholder?: string
  readonly facets?: readonly AdminFacet<T>[]
  readonly pageSizeOptions?: readonly number[]
  readonly bulkActions?: (rows: readonly T[], clearSelection: () => void) => React.ReactNode
}

type SortState = { id: string; desc: boolean } | null

const DEFAULT_PAGE_SIZES = [10, 20, 30, 40, 50] as const

function SortIndicator({ active, desc }: { active: boolean; desc: boolean }): React.ReactElement {
  if (!active) return <ChevronsUpDown size={13} className="ms-1 opacity-50" />
  return desc ? <ArrowDown size={13} className="ms-1" /> : <ArrowUp size={13} className="ms-1" />
}

function FacetFilter<T>({
  facet,
  selected,
  onChange,
}: {
  facet: AdminFacet<T>
  selected: ReadonlySet<string>
  onChange: (next: Set<string>) => void
}): React.ReactElement {
  const toggle = (value: string): void => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <ListFilter size={14} />
          <span className="hidden sm:inline">{facet.title}</span>
          {selected.size > 0 ? (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              {selected.size <= 2 ? (
                <span className="flex items-center gap-1">
                  {facet.options
                    .filter(option => selected.has(option.value))
                    .map(option => (
                      <span
                        key={option.value}
                        className="inline-flex items-center gap-1 rounded-sm bg-muted px-1 text-xs"
                      >
                        {option.label}
                        <button
                          type="button"
                          aria-label={`Clear ${option.label} filter`}
                          className="rounded-sm hover:bg-accent"
                          onClick={event => {
                            event.preventDefault()
                            event.stopPropagation()
                            toggle(option.value)
                          }}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                </span>
              ) : (
                <span className="rounded-sm bg-muted px-1 text-xs">{selected.size} selected</span>
              )}
            </>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>{facet.title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {facet.options.map(option => {
          const Icon = option.icon
          return (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={selected.has(option.value)}
              onCheckedChange={() => toggle(option.value)}
              onSelect={event => event.preventDefault()}
            >
              {Icon ? <Icon size={14} className="text-muted-foreground" /> : null}
              <span className="capitalize">{option.label}</span>
            </DropdownMenuCheckboxItem>
          )
        })}
        {selected.size > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="justify-center text-center"
              onSelect={() => onChange(new Set())}
            >
              Clear filters
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AdminDataTable<T>({
  data,
  columns,
  getRowId,
  searchText,
  searchPlaceholder = 'Filter...',
  facets = [],
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  bulkActions,
}: AdminDataTableProps<T>): React.ReactElement {
  const [filter, setFilter] = React.useState('')
  const [facetState, setFacetState] = React.useState<Record<string, Set<string>>>({})
  const [sorting, setSorting] = React.useState<SortState>(null)
  const [hidden, setHidden] = React.useState<Set<string>>(
    () => new Set(columns.filter(column => column.defaultHidden).map(column => column.id)),
  )
  const [pageSize, setPageSize] = React.useState<number>(pageSizeOptions[0] ?? 10)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())

  const isFiltered =
    filter.trim().length > 0 || Object.values(facetState).some(set => set.size > 0) || hidden.size > 0

  const rows = React.useMemo(() => {
    const query = filter.trim().toLowerCase()
    let next = data.filter(row => (query ? searchText(row).toLowerCase().includes(query) : true))
    for (const facet of facets) {
      const selectedValues = facetState[facet.id]
      if (selectedValues && selectedValues.size > 0) {
        next = next.filter(row => facet.match(row, selectedValues))
      }
    }
    if (sorting) {
      const column = columns.find(item => item.id === sorting.id)
      if (column?.sortValue) {
        const direction = sorting.desc ? -1 : 1
        next = [...next].sort((a, b) => {
          const left = column.sortValue?.(a)
          const right = column.sortValue?.(b)
          if (left === right) return 0
          if (left === undefined) return 1
          if (right === undefined) return -1
          return left < right ? -direction : direction
        })
      }
    }
    return next
  }, [data, filter, facetState, facets, sorting, columns, searchText])

  React.useEffect(() => {
    setPageIndex(0)
  }, [filter, facetState, pageSize, data.length])

  React.useEffect(() => {
    const ids = new Set(rows.map(getRowId))
    setSelected(previous => {
      let changed = false
      const next = new Set<string>()
      for (const id of previous) {
        if (ids.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : previous
    })
  }, [rows, getRowId])

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)
  const pageRows = rows.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize)
  const visibleColumns = columns.filter(column => !hidden.has(column.id))
  const pageIds = pageRows.map(getRowId)
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id))
  const somePageSelected = pageIds.some(id => selected.has(id))

  const toggleAllPage = (checked: boolean): void => {
    setSelected(previous => {
      const next = new Set(previous)
      for (const id of pageIds) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const toggleRow = (id: string): void => {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = (): void => setSelected(new Set())
  const selectedRows = rows.filter(row => selected.has(getRowId(row)))

  const resetFilters = (): void => {
    setFilter('')
    setFacetState({})
    setHidden(new Set(columns.filter(column => column.defaultHidden).map(column => column.id)))
  }

  const handleSort = (column: AdminColumn<T>): void => {
    if (!column.sortValue) return
    setSorting(previous => {
      if (previous?.id !== column.id) return { id: column.id, desc: false }
      if (!previous.desc) return { id: column.id, desc: true }
      return null
    })
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto">
          <SearchIcon
            size={14}
            className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={filter}
            onChange={event => setFilter(event.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 w-full ps-8 sm:w-56 lg:w-80"
          />
          {filter ? (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setFilter('')}
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
        {facets.map(facet => (
          <FacetFilter
            key={facet.id}
            facet={facet}
            selected={facetState[facet.id] ?? new Set()}
            onChange={next => setFacetState(previous => ({ ...previous, [facet.id]: next }))}
          />
        ))}
        {isFiltered ? (
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={resetFilters}>
            Reset
            <X size={13} />
          </Button>
        ) : null}
        <div className="ms-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <SlidersHorizontal size={14} />
                <span className="hidden sm:inline">View</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns
                .filter(column => column.hideable !== false)
                .map(column => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={!hidden.has(column.id)}
                    onCheckedChange={checked => {
                      setHidden(previous => {
                        const next = new Set(previous)
                        if (checked) next.delete(column.id)
                        else next.add(column.id)
                        return next
                      })
                    }}
                    onSelect={event => event.preventDefault()}
                  >
                    <span className="capitalize">{column.header}</span>
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-10 ps-3">
                <input
                  type="checkbox"
                  aria-label="Select all rows on this page"
                  className="size-3.5 translate-y-0.5 cursor-pointer accent-primary"
                  checked={allPageSelected}
                  ref={element => {
                    if (element) element.indeterminate = !allPageSelected && somePageSelected
                  }}
                  onChange={event => toggleAllPage(event.target.checked)}
                />
              </TableHead>
              {visibleColumns.map(column => (
                <TableHead key={column.id} className={column.headClassName}>
                  {column.sortValue ? (
                    <button
                      type="button"
                      className="-ms-2 inline-flex h-8 items-center rounded-md px-2 text-start hover:bg-accent"
                      onClick={() => handleSort(column)}
                    >
                      {column.header}
                      <SortIndicator active={sorting?.id === column.id} desc={Boolean(sorting?.desc)} />
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 1} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map(row => {
                const id = getRowId(row)
                const isSelected = selected.has(id)
                return (
                  <TableRow key={id} data-state={isSelected ? 'selected' : undefined}>
                    <TableCell className="ps-3">
                      <input
                        type="checkbox"
                        aria-label={`Select row ${id}`}
                        className="size-3.5 translate-y-0.5 cursor-pointer accent-primary"
                        checked={isSelected}
                        onChange={() => toggleRow(id)}
                      />
                    </TableCell>
                    {visibleColumns.map(column => (
                      <TableCell key={column.id} className={column.className}>
                        {column.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="text-muted-foreground">
          {selected.size} of {rows.length} row(s) selected.
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Rows per page</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-16 justify-between">
                  {pageSize}
                  <ChevronsUpDown size={12} className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-20">
                {pageSizeOptions.map(size => (
                  <DropdownMenuItem key={size} onSelect={() => setPageSize(size)}>
                    {size}
                    {size === pageSize ? <Check size={13} className="ms-auto" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="text-muted-foreground">
            Page {safePageIndex + 1} of {pageCount}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="First page"
              disabled={safePageIndex === 0}
              onClick={() => setPageIndex(0)}
            >
              <span className="sr-only">First</span>
              <ChevronsUpDown size={13} className="-rotate-90" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={safePageIndex === 0}
              onClick={() => setPageIndex(Math.max(0, safePageIndex - 1))}
            >
              <ArrowUp size={13} className="-rotate-90" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={safePageIndex >= pageCount - 1}
              onClick={() => setPageIndex(Math.min(pageCount - 1, safePageIndex + 1))}
            >
              <ArrowDown size={13} className="-rotate-90" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Last page"
              disabled={safePageIndex >= pageCount - 1}
              onClick={() => setPageIndex(pageCount - 1)}
            >
              <ChevronsUpDown size={13} className="rotate-90" />
            </Button>
          </div>
        </div>
      </div>

      {selectedRows.length > 0 && bulkActions ? (
        <div
          className={cn(
            'pointer-events-none sticky bottom-0 z-10 flex justify-center pt-2 pb-1',
            'max-sm:has-[>[data-slot=toolbar]]:mb-16',
          )}
        >
          <div className="pointer-events-auto flex items-center gap-2 rounded-lg border bg-background p-2 shadow-lg">
            <div className="hidden text-sm font-medium sm:block">
              {selectedRows.length} selected
            </div>
            <div className="flex items-center gap-2">{bulkActions(selectedRows, clearSelection)}</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
