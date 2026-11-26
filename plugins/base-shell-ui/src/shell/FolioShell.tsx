import * as React from 'react'
import type {
  FloatingPanelDefaults,
  WorkspaceUiContribution,
  WorkspaceViewProps,
} from '@folio/base-contract'
import { FolioQueryProvider } from '@folio/base-contract/rpc'
import {
  FolioButton,
  FolioIconBack,
  FolioIconLayers,
  FolioIconPanelLeft,
} from '@folio/base-ui-kit/client'
import { WorkspaceErrorBoundary } from './ErrorBoundary.js'
import { ShellLayout } from './ShellLayout.js'
import { getPaneLayoutFor, useShellStore } from './shell-store.js'
import { useWindowsCaptionMode } from './caption.js'

export interface FolioShellProps {
  readonly workspaces: readonly WorkspaceUiContribution[]
  readonly activeWorkspaceId: string
  readonly onSelectWorkspace: (id: string) => void
  readonly onOpenFloatingPanel: (id: string, defaults?: FloatingPanelDefaults) => void
  readonly onCloseFloatingPanel: (id: string) => void
  readonly onExit: () => void
  readonly enableEvents?: boolean
}

function matchWorkspaceForFile(
  workspaces: readonly WorkspaceUiContribution[],
  filePath: string,
): WorkspaceUiContribution | undefined {
  const lower = filePath.toLowerCase()
  return workspaces.find(ws =>
    ws.fileExtensions?.some(ext => lower.endsWith(ext.toLowerCase())),
  )
}

