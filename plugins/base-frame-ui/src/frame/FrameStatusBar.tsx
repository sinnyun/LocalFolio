import * as React from 'react'
import type { FrameAppDefinition, FrameController } from '@folio/base-contract'
import { FrameAppMenuButton } from './FrameAppSwitcher.js'
import { FrameRegion } from './FrameRegion.js'

export interface FrameStatusBarProps {
  readonly app: FrameAppDefinition
  readonly controller: FrameController
}

const CHIP_CLASS =
  'rounded px-1 py-0.5 text-[11px] transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none'

/**
 * Framework-owned bottom information bar. The plugin supplies only the left
 * half through `Status`; geometry controls and the DSH escape hint stay here.
 * It lives inside the app Provider so `Status` shares the app's React context.
 */
export function FrameStatusBar({
  app,
  controller,
}: FrameStatusBarProps): React.ReactElement {
  const { layout } = controller
  const Status = app.Status
  const hasLeft = Boolean(app.Left)
  const hasRight = Boolean(app.Right)
  const apps = controller.listApps()
  const showCompactSwitcher = !hasLeft && apps.length > 1

  const metrics: string[] = []
  if (hasLeft) metrics.push(`左 ${layout.leftCollapsed ? '—' : `${layout.leftWidth}px`}`)
  if (hasRight) metrics.push(`右 ${layout.rightCollapsed ? '—' : `${layout.rightWidth}px`}`)

  return (
    <footer
      data-lf-frame-statusbar=""
      className="flex h-7 shrink-0 items-center justify-between gap-3 border-t border-border px-3 text-[11px] text-muted-foreground"
      style={{ background: 'var(--dsw-specific-sidebar-fill, #f9fafb)' }}
    >
      <div
        data-lf-frame-status-left=""
        className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap"
      >
        {showCompactSwitcher ? (
          <>
            <FrameAppMenuButton
              apps={apps}
              activeId={app.id}
              onSelect={appId => controller.activateApp(appId)}
            />
            <span aria-hidden="true" className="opacity-40">
              |
            </span>
          </>
        ) : null}
        {Status ? (
          <FrameRegion
            scope={`${app.id}:status`}
            resetKey={app.id}
            fallback={<span className="text-muted-foreground">底部信息栏加载中…</span>}
          >
            <Status appId={app.id} frame={controller} />
          </FrameRegion>
        ) : (
          <span className="truncate">{app.title} · 布局由 @folio/base-frame-ui 托管</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {hasLeft ? (
          <button
            type="button"
            data-lf-frame-toggle-left=""
            aria-pressed={!layout.leftCollapsed}
            className={CHIP_CLASS}
            title="折叠 / 展开左侧面板（Ctrl+B）"
            onClick={controller.toggleLeft}
          >
            {layout.leftCollapsed ? '展开左栏' : '折叠左栏'}
          </button>
        ) : null}
        {metrics.length > 0 ? (
          <span className="tabular-nums">{metrics.join(' · ')}</span>
        ) : null}
        {hasRight ? (
          <button
            type="button"
            data-lf-frame-toggle-right=""
            aria-pressed={!layout.rightCollapsed}
            className={CHIP_CLASS}
            title="折叠 / 展开右侧面板（Ctrl+Alt+R）"
            onClick={controller.toggleRight}
          >
            {layout.rightCollapsed ? '展开右栏' : '折叠右栏'}
          </button>
        ) : null}
        <span aria-hidden="true" className="opacity-40">
          |
        </span>
        <span>Esc 返回 DSH</span>
      </div>
    </footer>
  )
}
