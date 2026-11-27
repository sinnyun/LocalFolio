import type { Context } from '@deepseek-ai/cordis'
import type { FolioNativeService } from '@folio/base-contract'
import {
  createNoopNativeMediaPool,
  createWindowsNativeMediaPool,
  type NativeMediaPool,
} from './win-media-pool.js'
import {
  openLocalPath,
  pickNativeFiles,
  pickNativeFolder,
  pickNativeSaveFile,
  recycleLocalPaths,
  revealLocalPath,
  setWindowsHiddenAttribute,
} from './win-shell.js'

export interface CreateFolioNativeServiceOptions {
  readonly mediaPool?: NativeMediaPool
}

export interface ManagedFolioNativeService extends FolioNativeService {
  dispose(): void
}

export function createFolioNativeService(
  options: CreateFolioNativeServiceOptions = {},
): ManagedFolioNativeService {
  const ownsPool = !options.mediaPool
  const pool =
    options.mediaPool ??
    (process.platform === 'win32'
      ? createWindowsNativeMediaPool()
      : createNoopNativeMediaPool())

  return {
    getThumbnail: (filePath, size, opts) => pool.getThumbnail(filePath, size, opts),
    renderImageProxy: (filePath, maxDim, opts) => pool.renderImageProxy(filePath, maxDim, opts),
    pickFolder: opts => pickNativeFolder(opts),
    pickFiles: opts => pickNativeFiles(opts),
    pickSaveFile: opts => pickNativeSaveFile(opts),
    revealPath: targetPath => revealLocalPath(targetPath),
    openPath: targetPath => openLocalPath(targetPath),
    setHiddenAttribute: (targetPath, hidden) => setWindowsHiddenAttribute(targetPath, hidden),
    recyclePaths: paths => recycleLocalPaths(paths),
    dispose(): void {
      if (ownsPool) pool.dispose()
    },
  }
}

export const name = 'base-native-host'
export const inject = ['folioRuntime'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const service = createFolioNativeService()
    const disposeProvide = ctx.provide('folioNative', service)
    return () => {
      disposeProvide()
      service.dispose()
    }
  }, 'base-native-host: provide folioNative')
}

export default { name, inject, apply }

export { createWindowsNativeMediaPool, createNoopNativeMediaPool } from './win-media-pool.js'
export type { NativeMediaPool } from './win-media-pool.js'
export {
  normalizeLocalPath,
  pickNativeFolder,
  pickNativeFiles,
  pickNativeSaveFile,
  recycleLocalPaths,
  revealLocalPath,
  openLocalPath,
  setWindowsHiddenAttribute,
} from './win-shell.js'
