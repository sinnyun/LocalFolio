import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { FolioUiService } from '@folio/base-contract'
import { FolioButton } from './components/Button.js'
import { FolioIconClose } from './icons.js'
import { getPortalContainer, setPortalContainer } from './portal.js'
import { FOLIO_UI_STYLES } from './styles.js'
import tailwindCss from './tailwind.generated.css'
import { clearToasts, dismissToast, toast, useToasts } from './toast.js'

const OVERLAY_SLOT = 'shell.overlay'

interface DshSlotsLike {
  register(
    spec: { name: string; id?: string; order?: number; label?: string },
    component: React.ComponentType<any>,
  ): () => void
  inject(name: string, install: () => (() => void) | void): () => void
}

interface ClientContext extends Context {
  slots?: DshSlotsLike
}

export function FolioToaster(): React.ReactElement | null {
  const items = useToasts()
  if (items.length === 0) return null

  return (
    <div
      data-lf-toaster=""
      role="region"
      aria-label="通知"
      aria-live="polite"
      className="lf-toaster"
    >
      {items.map(item => (
        <div key={item.id} data-lf-toast={item.id} data-tone={item.tone} className="lf-toast">
          <div style={{ minWidth: 0 }}>
            <div className="lf-toast-title">{item.title}</div>
            {item.description ? <div className="lf-toast-desc">{item.description}</div> : null}
          </div>
          <FolioButton
            variant="ghost"
            size="icon"
            aria-label="关闭通知"
            icon={<FolioIconClose size={13} />}
            onClick={() => dismissToast(item.id)}
          />
        </div>
      ))}
    </div>
  )
}

/**
 * Mounted on DSH's `shell.overlay` (order: 3) by `@folio/base-ui-kit`.
 * Owns:
 * 1. The single scoped `.lf-*` stylesheet (removed cleanly on unmount).
 * 2. The Radix UI portal root (so popups never mutate `document.body`).
 * 3. The shared toast stack.
 */
export function FolioUiHost(): React.ReactElement {
  const portalRef = React.useCallback((el: HTMLDivElement | null) => {
    setPortalContainer(el)
  }, [])

  React.useEffect(() => {
    return () => {
      setPortalContainer(null)
    }
  }, [])

  return (
    <div
      data-lf-ui-host=""
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 80,
      }}
    >
      <style data-lf-ui-styles="">{`${FOLIO_UI_STYLES}\n${tailwindCss}`}</style>
      <div ref={portalRef} data-lf-portal-root="" />
      <FolioToaster />
    </div>
  )
}

export function createFolioUiService(): FolioUiService {
  return {
    toast,
    dismissToast,
    clearToasts,
    getPortalContainer,
  }
}

export const name = 'base-ui-kit'
export const inject = ['slots'] as const

export function apply(ctx: Context): void {
  const clientCtx = ctx as ClientContext
  const slots = clientCtx.slots
  if (!slots) return

  const uiService = createFolioUiService()

  ctx.effect(() => {
    const disposeService = ctx.provide('folioUi', uiService)
    const disposeHost = slots.inject(OVERLAY_SLOT, () =>
      slots.register({ name: OVERLAY_SLOT, id: 'folio.ui.host', order: 3 }, FolioUiHost),
    )
    return () => {
      clearToasts()
      setPortalContainer(null)
      disposeHost?.()
      disposeService()
    }
  }, 'base-ui-kit: service + overlay portal/style/toast host')
}

export default { name, inject, apply }

// Shared UI components & primitives (consumed via dsh.client.external)
export { FolioButton, type FolioButtonProps } from './components/Button.js'
export { FolioTag, FolioBadge, type FolioTagProps, type FolioBadgeProps } from './components/Tag.js'
export {
  FolioInput,
  FolioTextarea,
  type FolioInputProps,
  type FolioTextareaProps,
} from './components/Input.js'
export {
  FolioCard,
  FolioSeparator,
  FolioEmptyState,
  type FolioCardProps,
  type FolioSeparatorProps,
  type FolioEmptyStateProps,
} from './components/Card.js'
export { FolioSwitch, type FolioSwitchProps } from './components/Switch.js'
export {
  FolioTabs,
  FolioTabsList,
  FolioTabsTrigger,
  FolioTabsContent,
} from './components/Tabs.js'
export {
  FolioDialog,
  FolioDialogTrigger,
  FolioDialogClose,
  FolioDialogContent,
  FolioDialogHeader,
  FolioDialogTitle,
  FolioDialogDescription,
  FolioDialogFooter,
  type FolioDialogContentProps,
} from './components/Dialog.js'
export {
  FolioDropdownMenu,
  FolioDropdownMenuTrigger,
  FolioDropdownMenuContent,
  FolioDropdownMenuItem,
  FolioDropdownMenuLabel,
  FolioDropdownMenuSeparator,
  type FolioDropdownMenuItemProps,
} from './components/DropdownMenu.js'
export {
  FolioSelect,
  type FolioSelectOption,
  type FolioSelectProps,
} from './components/Select.js'
export {
  FolioTooltipProvider,
  FolioTooltip,
  type FolioTooltipProps,
} from './components/Tooltip.js'
export { toast, dismissToast, clearToasts, useToast, useToasts } from './toast.js'
export { getPortalContainer, setPortalContainer, usePortalContainer } from './portal.js'
export { FOLIO_UI_STYLES } from './styles.js'
export * from './icons.js'
export { cn } from './lib/utils.js'
export { formatBytes, formatDateTime, categoryLabel } from './format.js'
export {
  FileCategoryIcon,
  LazyThumbImage,
  type FileCategoryIconProps,
  type LazyThumbImageProps,
  type SharedFileCategory,
} from './components/FileCategoryIcon.js'

// Generic shadcn/ui primitives & hooks (auto-synced by scripts/sync-ui-kit.mjs)
export * from './ui-exports.generated.js'
export {
  Lightbox,
  LightboxTrigger,
  LightboxClose,
  LightboxPortal,
  LightboxOverlay,
  LightboxContent,
  LightboxThumbnails,
  type LightboxItem,
  type LightboxProps,
} from './components/lightbox.js'
