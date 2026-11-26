import * as React from 'react'
import type {
  CaptionActionContribution,
  FloatingPanelDefaults,
  WorkspaceUiContribution,
  WorkspaceViewProps,
} from '@folio/base-contract'
import { FolioQueryProvider } from '@folio/base-contract/rpc'
import { FolioButton, FolioIconBack, FolioIconLayers } from '@folio/base-ui-kit/client'
import { WorkspaceErrorBoundary } from './ErrorBoundary.js'
import { ROW_ACTION_STYLES } from './row-actions.js'
import { useShellStore } from './shell-store.js'
import { useWindowsCaptionMode } from './caption.js'

export interface FolioShellProps {
  readonly workspaces: readonly WorkspaceUiContribution[]
  readonly activeWorkspaceId: string
  readonly onSelectWorkspace: (id: string) => void
  readonly onOpenFloatingPanel: (id: string, defaults?: FloatingPanelDefaults) => void
  readonly onCloseFloatingPanel: (id: string) => void
  readonly onExit: () => void
  readonly captionActions?: readonly CaptionActionContribution[]
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

function WorkspaceLoading(): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        fontSize: 12,
        color: 'var(--dsw-alias-label-tertiary, #81858c)',
      }}
    >
      正在加载工作区...
    </div>
  )
}

/**
 * The shell is two layers: one caption row, and one content area that belongs
 * entirely to the active workspace. It draws no panes and no bottom edge — form-A
 * workspaces put the four-region frame here, form-B workspaces put their own
 * full-bleed view here.
 */
function FolioShellInner({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onOpenFloatingPanel,
  onCloseFloatingPanel,
  onExit,
  captionActions,
}: Omit<FolioShellProps, 'enableEvents'>): React.ReactElement {
  const sorted = React.useMemo(
    () => [...workspaces].sort((a, b) => a.order - b.order),
    [workspaces],
  )
  const activeWorkspace = sorted.find(w => w.id === activeWorkspaceId) ?? sorted[0]
  const activeId = activeWorkspace?.id ?? ''

  const pendingTarget = useShellStore(s => s.pendingTarget)
  const setPendingTarget = useShellStore(s => s.setPendingTarget)
  const consumePendingTarget = useShellStore(s => s.consumePendingTarget)

  // Windows Desktop hosts the entry toggle and the workspace switcher in the
  // native window caption, so this row is dropped there.
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

  const MainView = activeWorkspace?.MainView

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

          <div
            data-lf-row-actions=""
            style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
          >
            <style data-lf-row-action-styles="">{ROW_ACTION_STYLES}</style>
            {(captionActions ?? []).map(action => (
              <action.Component key={action.id} isOpen />
            ))}
          </div>
        </header>
      )}

      <div
        data-lf-content=""
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {MainView ? (
          <WorkspaceErrorBoundary
            scopeName={activeWorkspace?.title ?? activeId}
            resetKey={activeId}
          >
            <React.Suspense fallback={<WorkspaceLoading />}>
              <MainView {...viewProps} />
            </React.Suspense>
          </WorkspaceErrorBoundary>
        ) : (
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
        )}
      </div>
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
        captionActions={props.captionActions}
      />
    </FolioQueryProvider>
  )
}
