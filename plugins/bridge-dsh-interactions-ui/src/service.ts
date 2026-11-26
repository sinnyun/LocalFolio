import {
  FOLIO_DRAG_MIME,
  encodeFolioDragPayload,
  type FolioContextMenuAction,
  type FolioContextMenuContribution,
  type FolioContextMenuPoint,
  type FolioContextMenuTarget,
  type FolioFileDragSession,
  type FolioFileDragSource,
  type FolioFileTransferSource,
  type FolioInteractionsService,
} from '@folio/base-contract'
import { toast } from '@folio/base-ui-kit/client'
import type {
  DshContextMenusLike,
  DshFileActionsLike,
  DshFileDragLike,
  DshMenuActionLike,
  DshPreparedFileDragLike,
} from './dsh-adapters.js'
import type { FallbackMenuStore } from './fallback-menu.js'

export interface CreateInteractionsServiceOptions {
  readonly resolveContextMenus: () => DshContextMenusLike | undefined
  readonly resolveFileDrag: () => DshFileDragLike | undefined
  readonly resolveFileActions: () => DshFileActionsLike | undefined
  readonly fallbackMenu: FallbackMenuStore
}

export interface ManagedInteractionsService extends FolioInteractionsService {
  dispose(): void
}

function mapActionsToDsh(actions: readonly FolioContextMenuAction[]): DshMenuActionLike[] {
  return actions.map(action => ({
    id: action.id,
    label: action.label,
    disabled: action.disabled,
    danger: action.danger,
    separatorBefore: action.separatorBefore,
    failureLabel: action.failureLabel,
    run: action.run,
    children: action.children ? mapActionsToDsh(action.children) : undefined,
  }))
}

async function copyImageFallback(source: FolioFileTransferSource): Promise<void> {
  const response = await fetch(source.url)
  if (!response.ok) {
    throw new Error(`读取图片失败 (${response.status})`)
  }
  const blob = await response.blob()
  if (typeof navigator !== 'undefined' && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type || 'image/png']: blob }),
    ])
    toast({ title: '已复制图片到剪贴板', tone: 'success' })
    return
  }
  throw new Error('当前环境不支持图片剪贴板写入')
}

