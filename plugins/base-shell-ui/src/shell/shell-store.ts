import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { FloatingPanelDefaults } from '@folio/base-contract'

function createSafeStorage(): StateStorage {
  const memory = new Map<string, string>()
  return {
    getItem(name) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(name)
        }
      } catch {
        // fallback to memory
      }
      return memory.get(name) ?? null
    },
    setItem(name, value) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(name, value)
          return
        }
      } catch {
        // fallback to memory
      }
      memory.set(name, value)
    },
    removeItem(name) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(name)
          return
        }
      } catch {
        // fallback to memory
      }
      memory.delete(name)
    },
  }
}

export interface FloatingPanelGeometry {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly zIndex: number
}

export interface PendingNavigation {
  readonly workspaceId: string
  readonly target: unknown
  readonly ts: number
}

/**
 * The shell's own state. Region geometry does not live here: the shell draws no
 * panes, so per-app widths belong to `@folio/base-frame-ui` (`folio.frame.v1`).
 */
export interface ShellStoreState {
  activeWorkspaceId: string
  pendingTarget: PendingNavigation | null
  openFloatingPanels: string[]
  floatingPanelRects: Record<string, FloatingPanelGeometry>
  maximizedPanels: Record<string, boolean>
  topZIndex: number

  setActiveWorkspace: (id: string) => void
  setPendingTarget: (workspaceId: string, target: unknown) => void
  consumePendingTarget: (workspaceId?: string) => unknown
  openFloatingPanel: (id: string, defaults?: FloatingPanelDefaults) => void
  closeFloatingPanel: (id: string) => void
  toggleFloatingPanel: (id: string, defaults?: FloatingPanelDefaults) => void
  focusFloatingPanel: (id: string) => void
  setFloatingPanelRect: (
    id: string,
    rect: Partial<Omit<FloatingPanelGeometry, 'zIndex'>>,
  ) => void
  toggleMaximizeFloatingPanel: (id: string) => void
  closeTopFloatingPanel: () => boolean
  reset: () => void
}

function computeDefaultRect(
  defaults: FloatingPanelDefaults | undefined,
  openCount: number,
  zIndex: number,
): FloatingPanelGeometry {
  const width = defaults?.width ?? 560
  const height = defaults?.height ?? 420
  const vw = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight || 800 : 800
  const offset = (openCount % 5) * 28
  const x = defaults?.x ?? Math.max(24, Math.round((vw - width) / 2) + offset)
  const y = defaults?.y ?? Math.max(56, Math.round((vh - height) / 2) + offset)
  return { x, y, width, height, zIndex }
}

const INITIAL_DATA = {
  activeWorkspaceId: '',
  pendingTarget: null as PendingNavigation | null,
  openFloatingPanels: [] as string[],
  floatingPanelRects: {} as Record<string, FloatingPanelGeometry>,
  maximizedPanels: {} as Record<string, boolean>,
  topZIndex: 100,
}

export const useShellStore = create<ShellStoreState>()(
  persist(
    (set, get) => ({
      ...INITIAL_DATA,

      setActiveWorkspace: id => set({ activeWorkspaceId: id }),

      setPendingTarget: (workspaceId, target) =>
        set({
          activeWorkspaceId: workspaceId,
          pendingTarget: { workspaceId, target, ts: Date.now() },
        }),

      consumePendingTarget: workspaceId => {
        const current = get().pendingTarget
        if (!current) return undefined
        if (workspaceId && current.workspaceId !== workspaceId) return undefined
        set({ pendingTarget: null })
        return current.target
      },

      openFloatingPanel: (id, defaults) =>
        set(state => {
          const nextZ = state.topZIndex + 1
          const existing = state.floatingPanelRects[id]
          const nextRect: FloatingPanelGeometry = existing
            ? { ...existing, zIndex: nextZ }
            : computeDefaultRect(defaults, state.openFloatingPanels.length, nextZ)
          const openFloatingPanels = state.openFloatingPanels.includes(id)
            ? state.openFloatingPanels
            : [...state.openFloatingPanels, id]
          return {
            topZIndex: nextZ,
            openFloatingPanels,
            floatingPanelRects: { ...state.floatingPanelRects, [id]: nextRect },
          }
        }),

      closeFloatingPanel: id =>
        set(state => ({
          openFloatingPanels: state.openFloatingPanels.filter(item => item !== id),
        })),

      toggleFloatingPanel: (id, defaults) => {
        if (get().openFloatingPanels.includes(id)) {
          get().closeFloatingPanel(id)
        } else {
          get().openFloatingPanel(id, defaults)
        }
      },

      focusFloatingPanel: id =>
        set(state => {
          const existing = state.floatingPanelRects[id]
          if (!existing || existing.zIndex === state.topZIndex) return state
          const nextZ = state.topZIndex + 1
          return {
            topZIndex: nextZ,
            floatingPanelRects: {
              ...state.floatingPanelRects,
              [id]: { ...existing, zIndex: nextZ },
            },
          }
        }),

      setFloatingPanelRect: (id, rect) =>
        set(state => {
          const existing =
            state.floatingPanelRects[id] ?? computeDefaultRect(undefined, 0, state.topZIndex)
          return {
            floatingPanelRects: {
              ...state.floatingPanelRects,
              [id]: {
                ...existing,
                x: rect.x ?? existing.x,
                y: rect.y ?? existing.y,
                width: rect.width ?? existing.width,
                height: rect.height ?? existing.height,
              },
            },
          }
        }),

      toggleMaximizeFloatingPanel: id =>
        set(state => {
          const nextZ = state.topZIndex + 1
          const existing = state.floatingPanelRects[id]
          return {
            topZIndex: nextZ,
            maximizedPanels: {
              ...state.maximizedPanels,
              [id]: !state.maximizedPanels[id],
            },
            floatingPanelRects: existing
              ? { ...state.floatingPanelRects, [id]: { ...existing, zIndex: nextZ } }
              : state.floatingPanelRects,
          }
        }),

      closeTopFloatingPanel: () => {
        const { openFloatingPanels, floatingPanelRects } = get()
        if (openFloatingPanels.length === 0) return false
        let topId = openFloatingPanels[openFloatingPanels.length - 1]!
        let maxZ = -1
        for (const id of openFloatingPanels) {
          const z = floatingPanelRects[id]?.zIndex ?? 0
          if (z >= maxZ) {
            maxZ = z
            topId = id
          }
        }
        get().closeFloatingPanel(topId)
        return true
      },

      reset: () => set({ ...INITIAL_DATA }),
    }),
    {
      // v3 drops `paneLayouts`; the previous keys' leftovers are ignored because
      // zustand merges only the fields listed in `partialize`.
      name: 'folio.shell.overlay.v3',
      storage: createJSONStorage(() => createSafeStorage()),
      partialize: state => ({
        activeWorkspaceId: state.activeWorkspaceId,
        floatingPanelRects: state.floatingPanelRects,
      }),
    },
  ),
)
