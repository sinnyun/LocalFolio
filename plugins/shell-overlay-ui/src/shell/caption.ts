import * as React from 'react'

/**
 * Windows Desktop draws its own caption row above the Web client:
 * `html[data-windows-titlebar]` reserves `--dsh-windows-titlebar-height` (40px)
 * and the preload mounts `[data-windows-menu]` (the 应用 / 编辑 buttons) as a
 * fixed, open-shadow host at `left: var(--dsh-windows-menu-start, 48px)`.
 *
 * Nothing in DSH exposes an extension seat in that row, so the shell places its
 * own fixed row immediately after the menubar. Both the insertion point and the
 * reserved native window-button width are measured rather than hard-coded:
 * `--dsh-windows-menu-start` jumps from 48px to 84px when the DSH sidebar
 * collapses, and the caption buttons scale with the page zoom.
 */

export const WINDOWS_TITLEBAR_ATTR = 'data-windows-titlebar'
export const WINDOWS_TITLEBAR_HEIGHT_VAR = '--dsh-windows-titlebar-height'
export const WINDOWS_MENU_START_VAR = '--dsh-windows-menu-start'
export const WINDOWS_MENU_SELECTOR = '[data-windows-menu]'

/** Gap between the DSH menubar and the shell row, in CSS pixels. */
export const CAPTION_GAP = 8

/** Fallback width of the 应用 + 编辑 buttons when the menubar is not mounted yet. */
const FALLBACK_MENU_WIDTH = 110

/** Fallback width reserved for the native minimize / maximize / close buttons (138 DIP plus slack). */
const FALLBACK_WINDOW_CONTROLS = 180

/** Fallback caption height when the preload variable is missing. */
const FALLBACK_TITLEBAR_HEIGHT = 40

export interface CaptionMetrics {
  /** Insertion point of the shell row: right edge of the DSH menubar plus {@link CAPTION_GAP}. */
  readonly left: number
  /** Inset reserved for the native window buttons on the right edge. */
  readonly right: number
  /** Caption row height (`--dsh-windows-titlebar-height`). */
  readonly height: number
}

interface TitlebarAreaRect {
  readonly x: number
  readonly width: number
}

interface WindowControlsOverlayLike {
  readonly visible?: boolean
  readonly getTitlebarAreaRect?: () => TitlebarAreaRect
}

function readPx(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function canUseDom(): boolean {
  return typeof document !== 'undefined' && document.documentElement !== null
}

/** True only inside the Windows Desktop shell; the browser and macOS desktop never set the marker. */
export function isWindowsCaption(): boolean {
  return canUseDom() && document.documentElement.hasAttribute(WINDOWS_TITLEBAR_ATTR)
}

function measureMenuRight(): number | null {
  const host = document.querySelector(WINDOWS_MENU_SELECTOR)
  if (host === null) return null
  const rect = host.getBoundingClientRect()
  return rect.width > 0 ? rect.right : null
}

function measureWindowControls(): number {
  const overlay = (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlayLike })
    .windowControlsOverlay
  if (overlay !== undefined && overlay.visible === true && typeof overlay.getTitlebarAreaRect === 'function') {
    try {
      const rect = overlay.getTitlebarAreaRect()
      const inset = window.innerWidth - (rect.x + rect.width)
      if (Number.isFinite(inset) && inset >= 0) return Math.round(inset)
    } catch {
      // Fall through to the conservative reserve below.
    }
  }
  return FALLBACK_WINDOW_CONTROLS
}

/** Current caption geometry, or null outside the Windows Desktop shell. */
export function resolveCaptionMetrics(): CaptionMetrics | null {
  if (!canUseDom()) return null
  const root = document.documentElement
  const style = getComputedStyle(root)
  const height = readPx(style.getPropertyValue(WINDOWS_TITLEBAR_HEIGHT_VAR), FALLBACK_TITLEBAR_HEIGHT)
  const menuStart = readPx(style.getPropertyValue(WINDOWS_MENU_START_VAR), 48)
  const left = Math.round((measureMenuRight() ?? menuStart + FALLBACK_MENU_WIDTH) + CAPTION_GAP)
  return { left, right: measureWindowControls(), height }
}

function sameMetrics(a: CaptionMetrics, b: CaptionMetrics): boolean {
  return a.left === b.left && a.right === b.right && a.height === b.height
}

function scheduleFrame(callback: () => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(callback)
  return setTimeout(callback, 16) as unknown as number
}

function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle)
  else clearTimeout(handle)
}

function subscribeCaptionMode(onChange: () => void): () => void {
  if (!canUseDom()) return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [WINDOWS_TITLEBAR_ATTR],
  })
  return () => observer.disconnect()
}

/** Reactive `html[data-windows-titlebar]`: false in the browser, true in Windows Desktop. */
export function useWindowsCaptionMode(): boolean {
  return React.useSyncExternalStore(subscribeCaptionMode, isWindowsCaption, () => false)
}

/**
 * Caption geometry that follows the DSH menubar: its width changes with the
 * language and font loading, its position with sidebar collapse, and the native
 * window buttons with zoom.
 */
export function useWindowsCaptionMetrics(): CaptionMetrics | null {
  const active = useWindowsCaptionMode()
  const [metrics, setMetrics] = React.useState<CaptionMetrics | null>(() =>
    active ? resolveCaptionMetrics() : null,
  )

  React.useEffect(() => {
    if (!active) {
      setMetrics(null)
      return undefined
    }

    let frame: number | null = null
    const recompute = (): void => {
      if (frame !== null) return
      frame = scheduleFrame(() => {
        frame = null
        setMetrics(previous => {
          const next = resolveCaptionMetrics()
          if (previous === null || next === null) return next
          return sameMetrics(previous, next) ? previous : next
        })
      })
    }

    recompute()

    const resizeObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => recompute()) : null
    resizeObserver?.observe(document.documentElement)

    let menuHost: Element | null = document.querySelector(WINDOWS_MENU_SELECTOR)
    if (menuHost !== null) resizeObserver?.observe(menuHost)

    // The preload appends the menubar to <body> once AppFrame has rendered.
    const bodyObserver = new MutationObserver(() => {
      if (menuHost !== null && menuHost.isConnected) {
        recompute()
        return
      }
      if (menuHost !== null) resizeObserver?.unobserve(menuHost)
      menuHost = document.querySelector(WINDOWS_MENU_SELECTOR)
      if (menuHost !== null) resizeObserver?.observe(menuHost)
      recompute()
    })
    bodyObserver.observe(document.body, { childList: true })

    const rootObserver = new MutationObserver(() => recompute())
    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'lang'],
    })

    // `--dsh-windows-menu-start` is a `:has()` rule keyed off the DSH frame's
    // collapsed marker, so the menubar shifts without any inline style change.
    const frameObserver = new MutationObserver(() => recompute())
    frameObserver.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-sidebar-collapsed', 'data-fullscreen'],
    })

    window.addEventListener('resize', recompute)

    return () => {
      if (frame !== null) cancelFrame(frame)
      window.removeEventListener('resize', recompute)
      bodyObserver.disconnect()
      rootObserver.disconnect()
      frameObserver.disconnect()
      resizeObserver?.disconnect()
    }
  }, [active])

  return metrics
}