function downloadFallback(source: FolioFileTransferSource): void {
  if (typeof document === 'undefined') return
  const anchor = document.createElement('a')
  anchor.href = source.url
  if (source.name) anchor.download = source.name
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function createFolioInteractionsService(
  options: CreateInteractionsServiceOptions,
): ManagedInteractionsService {
  const contributions = new Map<string, FolioContextMenuContribution>()
  const dshDisposers = new Map<string, () => void>()
  let activeFallbackAbort: AbortController | null = null
  let disposed = false

  const syncDshContribution = (
    contrib: FolioContextMenuContribution,
    dshMenus: DshContextMenusLike,
  ): void => {
    const key = `${contrib.target}:${contrib.id}`
    if (dshDisposers.has(key)) return
    const dispose = dshMenus.register({
      id: contrib.id,
      target: contrib.target,
      order: contrib.order,
      resolve: async (rawValue, signal) => {
        const value =
          rawValue && typeof rawValue === 'object'
            ? (rawValue as Readonly<Record<string, unknown>>)
            : {}
        const actions = await contrib.resolve(value, signal)
        return mapActionsToDsh(actions)
      },
    })
    dshDisposers.set(key, dispose)
  }

  const notify = (text: string, success = false): void => {
    const dshMenus = options.resolveContextMenus()
    if (dshMenus?.notify) {
      dshMenus.notify(text, success)
      return
    }
    toast({ title: text, tone: success ? 'success' : 'danger' })
  }

  return {
    hasNativeContextMenu: () => Boolean(options.resolveContextMenus()),
    hasNativeFileDrag: () => Boolean(options.resolveFileDrag()),
    canSaveAs: () => Boolean(options.resolveFileActions()?.canSaveAs),

    registerContextMenu(contribution: FolioContextMenuContribution): () => void {
      if (disposed) return () => {}
      const key = `${contribution.target}:${contribution.id}`
      contributions.set(key, contribution)

      const dshMenus = options.resolveContextMenus()
      if (dshMenus) {
        syncDshContribution(contribution, dshMenus)
      }

      return () => {
        if (contributions.get(key) !== contribution) return
        contributions.delete(key)
        const dshDispose = dshDisposers.get(key)
        if (dshDispose) {
          dshDisposers.delete(key)
          dshDispose()
        }
      }
    },

    openContextMenu(target: FolioContextMenuTarget, point: FolioContextMenuPoint): void {
      if (disposed) return
      const dshMenus = options.resolveContextMenus()
      if (dshMenus) {
        for (const contrib of contributions.values()) {
          if (contrib.target === target.kind) {
            syncDshContribution(contrib, dshMenus)
          }
        }
        dshMenus.open(target, point)
        return
      }

      activeFallbackAbort?.abort()
      const ac = new AbortController()
      activeFallbackAbort = ac

      const matching = Array.from(contributions.values())
        .filter(c => c.target === target.kind)
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))

      if (matching.length === 0) return

      void Promise.all(
        matching.map(c => Promise.resolve(c.resolve(target.value, ac.signal)).catch(() => [])),
      ).then(lists => {
        if (ac.signal.aborted || disposed) return
        const merged = lists.flat()
        if (merged.length > 0) {
          options.fallbackMenu.open(point, merged)
        }
      })
    },

    closeContextMenu(): void {
      activeFallbackAbort?.abort()
      activeFallbackAbort = null
      options.resolveContextMenus()?.close()
      options.fallbackMenu.close()
    },

    notify,

    createFileDragSession(
      source: FolioFileDragSource,
      fallbackPayload?: {
        readonly paths: readonly string[]
        readonly sourceWorkspace?: string
      },
    ): FolioFileDragSession {
      let sessionDisposed = false
      let abortController: AbortController | null = null
      let prepared: DshPreparedFileDragLike | null = null
      let preparing = false
      let prepFailed = false

      const release = (): void => {
        abortController?.abort()
        abortController = null
        preparing = false
        if (prepared) {
          prepared.release()
          prepared = null
        }
      }

      return {
        prepare(): void {
          if (sessionDisposed || preparing || prepared) return
          const fd = options.resolveFileDrag()
          if (!fd) return
          prepFailed = false
          preparing = true
          const ac = new AbortController()
          abortController = ac
          void fd.actions
            .prepare(source, ac.signal)
            .then(
              handle => {
                if (sessionDisposed || ac.signal.aborted) {
                  handle.release()
                  return
                }
                prepared = handle
              },
              () => {
                if (!ac.signal.aborted && !sessionDisposed) {
                  prepFailed = true
                }
              },
            )
            .finally(() => {
              if (abortController === ac) {
                preparing = false
              }
            })
        },

        start(transfer: DataTransfer, sourceEl: HTMLElement): boolean {
          if (sessionDisposed) return false
          if (fallbackPayload && fallbackPayload.paths.length > 0) {
            try {
              transfer.setData(FOLIO_DRAG_MIME, encodeFolioDragPayload(fallbackPayload))
            } catch {
              // ignore restricted DataTransfer
            }
          }

          const fd = options.resolveFileDrag()
          if (prepared) {
            return prepared.start(transfer, sourceEl)
          }
          if (fd && prepFailed) {
            fd.actions.reportFailure()
            return false
          }

          try {
            transfer.effectAllowed = 'copy'
            transfer.setData('text/plain', source.name)
          } catch {
            // ignore
          }
          return true
        },

        release,

        dispose(): void {
          sessionDisposed = true
          release()
        },
      }
    },

    readDroppedFile(transfer: DataTransfer): File | undefined {
      return options.resolveFileDrag()?.read(transfer)
    },

    async copyImage(source: FolioFileTransferSource): Promise<void> {
      const fa = options.resolveFileActions()
      if (fa) {
        await fa.copyImage(source)
        return
      }
      await copyImageFallback(source)
    },

    async saveFile(
      source: FolioFileTransferSource,
      mode: 'download' | 'saveAs' = 'download',
    ): Promise<void> {
      const fa = options.resolveFileActions()
      if (fa) {
        const effectiveMode = mode === 'saveAs' && !fa.canSaveAs ? 'download' : mode
        await fa.save(source, effectiveMode)
        return
      }
      downloadFallback(source)
    },

    dispose(): void {
      disposed = true
      activeFallbackAbort?.abort()
      activeFallbackAbort = null
      for (const dispose of dshDisposers.values()) {
        try {
          dispose()
        } catch {
          // ignore
        }
      }
      dshDisposers.clear()
      contributions.clear()
      options.fallbackMenu.close()
    },
  }
}
