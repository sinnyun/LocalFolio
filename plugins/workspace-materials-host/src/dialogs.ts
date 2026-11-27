import path from 'node:path'
import { FolioError, type FolioNativeService } from '@folio/base-contract'

export interface PickFilesResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly paths: readonly string[]
}

export interface PickSaveFileResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly filePath: string | null
}

export interface PickFolderResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly folderPath: string | null
}

export interface MaterialsDialogProvider {
  pickVectorCraftFiles(options?: { readonly multi?: boolean; readonly initialDir?: string }): Promise<PickFilesResult>
  pickSaveVectorCraftFile(options?: { readonly defaultName?: string; readonly initialDir?: string }): Promise<PickSaveFileResult>
  pickFolder(options?: { readonly initialDir?: string; readonly description?: string }): Promise<PickFolderResult>
  revealPath(targetPath: string): Promise<{ readonly revealedPath: string }>
}

export function normalizeLocalPath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return path.normalize(trimmed)
}

export function createWindowsMaterialsDialogProvider(
  native?: FolioNativeService,
): MaterialsDialogProvider {
  return {
    async pickVectorCraftFiles(options = {}): Promise<PickFilesResult> {
      if (!native) {
        return { supported: false, cancelled: false, paths: [] }
      }
      return native.pickFiles({
        title: '选择 VectorCraft 文件',
        filter: 'VectorCraft 文件 (*.vectorcraft)|*.vectorcraft|所有文件 (*.*)|*.*',
        multi: options.multi !== false,
        initialDir: options.initialDir,
      })
    },

    async pickSaveVectorCraftFile(options = {}): Promise<PickSaveFileResult> {
      if (!native?.pickSaveFile) {
        return { supported: false, cancelled: false, filePath: null }
      }
      return native.pickSaveFile({
        title: '新建 A3 横版 VectorCraft 文件',
        filter: 'VectorCraft 文件 (*.vectorcraft)|*.vectorcraft',
        defaultExt: 'vectorcraft',
        defaultName: (options.defaultName ?? '新建物料项目.vectorcraft').trim(),
        initialDir: options.initialDir,
      })
    },

    async pickFolder(options = {}): Promise<PickFolderResult> {
      if (!native) {
        return { supported: false, cancelled: false, folderPath: null }
      }
      return native.pickFolder({
        title: options.description ?? '选择导出目标文件夹',
        initialDir: options.initialDir,
      })
    },

    async revealPath(targetPath: string): Promise<{ readonly revealedPath: string }> {
      if (!native) {
        throw new FolioError('native_unavailable', '基础桌面原生服务未就绪', 503)
      }
      return native.revealPath(targetPath)
    },
  }
}
