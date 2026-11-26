import * as React from 'react'
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  CreditCard,
  Loader,
  Search,
  UserRound,
  UsersRound,
} from 'lucide-react'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@folio/base-ui-kit/client'
import type { Billing, CustomerRow } from '../data'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'Subscribed', label: 'Subscribed' },
  { value: 'Inactive', label: 'Inactive' },
  { value: 'Unsubscribed', label: 'Unsubscribed' },
] as const

const BILLING_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'Paid', label: 'Paid' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Overdue', label: 'Overdue' },
  { value: 'Trial', label: 'Trial' },
] as const

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name-asc', label: 'Name A-Z' },
  { value: 'name-desc', label: 'Name Z-A' },
] as const

type SortValue = (typeof SORT_OPTIONS)[number]['value']

const DARK_GREEN_FILL = 'fill-green-500 dark:fill-green-600'

function BillingIcon({ billing }: { billing: Billing }): React.ReactElement | null {
  switch (billing) {
    case 'Paid':
      return <CircleCheck className={cn('size-3.5 stroke-primary-foreground', DARK_GREEN_FILL)} />
    case 'Pending':
      return <Loader className="size-3.5" />
    case 'Overdue':
      return <CircleAlert className="size-3.5 text-amber-600 dark:text-amber-500" />
    case 'Trial':
      return <Clock3 className="size-3.5 text-muted-foreground" />
    default:
      return null
  }
}

function SelectionBox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean
  onToggle: () => void
  label: string
}): React.ReactElement {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-xs transition-colors',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'bg-transparent',
      )}
    >
      {checked ? <Check className="size-3" /> : null}
    </button>
  )
}

function formatJoined(value: string, id: string): { date: string; time: string } {
  const base = new Date(`${value}T00:00:00Z`)
  const minutes = 9 * 60 + (Number(id) % 12) * 17
  const joinedAt = new Date(base.getTime() + minutes * 60_000)
  return {
    date: joinedAt.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    time: `at ${joinedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })}`,
  }
}

