import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceUiContribution } from '@folio/lib-shared-contract'
import {
  Avatar,
  AvatarFallback,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
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
  FolioIconChevronDown,
  FolioIconChevronRight,
  FolioIconData,
  FolioIconExternal,
  FolioIconLayers,
  FolioIconMoreHorizontal,
  FolioIconPanelLeft,
  FolioIconPlugin,
  FolioIconPlus,
  FolioIconSettings,
  FolioIconSparkle,
  FolioIconTrash,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  TooltipProvider,
  useSidebar,
  type FolioIconProps,
} from '@folio/core-ui-kit/client'

type IconComp = React.ComponentType<FolioIconProps>

const DEMO_DATA = {
  user: {
    name: 'LocalFolio',
    email: 'workspace@localfolio.dev',
    initials: 'LF',
  },
  teams: [
    { name: 'Acme Inc', logo: FolioIconLayers, plan: 'Enterprise' },
    { name: 'Acme Corp.', logo: FolioIconPlugin, plan: 'Startup' },
    { name: 'Evil Corp.', logo: FolioIconSparkle, plan: 'Free' },
  ],
  navMain: [
    {
      title: 'Playground',
      icon: FolioIconData,
      isActive: true,
      items: ['History', 'Starred', 'Settings'],
    },
    {
      title: 'Models',
      icon: FolioIconSparkle,
      items: ['Genesis', 'Explorer', 'Quantum'],
    },
    {
      title: 'Documentation',
      icon: FolioIconLayers,
      items: ['Introduction', 'Get Started', 'Tutorials', 'Changelog'],
    },
    {
      title: 'Settings',
      icon: FolioIconSettings,
      items: ['General', 'Team', 'Billing', 'Limits'],
    },
  ],
  projects: [
    { name: 'Design Engineering', icon: FolioIconPanelLeft },
    { name: 'Sales & Marketing', icon: FolioIconData },
    { name: 'Travel', icon: FolioIconExternal },
  ],
} as const

