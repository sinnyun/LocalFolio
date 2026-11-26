import type * as React from 'react'
import type { WorkspaceViewProps } from './shell.js'

/**
 * Declarative layout contract for `@folio/base-frame-ui`.
 *
 * A future plugin never manages layout, dividers, collapse state, persisted
 * widths or keyboard shortcuts. It registers one `FrameAppDefinition` and
 * provides four optional regions; the frame owns everything else.
 *
 * Region order inside the frame:
 *
 * ```
 * ┌ Left ┬───────────── Main ──────────────┬ Right ┐
 * │      │                                  │       │
 * └──────┴──────────────────────────────────┴───────┘
 * │                    Status                        │
 * └──────────────────────────────────────────────────┘
 * ```
 */

export type FrameRegionComponent =
  | React.ComponentType<FrameViewProps>
  | React.LazyExoticComponent<React.ComponentType<FrameViewProps>>

/** Current, resolved frame geometry (pixels). Owned by the frame. */
export interface FrameLayoutSnapshot {
  readonly leftCollapsed: boolean
  readonly leftWidth: number
  readonly rightCollapsed: boolean
  readonly rightWidth: number
}

/** Per-app initial geometry. User adjustments and persisted state win over these. */
export interface FrameLayoutDefaults {
  readonly leftCollapsed?: boolean
  readonly leftWidth?: number
  readonly rightCollapsed?: boolean
  readonly rightWidth?: number
}

export interface FrameAppSummary {
  readonly id: string
  readonly workspaceId?: string
  readonly title: string
  readonly subtitle?: string
  readonly pluginId?: string
  readonly icon?: React.ComponentType<{ size?: number }>
  readonly order: number
}

/**
 * Imperative handle handed to every region. Region components are rendered by
 * the frame, so they always receive the freshest snapshot after a drag,
 * collapse or app switch.
 */
export interface FrameController {
  readonly appId: string
  readonly layout: FrameLayoutSnapshot
  listApps(): readonly FrameAppSummary[]
  activateApp(appId: string): void
  setLeftCollapsed(collapsed: boolean): void
  setRightCollapsed(collapsed: boolean): void
  toggleLeft(): void
  toggleRight(): void
  setLeftWidth(px: number): void
  setRightWidth(px: number): void
  /** Drop persisted/user geometry and fall back to `defaultLayout`. */
  resetLayout(): void
}

export interface FrameViewProps {
  readonly appId: string
  readonly frame: FrameController
}

export interface FrameProviderProps {
  readonly appId: string
  readonly frame: FrameController
  readonly children: React.ReactNode
}

export interface FrameAppDefinition {
  /** Unique app id, e.g. `notes.workbench`. Also the persisted layout key. */
  readonly id: string
  /** Optional host workspace id so multiple Form-A workspaces can scope their own apps. */
  readonly workspaceId?: string
  readonly title: string
  readonly subtitle?: string
  readonly pluginId?: string
  readonly icon?: React.ComponentType<{ size?: number }>
  /** Sort weight inside the frame's app switcher. Lower comes first. Defaults to 100. */
  readonly order?: number
  /**
   * Left panel. Rendered inside the frame's `<Sidebar>`, so the shadcn
   * `SidebarContent` / `SidebarFooter` / `SidebarMenu*` primitives all work.
   */
  readonly Left?: FrameRegionComponent
  /** Center content. Required: an app without a main view has nothing to show. */
  readonly Main: FrameRegionComponent
  /** Right panel body. The frame draws its title bar, divider and collapse button. */
  readonly Right?: FrameRegionComponent
  /** Bottom info bar (left side). The frame appends its layout controls on the right. */
  readonly Status?: FrameRegionComponent
  /**
   * Optional wrapper rendered around every region, so a plugin can share one
   * React context (selection, document, query cache…) between left/main/right/status.
   */
  readonly Provider?: React.ComponentType<FrameProviderProps>
  /** `icon` collapses left to an icon rail (default); `offcanvas` hides it completely. */
  readonly leftCollapse?: 'icon' | 'offcanvas'
  /** Title shown in the right panel's header. Defaults to `详情`. */
  readonly rightTitle?: string
  readonly defaultLayout?: FrameLayoutDefaults
}

/**
 * Client Cordis service (`ctx.folioFrame`) provided by `@folio/base-frame-ui`.
 *
 * The frame is a pure base capability: it draws nothing on its own. A workspace
 * plugin renders {@link FolioFrameService.View} inside its workspace and calls
 * {@link FolioFrameService.attachHostWorkspace}, so the frame stays invisible
 * until something hosts it.
 */
export interface FolioFrameService {
  /** The frame's own view. Render it to turn the host workspace into the frame. */
  readonly View: React.ComponentType
  /**
   * Ready-made `MainView` for a workspace: renders {@link View} and attaches
   * itself as the host while it is mounted, so `openApp()` can navigate and the
   * workspace author never wires `attachHostWorkspace` by hand.
   */
  readonly WorkspaceHost: React.ComponentType<WorkspaceViewProps>
  registerApp(definition: FrameAppDefinition): () => void
  listApps(): readonly FrameAppDefinition[]
  listAppSummaries(): readonly FrameAppSummary[]
  getActiveAppId(): string
  activateApp(appId: string): void
  /** Activate the app and bring the attached host workspace to the front. */
  openApp(appId: string): void
  getLayout(appId?: string): FrameLayoutSnapshot
  setLayout(appId: string, patch: Partial<FrameLayoutSnapshot>): void
  /** Observe registry/layout changes from non-React code. */
  subscribe(listener: () => void): () => void
  /**
   * Bind the workspace that renders {@link View}. `openApp` navigates there;
   * the frame never registers a workspace itself. Returns a detach function.
   */
  attachHostWorkspace(workspaceId: string): () => void
}
