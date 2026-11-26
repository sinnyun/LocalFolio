import type { CanvasLinkSourceProvider, FolioCanvasService } from '@folio/base-contract'

export function createFolioCanvasService(): FolioCanvasService {
  const providers = new Map<string, CanvasLinkSourceProvider>()
  const listeners = new Set<() => void>()
  let snapshot: readonly CanvasLinkSourceProvider[] = []

  const rebuildSnapshot = () => {
    snapshot = Array.from(providers.values()).sort(
      (a, b) => (a.order ?? 100) - (b.order ?? 100),
    )
  }

  const notify = () => {
    rebuildSnapshot()
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    registerLinkSource(provider: CanvasLinkSourceProvider): () => void {
      providers.set(provider.id, provider)
      notify()
      return () => {
        if (providers.get(provider.id) === provider) {
          providers.delete(provider.id)
          notify()
        }
      }
    },

    listLinkSources(): readonly CanvasLinkSourceProvider[] {
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
