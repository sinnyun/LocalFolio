import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {
  FloatingPanelContribution,
  FloatingPanelDefaults,
  FolioShellService,
  WorkspaceUiContribution,
} from '@folio/lib-shared-contract'
import { FolioButton, FolioIconLayers } from '@folio/core-ui-kit/client'
import { CaptionBar, type CaptionBarBridge } from './shell/CaptionBar.js'
import { FloatingPanelHost } from './shell/FloatingPanelHost.js'
import { FolioShell } from './shell/FolioShell.js'
import { useShellStore } from './shell/shell-store.js'
import { useWindowsCaptionMode } from './shell/caption.js'
import { useShortcutIsolation, type DshShortcutService } from './shell/shortcuts.js'

const OVERLAY_SLOT = 'shell.overlay'

export const ENTRY_SLOTS = [
  'conversation.header.leading',
  'conversation.session.header.actions',
] as const

type EntrySlotName = (typeof ENTRY_SLOTS)[number]

export interface DshSlotsLike {
  register(
    spec: {
      name: string
      id?: string
      order?: number
      priority?: number
      label?: string
      children?: Record<string, unknown>
    },
    component: React.ComponentType<any>,
  ): () => void
  inject(name: string, install: () => (() => void) | void): () => void
}

interface ClientContext extends Context {
  slots?: DshSlotsLike
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'var(--dsh-frame-top-clearance, 0px)',
  right: 0,
  bottom: 0,
  left: 0,
  background: 'var(--dsw-alias-bg-base, #ffffff)',
  color: 'var(--dsw-alias-label-primary, #0f1115)',
  fontFamily: 'var(--dsw-font-family, inherit)',
  pointerEvents: 'auto',
  outline: 'none',
}

interface ShellController extends FolioShellService {
  subscribeOpen(listener: () => void): () => void
  subscribeWorkspaces(listener: () => void): () => void
  subscribeFloatingPanels(listener: () => void): () => void
}

export function createShellController(initialOpen = false): ShellController {
  let openState = initialOpen
  const openListeners = new Set<() => void>()

  const workspacesMap = new Map<string, WorkspaceUiContribution>()
  let workspacesSnapshot: readonly WorkspaceUiContribution[] = []
  const workspaceListeners = new Set<() => void>()

  const floatingMap = new Map<string, FloatingPanelContribution>()
  let floatingSnapshot: readonly FloatingPanelContribution[] = []
  const floatingListeners = new Set<() => void>()

  const notify = (set: Set<() => void>): void => {
    for (const listener of [...set]) listener()
  }

  const setOpen = (next: boolean): void => {
    if (next === openState) return
    openState = next
    notify(openListeners)
  }

  const recomputeWorkspaces = (): void => {
    workspacesSnapshot = Array.from(workspacesMap.values()).sort((a, b) => a.order - b.order)
    notify(workspaceListeners)
  }

  const recomputeFloating = (): void => {
    floatingSnapshot = Array.from(floatingMap.values())
    notify(floatingListeners)
  }

  const navigateTo = (workspaceId: string, target?: unknown): void => {
    const store = useShellStore.getState()
    if (target !== undefined) store.setPendingTarget(workspaceId, target)
    else store.setActiveWorkspace(workspaceId)
  }

  const openFile = (filePath: string): void => {
    const lower = filePath.toLowerCase()
    const match = workspacesSnapshot.find(ws =>
      ws.fileExtensions?.some(ext => lower.endsWith(ext.toLowerCase())),
    )
    if (!match) return
    navigateTo(match.id, { openFile: filePath })
    setOpen(true)
  }

  const openFloatingPanel = (id: string, defaults?: FloatingPanelDefaults): void => {
    const contrib = floatingMap.get(id)
    useShellStore.getState().openFloatingPanel(id, {
      width: defaults?.width ?? contrib?.defaultWidth,
      height: defaults?.height ?? contrib?.defaultHeight,
      x: defaults?.x,
      y: defaults?.y,
    })
  }

  const closeFloatingPanel = (id: string): void => {
    useShellStore.getState().closeFloatingPanel(id)
  }

  const toggleFloatingPanel = (id: string, defaults?: FloatingPanelDefaults): void => {
    const contrib = floatingMap.get(id)
    useShellStore.getState().toggleFloatingPanel(id, {
      width: defaults?.width ?? contrib?.defaultWidth,
      height: defaults?.height ?? contrib?.defaultHeight,
      x: defaults?.x,
      y: defaults?.y,
    })
  }

  const focusFloatingPanel = (id: string): void => {
    useShellStore.getState().focusFloatingPanel(id)
  }

  return {
    isOpen: () => openState,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!openState),
    subscribeOpen(listener) {
      openListeners.add(listener)
      return () => openListeners.delete(listener)
    },
    registerWorkspace(contribution) {
      workspacesMap.set(contribution.id, contribution)
      recomputeWorkspaces()
      return () => {
        if (workspacesMap.get(contribution.id) === contribution) {
          workspacesMap.delete(contribution.id)
          recomputeWorkspaces()
        }
      }
    },
    listWorkspaces: () => workspacesSnapshot,
    subscribeWorkspaces(listener) {
      workspaceListeners.add(listener)
      return () => workspaceListeners.delete(listener)
    },
    registerFloatingPanel(contribution) {
      floatingMap.set(contribution.id, contribution)
      recomputeFloating()
      return () => {
        if (floatingMap.get(contribution.id) === contribution) {
          floatingMap.delete(contribution.id)
          closeFloatingPanel(contribution.id)
          recomputeFloating()
        }
      }
    },
    listFloatingPanels: () => floatingSnapshot,
    subscribeFloatingPanels(listener) {
      floatingListeners.add(listener)
      return () => floatingListeners.delete(listener)
    },
    openFloatingPanel,
    closeFloatingPanel,
    toggleFloatingPanel,
    focusFloatingPanel,
    navigateTo,
    openFile,
  }
}

