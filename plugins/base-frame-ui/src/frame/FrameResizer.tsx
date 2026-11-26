import * as React from 'react'

export interface FrameResizerProps {
  readonly side: 'left' | 'right'
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly onResize: (px: number) => void
  readonly onResizeStart?: () => void
  readonly onResizeEnd?: () => void
  readonly onReset?: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Framework-owned divider. Pointer drag, keyboard resize (arrows / Home / End),
 * double-click reset and ARIA separator semantics all stay inside the frame, so
 * plugins never touch them.
 */
export function FrameResizer({
  side,
  label,
  value,
  min,
  max,
  onResize,
  onResizeStart,
  onResizeEnd,
  onReset,
}: FrameResizerProps): React.ReactElement {
  const cleanupRef = React.useRef<(() => void) | null>(null)

  React.useEffect(() => {
    return () => {
      cleanupRef.current?.()
    }
  }, [])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.focus()
    cleanupRef.current?.()

    const startX = event.clientX
    const startValue = value
    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    onResizeStart?.()

    const move = (moveEvent: PointerEvent): void => {
      const delta = side === 'left' ? moveEvent.clientX - startX : startX - moveEvent.clientX
      onResize(clamp(startValue + delta, min, max))
    }
    const finish = (): void => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', finish)
      document.removeEventListener('pointercancel', finish)
      document.body.style.userSelect = previousUserSelect
      document.body.style.cursor = previousCursor
      cleanupRef.current = null
      onResizeEnd?.()
    }

    cleanupRef.current = finish
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', finish)
    document.addEventListener('pointercancel', finish)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 32 : 8
    let next: number | null = null
    switch (event.key) {
      case 'ArrowLeft':
        next = value + (side === 'left' ? -step : step)
        break
      case 'ArrowRight':
        next = value + (side === 'left' ? step : -step)
        break
      case 'Home':
        next = min
        break
      case 'End':
        next = max
        break
      case 'Enter':
        event.preventDefault()
        onReset?.()
        return
      default:
        return
    }
    event.preventDefault()
    onResize(clamp(next, min, max))
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      data-lf-frame-resizer={side}
      className="group relative z-20 flex w-1.5 shrink-0 touch-none cursor-col-resize items-center justify-center bg-transparent focus-visible:outline-none"
      title={`${label}：拖动调整宽度，方向键微调，双击恢复默认`}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => onReset?.()}
      onKeyDown={handleKeyDown}
    >
      <span
        aria-hidden="true"
        className="h-full w-px bg-transparent transition-colors group-hover:bg-muted-foreground/40 group-focus-visible:bg-muted-foreground/60"
      />
    </div>
  )
}
