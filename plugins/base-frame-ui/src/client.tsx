import type { Context } from '@deepseek-ai/cordis'
import { FrameWorkbench } from './frame/FrameWorkbench.js'
import { createFolioFrameService } from './frame/service.js'

export { FrameWorkbench } from './frame/FrameWorkbench.js'
export { FrameAppSwitcher } from './frame/FrameAppSwitcher.js'
export { FrameStatusBar } from './frame/FrameStatusBar.js'
export {
  FRAME_STORAGE_KEY,
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  MIN_LEFT_WIDTH,
  MAX_LEFT_WIDTH,
  MIN_RIGHT_WIDTH,
  MAX_RIGHT_WIDTH,
} from './frame/model.js'
export { frameStore, FrameStore, useFrameState } from './frame/store.js'
export { createFolioFrameService, createFrameController } from './frame/service.js'

/**
 * Pure base capability: provides `ctx.folioFrame`, draws nothing and registers
 * no workspace. A workspace plugin renders `folioFrame.View` and calls
 * `attachHostWorkspace`, so the frame only appears where something hosts it.
 */
export const name = 'base-frame-ui'
export const inject = ['folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const service = createFolioFrameService({
      View: FrameWorkbench,
      openWorkspace: workspaceId => ctx.folioShell.navigateTo(workspaceId),
    })
    return ctx.provide('folioFrame', service)
  }, 'base-frame-ui: folioFrame service')
}

export default { name, inject, apply }
