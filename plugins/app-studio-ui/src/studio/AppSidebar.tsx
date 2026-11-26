import * as React from 'react'
import {
  ChevronRight,
  CircleUser,
  CreditCard,
  EllipsisVertical,
  Github,
  LogOut,
  Mail,
  MessageSquareDot,
  PlusCircle,
} from 'lucide-react'
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  cn,
  useSidebar,
} from '@folio/core-ui-kit/client'
import {
  STUDIO_NAV,
  isNavParent,
  type StudioNavGroup,
  type StudioNavItem,
  type StudioNavLink,
  type StudioRoute,
} from './routes'
import { useStudioSettings } from './settings'

export const STUDIO_ROOT_USER = {
  name: 'Arham Khan',
  email: 'hello@arhamkhnz.com',
  role: 'administrator',
} as const

export const STUDIO_ACCOUNTS = [
  STUDIO_ROOT_USER,
  { name: 'Ammar Khan', email: 'hello@ammarkhnz.com', role: 'admin' },
] as const

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function AppLogo({ className }: { className?: string }): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="96 96 308 308"
      fill="currentColor"
      fillRule="evenodd"
      aria-hidden="true"
      className={cn('size-5 shrink-0', className)}
    >
      <path
        transform="rotate(45 250 250)"
        d="M200.26 97.87L208.55 90.27L216.84 84.05L225.13 79.22L233.42 75.76L241.71 73.69L250.00 73.00L258.29 73.69L266.58 75.76L274.87 79.22L283.16 84.05L291.45 90.27L299.74 97.87L402.13 200.26L409.73 208.55L415.95 216.84L420.78 225.13L424.24 233.42L426.31 241.71L427.00 250.00L426.31 258.29L424.24 266.58L420.78 274.87L415.95 283.16L409.73 291.45L402.13 299.74L299.74 402.13L291.45 409.73L283.16 415.95L274.87 420.78L266.58 424.24L258.29 426.31L250.00 427.00L241.71 426.31L233.42 424.24L225.13 420.78L216.84 415.95L208.55 409.73L200.26 402.13L97.87 299.74L90.27 291.45L84.05 283.16L79.22 274.87L75.76 266.58L73.69 258.29L73.00 250.00L73.69 241.71L75.76 233.42L79.22 225.13L84.05 216.84L90.27 208.55L97.87 200.26ZM345.634 250a95.634 95.634 0 1 0 -191.268 0a95.634 95.634 0 1 0 191.268 0Z"
      />
    </svg>
  )
}

const badgeTone: Record<NonNullable<StudioNavLink['badge']>, string> = {
  new: 'border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300',
  soon: 'border-zinc-500/20 bg-zinc-500/10 text-zinc-600 dark:border-zinc-400/25 dark:bg-zinc-400/10 dark:text-zinc-300',
  updated:
    'border-blue-600/20 bg-blue-500/10 text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-300',
}

function NavItemBadge({ badge }: { badge?: StudioNavLink['badge'] }): React.ReactElement | null {
  if (!badge) return null
  return (
    <SidebarMenuBadge className={cn('rounded-sm border px-1.5 capitalize', badgeTone[badge])}>
      {badge}
    </SidebarMenuBadge>
  )
}

function CollapsedIconFallback({ title }: { title: string }): React.ReactElement {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-xs text-[10px] font-medium outline">
      {title.slice(0, 1)}
    </span>
  )
}

interface NavProps {
  readonly route: StudioRoute
  readonly onNavigate: (route: StudioRoute) => void
}

function NavLinkRow({ item, route, onNavigate }: { item: StudioNavLink } & NavProps): React.ReactElement {
  const { state, isMobile, setOpenMobile } = useSidebar()
  const { sidebarCollapsible } = useStudioSettings()
  const Icon = item.icon
  const collapsedDesktop = state === 'collapsed' && !isMobile && sidebarCollapsible === 'icon'

  const go = (): void => {
    if (item.disabled) return
    onNavigate(item.id)
    setOpenMobile(false)
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={item.id === route}
        tooltip={item.title}
        aria-disabled={item.disabled || undefined}
      >
        <button
          type="button"
          onClick={go}
          disabled={item.disabled}
          className={cn('w-full text-start', item.disabled && 'opacity-50')}
        >
          {Icon ? <Icon /> : collapsedDesktop ? <CollapsedIconFallback title={item.title} /> : null}
          <span>{item.title}</span>
        </button>
      </SidebarMenuButton>
      <NavItemBadge badge={item.badge} />
    </SidebarMenuItem>
  )
}

