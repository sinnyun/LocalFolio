import * as React from 'react'
import { pageSingleton } from '@/page-singleton'

/**
 * `FolioUiHost` registers the portal root from the `@folio/base-ui-kit` row,
 * while dialogs, menus and tooltips read it from whichever plugin copy renders
 * them. A page-level store keeps both sides on the same container after live
 * code replacement swaps one of them.
 */
interface PortalStore {
  container: HTMLElement | null
  readonly listeners: Set<() => void>
}

const store = pageSingleton<PortalStore>('@folio/base-ui-kit/portal-container', () => ({
  container: null,
  listeners: new Set(),
}))

function emit(): void {
  for (const listener of [...store.listeners]) listener()
}

export function setPortalContainer(el: HTMLElement | null): void {
  if (store.container === el) return
  store.container = el
  emit()
}

export function getPortalContainer(): HTMLElement | null {
  return store.container
}

export function subscribePortalContainer(listener: () => void): () => void {
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
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
