import * as React from 'react'
import type { WorkspaceUiContribution } from '@folio/base-contract'
import { FolioIconBack, FolioIconLayers, FolioIconPanelLeft } from '@folio/base-ui-kit/client'
import { getPaneLayoutFor, useShellStore } from './shell-store.js'
import { useWindowsCaptionMetrics } from './caption.js'

/** The shell's own state the caption row needs; the controller in `client.tsx` provides it. */
export interface CaptionBarBridge {
  readonly isOpen: () => boolean
  readonly subscribeOpen: (listener: () => void) => () => void
  readonly toggle: () => void
  readonly open: () => void
  readonly listWorkspaces: () => readonly WorkspaceUiContribution[]
  readonly subscribeWorkspaces: (listener: () => void) => () => void
}

const CAPTION_STYLES = `
[data-lf-caption-bar] button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #4b5057);
  font: inherit;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  cursor: default;
  -webkit-app-region: no-drag;
}
[data-lf-caption-bar] button:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06));
  color: var(--dsw-alias-label-primary, #0f1115);
}
[data-lf-caption-bar] button[aria-current='page'] {
  background: var(--dsw-alias-button-ghost-active-fill, rgba(0, 0, 0, 0.08));
  color: var(--dsw-alias-label-primary, #0f1115);
  font-weight: 600;
}
[data-lf-caption-bar] button[data-lf-caption-icon-only] {
  width: 28px;
  padding: 0;
  justify-content: center;
}
[data-lf-caption-bar] button:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #2563eb);
  outline-offset: -2px;
}
:where(html[data-input-modality='pointer']) [data-lf-caption-bar] button:focus-visible {
  outline-color: transparent;
}
[data-lf-caption-bar] nav::-webkit-scrollbar {
  display: none;
}
`

function CaptionButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { readonly iconOnly?: boolean },
): React.ReactElement {
  const { iconOnly, type = 'button', ...rest } = props
  return (
    <button
      type={type}
      {...(iconOnly === true ? { 'data-lf-caption-icon-only': '' } : {})}
      {...rest}
    />
  )
}

function CaptionDivider(): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 1,
        height: 16,
        flexShrink: 0,
        margin: '0 2px',
        background: 'var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14))',
      }}
    />
  )
}

/**
 * Windows Desktop caption row: the single plugin-panel toggle, the workspace
 * switcher, and the panel toggles that the in-overlay top bar used to carry.
 * It renders inside the shell's own `shell.overlay` entry and only pins itself
 * to the caption with `position: fixed` — the same way ui-sidebar moves its
 * rail controls there — so no plugin-owned DOM leaves the application root.
 * The browser (and macOS desktop) never mount it: the marker attribute is
 * Windows-only, so those keep the ordinary in-overlay top bar.
 */
export function CaptionBar({ bridge }: { readonly bridge: CaptionBarBridge }): React.ReactElement | null {
  const metrics = useWindowsCaptionMetrics()
  const isOpen = React.useSyncExternalStore(bridge.subscribeOpen, bridge.isOpen, bridge.isOpen)
  const workspaces = React.useSyncExternalStore(
    bridge.subscribeWorkspaces,
    bridge.listWorkspaces,
    bridge.listWorkspaces,
  )
  const activeWorkspaceId = useShellStore(state => state.activeWorkspaceId)
  const setActiveWorkspace = useShellStore(state => state.setActiveWorkspace)
  const paneLayouts = useShellStore(state => state.paneLayouts)
  const toggleLeftPanel = useShellStore(state => state.toggleLeftPanel)
  const toggleRightPanel = useShellStore(state => state.toggleRightPanel)

  const sorted = React.useMemo(
    () => [...workspaces].sort((a, b) => a.order - b.order),
    [workspaces],
  )
  const activeWorkspace = sorted.find(workspace => workspace.id === activeWorkspaceId) ?? sorted[0]
  const activeId = activeWorkspace?.id ?? ''
  const layout = getPaneLayoutFor(paneLayouts, activeId)

  if (metrics === null || typeof document === 'undefined') return null

  const selectWorkspace = (id: string): void => {
    setActiveWorkspace(id)
    if (!isOpen) bridge.open()
  }

  return (
    <div
      data-lf-caption-bar=""
      role="toolbar"
      aria-label="LocalFolio 标题栏"
      style={{
        position: 'fixed',
        top: 0,
        left: metrics.left,
        right: metrics.right,
        height: metrics.height,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        zIndex: 30,
        paddingLeft: 2,
        overflow: 'hidden',
        fontFamily: 'var(--dsw-font-family, inherit)',
        color: 'var(--dsw-alias-label-secondary, #4b5057)',
        ...({ WebkitAppRegion: 'no-drag' } as React.CSSProperties),
      }}
    >
      <style data-lf-caption-styles="">{CAPTION_STYLES}</style>

      <CaptionButton
        data-lf-caption-toggle=""
        aria-expanded={isOpen}
        title={isOpen ? '返回 DSH 原生界面 (Esc)' : '打开 LocalFolio 工作台'}
        onClick={() => bridge.toggle()}
      >
        {isOpen ? <FolioIconBack size={13} /> : <FolioIconLayers size={13} />}
        <span>{isOpen ? '返回 DSH' : '工作台'}</span>
      </CaptionButton>

      <CaptionDivider />

      <nav
        aria-label="工作区切换"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          minWidth: 0,
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          if (sorted.length < 2) return
          event.preventDefault()
          const index = sorted.findIndex(workspace => workspace.id === activeId)
          const step = event.key === 'ArrowRight' ? 1 : -1
          const next = sorted[(index + step + sorted.length) % sorted.length]
          if (next !== undefined) selectWorkspace(next.id)
        }}
      >
        {sorted.map(workspace => {
          const Icon = workspace.icon
          const isActive = workspace.id === activeId
          return (
            <CaptionButton
              key={workspace.id}
              data-lf-caption-tab={workspace.id}
              aria-current={isActive ? 'page' : undefined}
              title={isOpen ? workspace.title : `打开 ${workspace.title}`}
              onClick={() => selectWorkspace(workspace.id)}
            >
              {Icon === undefined ? null : <Icon size={13} />}
              <span>{workspace.title}</span>
            </CaptionButton>
          )
        })}
      </nav>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
        {isOpen && activeWorkspace?.LeftPanel !== undefined ? (
          <CaptionButton
            iconOnly
            data-lf-caption-panel-left=""
            aria-pressed={!layout.leftCollapsed}
            title={layout.leftCollapsed ? '展开左侧栏' : '折叠左侧栏'}
            onClick={() => toggleLeftPanel(activeId)}
          >
            <FolioIconPanelLeft size={14} />
          </CaptionButton>
        ) : null}
        {isOpen && activeWorkspace?.RightPanel !== undefined ? (
          <CaptionButton
            iconOnly
            data-lf-caption-panel-right=""
            aria-pressed={!layout.rightCollapsed}
            title={layout.rightCollapsed ? '展开右侧栏' : '折叠右侧栏'}
            onClick={() => toggleRightPanel(activeId)}
          >
            <FolioIconPanelLeft size={14} />
          </CaptionButton>
        ) : null}
      </div>
    </div>
  )
}
