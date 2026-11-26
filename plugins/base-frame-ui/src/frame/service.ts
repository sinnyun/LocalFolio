import type * as React from 'react'
import type {
  FolioFrameService,
  FrameAppDefinition,
  FrameController,
} from '@folio/base-contract'
import {
  resolveActiveApp,
  resolveLayout,
  summarizeApp,
  type FrameState,
} from './model.js'
import { frameStore, type FrameStore } from './store.js'

/**
 * Build a fresh imperative handle for one app. The frame re-creates it after
 * every store change, so `controller.layout` is never stale.
 */
export function createFrameController(
  app: FrameAppDefinition,
  state: FrameState,
  store: FrameStore = frameStore,
): FrameController {
  const layout = resolveLayout(app, state.layouts[app.id])
  return {
    appId: app.id,
    layout,
    listApps: () => state.apps.map(summarizeApp),
    activateApp: appId => store.setActiveApp(appId),
    setLeftCollapsed: collapsed => store.setLayout(app.id, { leftCollapsed: collapsed }),
    setRightCollapsed: collapsed => store.setLayout(app.id, { rightCollapsed: collapsed }),
    toggleLeft: () => store.setLayout(app.id, { leftCollapsed: !layout.leftCollapsed }),
    toggleRight: () => store.setLayout(app.id, { rightCollapsed: !layout.rightCollapsed }),
    setLeftWidth: px => store.setLayout(app.id, { leftWidth: px }),
    setRightWidth: px => store.setLayout(app.id, { rightWidth: px }),
    resetLayout: () => store.resetLayout(app.id),
  }
}

export interface FolioFrameServiceOptions {
  /** The frame view handed to the workspace that hosts it. */
  readonly View: React.ComponentType
  /** Navigate to the host workspace; supplied by the client plugin through folioShell. */
  readonly openWorkspace?: (workspaceId: string) => void
}

export function createFolioFrameService(options: FolioFrameServiceOptions): FolioFrameService {
  let hostWorkspaceId: string | null = null

  return {
    View: options.View,

    registerApp(definition) {
      if (!definition || typeof definition.id !== 'string' || definition.id.trim() === '') {
        throw new Error('[@folio/base-frame-ui] folioFrame.registerApp requires a non-empty id')
      }
      if (typeof definition.title !== 'string' || definition.title.trim() === '') {
        throw new Error(
          `[@folio/base-frame-ui] folioFrame.registerApp("${definition.id}") requires a title`,
        )
      }
      if (!definition.Main) {
        throw new Error(
          `[@folio/base-frame-ui] folioFrame.registerApp("${definition.id}") requires Main`,
        )
      }
      return frameStore.registerApp(definition)
    },

    listApps: () => frameStore.getState().apps,

    listAppSummaries: () => frameStore.getState().apps.map(summarizeApp),

    getActiveAppId: () => resolveActiveApp(frameStore.getState())?.id ?? '',

    activateApp: appId => frameStore.setActiveApp(appId),

    openApp: appId => {
      frameStore.setActiveApp(appId)
      if (hostWorkspaceId !== null) options.openWorkspace?.(hostWorkspaceId)
    },

    getLayout: appId => {
      const state = frameStore.getState()
      const resolvedId = appId ?? resolveActiveApp(state)?.id
      const app = state.apps.find(item => item.id === resolvedId)
      return resolveLayout(app, resolvedId ? state.layouts[resolvedId] : undefined)
    },

    setLayout: (appId, patch) => frameStore.setLayout(appId, patch),

    subscribe: listener => frameStore.subscribe(listener),

    attachHostWorkspace(workspaceId) {
      hostWorkspaceId = workspaceId
      return () => {
        if (hostWorkspaceId === workspaceId) hostWorkspaceId = null
      }
    },
  }
}
