import * as React from 'react'
import type { FrameAppDefinition, FrameLayoutSnapshot } from '@folio/base-contract'
import {
  FRAME_STORAGE_KEY,
  clampLeftWidth,
  clampRightWidth,
  sanitizeActiveAppByWorkspace,
  sanitizeLayouts,
  sortApps,
  type FrameAppLayoutState,
  type FrameState,
} from './model.js'

type Listener = () => void

interface PersistedFrameState {
  readonly activeAppId?: unknown
  readonly activeAppByWorkspace?: unknown
  readonly layouts?: unknown
}

function emptyPersisted(): {
  activeAppId: string
  activeAppByWorkspace: Record<string, string>
  layouts: Record<string, FrameAppLayoutState>
} {
  return { activeAppId: '', activeAppByWorkspace: {}, layouts: {} }
}

function readPersisted(): {
  activeAppId: string
  activeAppByWorkspace: Record<string, string>
  layouts: Record<string, FrameAppLayoutState>
} {
  if (typeof window === 'undefined') return emptyPersisted()
  try {
    const raw = window.localStorage.getItem(FRAME_STORAGE_KEY)
    if (!raw) return emptyPersisted()
    const parsed = JSON.parse(raw) as PersistedFrameState
    return {
      activeAppId: typeof parsed.activeAppId === 'string' ? parsed.activeAppId : '',
      activeAppByWorkspace: sanitizeActiveAppByWorkspace(parsed.activeAppByWorkspace),
      layouts: sanitizeLayouts(parsed.layouts),
    }
  } catch {
    return emptyPersisted()
  }
}

/**
 * Tiny external store for the frame. It is deliberately not persisted in React
 * state: the Cordis service mutates it from outside the component tree, and the
 * frame subscribes through `useSyncExternalStore`.
 */
export class FrameStore {
  private state: FrameState
  private readonly listeners = new Set<Listener>()
  private persistTimer: ReturnType<typeof setTimeout> | null = null

  constructor(initial?: Partial<FrameState>) {
    const persisted = initial ? emptyPersisted() : readPersisted()
    this.state = {
      apps: initial?.apps ?? [],
      activeAppId: initial?.activeAppId ?? persisted.activeAppId,
      hostWorkspaceId: initial?.hostWorkspaceId ?? null,
      activeAppByWorkspace: initial?.activeAppByWorkspace ?? persisted.activeAppByWorkspace,
      layouts: initial?.layouts ?? persisted.layouts,
    }
  }

  readonly getState = (): FrameState => this.state

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  registerApp(definition: FrameAppDefinition): () => void {
    const apps = sortApps([
      ...this.state.apps.filter(app => app.id !== definition.id),
      definition,
    ])
    this.patchState({ apps })
    return () => {
      const current = this.state.apps.find(app => app.id === definition.id)
      // A newer registration for the same id wins; never remove it on stale cleanup.
      if (current !== definition) return
      this.patchState({
        apps: this.state.apps.filter(app => app.id !== definition.id),
        activeAppId: this.state.activeAppId === definition.id ? '' : this.state.activeAppId,
      })
    }
  }

  setHostWorkspace(workspaceId: string | null): void {
    if (this.state.hostWorkspaceId === workspaceId) return
    this.state = { ...this.state, hostWorkspaceId: workspaceId }
    for (const listener of this.listeners) listener()
  }

  setActiveApp(appId: string): void {
    const targetApp = this.state.apps.find(app => app.id === appId)
    const wsKey = targetApp?.workspaceId ?? this.state.hostWorkspaceId
    const nextByWs =
      wsKey && this.state.activeAppByWorkspace[wsKey] !== appId
        ? { ...this.state.activeAppByWorkspace, [wsKey]: appId }
        : this.state.activeAppByWorkspace
    if (this.state.activeAppId === appId && nextByWs === this.state.activeAppByWorkspace) return
    this.patchState({ activeAppId: appId, activeAppByWorkspace: nextByWs })
  }

  setLayout(appId: string, patch: Partial<FrameLayoutSnapshot>): void {
    const prev = this.state.layouts[appId] ?? {}
    const next: FrameAppLayoutState = {
      leftCollapsed:
        patch.leftCollapsed !== undefined ? patch.leftCollapsed : prev.leftCollapsed,
      rightCollapsed:
        patch.rightCollapsed !== undefined ? patch.rightCollapsed : prev.rightCollapsed,
      leftWidth:
        patch.leftWidth !== undefined ? clampLeftWidth(patch.leftWidth) : prev.leftWidth,
      rightWidth:
        patch.rightWidth !== undefined ? clampRightWidth(patch.rightWidth) : prev.rightWidth,
    }
    this.patchState({ layouts: { ...this.state.layouts, [appId]: next } })
  }

  resetLayout(appId: string): void {
    if (!(appId in this.state.layouts)) return
    const { [appId]: _removed, ...rest } = this.state.layouts
    this.patchState({ layouts: rest })
  }

  /** Test/teardown helper: forget apps, persisted geometry and listeners. */
  reset(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }
    this.listeners.clear()
    this.state = {
      apps: [],
      activeAppId: '',
      hostWorkspaceId: null,
      activeAppByWorkspace: {},
      layouts: {},
    }
  }

  private patchState(patch: Partial<FrameState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
    this.schedulePersist()
  }

  private schedulePersist(): void {
    if (typeof window === 'undefined') return
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persist()
    }, 150)
  }

  private persist(): void {
    try {
      const payload = JSON.stringify({
        activeAppId: this.state.activeAppId,
        activeAppByWorkspace: this.state.activeAppByWorkspace,
        layouts: this.state.layouts,
      })
      window.localStorage.setItem(FRAME_STORAGE_KEY, payload)
    } catch {
      // Storage can be unavailable (quota, privacy mode); layout still works in memory.
    }
  }
}

export const frameStore = new FrameStore()

/** Subscribe a React component to frame registry + geometry changes. */
export function useFrameState(store: FrameStore = frameStore): FrameState {
  return React.useSyncExternalStore(store.subscribe, store.getState, store.getState)
}
