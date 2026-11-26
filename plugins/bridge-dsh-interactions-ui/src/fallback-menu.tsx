import * as React from 'react'
import * as ReactDOM from 'react-dom'
import type { FolioContextMenuAction, FolioContextMenuPoint } from '@folio/base-contract'
import { FolioIconChevronRight, cn, usePortalContainer } from '@folio/base-ui-kit/client'

export interface FallbackMenuState {
  readonly open: boolean
  readonly point: FolioContextMenuPoint
  readonly actions: readonly FolioContextMenuAction[]
}

type Listener = () => void

export interface FallbackMenuStore {
  getState(): FallbackMenuState
  subscribe(listener: Listener): () => void
  open(point: FolioContextMenuPoint, actions: readonly FolioContextMenuAction[]): void
  close(): void
}

export function createFallbackMenuStore(): FallbackMenuStore {
  let state: FallbackMenuState = {
    open: false,
    point: { x: 0, y: 0 },
    actions: [],
  }
  const listeners = new Set<Listener>()
  const emit = (): void => {
    for (const listener of [...listeners]) listener()
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    open(point, actions) {
      state = { open: true, point, actions }
      emit()
    },
    close() {
      if (!state.open) return
      state = { open: false, point: { x: 0, y: 0 }, actions: [] }
      emit()
    },
  }
}

interface MenuListProps {
  readonly actions: readonly FolioContextMenuAction[]
  readonly onExecute: (action: FolioContextMenuAction) => void
  readonly depth?: number
}

function FallbackMenuList({ actions, onExecute, depth = 0 }: MenuListProps): React.ReactElement {
  const [openSubId, setOpenSubId] = React.useState<string | null>(null)

  return (
    <div
      role="menu"
      className="min-w-44 max-w-72 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {actions.map(action => {
        const hasChildren = Boolean(action.children && action.children.length > 0)
        const isSubOpen = openSubId === action.id

        return (
          <React.Fragment key={action.id}>
            {action.separatorBefore ? (
              <div role="separator" className="my-1 h-px bg-border" />
            ) : null}
            <div
              className="relative"
              onMouseEnter={() => setOpenSubId(hasChildren ? action.id : null)}
            >
              <button
                type="button"
                role="menuitem"
                data-lf-fallback-menuitem={action.id}
                disabled={action.disabled}
                onClick={ev => {
                  ev.stopPropagation()
                  if (action.disabled) return
                  if (hasChildren) {
                    setOpenSubId(prev => (prev === action.id ? null : action.id))
                    return
                  }
                  onExecute(action)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors outline-none',
                  action.disabled
                    ? 'cursor-not-allowed opacity-45'
                    : action.danger
                      ? 'text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10'
                      : 'hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground',
                )}
              >
                <span className="truncate">{action.label}</span>
                {hasChildren ? <FolioIconChevronRight size={12} className="shrink-0 opacity-60" /> : null}
              </button>

              {hasChildren && isSubOpen && action.children ? (
                <div
                  data-lf-fallback-submenu={action.id}
                  className={cn(
                    'absolute top-0 z-10',
                    depth >= 1 ? 'right-full mr-1' : 'left-full ml-1',
                  )}
                >
                  <FallbackMenuList
                    actions={action.children}
                    onExecute={onExecute}
                    depth={depth + 1}
                  />
                </div>
              ) : null}
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function FallbackContextMenuHost({
  store,
  onError,
}: {
  readonly store: FallbackMenuStore
  readonly onError: (message: string) => void
}): React.ReactElement | null {
  const state = React.useSyncExternalStore(store.subscribe, store.getState, store.getState)
  const portalContainer = usePortalContainer()
  const menuRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!state.open) return undefined
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
      store.close()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        store.close()
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [state.open, store])

  if (!state.open || state.actions.length === 0) return null

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720
  const left = Math.max(8, Math.min(state.point.x, vw - 220))
  const top = Math.max(8, Math.min(state.point.y, vh - 260))

  const handleExecute = (action: FolioContextMenuAction): void => {
    store.close()
    if (!action.run) return
    void Promise.resolve(action.run()).catch(err => {
      onError(action.failureLabel || (err instanceof Error ? err.message : String(err)))
    })
  }

  const content = (
    <div
      ref={menuRef}
      data-lf-fallback-context-menu=""
      className="pointer-events-auto fixed"
      style={{ left, top, zIndex: 95 }}
    >
      <FallbackMenuList actions={state.actions} onExecute={handleExecute} />
    </div>
  )

  return portalContainer ? ReactDOM.createPortal(content, portalContainer) : content
}
