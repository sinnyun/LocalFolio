import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { defineAction, type FolioRuntimeService } from '@folio/base-contract'
import { createEagleLinksService, type EagleLinksService } from './eagle-links.js'
import type { EaglePathResolveEntry } from './types.js'

export interface RegisterFeatureCanvasEagleHostOptions {
  readonly runtime: FolioRuntimeService
  readonly service?: EagleLinksService
}

export function registerFeatureCanvasEagleHost(
  options: RegisterFeatureCanvasEagleHostOptions,
): () => void {
  const { runtime } = options
  const service = options.service ?? createEagleLinksService()

  const disposers = [
    runtime.registerAction(
      defineAction({
        id: 'canvas.eagle.resolveFromPaths',
        title: '从本地路径识别 Eagle 图片来源',
        description:
          '检测路径是否位于 Eagle .info 条目目录内；若确认对应原图则返回 Eagle 条目、文件夹与 API 元数据。',
        tier: 'read',
        input: z.object({
          paths: z.array(z.string().min(1)).min(1),
        }),
        run: async input => {
          const items: EaglePathResolveEntry[] = await Promise.all(
            input.paths.map(async rawPath => {
              try {
                const source = await service.resolveDroppedPath(rawPath)
                return { path: rawPath, source }
              } catch (err) {
                return {
                  path: rawPath,
                  source: null,
                  error: err instanceof Error ? err.message : String(err),
                }
              }
            }),
          )
          return { items }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.eagle.resolveById',
        title: '按 Eagle 条目 ID 解析原图路径',
        description:
          '通过本地 Eagle Web API 查询条目与缩略图位置，定位并返回可加入画板的本地原图路径及 Eagle 元数据。',
        tier: 'read',
        input: z.object({
          itemId: z.string().min(1),
        }),
        run: async input => ({
          source: await service.resolveByItemId(input.itemId),
        }),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.eagle.openItem',
        title: '在 Eagle 中打开并定位条目',
        description: '调用系统注册的 eagle://item/{id} 协议处理器打开并定位 Eagle 中的条目。',
        tier: 'read',
        input: z.object({
          itemId: z.string().min(1),
        }),
        run: async input => service.openItem(input.itemId),
      }),
    ),
  ]

  return () => {
    for (const dispose of disposers.reverse()) dispose()
  }
}

export const name = 'feature-canvas-eagle-host'
export const inject = ['folioRuntime'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () =>
      registerFeatureCanvasEagleHost({
        runtime: ctx.folioRuntime,
      }),
    'feature-canvas-eagle-host: Eagle link resolution and deep-link open actions',
  )
}

export default { name, inject, apply }
export {
  buildCleanLaunchEnv,
  createEagleLinksService,
  DEFAULT_EAGLE_API_BASE,
  extractEagleItemIdFromDeepLink,
  extractEagleItemIdFromPath,
  isValidEagleItemId,
  normalizeEagleLocalPath,
  openEagleDeepLink,
} from './eagle-links.js'
export type {
  CreateEagleLinksServiceOptions,
  EagleLinksService,
} from './eagle-links.js'
export * from './types.js'
