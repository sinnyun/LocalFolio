import * as React from 'react'
import type { FrameAppDefinition, FrameLayoutSnapshot } from '@folio/base-contract'
import {
  FolioIconLayers,
  FolioIconPanelLeft,
  FolioIconPanelRight,
  Sidebar,
  SidebarHeader,
  SidebarProvider,
  SidebarRail,
} from '@folio/base-ui-kit/client'
import { FrameAppSwitcher } from './FrameAppSwitcher.js'
import { FrameRegion } from './FrameRegion.js'
import { FrameResizer } from './FrameResizer.js'
import { FrameStatusBar } from './FrameStatusBar.js'
import {
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  ICON_RAIL_WIDTH,
  MAX_LEFT_WIDTH,
  MAX_RIGHT_WIDTH,
  MIN_CENTER_WIDTH,
  MIN_LEFT_WIDTH,
  MIN_RIGHT_WIDTH,
  resolveActiveApp,
  resolveLayout,
  summarizeApp,
} from './model.js'
import { createFrameController } from './service.js'
import { frameStore, useFrameState } from './store.js'

/**
 * The left sidebar animates its CSS width; during a drag that animation turns
 * into rubber-band lag. Only while a divider is held down do we disable it.
 */
const FRAME_RUNTIME_CSS = `
[data-lf-frame][data-lf-frame-resizing] [data-slot="sidebar-gap"],
[data-lf-frame][data-lf-frame-resizing] [data-slot="sidebar-container"] {
  transition: none !important;
}
`

function useMeasuredWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = React.useState(0)

  React.useEffect(() => {
    const element = ref.current
    if (!element) return
    const update = (): void => setWidth(element.clientWidth || 0)
    update()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const observer = new ResizeObserver(() => update())
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return width
}

function FrameEmptyState(): React.ReactElement {
  return (
    <div
      data-lf-frame-empty=""
      className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <FolioIconLayers size={28} className="text-muted-foreground" />
      <h2 className="text-sm font-semibold">基础布局框架已就绪，等待插件注册应用</h2>
      <p className="max-w-lg text-xs leading-relaxed text-muted-foreground">
        工作区或其功能插件只需声明「左侧 / 中间 / 右侧 / 底部」四块内容，宽度调节、折叠、持久化、快捷键与错误隔离全部由框架负责。
      </p>
      <pre className="max-w-2xl overflow-auto rounded-md border border-border bg-muted p-3 text-left text-[11px] leading-relaxed">
        {`ctx.folioFrame.registerApp({
  id: 'notes.workbench',
  title: '笔记',
  Main: NotesMain,      // 必填：中间内容
  Left: NotesSidebar,   // 可选：左侧面板
  Right: NotesInspector,// 可选：右侧面板
  Status: NotesStatus,  // 可选：底部信息栏
})`}
      </pre>
      <p className="text-[11px] text-muted-foreground">
        完整说明见 <code>plugins/base-frame-ui/docs/DETAIL.md</code>
      </p>
    </div>
  )
}

interface FrameBodyProps {
  readonly app: FrameAppDefinition
  readonly apps: readonly FrameAppDefinition[]
  readonly state: ReturnType<typeof frameStore.getState>
  readonly layout: FrameLayoutSnapshot
}

function FrameBody({ app, apps, state, layout }: FrameBodyProps): React.ReactElement {
  const surfaceRef = React.useRef<HTMLDivElement | null>(null)
  const surfaceWidth = useMeasuredWidth(surfaceRef)
  const [resizing, setResizing] = React.useState<'left' | 'right' | null>(null)
  const controller = React.useMemo(() => createFrameController(app, state), [app, state])
  const appSummaries = React.useMemo(() => apps.map(summarizeApp), [apps])

  const Left = app.Left
  const Main = app.Main
  const Right = app.Right
  const Provider = app.Provider
  const hasLeft = Boolean(Left)
  const hasRight = Boolean(Right)
  const collapseMode = app.leftCollapse ?? 'icon'
  const collapsedRail = collapseMode === 'icon' ? ICON_RAIL_WIDTH : 0

  const maxLeft =
    surfaceWidth > 0
      ? Math.max(
          MIN_LEFT_WIDTH,
          surfaceWidth -
            (hasRight && !layout.rightCollapsed ? layout.rightWidth : 0) -
            MIN_CENTER_WIDTH -
            12,
        )
      : MAX_LEFT_WIDTH
  const effectiveLeft = layout.leftCollapsed
    ? layout.leftWidth
    : Math.min(layout.leftWidth, maxLeft)
  const visibleLeft = hasLeft
    ? layout.leftCollapsed
      ? collapsedRail
      : effectiveLeft
    : 0

  const maxRight =
    surfaceWidth > 0
      ? Math.max(MIN_RIGHT_WIDTH, surfaceWidth - visibleLeft - MIN_CENTER_WIDTH - 12)
      : MAX_RIGHT_WIDTH
  const effectiveRight = Math.min(layout.rightWidth, maxRight)

  React.useEffect(() => {
    if (!hasRight) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || !event.altKey) return
      if (event.key.toLowerCase() !== 'r') return
      event.preventDefault()
      frameStore.setLayout(app.id, { rightCollapsed: !layout.rightCollapsed })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [app.id, hasRight, layout.rightCollapsed])

  const leftRegion = Left ? (
    <FrameRegion scope={`${app.id}:left`} resetKey={app.id}>
      <Left appId={app.id} frame={controller} />
    </FrameRegion>
  ) : null

  const rightRegion = Right ? (
    <FrameRegion scope={`${app.id}:right`} resetKey={app.id}>
      <Right appId={app.id} frame={controller} />
    </FrameRegion>
  ) : null

  const content = (
    <>
      <main
        data-lf-frame-center=""
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      >
        <FrameRegion scope={`${app.id}:main`} resetKey={app.id}>
          <Main appId={app.id} frame={controller} />
        </FrameRegion>
      </main>

      {!hasRight ? null : layout.rightCollapsed ? (
        <button
          type="button"
          data-lf-frame-right-rail=""
          aria-label="展开右侧面板"
          title="展开右侧面板（Ctrl+Alt+R）"
          onClick={() => frameStore.setLayout(app.id, { rightCollapsed: false })}
          className="flex w-3 shrink-0 items-center justify-center border-l border-border bg-sidebar text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none"
        >
          <FolioIconPanelRight size={12} />
        </button>
      ) : (
        <>
          <FrameResizer
            side="right"
            label="调整右侧面板宽度"
            value={effectiveRight}
            min={MIN_RIGHT_WIDTH}
            max={maxRight}
            onResize={px => frameStore.setLayout(app.id, { rightWidth: px })}
            onResizeStart={() => setResizing('right')}
            onResizeEnd={() => setResizing(null)}
            onReset={() =>
              frameStore.setLayout(app.id, {
                rightWidth: app.defaultLayout?.rightWidth ?? DEFAULT_RIGHT_WIDTH,
              })
            }
          />
          <aside
            data-lf-frame-right=""
            aria-label={app.rightTitle ?? '右侧面板'}
            className="flex shrink-0 flex-col overflow-hidden border-l border-border bg-sidebar"
            style={{ width: effectiveRight }}
          >
            <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
              <span className="truncate text-xs font-medium">{app.rightTitle ?? '详情'}</span>
              <button
                type="button"
                data-lf-frame-collapse-right=""
                aria-label="折叠右侧面板"
                title="折叠右侧面板（Ctrl+Alt+R）"
                onClick={() => frameStore.setLayout(app.id, { rightCollapsed: true })}
                className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none"
              >
                <FolioIconPanelRight size={13} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto">{rightRegion}</div>
          </aside>
        </>
      )}
    </>
  )

  const frame = (
    <div
      data-lf-frame={app.id}
      data-lf-frame-resizing={resizing ?? undefined}
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden"
      style={{
        background: 'var(--dsw-alias-bg-base, #ffffff)',
        color: 'var(--dsw-alias-label-primary, #0f1115)',
        fontFamily: 'var(--dsw-font-family, inherit)',
        fontSize: 13,
      }}
    >
      <style data-lf-frame-runtime-styles="">{FRAME_RUNTIME_CSS}</style>

      <div
        ref={surfaceRef}
        data-lf-frame-surface=""
        className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
        style={{ transform: 'translateZ(0)' }}
      >
        {hasLeft ? (
          <SidebarProvider
            open={!layout.leftCollapsed}
            onOpenChange={open => frameStore.setLayout(app.id, { leftCollapsed: !open })}
            className="h-full min-h-0 w-full"
            style={
              {
                height: '100%',
                '--sidebar-width': `${effectiveLeft}px`,
              } as React.CSSProperties
            }
          >
            <Sidebar collapsible={collapseMode}>
              <SidebarHeader className="gap-1 p-2">
                <FrameAppSwitcher
                  apps={appSummaries}
                  activeId={app.id}
                  onSelect={appId => frameStore.setActiveApp(appId)}
                />
              </SidebarHeader>
              <div
                data-lf-frame-left-slot=""
                className="flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                {leftRegion}
              </div>
              <SidebarRail />
            </Sidebar>

            {layout.leftCollapsed ? null : (
              <FrameResizer
                side="left"
                label="调整左侧面板宽度"
                value={effectiveLeft}
                min={MIN_LEFT_WIDTH}
                max={maxLeft}
                onResize={px => frameStore.setLayout(app.id, { leftWidth: px })}
                onResizeStart={() => setResizing('left')}
                onResizeEnd={() => setResizing(null)}
                onReset={() =>
                  frameStore.setLayout(app.id, {
                    leftWidth: app.defaultLayout?.leftWidth ?? DEFAULT_LEFT_WIDTH,
                  })
                }
              />
            )}

            {content}
          </SidebarProvider>
        ) : (
          <div className="flex h-full min-h-0 w-full min-w-0 overflow-hidden">{content}</div>
        )}

        {hasLeft && layout.leftCollapsed && collapseMode === 'offcanvas' ? (
          <button
            type="button"
            data-lf-frame-expand-left=""
            aria-label="展开左侧面板"
            title="展开左侧面板（Ctrl+B）"
            onClick={() => frameStore.setLayout(app.id, { leftCollapsed: false })}
            className="absolute left-2 top-2 z-30 flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none"
          >
            <FolioIconPanelLeft size={14} />
          </button>
        ) : null}
      </div>

      <FrameStatusBar app={app} controller={controller} />
    </div>
  )

  return Provider ? (
    <Provider appId={app.id} frame={controller}>
      {frame}
    </Provider>
  ) : (
    frame
  )
}

/**
 * The frame view. It is a base capability, not a workspace: a workspace plugin
 * renders `ctx.folioFrame.View` and attaches itself through
 * `folioFrame.attachHostWorkspace`, so the frame only appears where it is hosted.
 */
export function FrameWorkbench(): React.ReactElement {
  const state = useFrameState()
  const active = resolveActiveApp(state)
  if (!active) return <FrameEmptyState />

  return (
    <FrameBody
      app={active}
      apps={state.apps}
      state={state}
      layout={resolveLayout(active, state.layouts[active.id])}
    />
  )
}
