import * as React from 'react'
import type { FolioProjectsUiService, ProjectsUiExtension } from '@folio/base-contract'

export function createFolioProjectsUiService(): FolioProjectsUiService {
  const extensions = new Map<string, ProjectsUiExtension>()
  const listeners = new Set<() => void>()
  let snapshot: readonly ProjectsUiExtension[] = []

  const rebuild = (): void => {
    snapshot = Array.from(extensions.values()).sort((a, b) => {
      const oa = a.order ?? 100
      const ob = b.order ?? 100
      if (oa !== ob) return oa - ob
      return a.id.localeCompare(b.id)
    })
  }

  const emit = (): void => {
    rebuild()
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    registerExtension(ext: ProjectsUiExtension): () => void {
      extensions.set(ext.id, ext)
      emit()
      return () => {
        if (extensions.get(ext.id) === ext) {
          extensions.delete(ext.id)
          emit()
        }
      }
    },
    listExtensions(): readonly ProjectsUiExtension[] {
      return snapshot
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

const EMPTY_EXTENSIONS: readonly ProjectsUiExtension[] = []

export function useProjectsExtensions(
  service?: FolioProjectsUiService,
): readonly ProjectsUiExtension[] {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => (service ? service.subscribe(onStoreChange) : () => {}),
    [service],
  )
  const getSnapshot = React.useCallback(
    () => (service ? service.listExtensions() : EMPTY_EXTENSIONS),
    [service],
  )
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
