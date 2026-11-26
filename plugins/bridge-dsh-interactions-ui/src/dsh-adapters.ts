import type { Context } from '@deepseek-ai/cordis'
import type { FolioFileDragSource, FolioFileTransferSource } from '@folio/base-contract'

export interface DshMenuActionLike {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
  readonly danger?: boolean
  readonly separatorBefore?: boolean
  readonly children?: readonly DshMenuActionLike[]
  readonly failureLabel?: string
  readonly run?: () => void | Promise<void>
}

export interface DshMenuContributionLike {
  readonly id: string
  readonly target: string
  readonly order: number
  resolve(
    target: unknown,
    signal: AbortSignal,
  ): readonly DshMenuActionLike[] | Promise<readonly DshMenuActionLike[]>
}

export interface DshContextMenusLike {
  register(contribution: DshMenuContributionLike): () => void
  open(target: { readonly kind: string; readonly value: unknown }, point: { readonly x: number; readonly y: number }): void
  close(): void
  notify?(text: string, success?: boolean): void
}

export interface DshPreparedFileDragLike {
  start(transfer: DataTransfer, source: HTMLElement): boolean
  release(): void
}

export interface DshFileDragLike {
  readonly actions: {
    prepare(source: FolioFileDragSource, signal: AbortSignal): Promise<DshPreparedFileDragLike>
    reportFailure(): void
  }
  read(transfer: DataTransfer): File | undefined
}

export interface DshFileActionsLike {
  readonly canSaveAs: boolean
  save(source: FolioFileTransferSource, mode: 'download' | 'saveAs'): Promise<unknown>
  copyImage(source: FolioFileTransferSource): Promise<void>
}

interface CordisGetLike {
  get?(key: string): unknown
}

function safeGet(ctx: Context | undefined, key: string): unknown {
  if (!ctx) return undefined
  const getter = (ctx as unknown as CordisGetLike).get
  if (typeof getter !== 'function') return undefined
  try {
    return getter.call(ctx, key)
  } catch {
    return undefined
  }
}

export function resolveDshContextMenus(ctx: Context | undefined): DshContextMenusLike | undefined {
  const candidate = safeGet(ctx, 'contextMenus') as Partial<DshContextMenusLike> | undefined
  if (
    candidate &&
    typeof candidate.register === 'function' &&
    typeof candidate.open === 'function' &&
    typeof candidate.close === 'function'
  ) {
    return candidate as DshContextMenusLike
  }
  return undefined
}

export function resolveDshFileDrag(ctx: Context | undefined): DshFileDragLike | undefined {
  const candidate = safeGet(ctx, 'fileDrag') as Partial<DshFileDragLike> | undefined
  if (
    candidate &&
    candidate.actions &&
    typeof candidate.actions.prepare === 'function' &&
    typeof candidate.actions.reportFailure === 'function' &&
    typeof candidate.read === 'function'
  ) {
    return candidate as DshFileDragLike
  }
  return undefined
}

export function resolveDshFileActions(ctx: Context | undefined): DshFileActionsLike | undefined {
  const candidate = safeGet(ctx, 'fileActions') as Partial<DshFileActionsLike> | undefined
  if (
    candidate &&
    typeof candidate.save === 'function' &&
    typeof candidate.copyImage === 'function'
  ) {
    return candidate as DshFileActionsLike
  }
  return undefined
}
