import * as React from 'react'
import {
  Check,
  CreditCard,
  LogOut,
  Moon,
  Search as SearchIcon,
  Settings,
  Sparkles,
  Sun,
  UserCircle,
} from 'lucide-react'
import {
  Avatar,
  AvatarFallback,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
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
  toast,
} from '@folio/core-ui-kit/client'
import { ROUTE_META, SEARCH_ENTRIES, type AdminRoute } from './routes'
import { useAdminTheme, type AdminTheme } from './theme'

export function AdminBreadcrumbs({
  route,
  onNavigate,
}: {
  route: AdminRoute
  onNavigate: (route: AdminRoute) => void
}): React.ReactElement {
  const crumbs = ROUTE_META[route].crumbs
  return (
    <Breadcrumb>
      <BreadcrumbList className="m-0 list-none p-0">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <React.Fragment key={`${crumb.title}-${index}`}>
              <BreadcrumbItem className={index === 0 ? 'hidden md:block' : undefined}>
                {last || !crumb.route ? (
                  <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <button
                      type="button"
                      className="cursor-pointer"
                      onClick={() => {
                        if (crumb.route) onNavigate(crumb.route)
                      }}
                    >
                      {crumb.title}
                    </button>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {last ? null : <BreadcrumbSeparator className="hidden md:block" />}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function ThemeSwitch(): React.ReactElement {
  const { theme, setTheme } = useAdminTheme()
  const options: readonly { value: AdminTheme; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ]

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="scale-95 rounded-full" aria-label="Toggle theme">
          <Sun size={18} className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon size={18} className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map(option => (
          <DropdownMenuItem key={option.value} onClick={() => setTheme(option.value)}>
            {option.label}
            <Check size={14} className={cn('ms-auto', theme !== option.value && 'invisible')} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ProfileDropdown({ onNavigate }: { onNavigate: (route: AdminRoute) => void }): React.ReactElement {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full" aria-label="Open profile menu">
          <Avatar className="h-8 w-8">
            <AvatarFallback>SN</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm leading-none font-medium">satnaing</p>
            <p className="text-xs leading-none text-muted-foreground">satnaingdev@gmail.com</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onNavigate('settings-profile')}>
            <UserCircle size={14} />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate('settings-account')}>
            <CreditCard size={14} />
            Billing
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate('settings-appearance')}>
            <Settings size={14} />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Sparkles size={14} />
            New Team
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() =>
            toast({
              title: 'Demo workspace',
              description: 'Sign out is not wired to a real session.',
            })
          }
        >
          <LogOut size={14} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SearchDialog({
  open,
  onOpenChange,
  onNavigate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (route: AdminRoute) => void
}): React.ReactElement {
  const [query, setQuery] = React.useState('')
  const results = SEARCH_ENTRIES.filter(entry =>
    entry.title.toLowerCase().includes(query.trim().toLowerCase()),
  )

  React.useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const select = (route: AdminRoute): void => {
    onNavigate(route)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search navigation</DialogTitle>
          <DialogDescription>Jump to any page in the admin console.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b px-3">
          <SearchIcon size={16} className="shrink-0 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search pages, settings, errors..."
            className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            onKeyDown={event => {
              if (event.key === 'Enter') {
                const first = results[0]
                if (first) select(first.route)
              }
            }}
          />
          <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No results found.</p>
          ) : (
            <ul className="m-0 list-none space-y-1 p-0">
              {results.map(entry => {
                const Icon = entry.icon ?? SearchIcon
                return (
                  <li key={entry.route}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-start text-sm hover:bg-accent hover:text-accent-foreground"
                      onClick={() => select(entry.route)}
                    >
                      <Icon size={15} />
                      <span>{entry.title}</span>
                      <span className="ms-auto text-xs text-muted-foreground">{entry.route}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TopNav({ onNavigate }: { onNavigate: (route: AdminRoute) => void }): React.ReactElement {
  const links = [
    { title: 'Overview', route: 'dashboard' as AdminRoute, disabled: false },
    { title: 'Customers', route: 'users' as AdminRoute, disabled: true },
    { title: 'Products', route: 'apps' as AdminRoute, disabled: true },
    { title: 'Settings', route: 'settings-profile' as AdminRoute, disabled: true },
  ]
  return (
    <nav aria-label="Dashboard sections" className="hidden items-center gap-1 md:flex">
      {links.map(link => (
        <button
          key={link.title}
          type="button"
          disabled={link.disabled}
          onClick={() => onNavigate(link.route)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm transition-colors',
            link.title === 'Overview'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
          )}
        >
          {link.title}
        </button>
      ))}
    </nav>
  )
}

export function AdminHeader({
  route,
  onNavigate,
  children,
}: {
  route: AdminRoute
  onNavigate: (route: AdminRoute) => void
  children?: React.ReactNode
}): React.ReactElement {
  const [searchOpen, setSearchOpen] = React.useState(false)

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(previous => !previous)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background px-4 sm:gap-3">
      <SidebarTrigger variant="outline" className="max-md:scale-110" />
      <Separator orientation="vertical" className="h-6" />
      <div className="hidden min-w-0 sm:block">
        <AdminBreadcrumbs route={route} onNavigate={onNavigate} />
      </div>
      {children}
      <div className="ms-auto flex items-center gap-1 sm:gap-2">
        <Button
          variant="outline"
          className="relative h-8 w-8 justify-start text-sm font-normal text-muted-foreground shadow-none sm:w-40 sm:pe-12 lg:w-52 xl:w-64"
          aria-keyshortcuts="Meta+K Control+K"
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
        >
          <SearchIcon size={15} />
          <span className="hidden sm:inline">Search</span>
          <kbd className="pointer-events-none absolute end-[0.3rem] top-[0.3rem] hidden h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium select-none sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </Button>
        <ThemeSwitch />
        <ProfileDropdown onNavigate={onNavigate} />
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} onNavigate={onNavigate} />
    </header>
  )
}

export { TopNav }