function createEntrySlotCoordinator() {
  const mounted = new Set<EntrySlotName>()
  const listeners = new Set<() => void>()
  let winner: EntrySlotName | null = null

  const recompute = (): void => {
    let next: EntrySlotName | null = null
    for (const slot of ENTRY_SLOTS) {
      if (mounted.has(slot)) {
        next = slot
        break
      }
    }
    if (next === winner) return
    winner = next
    for (const listener of [...listeners]) listener()
  }

  return {
    mount(slot: EntrySlotName): () => void {
      mounted.add(slot)
      recompute()
      return () => {
        mounted.delete(slot)
        recompute()
      }
    },
    getWinner: () => winner,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export interface CreateShellOverlayPluginOptions {
  readonly entryLabel?: string
  readonly enableEvents?: boolean
  readonly controller?: ShellController
}

export function createShellOverlayPlugin(options: CreateShellOverlayPluginOptions = {}) {
  const entryLabel = options.entryLabel ?? 'LocalFolio'

  return {
    name: 'shell-overlay-ui',
    inject: ['slots'] as const,
    apply(ctx: Context): void {
      const clientCtx = ctx as ClientContext
      const slots = clientCtx.slots
      if (!slots) return

      const controller = options.controller ?? createShellController(false)
      const entryCoordinator = createEntrySlotCoordinator()
      const captionBridge: CaptionBarBridge = {
        isOpen: controller.isOpen,
        subscribeOpen: controller.subscribeOpen,
        toggle: controller.toggle,
        open: controller.open,
        listWorkspaces: controller.listWorkspaces,
        subscribeWorkspaces: controller.subscribeWorkspaces,
      }

      const resolveShortcuts = (): DshShortcutService | undefined => {
        if (typeof clientCtx.get !== 'function') return undefined
        try {
          const svc = clientCtx.get('shortcuts')
          return typeof svc === 'object' && svc !== null ? (svc as DshShortcutService) : undefined
        } catch {
          return undefined
        }
      }

      const makeEntryComponent = (slotName: EntrySlotName): React.FC => {
        return function FolioEntry() {
          const isOpen = React.useSyncExternalStore(
            controller.subscribeOpen,
            controller.isOpen,
            controller.isOpen,
          )
          const winner = React.useSyncExternalStore(
            entryCoordinator.subscribe,
            entryCoordinator.getWinner,
            entryCoordinator.getWinner,
          )
          // Windows Desktop exposes the single caption toggle instead (CaptionBar).
          const captionMode = useWindowsCaptionMode()

          React.useEffect(() => entryCoordinator.mount(slotName), [])
          if (captionMode) return null
          if (winner !== null && winner !== slotName) return null

          return (
            <FolioButton
              variant="outline"
              size="sm"
              data-lf-entry={slotName}
              aria-pressed={isOpen}
              title={`打开 ${entryLabel}`}
              icon={<FolioIconLayers size={14} />}
              onClick={() => controller.toggle()}
            >
              {entryLabel}
            </FolioButton>
          )
        }
      }

      const FolioOverlay: React.FC = () => {
        const isOpen = React.useSyncExternalStore(
          controller.subscribeOpen,
          controller.isOpen,
          controller.isOpen,
        )
        const workspaces = React.useSyncExternalStore(
          controller.subscribeWorkspaces,
          controller.listWorkspaces,
          controller.listWorkspaces,
        )
        const activeWorkspaceId = useShellStore(s => s.activeWorkspaceId)
        const setActiveWorkspace = useShellStore(s => s.setActiveWorkspace)
        const overlayRef = React.useRef<HTMLDivElement | null>(null)

        React.useEffect(() => {
          if (workspaces.length === 0) return
          if (!workspaces.some(w => w.id === activeWorkspaceId)) {
            setActiveWorkspace(workspaces[0]!.id)
          }
        }, [workspaces, activeWorkspaceId, setActiveWorkspace])

        useShortcutIsolation({
          active: isOpen,
          resolveService: resolveShortcuts,
          onBeforeEscape: () => useShellStore.getState().closeTopFloatingPanel(),
          onEscape: () => controller.close(),
        })

        React.useEffect(() => {
          if (!isOpen) return undefined
          const el = overlayRef.current
          const doc = el?.ownerDocument ?? (typeof document !== 'undefined' ? document : null)
          const previous = doc?.activeElement as HTMLElement | null
          el?.focus()
          return () => {
            if (previous && typeof previous.focus === 'function') previous.focus()
          }
        }, [isOpen])

        if (!isOpen) return null

        return (
          <div
            ref={overlayRef}
            data-lf-overlay=""
            role="dialog"
            aria-modal="true"
            aria-label={entryLabel}
            tabIndex={-1}
            style={overlayStyle}
          >
            <FolioShell
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
              onSelectWorkspace={setActiveWorkspace}
              onOpenFloatingPanel={(id, defaults) => controller.openFloatingPanel(id, defaults)}
              onCloseFloatingPanel={id => controller.closeFloatingPanel(id)}
              onExit={() => controller.close()}
              enableEvents={options.enableEvents}
            />
          </div>
        )
      }

      /**
       * Independent floating-window layer on `shell.overlay` (order: 2).
       * Allows any plugin's draggable/resizable/maximizable panel to float above either
       * the workbench overlay OR native DSH views.
       */
      const FolioFloatingLayer: React.FC = () => {
        const panels = React.useSyncExternalStore(
          controller.subscribeFloatingPanels,
          controller.listFloatingPanels,
          controller.listFloatingPanels,
        )
        return <FloatingPanelHost panels={panels} />
      }

      /**
       * Windows Desktop caption row on `shell.overlay` (order: 0): one toggle
       * for the plugin panel, the workspace switcher, and the panel toggles.
       * It is mounted independently of the overlay so the entry stays reachable
       * while the panel is closed, and renders nothing in the browser or on macOS.
       */
      const FolioCaption: React.FC = () => <CaptionBar bridge={captionBridge} />

      ctx.effect(() => {
        const disposeService = ctx.provide('folioShell', controller)
        const disposeCaption = slots.inject(OVERLAY_SLOT, () =>
          slots.register(
            { name: OVERLAY_SLOT, id: 'folio.shell.caption', order: 0 },
            FolioCaption,
          ),
        )
        const disposeOverlay = slots.inject(OVERLAY_SLOT, () =>
          slots.register(
            { name: OVERLAY_SLOT, id: 'folio.shell.overlay', order: 1 },
            FolioOverlay,
          ),
        )
        const disposeFloating = slots.inject(OVERLAY_SLOT, () =>
          slots.register(
            { name: OVERLAY_SLOT, id: 'folio.shell.floating', order: 2 },
            FolioFloatingLayer,
          ),
        )
        const disposeEntries = ENTRY_SLOTS.map(slotName => {
          const EntryComponent = makeEntryComponent(slotName)
          return slots.inject(slotName, () =>
            slots.register(
              { name: slotName, id: `folio.shell.entry.${slotName}` },
              EntryComponent,
            ),
          )
        })

        return () => {
          for (const d of disposeEntries) d?.()
          disposeFloating?.()
          disposeOverlay?.()
          disposeCaption?.()
          disposeService()
        }
      }, 'shell-overlay-ui: service + caption + overlay + floating + entry slots')
    },
  }
}

const defaultPlugin = createShellOverlayPlugin()
export const name = defaultPlugin.name
export const inject = defaultPlugin.inject
export const apply = defaultPlugin.apply
export default defaultPlugin

export { FolioShell } from './shell/FolioShell.js'
export { CaptionBar, type CaptionBarBridge } from './shell/CaptionBar.js'
export {
  CAPTION_GAP,
  WINDOWS_TITLEBAR_ATTR,
  isWindowsCaption,
  resolveCaptionMetrics,
  useWindowsCaptionMetrics,
  useWindowsCaptionMode,
  type CaptionMetrics,
} from './shell/caption.js'
export { FloatingPanelHost, clampFloatingRect } from './shell/FloatingPanelHost.js'
export { isEditableEventTarget, useShortcutIsolation } from './shell/shortcuts.js'
