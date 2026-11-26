import * as React from 'react'
import {
  BadgeCheck,
  Bell,
  Check,
  CreditCard,
  Github,
  LayoutPanelLeft,
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings2,
  Sun,
} from 'lucide-react'
import {
  Avatar,
  AvatarFallback,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Separator,
  SidebarTrigger,
  cn,
} from '@folio/base-ui-kit/client'
import { SEARCH_ENTRIES, type StudioRoute } from './routes'
import {
  PRESET_LABELS,
  PRESET_ORDER,
  type StudioContentLayout,
  type StudioNavbarStyle,
  type StudioPreset,
  type StudioSidebarCollapsible,
  type StudioSidebarVariant,
  type StudioThemeMode,
  useStudioSettings,
} from './settings'
import { STUDIO_ACCOUNTS, initials } from './AppSidebar'

interface NavProps {
  readonly onNavigate: (route: StudioRoute) => void
}

function SearchDialog({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (route: StudioRoute) => void
} & NavProps): React.ReactElement {
  const [query, setQuery] = React.useState('')

  React.useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const normalized = query.trim().toLowerCase()
  const results = SEARCH_ENTRIES.filter(
    entry =>
      normalized.length === 0 ||
      entry.title.toLowerCase().includes(normalized) ||
      entry.group.toLowerCase().includes(normalized),
  )

  const select = (route: StudioRoute): void => {
    onNavigate(route)
    onOpenChange(false)
  }

  const groups = React.useMemo(() => {
    const order: string[] = []
    const map = new Map<string, typeof results>()
    for (const entry of results) {
      if (!map.has(entry.group)) {
        map.set(entry.group, [])
        order.push(entry.group)
      }
      map.get(entry.group)?.push(entry)
    }
    return order.map(group => ({ group, items: map.get(group) ?? [] }))
  }, [results])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search Studio Admin</DialogTitle>
          <DialogDescription>Jump to any dashboard or page.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search dashboards, users, and more…"
            className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            onKeyDown={event => {
              if (event.key === 'Enter') {
                const first = results[0]
                if (first) select(first.id)
              }
            }}
          />
          <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No results found.</p>
          ) : (
            groups.map(({ group, items }) => (
              <div key={group} className="mb-2">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group}</p>
                <ul className="m-0 list-none space-y-0.5 p-0">
                  {items.map(entry => {
                    const Icon = entry.icon ?? Search
                    return (
                      <li key={`${group}-${entry.id}-${entry.title}`}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-hidden"
                          onClick={() => select(entry.id)}
                        >
                          <Icon className="size-4 text-muted-foreground" />
                          <span className="truncate">{entry.title}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{label}</p>
      <div className="flex overflow-hidden rounded-md border">
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={option.value === value}
            className={cn(
              'flex-1 px-2 py-1.5 text-xs transition-colors',
              option.value === value
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const THEME_MODES: readonly { value: StudioThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const CONTENT_LAYOUTS: readonly { value: StudioContentLayout; label: string }[] = [
  { value: 'full', label: 'Full width' },
  { value: 'centered', label: 'Centered' },
]

const NAVBAR_STYLES: readonly { value: StudioNavbarStyle; label: string }[] = [
  { value: 'sticky', label: 'Sticky' },
  { value: 'static', label: 'Scroll' },
]

const SIDEBAR_VARIANTS: readonly { value: StudioSidebarVariant; label: string }[] = [
  { value: 'inset', label: 'Inset' },
  { value: 'sidebar', label: 'Sidebar' },
  { value: 'floating', label: 'Floating' },
]

const SIDEBAR_COLLAPSIBLES: readonly { value: StudioSidebarCollapsible; label: string }[] = [
  { value: 'icon', label: 'Icon' },
  { value: 'offcanvas', label: 'OffCanvas' },
  { value: 'none', label: 'None' },
]

function LayoutControls(): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const {
    mode,
    preset,
    contentLayout,
    navbarStyle,
    sidebarVariant,
    sidebarCollapsible,
    setMode,
    setPreset,
    setContentLayout,
    setNavbarStyle,
    setSidebarVariant,
    setSidebarCollapsible,
  } = useStudioSettings()

  const reset = (): void => {
    setMode('system')
    setPreset('default')
    setContentLayout('full')
    setNavbarStyle('static')
    setSidebarVariant('inset')
    setSidebarCollapsible('icon')
  }

  return (
    <>
      <Button size="icon" aria-label="Layout controls" onClick={() => setOpen(true)}>
        <Settings2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Preferences</DialogTitle>
            <DialogDescription>Customize your dashboard layout preferences.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Theme Preset</p>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESET_ORDER.map(option => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPreset(option as StudioPreset)}
                    aria-pressed={option === preset}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors',
                      option === preset ? 'bg-secondary text-secondary-foreground' : 'hover:bg-accent',
                    )}
                  >
                    <span className="size-2.5 rounded-full" data-preset-swatch={option} />
                    {PRESET_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            <SegmentedControl
              label="Theme Mode"
              value={mode}
              options={THEME_MODES}
              onChange={setMode}
            />
            <SegmentedControl
              label="Page Layout"
              value={contentLayout}
              options={CONTENT_LAYOUTS}
              onChange={setContentLayout}
            />
            <SegmentedControl
              label="Navbar Behavior"
              value={navbarStyle}
              options={NAVBAR_STYLES}
              onChange={setNavbarStyle}
            />
            <SegmentedControl
              label="Sidebar Style"
              value={sidebarVariant}
              options={SIDEBAR_VARIANTS}
              onChange={setSidebarVariant}
            />
            <SegmentedControl
              label="Sidebar Collapse Mode"
              value={sidebarCollapsible}
              options={SIDEBAR_COLLAPSIBLES}
              onChange={setSidebarCollapsible}
            />

            <Button type="button" size="sm" variant="outline" onClick={reset}>
              Restore Defaults
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ThemeSwitcher(): React.ReactElement {
  const { mode, setMode } = useStudioSettings()

  return (
    <Button
      size="icon"
      onClick={() => {
        const index = THEME_MODES.findIndex(option => option.value === mode)
        const next = THEME_MODES[(index + 1) % THEME_MODES.length]
        if (next) setMode(next.value)
      }}
      aria-label={`Current theme: ${mode}. Click to cycle themes`}
    >
      {mode === 'system' ? <Monitor /> : mode === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}

function GitHubRepositoriesMenu(): React.ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" aria-label="Upstream repositories">
          <Github />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Upstream editions</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <a
            href="https://github.com/arhamkhnz/next-shadcn-admin-dashboard"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2"
          >
            <LayoutPanelLeft />
            Next.js · Shadcn UI
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href="https://github.com/arhamkhnz/next-shadcn-admin-dashboard-baseui"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2"
          >
            <LayoutPanelLeft />
            Next.js · Base UI
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href="https://github.com/arhamkhnz/tanstack-shadcn-admin-dashboard"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2"
          >
            <LayoutPanelLeft />
            TanStack Start
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccountSwitcher(): React.ReactElement {
  const [activeEmail, setActiveEmail] = React.useState<string>(STUDIO_ACCOUNTS[0].email)
  const active = STUDIO_ACCOUNTS.find(account => account.email === activeEmail) ?? STUDIO_ACCOUNTS[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Switch account" className="rounded-lg">
          <Avatar className="size-8 rounded-lg">
            <AvatarFallback className="rounded-lg text-xs">{initials(active.name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56 space-y-1 rounded-lg" side="bottom" align="end" sideOffset={4}>
        {STUDIO_ACCOUNTS.map(account => (
          <DropdownMenuItem
            key={account.email}
            className={cn('p-0', account.email === activeEmail && 'bg-accent/50')}
            onClick={() => setActiveEmail(account.email)}
          >
            <div className="flex w-full items-center gap-2 px-1 py-1.5">
              <Avatar className="size-9 rounded-lg">
                <AvatarFallback className="rounded-lg text-xs">{initials(account.name)}</AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">{account.name}</span>
                <span className="truncate text-xs capitalize">{account.role}</span>
              </div>
              <span
                className={cn(
                  'me-1 flex size-5 items-center justify-center rounded-full text-primary opacity-0',
                  account.email === activeEmail && 'opacity-100',
                )}
              >
                <Check aria-hidden="true" className="size-4" />
              </span>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <BadgeCheck />
            Account
          </DropdownMenuItem>
          <DropdownMenuItem>
            <CreditCard />
            Billing
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Bell />
            Notifications
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function StudioHeader({ onNavigate }: NavProps): React.ReactElement {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const { navbarStyle } = useStudioSettings()

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setSearchOpen(previous => !previous)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear lg:px-6',
        navbarStyle === 'sticky'
          ? 'sticky top-0 z-50 rounded-t-[inherit] bg-background/50 backdrop-blur-md'
          : 'bg-background',
      )}
    >
      <div className="flex min-w-0 items-center gap-1 lg:gap-2">
        <SidebarTrigger className="-ms-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center" />
        <Button
          variant="link"
          onClick={() => setSearchOpen(true)}
          className="px-0! font-normal text-muted-foreground hover:no-underline"
        >
          <Search data-icon="inline-start" />
          Search
          <kbd className="inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium select-none">
            <span className="text-xs">⌘</span>J
          </kbd>
        </Button>
      </div>

      <div className="ms-auto flex items-center gap-2">
        <LayoutControls />
        <ThemeSwitcher />
        <GitHubRepositoriesMenu />
        <AccountSwitcher />
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} onNavigate={onNavigate} />
    </header>
  )
}
