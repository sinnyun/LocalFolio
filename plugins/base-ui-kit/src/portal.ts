import * as React from 'react'

let portalContainer: HTMLElement | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of [...listeners]) listener()
}

export function setPortalContainer(el: HTMLElement | null): void {
  if (portalContainer === el) return
  portalContainer = el
  emit()
}

export function getPortalContainer(): HTMLElement | null {
  return portalContainer
}

export function subscribePortalContainer(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Returns the `shell.overlay` portal container managed by `@folio/base-ui-kit`.
 * All Radix UI popups/dialogs/tooltips mount here so we never mutate `document.body`.
 */
export function usePortalContainer(): HTMLElement | null {
  return React.useSyncExternalStore(
    subscribePortalContainer,
    getPortalContainer,
    getPortalContainer,
  )
}
