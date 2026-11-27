import * as React from 'react'
import { rpcCall } from '@folio/base-contract/rpc'
import { LocalFilePickerDialog } from '@folio/base-collection-ui/client'
import { useCanvas } from '../context.js'
import { buildProxyUrl } from '../lod.js'
import type { CanvasListDirResult, CanvasRootsResult } from '../types.js'

const loadRoots = (): Promise<CanvasRootsResult> =>
  rpcCall<CanvasRootsResult>('canvas.fs.roots', {})

const loadDir = (path?: string): Promise<CanvasListDirResult> =>
  rpcCall<CanvasListDirResult>('canvas.fs.list', { path })

export function LocalImagePickerDialog(): React.ReactElement {
  const {
    pickerRequest,
    closePicker,
    insertLinkedImages,
    relinkAsset,
    batchRelocateFromFolder,
  } = useCanvas()

  const reqMode = pickerRequest?.mode
  const mode =
    reqMode === 'relocate-folder' ? 'folder' : reqMode === 'relink' ? 'single-file' : 'multi-file'
  const title =
    reqMode === 'relink'
      ? `重新选择链接图片${pickerRequest?.targetFileName ? `：${pickerRequest.targetFileName}` : ''}`
      : reqMode === 'relocate-folder'
        ? '选择图片所在的新文件夹'
        : '选择要链接的本地图片'
  const description =
    reqMode === 'relocate-folder'
      ? '将扫描所选目录及两级子目录，按文件名自动重新链接所有已失效的图片。'
      : '画板仅保存本地文件链接与 LOD 代理缓存，不会复制或写入图片原始文件。'
  const confirmLabel =
    reqMode === 'relocate-folder'
      ? '匹配此文件夹'
      : reqMode === 'relink'
        ? '重新链接此图片'
        : '链接到画板'

  const handleConfirm = async (paths: string[]): Promise<void> => {
    if (!pickerRequest) return
    if (pickerRequest.mode === 'relocate-folder') {
      if (paths[0]) await batchRelocateFromFolder(paths[0])
      return
    }
    if (pickerRequest.mode === 'relink') {
      if (pickerRequest.targetAssetId && paths[0]) await relinkAsset(pickerRequest.targetAssetId, paths[0])
      return
    }
    if (paths.length > 0) await insertLinkedImages(paths, pickerRequest.dropPoint)
  }

  return (
    <LocalFilePickerDialog
      open={Boolean(pickerRequest)}
      mode={mode}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      initialDir={pickerRequest?.initialDir}
      emptyText="此目录下没有子文件夹或图片文件"
      dialogDataAttr="data-lf-canvas-picker-dialog"
      onClose={closePicker}
      onConfirm={handleConfirm}
      loadRoots={loadRoots}
      loadDir={loadDir}
      buildThumbUrl={entry => buildProxyUrl(entry.path, 256, entry.mtimeMs ?? 0, 0)}
    />
  )
}
