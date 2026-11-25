import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { MyPluginsSection, type DshSettingsServiceLike } from './MyPluginsSection.js'

const SETTINGS_SECTION_SLOT = 'settings.section'

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

export const name = 'shell-settings-ui'
export const inject = ['slots'] as const

export function apply(ctx: Context): void {
  const clientCtx = ctx as ClientContext
  const slots = clientCtx.slots
  if (!slots) return

  const resolveSettings = (): DshSettingsServiceLike | undefined => {
    if (typeof clientCtx.get !== 'function') return undefined
    try {
      const svc = clientCtx.get('settings')
      return typeof svc === 'object' && svc !== null ? (svc as DshSettingsServiceLike) : undefined
    } catch {
      return undefined
    }
  }

  const Section: React.FC = () => <MyPluginsSection resolveSettings={resolveSettings} />

  ctx.effect(() => {
    const dispose = slots.inject(SETTINGS_SECTION_SLOT, () =>
      slots.register(
        { name: SETTINGS_SECTION_SLOT, id: 'folio-my-plugins', order: 60, label: '我的插件' },
        Section,
      ),
    )
    return () => {
      dispose?.()
    }
  }, 'shell-settings-ui: settings.section')
}

export { MyPluginsSection } from './MyPluginsSection.js'
export type { DshSettingsServiceLike, MyPluginsSectionProps } from './MyPluginsSection.js'
