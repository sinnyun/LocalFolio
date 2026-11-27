import fsp from 'node:fs/promises'
import os from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  FolioError,
  defineAction,
  type FolioFsService,
  type FolioNativeService,
  type FolioRuntimeService,
  type FolioStorageService,
  type FolioThumbsService,
} from '@folio/base-contract'
import { normalizeBrowsePath } from './classify.js'
import { listDrives, listQuickFolders } from './drives.js'
import { createDefaultFavoritesState, createFavoritesManager } from './favorites.js'
import { inspectFile, listDirectory, listTreeChildren } from './fs-ops.js'
import {
  createDownloadRouteHandler,
  createMediaRouteHandler,
  createThumbRouteHandler,
} from './media-route.js'
import { createMetadataManager } from './metadata.js'
import { FavoritesStateSchema, FilesPrefsSchema, MetadataStateSchema } from './types.js'
import { createWindowsShellThumbProvider, type ShellThumbProvider } from './win-thumb.js'

export interface RegisterWorkspaceFilesHostOptions {
  readonly runtime: FolioRuntimeService
  readonly storage: FolioStorageService
  readonly fs?: FolioFsService
  readonly thumbs?: FolioThumbsService
  readonly native?: FolioNativeService
  readonly thumbProvider?: ShellThumbProvider
}

