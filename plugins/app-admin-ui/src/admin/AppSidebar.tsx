import * as React from 'react'
import {
  AudioWaveform,
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  Command,
  CreditCard,
  GalleryVerticalEnd,
  Github,
  LogOut,
  Plus,
  Sparkles,
} from 'lucide-react'
import {
  Avatar,
  AvatarFallback,
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  FolioIconChevronRight,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
  toast,
} from '@folio/core-ui-kit/client'
import { NAV_GROUPS, ROUTE_META, isCollapsible, type AdminRoute, type NavGroup, type NavItem, type NavLinkItem } from './routes'

const TEAMS = [
  { name: 'Shadcn Admin', logo: Command, plan: 'Vite + ShadcnUI' },
  { name: 'Acme Inc', logo: GalleryVerticalEnd, plan: 'Enterprise' },
  { name: 'Acme Corp.', logo: AudioWaveform, plan: 'Startup' },
] as const

const USER = {
  name: 'satnaing',
  email: 'satnaingdev@gmail.com',
  initials: 'SN',
} as const

function NavBadge({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Badge className="ms-auto rounded-full px-1 py-0 text-xs">{children}</Badge>
}

function TeamSwitcher(): React.ReactElement {
  const { isMobile } = useSidebar()
  const [activeTeam, setActiveTeam] = React.useState<(typeof TEAMS)[number]>(TEAMS[0])
  const ActiveLogo = activeTeam.logo

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <ActiveLogo size={16} />
              </div>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">{activeTeam.name}</span>
                <span className="truncate text-xs">{activeTeam.plan}</span>
              </div>
              <ChevronsUpDown size={14} className="ms-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">Teams</DropdownMenuLabel>
            {TEAMS.map((team, index) => {
              const Logo = team.logo
              return (
                <DropdownMenuItem
                  key={team.name}
                  onClick={() => setActiveTeam(team)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-sm border">
                    <Logo size={14} className="shrink-0" />
                  </div>
                  {team.name}
                  <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus size={14} />
              </div>
              <div className="font-medium text-muted-foreground">Add team</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function NavLinkRow({
  item,
  active,
  onNavigate,
  nested = false,
}: {
  item: NavLinkItem
  active: boolean
  onNavigate: (route: AdminRoute) => void
  nested?: boolean
}): React.ReactElement {
  const Icon = item.icon
  const { setOpenMobile } = useSidebar()
  const content = (
    <>
      {Icon ? <Icon size={nested ? 14 : 16} /> : null}
      <span>{item.title}</span>
      {item.badge ? <NavBadge>{item.badge}</NavBadge> : null}
    </>
  )
  const handleClick = (): void => {
    onNavigate(item.route)
    setOpenMobile(false)
  }

  if (nested) {
    return (
      <SidebarMenuSubItem>
        <SidebarMenuSubButton asChild isActive={active}>
          <button type="button" onClick={handleClick} className="w-full text-start">
            {content}
          </button>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
    )
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
        <button type="button" onClick={handleClick} className="w-full text-start">
          {content}
        </button>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function NavCollapsibleRow({
  item,
  route,
  onNavigate,
}: {
  item: Exclude<NavItem, NavLinkItem>
  route: AdminRoute
  onNavigate: (route: AdminRoute) => void
}): React.ReactElement {
  const { state, isMobile, setOpenMobile } = useSidebar()
  const Icon = item.icon
  const isActive = item.items.some(child => child.route === route)
  const [open, setOpen] = React.useState(isActive)

  React.useEffect(() => {
    if (isActive) setOpen(true)
  }, [isActive])

  if (state === 'collapsed' && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={item.title} isActive={isActive}>
              {Icon ? <Icon size={16} /> : null}
              <span>{item.title}</span>
              <FolioIconChevronRight size={14} className="ms-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" sideOffset={4} className="min-w-48">
            <DropdownMenuLabel>{item.title}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {item.items.map(child => {
              const ChildIcon = child.icon
              return (
                <DropdownMenuItem
                  key={child.route}
                  className={child.route === route ? 'bg-secondary' : undefined}
                  onClick={() => {
                    onNavigate(child.route)
                    setOpenMobile(false)
                  }}
                >
                  {ChildIcon ? <ChildIcon size={14} /> : null}
                  <span className="max-w-52 text-wrap">{child.title}</span>
                  {child.badge ? <span className="ms-auto text-xs">{child.badge}</span> : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    )
  }

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title}>
            {Icon ? <Icon size={16} /> : null}
            <span>{item.title}</span>
            <FolioIconChevronRight
              size={14}
              className="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.items.map(child => (
              <NavLinkRow
                key={child.route}
                item={child}
                active={child.route === route}
                onNavigate={onNavigate}
                nested
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function NavGroupBlock({
  group,
  route,
  onNavigate,
}: {
  group: NavGroup
  route: AdminRoute
  onNavigate: (route: AdminRoute) => void
}): React.ReactElement {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
      <SidebarMenu>
        {group.items.map(item =>
          isCollapsible(item) ? (
            <NavCollapsibleRow key={item.title} item={item} route={route} onNavigate={onNavigate} />
          ) : (
            <NavLinkRow
              key={item.route}
              item={item}
              active={item.route === route}
              onNavigate={onNavigate}
            />
          ),
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function NavUser({ onNavigate }: { onNavigate: (route: AdminRoute) => void }): React.ReactElement {
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{USER.initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-semibold">{USER.name}</span>
                <span className="truncate text-xs">{USER.email}</span>
              </div>
              <ChevronsUpDown size={14} className="ms-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{USER.initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">{USER.name}</span>
                  <span className="truncate text-xs">{USER.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <Sparkles size={14} />
                Upgrade to Pro
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => {
                  onNavigate('settings-account')
                  setOpenMobile(false)
                }}
              >
                <BadgeCheck size={14} />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onNavigate('settings-profile')
                  setOpenMobile(false)
                }}
              >
                <CreditCard size={14} />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onNavigate('settings-notifications')
                  setOpenMobile(false)
                }}
              >
                <Bell size={14} />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={closeDemoSession}>
              <LogOut size={14} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function closeDemoSession(): void {
  toast({
    title: 'Demo workspace',
    description: 'Sign out is not wired to a real session.',
  })
}

export function AppSidebar({
  route,
  onNavigate,
}: {
  route: AdminRoute
  onNavigate: (route: AdminRoute) => void
}): React.ReactElement {
  const current = ROUTE_META[route]
  return (
    <Sidebar collapsible="icon" variant="inset" aria-label={`Shadcn Admin — ${current.title}`}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map(group => (
          <NavGroupBlock key={group.title} group={group} route={route} onNavigate={onNavigate} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <a
          href="https://github.com/satnaing/shadcn-admin"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-md border border-sidebar-border px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
        >
          <Github size={14} />
          <span className="truncate">Ported from satnaing/shadcn-admin</span>
        </a>
        <NavUser onNavigate={onNavigate} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
