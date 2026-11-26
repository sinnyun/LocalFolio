import * as React from 'react'
import type { CaptionActionProps } from '@folio/base-contract'
import { FolioIconPanelLeft, FolioIconPanelRight } from '@folio/base-ui-kit/client'
import { resolveActiveApp, resolveLayout } from './model.js'
import { frameStore, useFrameState } from './store.js'

/**
 * The frame's contribution to the shell's row (Windows caption bar / in-overlay
 * top bar): compact toggles for the active app's side panels.
 *
 * The buttons are bare `<button>` elements on purpose — the shell styles every
 * button inside its row, so the frame never imports the shell's internals and
 * the dependency direction stays frame → shell.
 */
export function FrameCaptionActions({ isOpen }: CaptionActionProps): React.ReactElement | null {
  const state = useFrameState()
  const active = resolveActiveApp(state)
  if (!isOpen || !active) return null

  const hasLeft = Boolean(active.Left)
  const hasRight = Boolean(active.Right)
  if (!hasLeft && !hasRight) return null

  const layout = resolveLayout(active, state.layouts[active.id])
  const toggleLeft = (): void => frameStore.setLayout(active.id, { leftCollapsed: !layout.leftCollapsed })
  const toggleRight = (): void =>
    frameStore.setLayout(active.id, { rightCollapsed: !layout.rightCollapsed })

  return (
    <>
      {hasLeft ? (
        <button
          type="button"
          data-lf-caption-icon-only=""
          data-lf-caption-panel-left=""
          aria-pressed={!layout.leftCollapsed}
          title={layout.leftCollapsed ? '展开左侧面板（Ctrl+B）' : '折叠左侧面板（Ctrl+B）'}
          onClick={toggleLeft}
        >
          <FolioIconPanelLeft size={14} />
        </button>
      ) : null}
      {hasRight ? (
        <button
          type="button"
          data-lf-caption-icon-only=""
          data-lf-caption-panel-right=""
          aria-pressed={!layout.rightCollapsed}
          title={layout.rightCollapsed ? '展开右侧面板（Ctrl+Alt+R）' : '折叠右侧面板（Ctrl+Alt+R）'}
          onClick={toggleRight}
        >
          <FolioIconPanelRight size={14} />
        </button>
      ) : null}
    </>
  )
}
