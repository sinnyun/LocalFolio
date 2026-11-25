import * as React from 'react'

export interface DshShortcutService {
  readonly runtime?: 'desktop' | 'web'
  readonly platform?: 'macos' | 'windows' | 'linux'
  recording?: (active: boolean) => void | Promise<void>
}

export function isEditableEventTarget(event: Event): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  const origin = (path[0] ?? event.target) as HTMLElement | null
  if (!origin || typeof origin !== 'object') return false
  const tag = typeof origin.tagName === 'string' ? origin.tagName.toUpperCase() : ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return Boolean(origin.isContentEditable)
}

export interface ShortcutIsolationOptions {
  readonly active: boolean
  readonly resolveService: () => DshShortcutService | undefined
  readonly onBeforeEscape?: () => boolean
  readonly onEscape: () => void
}

const POPUP_SELECTOR =
  '[data-modal-layer], [data-open][role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

function hasOpenNativePopup(doc: Document | null): boolean {
  if (!doc) return false
  return doc.querySelector(POPUP_SELECTOR) !== null
}

/**
 * Full-screen overlay shortcut isolation (native DSH DOM, no Shadow DOM wall):
 * 1. Suspends DSH global shortcuts via `shortcuts.recording(true)` while open,
 *    and unconditionally restores `shortcuts.recording(false)` on close/unmount.
 * 2. Layered Esc: yields to DSH native popups/menus -> top floating panel (`onBeforeEscape`) -> exit overlay.
 */
export function useShortcutIsolation({
  active,
  resolveService,
  onBeforeEscape,
  onEscape,
}: ShortcutIsolationOptions): void {
  const resolveRef = React.useRef(resolveService)
  resolveRef.current = resolveService
  const onBeforeEscapeRef = React.useRef(onBeforeEscape)
  onBeforeEscapeRef.current = onBeforeEscape
  const onEscapeRef = React.useRef(onEscape)
  onEscapeRef.current = onEscape

  React.useEffect(() => {
    if (!active) return undefined

    const callRecording = (flag: boolean): void => {
      try {
        const service = resolveRef.current()
        if (typeof service?.recording === 'function') {
          void Promise.resolve(service.recording(flag)).catch(() => {})
        }
      } catch {
        // Degrade gracefully when host shortcut service is absent.
      }
    }

    callRecording(true)

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const doc = typeof document !== 'undefined' ? document : null
      if (hasOpenNativePopup(doc)) return
      if (onBeforeEscapeRef.current?.()) {
        event.preventDefault()
        return
      }
      event.preventDefault()
      onEscapeRef.current()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      callRecording(false)
    }
  }, [active])
}