export function RecentCustomersTable({ data }: { data: readonly CustomerRow[] }): React.ReactElement {
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState<(typeof STATUS_OPTIONS)[number]['value']>('all')
  const [billing, setBilling] = React.useState<(typeof BILLING_OPTIONS)[number]['value']>('all')
  const [sort, setSort] = React.useState<SortValue>('newest')
  const [pageIndex, setPageIndex] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(10)
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(() => new Set())

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const rows = data.filter(row => {
      if (status !== 'all' && row.status !== status) return false
      if (billing !== 'all' && row.billing !== billing) return false
      if (normalized.length === 0) return true
      return `${row.id} ${row.name} ${row.email}`.toLowerCase().includes(normalized)
    })

    const sorted = [...rows]
    sorted.sort((a, b) => {
      if (sort === 'newest') return b.joined.localeCompare(a.joined)
      if (sort === 'oldest') return a.joined.localeCompare(b.joined)
      if (sort === 'name-asc') return a.name.localeCompare(b.name)
      return b.name.localeCompare(a.name)
    })
    return sorted
  }, [data, query, status, billing, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)
  const pageRows = filtered.slice(safePageIndex * pageSize, safePageIndex * pageSize + pageSize)
  const allPageSelected = pageRows.length > 0 && pageRows.every(row => selected.has(row.id))
  const somePageSelected = pageRows.some(row => selected.has(row.id))

  const toggleRow = (id: string): void => {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const togglePage = (): void => {
    setSelected(previous => {
      const next = new Set(previous)
      if (allPageSelected) for (const row of pageRows) next.delete(row.id)
      else for (const row of pageRows) next.add(row.id)
      return next
    })
  }

  const resetPage = (): void => setPageIndex(0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-7 rounded-[min(var(--radius-md),12px)] pl-8"
              placeholder="Search customers..."
              value={query}
              onChange={event => {
                setQuery(event.target.value)
                resetPage()
              }}
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <UsersRound />
                Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-35" align="start">
              <DropdownMenuRadioGroup
                value={status}
                onValueChange={value => {
                  setStatus(value as (typeof STATUS_OPTIONS)[number]['value'])
                  resetPage()
                }}
              >
                {STATUS_OPTIONS.map(option => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <CreditCard />
                Billing
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={billing}
                onValueChange={value => {
                  setBilling(value as (typeof BILLING_OPTIONS)[number]['value'])
                  resetPage()
                }}
              >
                {BILLING_OPTIONS.map(option => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ArrowUpDown />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={value => {
                  setSort(value as SortValue)
                  resetPage()
                }}
              >
                {SORT_OPTIONS.map(option => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/15">
            <TableRow>
              <TableHead className="h-11 w-10 p-3">
                <div className="flex items-center justify-center">
                  <SelectionBox
                    checked={allPageSelected}
                    onToggle={togglePage}
                    label="Select all customers on this page"
                  />
                </div>
              </TableHead>
              <TableHead className="h-11 p-3 font-medium">Customer</TableHead>
              <TableHead className="h-11 p-3 font-medium">Status</TableHead>
              <TableHead className="h-11 p-3 font-medium">Billing</TableHead>
              <TableHead className="h-11 p-3 font-medium">Plan</TableHead>
              <TableHead className="h-11 p-3 font-medium">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map(row => {
                const joined = formatJoined(row.joined, row.id)
                return (
                  <TableRow key={row.id} data-state={selected.has(row.id) ? 'selected' : undefined}>
                    <TableCell className="p-3 align-middle">
                      <div className="flex items-center justify-center">
                        <SelectionBox
                          checked={selected.has(row.id)}
                          onToggle={() => toggleRow(row.id)}
                          label={`Select ${row.name}`}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="p-3 align-middle">
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 items-center justify-center rounded-md border bg-muted">
                          <UserRound className="size-4 text-muted-foreground" />
                        </span>
                        <div className="grid min-w-0 gap-0.5">
                          <span className="truncate text-sm leading-none font-medium">{row.name}</span>
                          <span className="truncate text-xs leading-none text-muted-foreground">#{row.id}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="p-3 align-middle">
                      <Badge variant="outline" className="px-1.5 text-muted-foreground">
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="p-3 align-middle">
                      <Badge variant="outline" className="px-1.5 text-muted-foreground">
                        <BillingIcon billing={row.billing} />
                        {row.billing}
                      </Badge>
                    </TableCell>
                    <TableCell className="p-3 align-middle text-sm">{row.plan}</TableCell>
                    <TableCell className="p-3 align-middle">
                      <div className="grid gap-0.5">
                        <span className="text-sm">{joined.date}</span>
                        <span className="text-xs text-muted-foreground">{joined.time}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
          {selected.size} of {filtered.length} row(s) selected.
        </div>
        <div className="flex w-full items-center gap-8 lg:w-fit">
          <div className="hidden items-center gap-2 lg:flex">
            <label htmlFor="studio-customers-rows-per-page" className="text-sm font-medium">
              Rows per page
            </label>
            <Select
              value={`${pageSize}`}
              onValueChange={value => {
                setPageSize(Number(value))
                resetPage()
              }}
            >
              <SelectTrigger size="sm" className="w-20" id="studio-customers-rows-per-page">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                <SelectGroup>
                  {[10, 20, 30, 40, 50].map(size => (
                    <SelectItem key={size} value={`${size}`}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-fit items-center justify-center text-sm font-medium">
            Page {safePageIndex + 1} of {pageCount}
          </div>
          <div className="ms-auto flex items-center gap-2 lg:ms-0">
            <Button
              variant="outline"
              className="hidden size-8 lg:flex"
              size="icon"
              onClick={() => setPageIndex(0)}
              disabled={safePageIndex === 0}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              className="size-8"
              size="icon"
              onClick={() => setPageIndex(index => Math.max(0, index - 1))}
              disabled={safePageIndex === 0}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              className="size-8"
              size="icon"
              onClick={() => setPageIndex(index => Math.min(pageCount - 1, index + 1))}
              disabled={safePageIndex >= pageCount - 1}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden size-8 lg:flex"
              size="icon"
              onClick={() => setPageIndex(pageCount - 1)}
              disabled={safePageIndex >= pageCount - 1}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
