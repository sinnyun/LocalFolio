import fsp from 'node:fs/promises'
import type { FolioNativeService, ThumbGeneratorProvider } from '@folio/base-contract'

const MAX_SVG_BYTES = 2 * 1024 * 1024

export const WIC_IMAGE_EXTS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.jfif',
  '.webp',
  '.gif',
  '.bmp',
  '.ico',
  '.avif',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
] as const

export const SHELL_MEDIA_EXTS = [
  '.psd',
  '.psb',
  '.ai',
  '.eps',
  '.mp4',
  '.m4v',
  '.webm',
  '.mov',
  '.mkv',
  '.avi',
  '.wmv',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
] as const

export function createBuiltinThumbProviders(
  native: FolioNativeService,
): ThumbGeneratorProvider[] {
  return [
    {
      id: 'svg-direct',
      title: 'SVG 矢量直出',
      priority: 10,
      extensions: ['.svg'],
      async generate(req) {
        try {
          const st = await fsp.stat(req.filePath)
          if (!st.isFile() || st.size <= 0 || st.size > MAX_SVG_BYTES) return null
          const buffer = await fsp.readFile(req.filePath)
          return buffer.length > 0 ? { buffer, mime: 'image/svg+xml' } : null
        } catch {
          return null
        }
      },
    },
    {
      id: 'win-wic-image',
      title: 'Windows WIC 图像缩放解码',
      priority: 20,
      extensions: [...WIC_IMAGE_EXTS],
      async generate(req) {
        const rendered = await native.renderImageProxy(req.filePath, req.maxDim, {
          preferPng: req.preferPng,
          signal: req.signal,
        })
        if (!rendered || rendered.buffer.length === 0) return null
        return { buffer: rendered.buffer, mime: rendered.mime }
      },
    },
    {
      id: 'win-shell-media',
      title: 'Windows Shell 视频/文档/设计缩略图提取',
      priority: 50,
      extensions: [...SHELL_MEDIA_EXTS],
      async generate(req) {
        const proxy = await native
          .renderImageProxy(req.filePath, req.maxDim, {
            preferPng: req.preferPng,
            signal: req.signal,
          })
          .catch(() => null)
        if (proxy && proxy.buffer.length > 0) {
          return { buffer: proxy.buffer, mime: proxy.mime }
        }
        const shellThumb = await native
          .getThumbnail(req.filePath, req.maxDim, {
            allowIconFallback: false,
            preferPng: req.preferPng,
            signal: req.signal,
          })
          .catch(() => null)
        if (shellThumb && shellThumb.buffer.length > 0) {
          return { buffer: shellThumb.buffer, mime: shellThumb.mime }
        }
        return null
      },
    },
  ]
}
