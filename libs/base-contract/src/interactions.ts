export interface FolioContextMenuPoint {
  readonly x: number
  readonly y: number
}

export interface FolioContextMenuTarget {
  readonly kind: string
  readonly value: Readonly<Record<string, unknown>>
}

export interface FolioContextMenuAction {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
  readonly danger?: boolean
  readonly separatorBefore?: boolean
  readonly children?: readonly FolioContextMenuAction[]
  readonly failureLabel?: string
  readonly run?: () => void | Promise<void>
}

export interface FolioContextMenuContribution {
  readonly id: string
  readonly target: string
  readonly order: number
  resolve(
    value: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ): readonly FolioContextMenuAction[] | Promise<readonly FolioContextMenuAction[]>
}

export type FolioFileDragSource =
  | {
      readonly kind: 'url'
      readonly url: string
      readonly name: string
      readonly mediaType?: string
    }
  | {
      readonly kind: 'blob'
      readonly blob: Blob
      readonly name: string
      readonly mediaType?: string
    }

export interface FolioFileDragSession {
  prepare(): void
  /**
   * Start dragging. Returns `true` for browser drag, or `false` when Desktop
   * native drag took over (caller should call `event.preventDefault()`).
   */
  start(transfer: DataTransfer, source: HTMLElement): boolean
  release(): void
  dispose(): void
}

export interface FolioFileTransferSource {
  readonly url: string
  readonly name?: string
  readonly mediaType?: string
}

/**
 * Client Cordis service (`ctx.folioInteractions`) provided by `@folio/bridge-dsh-interactions-ui`.
 * Bridges DSH native `contextMenus`, `fileDrag`, and `fileActions` with clean fallbacks.
 */
export interface FolioInteractionsService {
  hasNativeContextMenu(): boolean
  hasNativeFileDrag(): boolean
  canSaveAs(): boolean
  registerContextMenu(contribution: FolioContextMenuContribution): () => void
  openContextMenu(target: FolioContextMenuTarget, point: FolioContextMenuPoint): void
  closeContextMenu(): void
  notify(text: string, success?: boolean): void
  createFileDragSession(
    source: FolioFileDragSource,
    fallbackPayload?: {
      readonly paths: readonly string[]
      readonly sourceWorkspace?: string
    },
  ): FolioFileDragSession
  readDroppedFile(transfer: DataTransfer): File | undefined
  copyImage(source: FolioFileTransferSource): Promise<void>
  saveFile(source: FolioFileTransferSource, mode?: 'download' | 'saveAs'): Promise<void>
}
