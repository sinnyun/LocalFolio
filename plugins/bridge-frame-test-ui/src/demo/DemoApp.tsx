import * as React from 'react'
import type {
  FrameAppDefinition,
  FrameProviderProps,
  FrameViewProps,
} from '@folio/base-contract'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FolioButton,
  FolioIconChevronDown,
  FolioIconChevronRight,
  FolioIconData,
  FolioIconExternal,
  FolioIconLayers,
  FolioIconMoreHorizontal,
  FolioIconPanelLeft,
  FolioIconPanelRight,
  FolioIconSettings,
  FolioIconSparkle,
  FolioIconTrash,
  FolioTag,
  Separator,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
  type FolioIconProps,
} from '@folio/base-ui-kit/client'

type IconComp = React.ComponentType<FolioIconProps>

interface DemoSelection {
  readonly group: string
  readonly item: string
}

interface DemoContextValue {
  readonly selection: DemoSelection
  readonly select: (group: string, item: string) => void
}

const DemoContext = React.createContext<DemoContextValue | null>(null)

function useDemo(): DemoContextValue {
  const value = React.useContext(DemoContext)
  if (!value) throw new Error('Demo app regions must be rendered inside DemoAppProvider')
  return value
}

function DemoAppProvider({ children }: FrameProviderProps): React.ReactElement {
  const [selection, setSelection] = React.useState<DemoSelection>({
    group: 'Playground',
    item: 'History',
  })
  const value = React.useMemo<DemoContextValue>(
    () => ({
      selection,
      select: (group, item) => setSelection({ group, item }),
    }),
    [selection],
  )
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

const DEMO_USER = {
  name: 'LocalFolio',
  email: 'workspace@localfolio.dev',
  initials: 'LF',
} as const

interface DemoNavGroup {
  readonly title: string
  readonly icon: IconComp
  readonly isActive?: boolean
  readonly items: readonly string[]
}

const DEMO_NAV: readonly DemoNavGroup[] = [
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
]

const DEMO_PROJECTS = [
  { name: 'Design Engineering', icon: FolioIconPanelLeft },
  { name: 'Sales & Marketing', icon: FolioIconData },
  { name: 'Travel', icon: FolioIconExternal },
] as const

function DemoNavMain(): React.ReactElement {
  const { selection, select } = useDemo()
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {DEMO_NAV.map(group => {
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
                          isActive={
                            selection.group === group.title && selection.item === subTitle
                          }
                        >
                          <button
                            type="button"
                            onClick={() => select(group.title, subTitle)}
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

function DemoNavProjects(): React.ReactElement {
  const { select } = useDemo()
  const { isMobile } = useSidebar()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Projects</SidebarGroupLabel>
      <SidebarMenu>
        {DEMO_PROJECTS.map(item => {
          const Icon = item.icon
          return (
            <SidebarMenuItem key={item.name}>
              <SidebarMenuButton asChild>
                <button
                  type="button"
                  onClick={() => select('Projects', item.name)}
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
                    <span className="sr-only">更多</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-48 rounded-lg"
                  side={isMobile ? 'bottom' : 'right'}
                  align={isMobile ? 'end' : 'start'}
                >
                  <DropdownMenuItem onClick={() => select('Projects', item.name)}>
                    <FolioIconExternal size={13} className="text-muted-foreground" />
                    <span>查看项目</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">
                    <FolioIconTrash size={13} />
                    <span>删除项目</span>
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

function DemoNavUser(): React.ReactElement {
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
                <AvatarFallback className="rounded-lg">{DEMO_USER.initials}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{DEMO_USER.name}</span>
                <span className="truncate text-xs">{DEMO_USER.email}</span>
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
            <DropdownMenuItem>
              <FolioIconSparkle size={13} />
              账户设置
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function DemoLeft(): React.ReactElement {
  return (
    <>
      <SidebarContent>
        <DemoNavMain />
        <DemoNavProjects />
      </SidebarContent>
      <SidebarFooter>
        <DemoNavUser />
      </SidebarFooter>
    </>
  )
}

function DemoMain({ frame }: FrameViewProps): React.ReactElement {
  const { selection, select } = useDemo()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <Breadcrumb>
          <BreadcrumbList className="m-0 list-none p-0">
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="#frame-demo" onClick={event => event.preventDefault()}>
                {selection.group}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{selection.item}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="ml-auto flex items-center gap-2">
          <FolioTag tone="neutral">@folio/base-frame-ui</FolioTag>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            data-lf-demo-toggle-right=""
            aria-label={frame.layout.rightCollapsed ? '展开右侧面板' : '折叠右侧面板'}
            aria-pressed={!frame.layout.rightCollapsed}
            title={
              frame.layout.rightCollapsed
                ? '展开右侧面板（Ctrl+Alt+R）'
                : '折叠右侧面板（Ctrl+Alt+R）'
            }
            onClick={() => frame.toggleRight()}
          >
            <FolioIconPanelRight size={14} />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <div className="grid auto-rows-min gap-4 md:grid-cols-3">
          <div className="flex aspect-video flex-col justify-between rounded-xl border border-border bg-muted/50 p-4">
            <span className="text-xs text-muted-foreground">当前分组</span>
            <span className="text-lg font-semibold">{selection.group}</span>
          </div>
          <div className="flex aspect-video flex-col justify-between rounded-xl border border-border bg-muted/50 p-4">
            <span className="text-xs text-muted-foreground">当前节点</span>
            <span className="text-lg font-semibold">{selection.item}</span>
          </div>
          <div className="flex aspect-video flex-col justify-between rounded-xl border border-border bg-muted/50 p-4">
            <span className="text-xs text-muted-foreground">布局归属</span>
            <span className="text-sm font-medium">
              @folio/base-frame-ui 托管四区布局
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 rounded-xl border border-border bg-muted/50 p-6 text-sm text-muted-foreground">
          <p className="m-0 leading-relaxed">
            这份「侧栏示例」已被复制并改造成 LocalFolio 的基础布局框架：左侧面板、中间内容、右侧面板和底部信息栏全部由框架托管，本应用只通过{' '}
            <code>ctx.folioFrame.registerApp</code> 声明四个区域显示什么。
          </p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-xs">
            <li>· 拖动左右分隔条调整面板宽度，双击分隔条恢复默认宽度</li>
            <li>
              · <kbd className="rounded border px-1.5 py-0.5 text-[11px]">Ctrl+B</kbd>{' '}
              折叠左侧面板（图标轨），再按一次展开
            </li>
            <li>
              · <kbd className="rounded border px-1.5 py-0.5 text-[11px]">Ctrl+Alt+R</kbd>{' '}
              折叠 / 展开右侧面板，底部信息栏也有对应按钮
            </li>
            <li>· 宽度、折叠状态与当前应用自动持久化，下次打开保持一致</li>
          </ul>
          <div className="mt-auto flex flex-wrap gap-2">
            <FolioButton
              variant="outline"
              size="sm"
              data-lf-demo-select-starred=""
              onClick={() => select('Playground', 'Starred')}
            >
              选中 Starred
            </FolioButton>
            <FolioButton
              variant="ghost"
              size="sm"
              onClick={() => frame.setRightCollapsed(false)}
            >
              展开右侧面板
            </FolioButton>
            <FolioButton variant="ghost" size="sm" onClick={() => frame.resetLayout()}>
              恢复默认布局
            </FolioButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function DemoRight({ frame }: FrameViewProps): React.ReactElement {
  const { selection, select } = useDemo()
  const { layout } = frame

  return (
    <div className="flex flex-col gap-4 p-4 text-sm" data-lf-demo-right="">
      <section className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">当前选择</span>
        <span className="text-lg font-semibold">{selection.item}</span>
        <span className="text-xs text-muted-foreground">{selection.group}</span>
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">框架托管布局</span>
        <dl className="m-0 grid grid-cols-[84px_1fr] gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">左侧面板</dt>
          <dd className="m-0 tabular-nums">
            {layout.leftCollapsed ? '已折叠为图标轨' : `${layout.leftWidth}px`}
          </dd>
          <dt className="text-muted-foreground">右侧面板</dt>
          <dd className="m-0 tabular-nums">
            {layout.rightCollapsed ? '已折叠' : `${layout.rightWidth}px`}
          </dd>
          <dt className="text-muted-foreground">底部信息栏</dt>
          <dd className="m-0">共享同一份应用上下文</dd>
          <dt className="text-muted-foreground">快捷键</dt>
          <dd className="m-0">Ctrl+B / Ctrl+Alt+R</dd>
        </dl>
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">交互验证</span>
        <div className="flex flex-wrap gap-2">
          <FolioButton variant="outline" size="sm" onClick={() => select('Models', 'Quantum')}>
            选中 Quantum
          </FolioButton>
          <FolioButton variant="outline" size="sm" onClick={() => frame.toggleRight()}>
            折叠右栏
          </FolioButton>
          <FolioButton variant="ghost" size="sm" onClick={() => frame.resetLayout()}>
            恢复默认
          </FolioButton>
        </div>
      </section>

      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        右侧面板的标题、分隔条、折叠按钮和宽度持久化全部由框架提供，功能插件只负责这里的正文。
      </p>
    </div>
  )
}

function DemoStatus(): React.ReactElement {
  const { selection } = useDemo()
  return (
    <span className="truncate">
      测试框架示例 · {selection.group} / {selection.item} · 四区共享应用上下文 · 拖动分隔条可调宽
    </span>
  )
}

export const demoFrameApp: FrameAppDefinition = {
  id: 'frame.sidebar-demo',
  title: '测试框架示例',
  subtitle: '框架内置示例应用',
  pluginId: '@folio/bridge-frame-test-ui',
  icon: FolioIconPanelLeft,
  order: 10,
  leftCollapse: 'icon',
  rightTitle: '属性',
  defaultLayout: {
    leftWidth: 272,
    rightWidth: 320,
    leftCollapsed: false,
    rightCollapsed: false,
  },
  Provider: DemoAppProvider,
  Left: DemoLeft,
  Main: DemoMain,
  Right: DemoRight,
  Status: DemoStatus,
}
