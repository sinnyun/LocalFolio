import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { z } from 'zod'
import type {
  FolioStorageService,
  JsonStore,
  PluginStorageNamespace,
} from '@folio/base-contract'
import { createFsSeam, createJsonStore, createLocalFsSeam } from './fs-seam.js'
import {
  ensureDirSync,
  normalizePluginId,
  resolveFolioDataRoot,
  resolveSafeChildPath,
} from './paths.js'

export interface CreateFolioStorageOptions {
  readonly dataDir?: string
  readonly ctx?: unknown
}

export function createFolioStorageService(
  options: CreateFolioStorageOptions = {},
): FolioStorageService {
  const rootDir = resolveFolioDataRoot(options.dataDir)
  const sharedDir = path.join(rootDir, 'shared')
  const pluginsDir = path.join(rootDir, 'plugins')
  ensureDirSync(sharedDir)
  ensureDirSync(pluginsDir)

  // Plugin storage lives under LocalFolio's own host app-data root, outside any
  // DSH agent workspace. Routing it through DSH ctx.fs subjects internal plugin
  // state to dsh-fs-sandbox (workspace-write / read-only), so always use the
  // local atomic fs seam here.
  const fsSeam = createLocalFsSeam()
  const namespaces = new Map<string, PluginStorageNamespace>()

  const forPlugin = (rawPluginId: string): PluginStorageNamespace => {
    const pluginId = normalizePluginId(rawPluginId)
    const existing = namespaces.get(pluginId)
    if (existing) return existing

    const pluginRoot = path.join(pluginsDir, pluginId)
    const dataDir = path.join(pluginRoot, 'data')
    const cacheDir = path.join(pluginRoot, 'cache')
    ensureDirSync(dataDir)
    ensureDirSync(cacheDir)

    const ns: PluginStorageNamespace = Object.freeze({
      pluginId,
      rootDir: pluginRoot,
      dataDir,
      cacheDir,
      fs: fsSeam,
      dataPath: (...segments: string[]) => resolveSafeChildPath(dataDir, segments),
      cachePath: (...segments: string[]) => resolveSafeChildPath(cacheDir, segments),
      jsonStore<T>(
        relativeFile: string,
        schema: z.ZodType<T>,
        defaultValue: () => T,
      ): JsonStore<T> {
        return createJsonStore(
          fsSeam,
          resolveSafeChildPath(dataDir, [relativeFile]),
          schema,
          defaultValue,
        )
      },
    })

    namespaces.set(pluginId, ns)
    return ns
  }

  return Object.freeze({
    rootDir,
    sharedDir,
    pluginsDir,
    fs: fsSeam,
    sharedPath: (...segments: string[]) => resolveSafeChildPath(sharedDir, segments),
    sharedJsonStore<T>(
      relativeFile: string,
      schema: z.ZodType<T>,
      defaultValue: () => T,
    ): JsonStore<T> {
      return createJsonStore(
        fsSeam,
        resolveSafeChildPath(sharedDir, [relativeFile]),
        schema,
        defaultValue,
      )
    },
    forPlugin,
    listRegisteredPlugins: () => Array.from(namespaces.keys()).sort(),
  })
}

export const name = 'base-storage-host'

export function apply(ctx: Context): void {
  const service = createFolioStorageService({ ctx })
  // Public Cordis registration API: the returned disposer is owned by this
  // plugin's effect, so the service disappears exactly when the plugin unloads.
  ctx.effect(() => ctx.provide('folioStorage', service), 'base-storage-host: provide folioStorage')
}

export { createFsSeam, createLocalFsSeam, createJsonStore } from './fs-seam.js'
export { resolveFolioDataRoot, normalizePluginId } from './paths.js'
