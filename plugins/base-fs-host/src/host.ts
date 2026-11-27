import type { Context } from '@deepseek-ai/cordis'
import type { FolioFsService } from '@folio/base-contract'
import {
  buildBreadcrumbs,
  classifyFile,
  getParentPath,
  isHiddenName,
  isPathInside,
  isStreamableMediaExt,
  isTextPreviewable,
  normalizePath,
  parseImageDimensionsFromBuffer,
  readImageDimensions,
  sniffImageMime,
} from './classify.js'
import { listDirectory, listDrives, listQuickFolders, listRoots } from './drives.js'
import { pruneCacheDir, serveDownloadFile, serveMediaFile, writeAtomicFile } from './media.js'

export function createFolioFsService(): FolioFsService {
  return {
    normalizePath,
    isPathInside,
    getParentPath,
    buildBreadcrumbs,
    classifyFile,
    isStreamableMediaExt,
    isTextPreviewable,
    isHiddenName,
    parseImageDimensionsFromBuffer,
    readImageDimensions,
    sniffImageMime,
    listDrives,
    listQuickFolders,
    listRoots,
    listDirectory,
    serveMediaFile,
    serveDownloadFile,
    pruneCacheDir,
    writeAtomicFile,
  }
}

export const name = 'base-fs-host'
export const inject = ['folioRuntime'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const service = createFolioFsService()
    return ctx.provide('folioFs', service)
  }, 'base-fs-host: provide folioFs')
}

export default { name, inject, apply }

export {
  buildBreadcrumbs,
  classifyFile,
  getParentPath,
  isHiddenName,
  isPathInside,
  isStreamableMediaExt,
  isTextPreviewable,
  normalizePath,
  parseImageDimensionsFromBuffer,
  readImageDimensions,
  sniffImageMime,
} from './classify.js'
export { listDirectory, listDrives, listQuickFolders, listRoots } from './drives.js'
export { pruneCacheDir, serveDownloadFile, serveMediaFile, writeAtomicFile } from './media.js'
