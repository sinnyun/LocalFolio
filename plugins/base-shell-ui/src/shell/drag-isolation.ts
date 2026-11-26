import * as React from 'react'

export const DSH_FILE_DRAG_TOKEN_TYPE = 'application/x-dsh-file-drag'

export type IsolatedDragKind = 'dragenter' | 'dragover' | 'dragleave' | 'drop'

export interface DragEventLike {
  readonly defaultPrevented: boolean
  readonly dataTransfer: DataTransfer | null
  preventDefault(): void
  stopPropagation(): void
}

/**
 * Check whether a drag carries native OS files (`Files`) or a DSH internal
 * file-drag token (`application/x-dsh-file-drag`).
 */
export function isFileDragEvent(event: { readonly dataTransfer: DataTransfer | null }): boolean {
  const types = event.dataTransfer?.types
  if (!types) return false
  const list = Array.from(types as Iterable<string>)
  return list.includes('Files') || list.includes(DSH_FILE_DRAG_TOKEN_TYPE)
}

/**
 * Isolate a drag event at the LocalFolio boundary so it never bubbles up to
 * DSH's `document`-level attachment drop listeners while still allowing inner
 * workspace React/DOM handlers to run first.
 */
export function handleIsolatedDragEvent(kind: IsolatedDragKind, event: DragEventLike): void {
  event.stopPropagation()

  if (event.defaultPrevented || !isFileDragEvent(event)) {
    return
  }

  if (kind === 'dragenter' || kind === 'drop') {
    event.preventDefault()
    return
  }

  if (kind === 'dragover') {
    event.preventDefault()
    if (event.dataTransfer) {
      try {
        event.dataTransfer.dropEffect = 'none'
      } catch {
        // Ignore read-only DataTransfer in synthetic environments.
      }
    }
  }
}

/**
 * Isolate file drag-and-drop while the full-screen LocalFolio overlay is open
 * by listening in the bubble phase on `document.documentElement`.
 *
 * All workspace React handlers (`#root`) and portals (`document.body`) finish
 * before `documentElement`, while `stopPropagation()` blocks DSH's
 * `document`-level `installDocumentDropEvents` listeners cleanly (and covers the
 * top Windows titlebar strip as well).
 */
export function useDragIsolation(active: boolean): void {
  React.useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined
    const rootEl = document.documentElement
    if (!rootEl) return undefined

    const onDragEnter = (event: DragEvent): void => handleIsolatedDragEvent('dragenter', event)
    const onDragOver = (event: DragEvent): void => handleIsolatedDragEvent('dragover', event)
    const onDragLeave = (event: DragEvent): void => handleIsolatedDragEvent('dragleave', event)
    const onDrop = (event: DragEvent): void => handleIsolatedDragEvent('drop', event)

    rootEl.addEventListener('dragenter', onDragEnter, false)
    rootEl.addEventListener('dragover', onDragOver, false)
    rootEl.addEventListener('dragleave', onDragLeave, false)
    rootEl.addEventListener('drop', onDrop, false)

    return () => {
      rootEl.removeEventListener('dragenter', onDragEnter, false)
      rootEl.removeEventListener('dragover', onDragOver, false)
      rootEl.removeEventListener('dragleave', onDragLeave, false)
      rootEl.removeEventListener('drop', onDrop, false)
    }
  }, [active])
}

/**
 * React event props that isolate drag-and-drop inside a standalone floating
 * panel even when the main LocalFolio overlay is closed.
 */
export function createDragBoundaryHandlers(): {
  readonly onDragEnter: React.DragEventHandler<HTMLElement>
  readonly onDragOver: React.DragEventHandler<HTMLElement>
  readonly onDragLeave: React.DragEventHandler<HTMLElement>
  readonly onDrop: React.DragEventHandler<HTMLElement>
} {
  return {
    onDragEnter: event => handleIsolatedDragEvent('dragenter', event),
    onDragOver: event => handleIsolatedDragEvent('dragover', event),
    onDragLeave: event => handleIsolatedDragEvent('dragleave', event),
    onDrop: event => handleIsolatedDragEvent('drop', event),
  }
}
