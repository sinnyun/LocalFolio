import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { toast } from '@folio/base-ui-kit/client'
import {
  resolveDshContextMenus,
  resolveDshFileActions,
  resolveDshFileDrag,
} from './dsh-adapters.js'
import { FallbackContextMenuHost, createFallbackMenuStore } from './fallback-menu.js'
import { createFolioInteractionsService } from './service.js'

const OVERLAY_SLOT = 'shell.overlay'

interface DshSlotsLike {
  register(
    spec: { name: string; id?: string; order?: number; label?: string },
    component: React.ComponentType<any>,
  ): () => void
  inject(name: string, install: () => (() => void) | void): () => void
}

export const name = 'bridge-dsh-interactions-ui'
export const inject = [] as const

export function apply(ctx: Context): void {
  const fallbackMenu = createFallbackMenuStore()
  const service = createFolioInteractionsService({
    resolveContextMenus: () => resolveDshContextMenus(ctx),
    resolveFileDrag: () => resolveDshFileDrag(ctx),
    resolveFileActions: () => resolveDshFileActions(ctx),
    fallbackMenu,
  })

  const FallbackHost: React.FC = () => (
    <FallbackContextMenuHost
      store={fallbackMenu}
      onError={msg => toast({ title: msg, tone: 'danger' })}
    />
  )

  ctx.effect(() => {
    const disposeProvide = ctx.provide('folioInteractions', service)

    let disposeSlot: (() => void) | undefined
    try {
      const slots = ctx.get('slots') as DshSlotsLike | undefined
      if (slots && typeof slots.inject === 'function' && typeof slots.register === 'function') {
        disposeSlot = slots.inject(OVERLAY_SLOT, () =>
          slots.register({ name: OVERLAY_SLOT, id: 'folio.interactions.fallback-menu', order: 4 }, FallbackHost),
        )
      }
    } catch {
      // Optional slot host absent in minimal tests
    }

    return () => {
      disposeSlot?.()
      service.dispose()
      disposeProvide()
    }
  }, 'bridge-dsh-interactions-ui: folioInteractions service + fallback menu')
}

export default { name, inject, apply }

export { createFallbackMenuStore, FallbackContextMenuHost } from './fallback-menu.js'
export { createFolioInteractionsService } from './service.js'
export {
  resolveDshContextMenus,
  resolveDshFileDrag,
  resolveDshFileActions,
} from './dsh-adapters.js'