export function registerWorkspaceFilesHost(options: RegisterWorkspaceFilesHostOptions): () => void {
  const { runtime, storage, fs: fsService, thumbs, native } = options
  const usesSharedServices = Boolean(thumbs || native)
  const ownsThumbProvider = !options.thumbProvider && !usesSharedServices
  const thumbProvider =
    options.thumbProvider ?? (usesSharedServices ? undefined : createWindowsShellThumbProvider(native))

  const pluginStorage = storage.forPlugin('workspace-files-host')
  const prefsStore = pluginStorage.jsonStore('preferences.json', FilesPrefsSchema, () => ({
    pinnedFolders: [],
  }))
  const favoritesStore = pluginStorage.jsonStore(
    'favorites.json',
    FavoritesStateSchema,
    createDefaultFavoritesState,
  )
  const metadataStore = pluginStorage.jsonStore('metadata.json', MetadataStateSchema, () => ({
    version: 1 as const,
    tags: [],
    files: {},
  }))

  const favorites = createFavoritesManager(favoritesStore)
  const metadata = createMetadataManager(metadataStore)

  const disposers = [
    runtime.registerAction(
      defineAction({
        id: 'files.roots',
        title: '获取快捷文件夹与驱动器列表',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => {
          const prefs = await prefsStore.read()
          const [quickFolders, drives] = await Promise.all([
            listQuickFolders(prefs.pinnedFolders, fsService),
            listDrives(fsService),
          ])
          return {
            homePath: normalizeBrowsePath(os.homedir()),
            platform: process.platform,
            quickFolders,
            drives,
            pinnedFolders: prefs.pinnedFolders,
          }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.list',
        title: '列取本地目录内容',
        tier: 'read',
        input: z
          .object({
            path: z.string().optional(),
            showHidden: z.boolean().optional().default(false),
            includeSubdirChildren: z.boolean().optional().default(false),
          })
          .default({ showHidden: false, includeSubdirChildren: false }),
        run: async input => listDirectory(input),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.tree',
        title: '获取文件树子目录',
        tier: 'read',
        input: z.object({
          path: z.string().min(1),
          showHidden: z.boolean().optional().default(false),
        }),
        run: async input => ({
          path: normalizeBrowsePath(input.path),
          children: await listTreeChildren(input),
        }),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.inspect',
        title: '检查文件详情与预览信息',
        tier: 'read',
        input: z.object({
          path: z.string().min(1),
        }),
        run: async input => inspectFile(input.path),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.reveal',
        title: '在系统资源管理器中打开',
        tier: 'read',
        input: z.object({
          path: z.string().min(1),
        }),
        run: async input => {
          if (!native) {
            throw new FolioError('native_unavailable', '基础桌面原生服务未就绪', 503)
          }
          return native.revealPath(input.path)
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.prefs.pin',
        title: '固定快捷文件夹',
        tier: 'modify',
        input: z.object({
          path: z.string().min(1),
        }),
        run: async input => {
          const normalized = normalizeBrowsePath(input.path)
          const st = await fsp.stat(normalized).catch(() => null)
          if (!st || !st.isDirectory()) {
            throw new FolioError('not_a_directory', `目标不是有效文件夹: ${normalized}`, 400)
          }
          const next = await prefsStore.update(curr => {
            const exists = curr.pinnedFolders.some(
              p => p.toLowerCase() === normalized.toLowerCase(),
            )
            return exists ? curr : { ...curr, pinnedFolders: [...curr.pinnedFolders, normalized] }
          })
          runtime.events.emitInvalidate('files', normalized)
          return next
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.prefs.unpin',
        title: '取消固定快捷文件夹',
        tier: 'modify',
        input: z.object({
          path: z.string().min(1),
        }),
        run: async input => {
          const normalized = normalizeBrowsePath(input.path)
          const next = await prefsStore.update(curr => ({
            ...curr,
            pinnedFolders: curr.pinnedFolders.filter(
              p => p.toLowerCase() !== normalized.toLowerCase(),
            ),
          }))
          runtime.events.emitInvalidate('files', normalized)
          return next
        },
      }),
    ),

    // Favorites actions
    runtime.registerAction(
      defineAction({
        id: 'files.favorites.get',
        title: '读取文件夹收藏夹与分组',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => favorites.get(),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.favorites.add',
        title: '添加文件夹到收藏夹',
        tier: 'modify',
        input: z.object({
          path: z.string().min(1),
          name: z.string().optional(),
          groupId: z.string().optional(),
        }),
        run: async input => {
          const next = await favorites.add(input)
          runtime.events.emitInvalidate('files', input.path)
          return next
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.favorites.update',
        title: '更新收藏文件夹信息',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
          name: z.string().optional(),
          groupId: z.string().optional(),
          order: z.number().int().optional(),
        }),
        run: async input => {
          const next = await favorites.update(input)
          runtime.events.emitInvalidate('files', input.id)
          return next
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.favorites.remove',
        title: '移除收藏文件夹',
        tier: 'delete',
        input: z.object({
          id: z.string().optional(),
          path: z.string().optional(),
        }),
        run: async input => {
          const next = await favorites.remove(input)
          runtime.events.emitInvalidate('files', input.id ?? input.path)
          return next
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.favorites.group.create',
        title: '创建收藏夹分组',
        tier: 'modify',
        input: z.object({
          name: z.string().min(1),
          color: z.string().optional(),
        }),
        run: async input => {
          const next = await favorites.createGroup(input)
          runtime.events.emitInvalidate('files')
          return next
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.favorites.group.update',
        title: '更新收藏夹分组',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
          name: z.string().optional(),
          color: z.string().optional(),
          order: z.number().int().optional(),
        }),
        run: async input => {
          const next = await favorites.updateGroup(input)
          runtime.events.emitInvalidate('files')
          return next
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.favorites.group.delete',
        title: '删除收藏夹分组',
        tier: 'delete',
        input: z.object({
          id: z.string().min(1),
          mode: z.enum(['move-to-default', 'delete-items']).optional(),
        }),
        run: async input => {
          const next = await favorites.deleteGroup(input)
          runtime.events.emitInvalidate('files')
          return next
        },
      }),
    ),

    // Metadata & Tag actions
    runtime.registerAction(
      defineAction({
        id: 'files.meta.get',
        title: '读取文件标签、星级与备注索引',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => metadata.get(),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.meta.set',
        title: '设置文件星级、标签或备注',
        tier: 'modify',
        input: z.object({
          path: z.string().min(1),
          rating: z.number().int().min(0).max(5).optional(),
          tagIds: z.array(z.string()).optional(),
          note: z.string().optional(),
        }),
        run: async input => {
          const res = await metadata.setFileMeta(input)
          runtime.events.emitInvalidate('files', res.key)
          return res
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.meta.pruneMissing',
        title: '清理已失效的文件元数据记录',
        tier: 'delete',
        input: z.object({
          paths: z.array(z.string().min(1)),
        }),
        run: async input => {
          const res = await metadata.pruneMissing(input)
          runtime.events.emitInvalidate('files')
          return res
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.tags.create',
        title: '创建文件标签',
        tier: 'modify',
        input: z.object({
          name: z.string().min(1),
          color: z.string().optional(),
          description: z.string().optional(),
        }),
        run: async input => {
          const res = await metadata.createTag(input)
          runtime.events.emitInvalidate('files')
          return res
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.tags.update',
        title: '更新文件标签',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
          name: z.string().optional(),
          color: z.string().optional(),
          description: z.string().optional(),
        }),
        run: async input => {
          const res = await metadata.updateTag(input)
          runtime.events.emitInvalidate('files')
          return res
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.tags.delete',
        title: '删除文件标签',
        tier: 'delete',
        input: z.object({
          id: z.string().min(1),
        }),
        run: async input => {
          const res = await metadata.deleteTag(input)
          runtime.events.emitInvalidate('files')
          return res
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'files.tags.files',
        title: '聚合获取指定标签下的本地文件',
        tier: 'read',
        input: z.object({
          tagId: z.string().min(1),
        }),
        run: async input => metadata.listTagFiles(input),
      }),
    ),

    runtime.registerRoute(
      'GET',
      '/files/thumb',
      createThumbRouteHandler({ thumbs, native, thumbProvider }),
    ),
    runtime.registerRoute('GET', '/files/media', createMediaRouteHandler(fsService)),
    runtime.registerRoute('GET', '/files/download', createDownloadRouteHandler(fsService)),
  ]

  return () => {
    for (const dispose of disposers.reverse()) dispose()
    if (ownsThumbProvider && thumbProvider) {
      thumbProvider.dispose()
    }
  }
}

export const name = 'workspace-files-host'
export const inject = [
  'folioRuntime',
  'folioStorage',
  'folioThumbs',
  'folioNative',
  'folioFs',
] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () =>
      registerWorkspaceFilesHost({
        runtime: ctx.folioRuntime,
        storage: ctx.folioStorage,
        fs: ctx.folioFs,
        thumbs: ctx.folioThumbs,
        native: ctx.folioNative,
      }),
    'workspace-files-host: actions + thumb/media routes',
  )
}

export default { name, inject, apply }

export { createWindowsShellThumbProvider, createNoopShellThumbProvider } from './win-thumb.js'
export type { ShellThumbProvider } from './win-thumb.js'
export * from './types.js'
export * from './classify.js'
