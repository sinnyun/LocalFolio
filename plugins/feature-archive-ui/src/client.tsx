import type { Context } from '@deepseek-ai/cordis'
import { createArchiveProjectsExtension } from './archive-extension.js'

export const name = 'feature-archive-ui'
export const inject = ['folioProjects'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.folioProjects.registerExtension(createArchiveProjectsExtension()),
    'feature-archive-ui: register archive extension onto folioProjects',
  )
}

export { createArchiveProjectsExtension } from './archive-extension.js'
export { resetArchiveStoreForTests } from './archive-store.js'
export * from './types.js'
export default { name, inject, apply }
