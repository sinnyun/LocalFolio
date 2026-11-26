import * as React from 'react'
import type { FloatingPanelContribution } from '@folio/base-contract'
import { FolioIconClose } from '@folio/base-ui-kit/client'
import { WorkspaceErrorBoundary } from './ErrorBoundary.js'
import { useShellStore, type FloatingPanelGeometry } from './shell-store.js'

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const RESIZE_CURSORS: Record<ResizeEdge, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

export function clampFloatingRect(
  rect: { x: number; y: number; width: number; height: number },
  minWidth: number,
  minHeight: number,
): { x: number; y: number; width: number; height: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight || 800 : 800
  const width = Math.max(minWidth, Math.min(rect.width, vw - 16))
  const height = Math.max(minHeight, Math.min(rect.height, vh - 16))
  // Keep at least 120x36px of the titlebar visible inside the viewport.
  const x = Math.min(Math.max(rect.x, -width + 120), vw - 120)
  const y = Math.min(Math.max(rect.y, 0), vh - 36)
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}

interface FloatingWindowProps {
  readonly contrib: FloatingPanelContribution
  readonly rect: FloatingPanelGeometry
  readonly maximized: boolean
  readonly onFocus: () => void
  readonly onClose: () => void
  readonly onToggleMaximize: () => void
  readonly onChangeRect: (patch: { x: number; y: number; width: number; height: number }) => void
}

function FloatingWindow({
  contrib,
  rect,
  maximized,
  onFocus,
  onClose,
  onToggleMaximize,
  onChangeRect,
}: FloatingWindowProps): React.ReactElement {
  const minW = contrib.minWidth ?? 320
  const minH = contrib.minHeight ?? 220

  const startDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (maximized || event.button !== 0) return
    event.preventDefault()
    onFocus()
    const target = event.currentTarget
    target.setPointerCapture?.(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    const origin = { ...rect }

    const onMove = (e: PointerEvent): void => {
      onChangeRect(
        clampFloatingRect(
          {
            x: origin.x + (e.clientX - startX),
            y: origin.y + (e.clientY - startY),
            width: origin.width,
            height: origin.height,
          },
          minW,
          minH,
        ),
      )
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const startResize = (edge: ResizeEdge) => (event: React.PointerEvent<HTMLDivElement>): void => {
    if (maximized || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onFocus()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    const origin = { ...rect }

    const onMove = (e: PointerEvent): void => {
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      let { x, y, width, height } = origin

      if (edge.includes('e')) width = Math.max(minW, origin.width + dx)
      if (edge.includes('s')) height = Math.max(minH, origin.height + dy)
      if (edge.includes('w')) {
        const nextW = Math.max(minW, origin.width - dx)
        x = origin.x + (origin.width - nextW)
        width = nextW
      }
      if (edge.includes('n')) {
        const nextH = Math.max(minH, origin.height - dy)
        y = origin.y + (origin.height - nextH)
        height = nextH
      }

      onChangeRect(clampFloatingRect({ x, y, width, height }, minW, minH))
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const windowStyle: React.CSSProperties = maximized
    ? {
        position: 'fixed',
        top: 'var(--dsh-frame-top-clearance, 0px)',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: rect.zIndex,
        borderRadius: 0,
      }
    : {
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        zIndex: rect.zIndex,
        borderRadius: 'var(--dsw-radius-md, 10px)',
      }

  const Content = contrib.Component

  return (
    <section
      role="dialog"
      aria-label={contrib.title}
      data-lf-floating-panel={contrib.id}
      data-lf-maximized={maximized ? 'true' : 'false'}
      onPointerDown={onFocus}
      style={{
        ...windowStyle,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        pointerEvents: 'auto',
        background: 'var(--dsw-alias-bg-layer-2, #ffffff)',
        color: 'var(--dsw-alias-label-primary, #0f1115)',
        border: '1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.16))',
        boxShadow: 'var(--dsw-elevation-prominent, 0 18px 42px rgba(15, 23, 42, 0.22))',
      }}
    >
      {/* Draggable Titlebar (double-click to maximize/restore) */}
      <header
        data-lf-floating-titlebar={contrib.id}
        onPointerDown={startDrag}
        onDoubleClick={onToggleMaximize}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          height: 36,
          padding: '0 10px 0 12px',
          flexShrink: 0,
          userSelect: 'none',
          cursor: maximized ? 'default' : 'grab',
          background: 'var(--dsw-specific-sidebar-fill, #f9fafb)',
          borderBottom: '1px solid var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.1))',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {contrib.title}
          </span>
          {contrib.pluginId ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 400,
                fontFamily: 'var(--ds-font-family-code, monospace)',
                color: 'var(--dsw-alias-label-tertiary, #81858c)',
              }}
            >
              {contrib.pluginId}
            </span>
          ) : null}
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          onPointerDown={e => e.stopPropagation()}
        >
          <button
            type="button"
            data-lf-floating-maximize={contrib.id}
            title={maximized ? '还原窗口' : '最大化窗口'}
            aria-label={maximized ? '还原窗口' : '最大化窗口'}
            onClick={onToggleMaximize}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--dsw-alias-label-secondary, #61666b)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {maximized ? '❐' : '□'}
          </button>
          <button
            type="button"
            data-lf-floating-close={contrib.id}
            title="关闭悬浮面板"
            aria-label="关闭悬浮面板"
            onClick={onClose}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: 'var(--dsw-alias-label-secondary, #61666b)',
              cursor: 'pointer',
            }}
          >
            <FolioIconClose size={13} />
          </button>
        </div>
      </header>

      {/* Panel Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
        <WorkspaceErrorBoundary scopeName={contrib.title} resetKey={contrib.id}>
          <Content
            panelId={contrib.id}
            maximized={maximized}
            close={onClose}
            toggleMaximize={onToggleMaximize}
          />
        </WorkspaceErrorBoundary>
      </div>

      {/* 8-way resize handles (hidden when maximized) */}
      {!maximized ? (
        <>
          {(
            [
              ['n', { top: 0, left: 6, right: 6, height: 5 }],
              ['s', { bottom: 0, left: 6, right: 6, height: 5 }],
              ['e', { top: 6, bottom: 6, right: 0, width: 5 }],
              ['w', { top: 6, bottom: 6, left: 0, width: 5 }],
              ['ne', { top: 0, right: 0, width: 10, height: 10 }],
              ['nw', { top: 0, left: 0, width: 10, height: 10 }],
              ['se', { bottom: 0, right: 0, width: 10, height: 10 }],
              ['sw', { bottom: 0, left: 0, width: 10, height: 10 }],
            ] as Array<[ResizeEdge, React.CSSProperties]>
          ).map(([edge, pos]) => (
            <div
              key={edge}
              data-lf-resize-edge={edge}
              onPointerDown={startResize(edge)}
              style={{
                position: 'absolute',
                ...pos,
                cursor: RESIZE_CURSORS[edge],
                zIndex: 5,
              }}
            />
          ))}
        </>
      ) : null}
    </section>
  )
}

