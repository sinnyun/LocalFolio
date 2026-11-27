import type { Context } from '@deepseek-ai/cordis'
import { createThumbsEagleProjectsExtension } from './eagle-thumbs-extension.js'

export const name = 'feature-thumbs-eagle-ui'
export const inject = ['folioProjects'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () => ctx.folioProjects.registerExtension(createThumbsEagleProjectsExtension()),
    'feature-thumbs-eagle-ui: register missing thumbnails extension onto folioProjects',
  )
}

export { createThumbsEagleProjectsExtension } from './eagle-thumbs-extension.js'
export default { name, inject, apply }
