import fsp from 'node:fs/promises'
import os from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  FolioError,
  defineAction,
  type FolioRuntimeService,
  type FolioStorageService,
} from '@folio/base-contract'
import { normalizeBrowsePath } from './classify.js'
import { listDrives, listQuickFolders } from './drives.js'
import { inspectFile, listDirectory, listTreeChildren, revealInExplorer } from './fs-ops.js'
import { createMediaRouteHandler, createThumbRouteHandler } from './media-route.js'
import { FilesPrefsSchema } from './types.js'
import { createWindowsShellThumbProvider, type ShellThumbProvider } from './win-thumb.js'

export interface RegisterWorkspaceFilesHostOptions {
  readonly runtime: FolioRuntimeService
  readonly storage: FolioStorageService
  readonly thumbProvider?: ShellThumbProvider
}

export function registerWorkspaceFilesHost(options: RegisterWorkspaceFilesHostOptions): () => void {
  const { runtime, storage } = options
  const ownsThumbProvider = !options.thumbProvider
  const thumbProvider = options.thumbProvider ?? createWindowsShellThumbProvider()

  const pluginStorage = storage.forPlugin('workspace-files-host')
  const prefsStore = pluginStorage.jsonStore('preferences.json', FilesPrefsSchema, () => ({
    pinnedFolders: [],
  }))

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
            listQuickFolders(prefs.pinnedFolders),
            listDrives(),
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
        run: async input => revealInExplorer(input.path),
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

    runtime.registerRoute('GET', '/files/thumb', createThumbRouteHandler(thumbProvider)),
    runtime.registerRoute('GET', '/files/media', createMediaRouteHandler()),
  ]

  return () => {
    for (const dispose of disposers.reverse()) dispose()
    if (ownsThumbProvider) {
      thumbProvider.dispose()
    }
  }
}

export const name = 'workspace-files-host'
export const inject = ['folioRuntime', 'folioStorage'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () =>
      registerWorkspaceFilesHost({
        runtime: ctx.folioRuntime,
        storage: ctx.folioStorage,
      }),
    'workspace-files-host: actions + thumb/media routes',
  )
}

export default { name, inject, apply }

export { createWindowsShellThumbProvider, createNoopShellThumbProvider } from './win-thumb.js'
export type { ShellThumbProvider } from './win-thumb.js'
export * from './types.js'
export * from './classify.js'