function TeamSwitcher({
  teams,
}: {
  teams: readonly { readonly name: string; readonly logo: IconComp; readonly plan: string }[]
}): React.ReactElement | null {
  const { isMobile } = useSidebar()
  const [activeTeam, setActiveTeam] = React.useState(teams[0])
  if (!activeTeam) return null
  const ActiveLogo = activeTeam.logo

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              data-lf-team-switcher=""
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <ActiveLogo size={15} />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{activeTeam.name}</span>
                <span className="truncate text-xs">{activeTeam.plan}</span>
              </div>
              <FolioIconChevronDown size={14} className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">Teams</DropdownMenuLabel>
            {teams.map((team, index) => {
              const Logo = team.logo
              return (
                <DropdownMenuItem
                  key={team.name}
                  onClick={() => setActiveTeam(team)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    <Logo size={13} />
                  </div>
                  {team.name}
                  <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                </DropdownMenuItem>
              )
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                <FolioIconPlus size={13} />
              </div>
              <div className="font-medium text-muted-foreground">Add team</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function NavMain({
  items,
  activeItem,
  onSelect,
}: {
  items: readonly {
    readonly title: string
    readonly icon: IconComp
    readonly isActive?: boolean
    readonly items: readonly string[]
  }[]
  activeItem: { group: string; item: string }
  onSelect: (group: string, item: string) => void
}): React.ReactElement {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map(group => {
          const Icon = group.icon
          return (
            <Collapsible
              key={group.title}
              asChild
              defaultOpen={group.isActive}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={group.title}>
                    <Icon size={15} />
                    <span>{group.title}</span>
                    <FolioIconChevronRight
                      size={14}
                      className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                    />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {group.items.map(subTitle => (
                      <SidebarMenuSubItem key={subTitle}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={activeItem.group === group.title && activeItem.item === subTitle}
                        >
                          <button
                            type="button"
                            onClick={() => onSelect(group.title, subTitle)}
                            className="w-full text-left"
                          >
                            <span>{subTitle}</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function NavProjects({
  projects,
  onSelect,
}: {
  projects: readonly { readonly name: string; readonly icon: IconComp }[]
  onSelect: (name: string) => void
}): React.ReactElement {
  const { isMobile } = useSidebar()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarMenu>
        {projects.map(item => {
          const Icon = item.icon
          return (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton asChild>
                <button
                  type="button"
                  onClick={() => onSelect(item.name)}
                  className="w-full text-left"
                >
                  <Icon size={15} />
                  <span>{item.name}</span>
                </button>
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction showOnHover>
                    <FolioIconMoreHorizontal size={14} />
                    <span className="sr-only">More</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-48 rounded-lg"
                  side={isMobile ? 'bottom' : 'right'}
                  align={isMobile ? 'end' : 'start'}
                >
                  <DropdownMenuItem onClick={() => onSelect(item.name)}>
                    <FolioIconExternal size={13} className="text-muted-foreground" />
                    <span>View Project</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">
                    <FolioIconTrash size={13} />
                    <span>Delete Project</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function NavUser({
  user,
}: {
  user: { readonly name: string; readonly email: string; readonly initials: string }
}): React.ReactElement {
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
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{user.initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <FolioIconChevronDown size={14} className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{user.initials}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <FolioIconSparkle size={13} />
                Upgrade to Pro
              </DropdownMenuItem>
              <DropdownMenuItem>
                <FolioIconSettings size={13} />
                Account Settings
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function Sidebar07DemoView(): React.ReactElement {
  const [active, setActive] = React.useState<{ group: string; item: string }>({
    group: 'Playground',
    item: 'History',
  })

  return (
    <div
      data-lf-sidebar-demo=""
      className="relative h-full w-full overflow-hidden [transform:translateZ(0)]"
    >
      <TooltipProvider>
        <SidebarProvider className="h-full min-h-0">
          <Sidebar collapsible="icon">
            <SidebarHeader>
              <TeamSwitcher teams={DEMO_DATA.teams} />
            </SidebarHeader>
            <SidebarContent>
              <NavMain
                items={DEMO_DATA.navMain}
                activeItem={active}
                onSelect={(group, item) => setActive({ group, item })}
              />
              <NavProjects
                projects={DEMO_DATA.projects}
                onSelect={name => setActive({ group: 'Projects', item: name })}
              />
            </SidebarContent>
            <SidebarFooter>
              <NavUser user={DEMO_DATA.user} />
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>

          <SidebarInset className="min-h-0 overflow-auto">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
              <Breadcrumb>
                <BreadcrumbList className="m-0 list-none p-0">
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="#sidebar-demo" onClick={e => e.preventDefault()}>
                      {active.group}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{active.item}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </header>

            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="grid auto-rows-min gap-4 md:grid-cols-3">
                <div className="flex aspect-video flex-col justify-between rounded-xl border border-border bg-muted/50 p-4">
                  <span className="text-xs text-muted-foreground">当前分组</span>
                  <span className="text-lg font-semibold">{active.group}</span>
                </div>
                <div className="flex aspect-video flex-col justify-between rounded-xl border border-border bg-muted/50 p-4">
                  <span className="text-xs text-muted-foreground">当前节点</span>
                  <span className="text-lg font-semibold">{active.item}</span>
                </div>
                <div className="flex aspect-video flex-col justify-between rounded-xl border border-border bg-muted/50 p-4">
                  <span className="text-xs text-muted-foreground">架构模式</span>
                  <span className="text-sm font-medium">
                    @folio/app-sidebar-ui → @folio/core-ui-kit
                  </span>
                </div>
              </div>
              <div className="flex-1 rounded-xl border border-border bg-muted/50 p-6 text-sm text-muted-foreground">
                点击左上角折叠图标或按 <kbd className="rounded border px-1.5 py-0.5 text-xs">Ctrl+B</kbd>{' '}
                测试图标轨折叠、悬浮 Tooltip、TeamSwitcher 与 NavUser 下拉菜单（全部通过受管 Portal 渲染在{' '}
                <code>shell.overlay</code> 内）。
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  )
}

export const sidebarDemoWorkspace: WorkspaceUiContribution = {
  id: 'sidebar-07-demo',
  title: '侧栏示例',
  order: 3,
  pluginId: '@folio/app-sidebar-ui',
  icon: FolioIconPanelLeft,
  MainView: Sidebar07DemoView,
}

export const name = 'app-sidebar-ui'
export const inject = ['folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const dispose = ctx.folioShell.registerWorkspace(sidebarDemoWorkspace)
    return () => {
      dispose()
    }
  }, 'app-sidebar-ui: register workspace')
}
