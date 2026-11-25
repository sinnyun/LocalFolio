import * as React from 'react'
import {
  Group as RawGroup,
  Panel as RawPanel,
  Separator as RawSeparator,
  type Layout,
  type LayoutChangedMeta,
} from 'react-resizable-panels'
import type { WorkspaceUiContribution, WorkspaceViewProps } from '@folio/lib-shared-contract'
import { WorkspaceErrorBoundary } from './ErrorBoundary.js'
import { asCompat } from './compat.js'

const Group = asCompat(RawGroup)
const Panel = asCompat(RawPanel)
const Separator = asCompat(RawSeparator)

export interface ShellLayoutProps {
  readonly workspace: WorkspaceUiContribution | undefined
  readonly viewProps: WorkspaceViewProps
  readonly leftCollapsed: boolean
  readonly rightCollapsed: boolean
  readonly leftSize: number
  readonly rightSize: number
  readonly onPaneSizesChange: (patch: { leftSize?: number; rightSize?: number }) => void
  readonly fallbackView: React.ReactNode
}

function ResizeHandle({ id }: { id: string }): React.ReactElement {
  return (
    <Separator
      id={id}
      data-lf-resize-handle={id}
      style={{
        width: 4,
        flexShrink: 0,
        cursor: 'col-resize',
        background: 'transparent',
        borderLeft: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))',
      }}
    />
  )
}

export function ShellLayout({
  workspace,
  viewProps,
  leftCollapsed,
  rightCollapsed,
  leftSize,
  rightSize,
  onPaneSizesChange,
  fallbackView,
}: ShellLayoutProps): React.ReactElement {
  const HeaderSlot = workspace?.HeaderSlot
  const LeftPanel = workspace?.LeftPanel
  const MainView = workspace?.MainView
  const RightPanel = workspace?.RightPanel
  const wsId = workspace?.id ?? 'none'

  const showLeft = Boolean(LeftPanel) && !leftCollapsed
  const showRight = Boolean(RightPanel) && !rightCollapsed

  const mainContent = MainView ? (
    <WorkspaceErrorBoundary scopeName={workspace?.title ?? wsId} resetKey={wsId}>
      <React.Suspense
        fallback={
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
        }
      >
        <MainView {...viewProps} />
      </React.Suspense>
    </WorkspaceErrorBoundary>
  ) : (
    fallbackView
  )

  const centerColumn = (
    <div
      data-lf-pane="main"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
        background: 'var(--dsw-alias-bg-base, #ffffff)',
      }}
    >
      {HeaderSlot ? (
        <div
          data-lf-header-slot={wsId}
          style={{
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            overflow: 'hidden',
            borderBottom: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))',
            background: 'var(--dsw-specific-sidebar-fill, #f9fafb)',
          }}
        >
          <WorkspaceErrorBoundary scopeName={`${wsId}:header`} resetKey={wsId}>
            <HeaderSlot {...viewProps} />
          </WorkspaceErrorBoundary>
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {mainContent}
      </div>
    </div>
  )

  const handleLayoutChanged = (layout: Layout, meta: LayoutChangedMeta): void => {
    if (!meta?.isUserInteraction) return
    const patch: { leftSize?: number; rightSize?: number } = {}
    if (typeof layout.left === 'number' && layout.left > 0) patch.leftSize = layout.left
    if (typeof layout.right === 'number' && layout.right > 0) patch.rightSize = layout.right
    if (patch.leftSize !== undefined || patch.rightSize !== undefined) onPaneSizesChange(patch)
  }

  if (!showLeft && !showRight) {
    return (
      <div
        data-lf-layout=""
        data-lf-layout-workspace={wsId}
        style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}
      >
        {centerColumn}
      </div>
    )
  }

  const mainDefault = Math.max(
    20,
    100 - (showLeft ? leftSize : 0) - (showRight ? rightSize : 0),
  )

  return (
    <div
      data-lf-layout=""
      data-lf-layout-workspace={wsId}
      style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}
    >
      <Group
        key={`${wsId}:${showLeft ? 'L' : '-'}:${showRight ? 'R' : '-'}`}
        id={`lf-layout-${wsId}`}
        orientation="horizontal"
        onLayoutChanged={handleLayoutChanged}
        style={{ display: 'flex', width: '100%', height: '100%', minHeight: 0 }}
      >
        {showLeft && LeftPanel ? (
          <>
            <Panel
              id="left"
              defaultSize={`${leftSize}%`}
              minSize="12%"
              maxSize="45%"
              style={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow: 'hidden',
                background: 'var(--dsw-specific-sidebar-fill, #f9fafb)',
                color: 'var(--dsw-alias-label-primary, #0f1115)',
              }}
            >
              <aside
                data-lf-pane="left"
                aria-label="左侧栏"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  minHeight: 0,
                  overflow: 'hidden',
                }}
              >
                <WorkspaceErrorBoundary scopeName={`${wsId}:left`} resetKey={wsId}>
                  <LeftPanel {...viewProps} />
                </WorkspaceErrorBoundary>
              </aside>
            </Panel>
            <ResizeHandle id="left-main" />
          </>
        ) : null}

        <Panel
          id="main"
          defaultSize={`${mainDefault}%`}
          minSize="25%"
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
            background: 'var(--dsw-alias-bg-base, #ffffff)',
          }}
        >
          {centerColumn}
        </Panel>

        {showRight && RightPanel ? (
          <>
            <ResizeHandle id="main-right" />
            <Panel
              id="right"
              defaultSize={`${rightSize}%`}
              minSize="12%"
              maxSize="45%"
              style={{
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
                overflow: 'hidden',
                background: 'var(--dsw-specific-sidebar-fill, #f9fafb)',
                color: 'var(--dsw-alias-label-primary, #0f1115)',
              }}
            >
              <aside
                data-lf-pane="right"
                aria-label="右侧栏"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  minHeight: 0,
                  overflow: 'hidden',
                }}
              >
                <WorkspaceErrorBoundary scopeName={`${wsId}:right`} resetKey={wsId}>
                  <RightPanel {...viewProps} />
                </WorkspaceErrorBoundary>
              </aside>
            </Panel>
          </>
        ) : null}
      </Group>
    </div>
  )
}