function FolioShellInner({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenFloatingPanel,
  onCloseFloatingPanel,
  onExit,
}: Omit<FolioShellProps, 'enableEvents'>): React.ReactElement {
  const sorted = React.useMemo(
    () => [...workspaces].sort((a, b) => a.order - b.order),
    [workspaces],
  )
  const activeWorkspace = sorted.find(w => w.id === activeWorkspaceId) ?? sorted[0]
  const activeId = activeWorkspace?.id ?? ''

  const paneLayouts = useShellStore(s => s.paneLayouts)
  const pendingTarget = useShellStore(s => s.pendingTarget)
  const setPendingTarget = useShellStore(s => s.setPendingTarget)
  const consumePendingTarget = useShellStore(s => s.consumePendingTarget)
  const setPaneLayout = useShellStore(s => s.setPaneLayout)
  const toggleLeftPanel = useShellStore(s => s.toggleLeftPanel)
  const toggleRightPanel = useShellStore(s => s.toggleRightPanel)

  const layout = getPaneLayoutFor(paneLayouts, activeId)
  // Windows Desktop hosts the switcher, the panel toggles and the exit toggle
  // in the window caption row (see CaptionBar), so the in-overlay top bar is
  // dropped there; Web and macOS keep it.
  const captionMode = useWindowsCaptionMode()

  const navigateTo = React.useCallback(
    (workspaceId: string, target?: unknown) => {
      if (target !== undefined) setPendingTarget(workspaceId, target)
      onSelectWorkspace(workspaceId)
    },
    [onSelectWorkspace, setPendingTarget],
  )

  const openFile = React.useCallback(
    (filePath: string) => {
      const targetWs = matchWorkspaceForFile(sorted, filePath) ?? activeWorkspace
      if (!targetWs) return
      navigateTo(targetWs.id, { openFile: filePath })
    },
    [sorted, activeWorkspace, navigateTo],
  )

  const viewProps: WorkspaceViewProps = React.useMemo(
    () => ({
      workspaceId: activeId,
      workspaces: sorted,
      pendingTarget: pendingTarget?.workspaceId === activeId ? pendingTarget.target : undefined,
      consumePendingTarget: () => consumePendingTarget(activeId),
      navigateTo,
      openFile,
      openFloatingPanel: onOpenFloatingPanel,
      closeFloatingPanel: onCloseFloatingPanel,
    }),
    [
      activeId,
      sorted,
      pendingTarget,
      consumePendingTarget,
      navigateTo,
      openFile,
      onOpenFloatingPanel,
      onCloseFloatingPanel,
    ],
  )

  const StatusSlot = activeWorkspace?.StatusSlot

  return (
    <div
      data-lf-shell=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--dsw-alias-bg-base, #ffffff)',
        color: 'var(--dsw-alias-label-primary, #0f1115)',
        fontFamily: 'var(--dsw-font-family, inherit)',
        fontSize: 13,
      }}
    >
      {captionMode ? null : (
        <header
          data-lf-topbar=""
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            height: 42,
            padding: '0 12px',
            flexShrink: 0,
            borderBottom: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))',
            background: 'var(--dsw-specific-sidebar-fill, #f9fafb)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div
              data-lf-brand=""
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              <FolioIconLayers size={15} />
              <span>LocalFolio</span>
            </div>
  
            <FolioButton
              variant="outline"
              size="sm"
              data-lf-exit=""
              icon={<FolioIconBack size={13} />}
              title="返回 DSH 原生界面 (Esc)"
              onClick={onExit}
            >
              返回 DSH
            </FolioButton>
  
            <div
              aria-hidden="true"
              style={{
                width: 1,
                height: 16,
                margin: '0 4px',
                background: 'var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.14))',
              }}
            />
  
            <nav
              aria-label="工作区切换"
              style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflowX: 'auto' }}
            >
              {sorted.map(ws => {
                const Icon = ws.icon
                const isActive = ws.id === activeId
                return (
                  <FolioButton
                    key={ws.id}
                    variant={isActive ? 'outline' : 'ghost'}
                    size="sm"
                    data-lf-workspace-tab={ws.id}
                    aria-current={isActive ? 'page' : undefined}
                    icon={Icon ? <Icon size={13} /> : undefined}
                    onClick={() => onSelectWorkspace(ws.id)}
                    style={
                      isActive
                        ? {
                            background: 'var(--dsw-alias-button-ghost-active-fill, #ebebeb)',
                            fontWeight: 600,
                          }
                        : undefined
                    }
                  >
                    {ws.title}
                  </FolioButton>
                )
              })}
            </nav>
          </div>
  
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {activeWorkspace?.LeftPanel ? (
              <FolioButton
                variant="ghost"
                size="sm"
                data-lf-toggle-left=""
                aria-pressed={!layout.leftCollapsed}
                title={layout.leftCollapsed ? '展开左侧栏' : '折叠左侧栏'}
                icon={<FolioIconPanelLeft size={14} />}
                onClick={() => toggleLeftPanel(activeId)}
              />
            ) : null}
            {activeWorkspace?.RightPanel ? (
              <FolioButton
                variant="ghost"
                size="sm"
                data-lf-toggle-right=""
                aria-pressed={!layout.rightCollapsed}
                title={layout.rightCollapsed ? '展开右侧栏' : '折叠右侧栏'}
                icon={<FolioIconPanelLeft size={14} />}
                onClick={() => toggleRightPanel(activeId)}
              />
            ) : null}
          </div>
        </header>
      )}

      <ShellLayout
        workspace={activeWorkspace}
        viewProps={viewProps}
        leftCollapsed={layout.leftCollapsed}
        rightCollapsed={layout.rightCollapsed}
        leftSize={layout.leftSize}
        rightSize={layout.rightSize}
        onPaneSizesChange={patch => setPaneLayout(activeId, patch)}
        fallbackView={
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              height: '100%',
              padding: 24,
              textAlign: 'center',
              color: 'var(--dsw-alias-label-tertiary, #81858c)',
            }}
          >
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary, #0f1115)' }}>
              尚未安装任何工作区插件
            </p>
            <p style={{ margin: 0, fontSize: 12 }}>
              安装任意注入 ctx.folioShell 的工作区插件后，工作区将自动出现。
            </p>
          </div>
        }
      />

      {activeWorkspace?.hideStatusBar ? null : (
        <footer
          data-lf-statusbar=""
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 28,
            padding: '0 12px',
            flexShrink: 0,
            fontSize: 11,
            borderTop: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))',
            background: 'var(--dsw-specific-sidebar-fill, #f9fafb)',
            color: 'var(--dsw-alias-label-tertiary, #81858c)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {StatusSlot ? (
              <WorkspaceErrorBoundary scopeName={`${activeId}:status`} resetKey={activeId}>
                <StatusSlot {...viewProps} />
              </WorkspaceErrorBoundary>
            ) : (
              <span>已挂载工作区：{sorted.length} 个</span>
            )}
          </div>
          <div style={{ flexShrink: 0 }}>按 Esc 关闭悬浮面板 / 返回 DSH</div>
        </footer>
      )}
    </div>
  )
}

export function FolioShell(props: FolioShellProps): React.ReactElement {
  return (
    <FolioQueryProvider enableEvents={props.enableEvents ?? true}>
      <FolioShellInner
        workspaces={props.workspaces}
        activeWorkspaceId={props.activeWorkspaceId}
        onSelectWorkspace={props.onSelectWorkspace}
        onOpenFloatingPanel={props.onOpenFloatingPanel}
        onCloseFloatingPanel={props.onCloseFloatingPanel}
        onExit={props.onExit}
      />
    </FolioQueryProvider>
  )
}
