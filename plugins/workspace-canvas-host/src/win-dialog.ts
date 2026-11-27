import {
  FolioError,
  type FolioFsService,
  type FolioNativeService,
} from '@folio/base-contract'
import { IMAGE_EXT_MAP } from './image-meta.js'
import type {
  CanvasListDirResult,
  CanvasQuickFolder,
  CanvasRootsResult,
} from './types.js'

export interface PickImagesOptions {
  readonly multi?: boolean
  readonly initialDir?: string
}

export interface PickImagesResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly paths: readonly string[]
}

export interface PickFolderResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly folderPath: string | null
}

export interface CanvasDialogProvider {
  pickImages(options?: PickImagesOptions): Promise<PickImagesResult>
  pickFolder(options?: { readonly initialDir?: string }): Promise<PickFolderResult>
  revealPath(filePath: string): Promise<{ readonly revealedPath: string }>
}

const IMAGE_FILTER =
  '图片文件|*.png;*.jpg;*.jpeg;*.jfif;*.webp;*.gif;*.bmp;*.ico;*.avif;*.svg;*.tif;*.tiff;*.heic;*.heif;*.psd|所有文件|*.*'

export function createWindowsDialogProvider(
  native?: FolioNativeService,
): CanvasDialogProvider {
  return {
    async pickImages(options: PickImagesOptions = {}): Promise<PickImagesResult> {
      if (!native) {
        return { supported: false, cancelled: false, paths: [] }
      }
      const multi = options.multi !== false
      return native.pickFiles({
        title: multi ? '选择要链接的图片' : '重新选择链接图片',
        filter: IMAGE_FILTER,
        multi,
        initialDir: options.initialDir,
      })
    },

    async pickFolder(options: { readonly initialDir?: string } = {}): Promise<PickFolderResult> {
      if (!native) {
        return { supported: false, cancelled: false, folderPath: null }
      }
      return native.pickFolder({
        title: '选择包含已移动图片的文件夹，用于批量重新链接',
        initialDir: options.initialDir,
      })
    },

    async revealPath(filePath: string): Promise<{ readonly revealedPath: string }> {
      if (!native) {
        throw new FolioError('native_unavailable', '基础桌面原生服务未就绪', 503)
      }
      return native.revealPath(filePath)
    },
  }
}

export async function listCanvasRoots(fsService?: FolioFsService): Promise<CanvasRootsResult> {
  if (!fsService) {
    throw new FolioError('fs_unavailable', '基础文件系统服务未就绪', 503)
  }
  const roots = await fsService.listRoots()
  const quickFolders: CanvasQuickFolder[] = roots.quickFolders.map(q => ({
    id: q.id,
    name: q.name,
    path: q.path,
    kind: q.kind,
  }))
  const drives = roots.drives.map(d => ({
    name: d.id === 'root' ? '/' : d.id,
    path: d.path,
  }))
  return {
    homePath: roots.homePath,
    platform: roots.platform,
    quickFolders,
    drives,
  }
}

export async function listCanvasDirectory(
  options: {
    readonly path?: string
    readonly showHidden?: boolean
  },
  fsService?: FolioFsService,
): Promise<CanvasListDirResult> {
  if (!fsService) {
    throw new FolioError('fs_unavailable', '基础文件系统服务未就绪', 503)
  }
  const res = await fsService.listDirectory({
    path: options.path,
    showHidden: options.showHidden,
    extensions: Object.keys(IMAGE_EXT_MAP),
    limit: 1200,
  })
  return {
    path: res.path,
    parentPath: res.parentPath,
    entries: res.entries.map(e => ({
      name: e.name,
      path: e.path,
      isDir: e.isDir,
      ext: e.ext,
      mime: e.mime,
      size: e.size,
      mtimeMs: e.mtimeMs,
    })),
    truncated: res.truncated,
  }
}