function NavCollapsibleRow({
  item,
  route,
  onNavigate,
}: { item: Exclude<StudioNavItem, StudioNavLink> } & NavProps): React.ReactElement {
  const { state, isMobile, setOpenMobile } = useSidebar()
  const Icon = item.icon
  const isActive = item.subItems.some(child => child.id === route)
  const [open, setOpen] = React.useState(isActive)
  const collapsedDesktop = state === 'collapsed' && !isMobile

  React.useEffect(() => {
    if (isActive) setOpen(true)
  }, [isActive])

  if (collapsedDesktop) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={item.title} isActive={isActive}>
              {Icon ? <Icon /> : <CollapsedIconFallback title={item.title} />}
              <span>{item.title}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" sideOffset={12} className="w-48">
            <DropdownMenuLabel>{item.title}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {item.subItems.map(child => (
              <DropdownMenuItem
                key={child.id}
                disabled={child.disabled}
                className={child.id === route ? 'bg-accent' : undefined}
                onClick={() => {
                  onNavigate(child.id)
                  setOpenMobile(false)
                }}
              >
                {child.title}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    )
  }

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title} isActive={isActive}>
            {Icon ? <Icon /> : null}
            <span>{item.title}</span>
            <ChevronRight className="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <NavItemBadge badge={item.badge} />
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.subItems.map(child => (
              <SidebarMenuSubItem key={child.id}>
                <SidebarMenuSubButton
                  asChild
                  isActive={child.id === route}
                  aria-disabled={child.disabled || undefined}
                >
                  <button
                    type="button"
                    disabled={child.disabled}
                    className="w-full text-start"
                    onClick={() => {
                      onNavigate(child.id)
                      setOpenMobile(false)
                    }}
                  >
                    <span>{child.title}</span>
                  </button>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function NavGroupBlock({ group, route, onNavigate }: { group: StudioNavGroup } & NavProps): React.ReactElement {
  return (
    <SidebarGroup>
      {group.label ? (
        <SidebarGroupLabel className="group-data-[collapsible=icon]:pointer-events-none">
          {group.label}
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map(item =>
            isNavParent(item) ? (
              <NavCollapsibleRow key={`${group.id}-${item.id}`} item={item} route={route} onNavigate={onNavigate} />
            ) : (
              <NavLinkRow
                key={`${group.id}-${item.title}`}
                item={item}
                route={route}
                onNavigate={onNavigate}
              />
            ),
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function QuickCreateRow({ onNavigate }: { onNavigate: (route: StudioRoute) => void }): React.ReactElement {
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Quick Create"
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
              onClick={() => onNavigate('tasks')}
            >
              <PlusCircle />
              <span>Quick Create</span>
            </SidebarMenuButton>
            <Button size="icon" variant="outline" className="size-9 shrink-0 group-data-[collapsible=icon]:opacity-0">
              <Mail />
              <span className="sr-only">Inbox</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function SupportCard(): React.ReactElement {
  return (
    <Card className="gap-2 overflow-hidden py-4 shadow-none group-data-[collapsible=icon]:hidden">
      <CardHeader className="min-w-0 px-4">
        <CardTitle className="truncate text-sm">Have something in mind?</CardTitle>
        <CardDescription className="line-clamp-3 text-xs">
          Studio Admin is MIT licensed. Suggest a feature or read the source on{' '}
          <a
            href="https://github.com/arhamkhnz/next-shadcn-admin-dashboard"
            target="_blank"
            rel="noreferrer"
            className="text-foreground hover:underline"
          >
            GitHub
          </a>
          .
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function NavUser(): React.ReactElement {
  const { isMobile } = useSidebar()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarFallback className="rounded-lg text-xs">
                  {initials(STUDIO_ROOT_USER.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-medium">{STUDIO_ROOT_USER.name}</span>
                <span className="truncate text-xs text-muted-foreground">{STUDIO_ROOT_USER.email}</span>
              </div>
              <EllipsisVertical className="ms-auto size-4" />
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
                <Avatar className="size-8 rounded-lg">
                  <AvatarFallback className="rounded-lg text-xs">
                    {initials(STUDIO_ROOT_USER.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-medium">{STUDIO_ROOT_USER.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{STUDIO_ROOT_USER.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <CircleUser />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <CreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem>
                <MessageSquareDot />
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
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function AppSidebar({ route, onNavigate }: NavProps): React.ReactElement {
  const { sidebarVariant, sidebarCollapsible } = useStudioSettings()

  return (
    <Sidebar
      collapsible={sidebarCollapsible}
      variant={sidebarVariant}
      aria-label="Studio Admin navigation"
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <button type="button" className="w-full" onClick={() => onNavigate('default')}>
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <AppLogo />
                </span>
                <span className="grid flex-1 text-start leading-tight">
                  <span className="truncate text-base font-semibold">Studio Admin</span>
                  <span className="truncate text-xs text-muted-foreground">shadcn/ui dashboard</span>
                </span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <QuickCreateRow onNavigate={onNavigate} />
        {STUDIO_NAV.map(group => (
          <NavGroupBlock key={group.id} group={group} route={route} onNavigate={onNavigate} />
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SupportCard />
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export function RepoMenuItem(): React.ReactElement {
  return (
    <DropdownMenuItem asChild>
      <a
        href="https://github.com/arhamkhnz/next-shadcn-admin-dashboard"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2"
      >
        <Github />
        View source
      </a>
    </DropdownMenuItem>
  )
}
