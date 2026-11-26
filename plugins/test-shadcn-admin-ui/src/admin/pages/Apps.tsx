import * as React from 'react'
import { ArrowDownAZ, ArrowUpAZ, Check, SlidersHorizontal } from 'lucide-react'
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  cn,
  toast,
} from '@folio/base-ui-kit/client'
import { APP_ENTRIES, type AppEntry } from '../data'

type AppFilter = 'all' | 'connected' | 'notConnected'
type SortOrder = 'asc' | 'desc'

const FILTER_LABEL: Record<AppFilter, string> = {
  all: 'All Apps',
  connected: 'Connected',
  notConnected: 'Not Connected',
}

export function AppsPage(): React.ReactElement {
  const [apps, setApps] = React.useState<AppEntry[]>(() => [...APP_ENTRIES])
  const [filter, setFilter] = React.useState('')
  const [type, setType] = React.useState<AppFilter>('all')
  const [sort, setSort] = React.useState<SortOrder>('asc')

  const filtered = apps
    .filter(app =>
      type === 'connected' ? app.connected : type === 'notConnected' ? !app.connected : true,
    )
    .filter(app => app.name.toLowerCase().includes(filter.trim().toLowerCase()))
    .sort((a, b) => (sort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)))

  const toggle = (name: string): void => {
    setApps(previous =>
      previous.map(app => (app.name === name ? { ...app, connected: !app.connected } : app)),
    )
    const target = apps.find(app => app.name === name)
    if (target) {
      toast({
        title: target.connected ? `${name} disconnected` : `${name} connected`,
        description: 'Integration state is local to this demo workspace.',
      })
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">App Integrations</h1>
        <p className="text-muted-foreground">Here&apos;s a list of your apps for the integration!</p>
      </div>

      <div className="my-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Filter apps..."
            className="h-9 w-full sm:w-64"
            value={filter}
            onChange={event => setFilter(event.target.value)}
          />
          <Select value={type} onValueChange={value => setType(value as AppFilter)}>
            <SelectTrigger className="w-36" aria-label="Filter apps by connection">
              <SelectValue>{FILTER_LABEL[type]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Apps</SelectItem>
              <SelectItem value="connected">Connected</SelectItem>
              <SelectItem value="notConnected">Not Connected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Select value={sort} onValueChange={value => setSort(value as SortOrder)}>
          <SelectTrigger className="w-16" aria-label="Sort apps">
            <SelectValue>
              <SlidersHorizontal size={18} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="asc">
              <span className="flex items-center gap-2">
                <ArrowUpAZ size={16} />
                <span>Ascending</span>
              </span>
            </SelectItem>
            <SelectItem value="desc">
              <span className="flex items-center gap-2">
                <ArrowDownAZ size={16} />
                <span>Descending</span>
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Separator className="shadow-sm" />

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No apps match {filter ? `“${filter}”` : 'this filter'} yet.
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-4 overflow-auto pt-4 pb-16 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(app => {
            const Logo = app.icon
            return (
              <li key={app.name} className="rounded-lg border p-4 transition-shadow hover:shadow-md">
                <div className="mb-8 flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-muted p-2">
                    <Logo size={22} />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      app.connected &&
                        'border border-blue-300 bg-blue-50 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:hover:bg-blue-900',
                    )}
                    onClick={() => toggle(app.name)}
                  >
                    {app.connected ? (
                      <>
                        <Check size={13} /> Connected
                      </>
                    ) : (
                      'Connect'
                    )}
                  </Button>
                </div>
                <div>
                  <h2 className="mb-1 flex items-center gap-2 font-semibold">
                    {app.name}
                    {app.connected ? (
                      <Badge variant="secondary" className="text-[10px]">
                        active
                      </Badge>
                    ) : null}
                  </h2>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{app.desc}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
