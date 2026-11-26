import * as React from 'react'
import type { FrameAppSummary } from '@folio/base-contract'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FolioIconCheck,
  FolioIconChevronDown,
  FolioIconLayers,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@folio/base-ui-kit/client'

export interface FrameAppSwitcherProps {
  readonly apps: readonly FrameAppSummary[]
  readonly activeId: string
  readonly onSelect: (appId: string) => void
}

export function resolveSwitcherApp(
  apps: readonly FrameAppSummary[],
  activeId: string,
): FrameAppSummary | undefined {
  return apps.find(app => app.id === activeId) ?? apps[0]
}

function FrameAppMenuContent({
  apps,
  activeId,
  onSelect,
}: FrameAppSwitcherProps): React.ReactElement {
  return (
    <>
      <DropdownMenuLabel className="text-xs text-muted-foreground">
        框架内应用 · {apps.length}
      </DropdownMenuLabel>
      {apps.map(app => {
        const Icon = app.icon ?? FolioIconLayers
        const selected = app.id === activeId
        return (
          <DropdownMenuItem
            key={app.id}
            data-lf-frame-app={app.id}
            data-active={selected ? 'true' : undefined}
            className="gap-2 p-2"
            onClick={() => onSelect(app.id)}
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md border">
              <Icon size={13} />
            </div>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{app.title}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {app.pluginId ?? app.id}
              </span>
            </div>
            {selected ? (
              <FolioIconCheck size={13} className="ml-auto text-muted-foreground" />
            ) : null}
          </DropdownMenuItem>
        )
      })}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
        插件通过 ctx.folioFrame.registerApp 接入
      </DropdownMenuLabel>
    </>
  )
}

/**
 * Framework-owned switcher living in the sidebar header. Plugins never render
 * it: registering an app is enough for it to appear here.
 */
export function FrameAppSwitcher({
  apps,
  activeId,
  onSelect,
}: FrameAppSwitcherProps): React.ReactElement | null {
  const { isMobile } = useSidebar()
  const active = resolveSwitcherApp(apps, activeId)
  if (!active) return null
  const ActiveIcon = active.icon ?? FolioIconLayers

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              data-lf-frame-app-switcher=""
              aria-label={`当前应用：${active.title}，点击切换`}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <ActiveIcon size={15} />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{active.title}</span>
                <span className="truncate text-xs">
                  {active.subtitle ?? active.pluginId ?? 'LocalFolio 框架'}
                </span>
              </div>
              <FolioIconChevronDown size={14} className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
            className="min-w-64 rounded-lg"
          >
            <FrameAppMenuContent apps={apps} activeId={activeId} onSelect={onSelect} />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/**
 * Compact switcher for apps that declare no `Left` region: the sidebar is not
 * rendered, so the switcher moves into the bottom information bar.
 */
export function FrameAppMenuButton({
  apps,
  activeId,
  onSelect,
}: FrameAppSwitcherProps): React.ReactElement | null {
  const active = resolveSwitcherApp(apps, activeId)
  if (!active) return null
  const ActiveIcon = active.icon ?? FolioIconLayers

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-lf-frame-app-switcher=""
          data-lf-frame-app-switcher-compact=""
          aria-label={`当前应用：${active.title}，点击切换`}
          className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none"
        >
          <ActiveIcon size={12} />
          <span className="max-w-36 truncate">{active.title}</span>
          <FolioIconChevronDown size={10} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" sideOffset={4} className="min-w-64 rounded-lg">
        <FrameAppMenuContent apps={apps} activeId={activeId} onSelect={onSelect} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
