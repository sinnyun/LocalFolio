import type * as React from 'react'

export const FOLIO_DRAG_MIME = 'application/x-localfolio-items'

export interface FolioDragPayload {
  readonly paths: readonly string[]
  readonly sourceWorkspace?: string
}

export function encodeFolioDragPayload(payload: FolioDragPayload): string {
  return JSON.stringify(payload)
}

export function decodeFolioDragPayload(raw: string): FolioDragPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<FolioDragPayload>
    if (!Array.isArray(parsed.paths)) return null
    const paths = parsed.paths.filter((p): p is string => typeof p === 'string' && p.length > 0)
    if (paths.length === 0) return null
    return {
      paths,
      sourceWorkspace:
        typeof parsed.sourceWorkspace === 'string' ? parsed.sourceWorkspace : undefined,
    }
  } catch {
    return null
  }
}

export interface WorkspaceViewProps {
  readonly workspaceId: string
  readonly workspaces: readonly WorkspaceUiContribution[]
  readonly pendingTarget?: unknown
  readonly consumePendingTarget: () => unknown
  readonly navigateTo: (workspaceId: string, target?: unknown) => void
  readonly openFile: (filePath: string) => void
  readonly openFloatingPanel: (id: string, defaults?: FloatingPanelDefaults) => void
  readonly closeFloatingPanel: (id: string) => void
}

export type WorkspaceMainViewComponent =
  | React.ComponentType<WorkspaceViewProps>
  | React.LazyExoticComponent<React.ComponentType<WorkspaceViewProps>>

export interface WorkspaceUiContribution {
  readonly id: string
  readonly title: string
  readonly order: number
  readonly pluginId?: string
  readonly icon?: React.ComponentType<{ size?: number }>
  readonly shortcutScope?: string
  readonly fileExtensions?: readonly string[]
  /**
   * The workspace's whole content area, below the shell's caption bar.
   *
   * Form A (four regions) passes `folioFrame.WorkspaceHost` and registers a
   * `FrameAppDefinition`. Form B passes its own full-bleed view; the shell
   * contributes nothing inside this area — no panes, no bottom edge.
   */
  readonly MainView?: WorkspaceMainViewComponent
}

/** Props handed to a caption-row action registered through `registerCaptionAction`. */
export interface CaptionActionProps {
  /** Whether the workbench panel is currently open. */
  readonly isOpen: boolean
}

/**
 * A small control a plugin contributes to the shell's caption row (Windows
 * Desktop title bar) or the in-overlay top bar. The shell owns the row and its
 * styling; the plugin owns the button and what it does.
 */
export interface CaptionActionContribution {
  readonly id: string
  /** Sort weight inside the row. Lower comes first. Defaults to 100. */
  readonly order?: number
  readonly Component: React.ComponentType<CaptionActionProps>
}

export interface FloatingPanelDefaults {
  readonly width?: number
  readonly height?: number
  readonly x?: number
  readonly y?: number
}

export interface FloatingPanelRenderProps {
  readonly panelId: string
  readonly maximized: boolean
  readonly close: () => void
  readonly toggleMaximize: () => void
}

/**
 * Declarative floating panel contribution (free drag, 8-way resize, maximize/restore).
 * Any future plugin can register its own standalone floating window via `ctx.folioShell.registerFloatingPanel`.
 */
export interface FloatingPanelContribution {
  readonly id: string
  readonly title: string
  readonly pluginId?: string
  readonly defaultWidth?: number
  readonly defaultHeight?: number
  readonly minWidth?: number
  readonly minHeight?: number
  readonly Component: React.ComponentType<FloatingPanelRenderProps>
}

export interface FileTypeAdapter<TData = unknown> {
  readonly id: string
  readonly extensions: readonly string[]
  readonly targetWorkspaceId: string
  parse(rawText: string): TData
  serialize(data: TData): string
}

/**
 * Client Cordis service (`ctx.folioShell`) provided by `@folio/base-shell-ui`.
 * Runs directly in DSH's native DOM (zero Shadow DOM wall).
 */
export interface FolioShellService {
  isOpen(): boolean
  open(): void
  close(): void
  toggle(): void
  registerWorkspace(contribution: WorkspaceUiContribution): () => void
  listWorkspaces(): readonly WorkspaceUiContribution[]
  /**
   * Contribute a control to the shell's caption row / top bar. The shell owns
   * the row, the styling and the ordering; the plugin owns the button.
   */
  registerCaptionAction(action: CaptionActionContribution): () => void
  listCaptionActions(): readonly CaptionActionContribution[]
  registerFloatingPanel(contribution: FloatingPanelContribution): () => void
  listFloatingPanels(): readonly FloatingPanelContribution[]
  openFloatingPanel(id: string, defaults?: FloatingPanelDefaults): void
  closeFloatingPanel(id: string): void
  toggleFloatingPanel(id: string, defaults?: FloatingPanelDefaults): void
  focusFloatingPanel(id: string): void
  navigateTo(workspaceId: string, target?: unknown): void
  openFile(filePath: string): void
}
