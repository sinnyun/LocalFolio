import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  defineAction,
  type FolioRuntimeService,
  type FolioStorageService,
} from '@folio/base-contract'
import { createBoardsManager } from './boards.js'
import {
  checkLinkedImages,
  inspectLinkedImage,
  relocateMissingImagesInFolder,
} from './image-meta.js'
import {
  clearLodCache,
  createCanvasProxyRouteHandler,
  createWindowsWicImageProxyProvider,
  getLodCacheStats,
  type ImageProxyProvider,
} from './image-proxy.js'
import { createTldrawAssetRouteHandler } from './tldraw-assets-route.js'
import {
  createWindowsDialogProvider,
  listCanvasDirectory,
  listCanvasRoots,
  type CanvasDialogProvider,
} from './win-dialog.js'

export interface RegisterWorkspaceCanvasHostOptions {
  readonly runtime: FolioRuntimeService
  readonly storage: FolioStorageService
  readonly proxyProvider?: ImageProxyProvider
  readonly dialogProvider?: CanvasDialogProvider
  readonly tldrawAssetsRoot?: string
}

export function registerWorkspaceCanvasHost(
  options: RegisterWorkspaceCanvasHostOptions,
): () => void {
  const { runtime, storage } = options
  const ownsProxyProvider = !options.proxyProvider
  const proxyProvider = options.proxyProvider ?? createWindowsWicImageProxyProvider()
  const dialogProvider = options.dialogProvider ?? createWindowsDialogProvider()

  const pluginStorage = storage.forPlugin('workspace-canvas-host')
  const boards = createBoardsManager(pluginStorage)

  const disposers = [
    runtime.registerAction(
      defineAction({
        id: 'canvas.boards.list',
        title: '获取画板列表',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => ({
          boards: await boards.list(),
        }),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.boards.get',
        title: '读取画板文档快照',
        tier: 'read',
        input: z.object({
          id: z.string().min(1),
        }),
        run: async input => boards.get(input.id),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.boards.create',
        title: '新建画板',
        tier: 'modify',
        input: z
          .object({
            title: z.string().optional(),
          })
          .default({}),
        run: async input => {
          const board = await boards.create(input)
          runtime.events.emitInvalidate('canvas', board.id)
          return { board }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.boards.rename',
        title: '重命名画板',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
          title: z.string().min(1),
        }),
        run: async input => {
          const board = await boards.rename(input)
          runtime.events.emitInvalidate('canvas', board.id)
          return { board }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.boards.duplicate',
        title: '复制画板',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
        }),
        run: async input => {
          const board = await boards.duplicate(input)
          runtime.events.emitInvalidate('canvas', board.id)
          return { board }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.boards.delete',
        title: '删除画板',
        tier: 'delete',
        input: z.object({
          id: z.string().min(1),
        }),
        run: async input => {
          const res = await boards.remove(input)
          runtime.events.emitInvalidate('canvas', input.id)
          return res
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.boards.save',
        title: '保存画板快照（纯图片链接）',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
          snapshot: z.record(z.string(), z.unknown()),
          brokenCount: z.number().int().min(0).optional(),
        }),
        run: async input => boards.save(input),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.links.inspect',
        title: '批量检查本地图片尺寸与链接信息',
        tier: 'read',
        input: z.object({
          paths: z.array(z.string().min(1)).min(1),
        }),
        run: async input => ({
          items: await Promise.all(input.paths.map(p => inspectLinkedImage(p))),
        }),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.links.check',
        title: '检测画板图片链接有效性',
        tier: 'read',
        input: z.object({
          paths: z.array(z.string()),
        }),
        run: async input => ({
          items: await checkLinkedImages(input.paths),
        }),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.links.relocateInFolder',
        title: '在指定文件夹内批量匹配已移动的图片',
        tier: 'read',
        input: z.object({
          folderPath: z.string().min(1),
          missingItems: z.array(
            z.object({
              linkId: z.string().min(1),
              fileName: z.string().min(1),
              expectedSize: z.number().optional(),
            }),
          ),
        }),
        run: async input => relocateMissingImagesInFolder(input.folderPath, input.missingItems),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.links.reveal',
        title: '在系统资源管理器中定位链接图片',
        tier: 'read',
        input: z.object({
          path: z.string().min(1),
        }),
        run: async input => dialogProvider.revealPath(input.path),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.dialog.pickImages',
        title: '打开系统图片选择对话框',
        tier: 'read',
        input: z
          .object({
            multi: z.boolean().optional(),
            initialDir: z.string().optional(),
          })
          .default({}),
        run: async input => dialogProvider.pickImages(input),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.dialog.pickFolder',
        title: '打开系统文件夹选择对话框',
        tier: 'read',
        input: z
          .object({
            initialDir: z.string().optional(),
          })
          .default({}),
        run: async input => dialogProvider.pickFolder(input),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.fs.roots',
        title: '获取本地快速文件夹与驱动器列表',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => listCanvasRoots(),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.fs.list',
        title: '列取本地文件夹中的子目录与图片',
        tier: 'read',
        input: z
          .object({
            path: z.string().optional(),
            showHidden: z.boolean().optional(),
          })
          .default({}),
        run: async input => listCanvasDirectory(input),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.cache.stats',
        title: '读取 LOD 代理图缓存统计',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => getLodCacheStats(pluginStorage.cacheDir),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'canvas.cache.clear',
        title: '清空画板 LOD 代理图缓存',
        tier: 'delete',
        input: z.object({}).default({}),
        run: async () => clearLodCache(pluginStorage.cacheDir),
      }),
    ),

    runtime.registerRoute(
      'GET',
      '/canvas/proxy',
      createCanvasProxyRouteHandler({
        cacheDir: pluginStorage.cacheDir,
        provider: proxyProvider,
      }),
    ),

    runtime.registerRoute(
      'GET',
      '/canvas/tldraw-asset',
      createTldrawAssetRouteHandler(options.tldrawAssetsRoot),
    ),
  ]

  return () => {
    for (const dispose of disposers.reverse()) dispose()
    if (ownsProxyProvider) {
      proxyProvider.dispose()
    }
  }
}

export const name = 'workspace-canvas-host'
export const inject = ['folioRuntime', 'folioStorage'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () =>
      registerWorkspaceCanvasHost({
        runtime: ctx.folioRuntime,
        storage: ctx.folioStorage,
      }),
    'workspace-canvas-host: actions + lod proxy + tldraw assets',
  )
}

export default { name, inject, apply }

export { createBoardsManager, sanitizeBoardSnapshot } from './boards.js'
export {
  checkLinkedImages,
  classifyImageFile,
  inspectLinkedImage,
  isImageFile,
  normalizeLocalPath,
  parseImageDimensionsFromBuffer,
  readImageDimensions,
  relocateMissingImagesInFolder,
} from './image-meta.js'
export {
  clearLodCache,
  createCanvasProxyRouteHandler,
  createNoopImageProxyProvider,
  createWindowsWicImageProxyProvider,
  getLodCacheStats,
  LOD_TIERS,
  snapLodTier,
} from './image-proxy.js'
export type { ImageProxyOptions, ImageProxyProvider, ImageProxyResult, LodTier } from './image-proxy.js'
export { createTldrawAssetRouteHandler } from './tldraw-assets-route.js'
export { createWindowsDialogProvider, listCanvasDirectory, listCanvasRoots, revealLocalPath } from './win-dialog.js'
export type { CanvasDialogProvider, PickFolderResult, PickImagesOptions, PickImagesResult } from './win-dialog.js'
export * from './types.js'