export interface FloatingPanelHostProps {
  readonly panels: readonly FloatingPanelContribution[]
}

export function FloatingPanelHost({ panels }: FloatingPanelHostProps): React.ReactElement | null {
  const openIds = useShellStore(s => s.openFloatingPanels)
  const rects = useShellStore(s => s.floatingPanelRects)
  const maximizedMap = useShellStore(s => s.maximizedPanels)
  const focus = useShellStore(s => s.focusFloatingPanel)
  const close = useShellStore(s => s.closeFloatingPanel)
  const toggleMaximize = useShellStore(s => s.toggleMaximizeFloatingPanel)
  const setRect = useShellStore(s => s.setFloatingPanelRect)

  const panelMap = React.useMemo(() => new Map(panels.map(p => [p.id, p])), [panels])
  const active = openIds
    .map(id => panelMap.get(id))
    .filter((p): p is FloatingPanelContribution => p !== undefined)

  if (active.length === 0) return null

  return (
    <div
      data-lf-floating-host=""
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 40,
      }}
    >
      {active.map(contrib => {
        const rect = rects[contrib.id] ?? {
          x: 160,
          y: 96,
          width: contrib.defaultWidth ?? 560,
          height: contrib.defaultHeight ?? 420,
          zIndex: 101,
        }
        return (
          <FloatingWindow
            key={contrib.id}
            contrib={contrib}
            rect={rect}
            maximized={Boolean(maximizedMap[contrib.id])}
            onFocus={() => focus(contrib.id)}
            onClose={() => close(contrib.id)}
            onToggleMaximize={() => toggleMaximize(contrib.id)}
            onChangeRect={next => setRect(contrib.id, next)}
          />
        )
      })}
    </div>
  )
}
