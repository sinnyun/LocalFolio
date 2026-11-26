import type { Context } from '@deepseek-ai/cordis'
import { createEagleLinkSourceProvider } from './eagle-provider.js'

export const name = 'feature-canvas-eagle-ui'
export const inject = ['folioCanvas'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.folioCanvas.registerLinkSource(createEagleLinkSourceProvider()),
    'feature-canvas-eagle-ui: register Eagle link source onto folioCanvas',
  )
}

export default { name, inject, apply }
export {
  createEagleLinkSourceProvider,
  extractEagleDeepLinkIds,
  isPotentialEagleInfoPath,
  resetEagleDebugStore,
  type EagleDebugEntry,
  type EagleDebugState,
} from './eagle-provider.js'
export * from './types.js'
