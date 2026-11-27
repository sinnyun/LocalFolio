import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { FolioNativeService, ThumbGenerateRequest, ThumbGeneratorProvider } from '@folio/base-contract'
import { HEAVY_DESIGN_AVOID_BYTES, shouldAvoidHeavyInFastLayer } from './blacklist.js'
import { readPsdEmbeddedJpeg } from './psd-preview.js'
import type { ThumbToolRegistry } from './tools.js'

const execFileAsync = promisify(execFile)

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
  '.cdr',
  '.blend',
  '.max',
  '.c4d',
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

export const MAGICK_DESIGN_EXTS = [
  '.psd',
  '.psb',
  '.tif',
  '.tiff',
  '.ai',
  '.eps',
  '.pdf',
] as const

export const FFMPEG_VIDEO_EXTS = [
  '.mp4',
  '.m4v',
  '.webm',
  '.mov',
  '.mkv',
  '.avi',
  '.wmv',
  '.flv',
  '.mxf',
  '.ts',
  '.mts',
  '.m2ts',
] as const

export interface BuiltinThumbProvidersOptions {
  readonly native: FolioNativeService
  readonly tools?: ThumbToolRegistry
  readonly heavyAvoidBytes?: number
}

async function runCliToTempWebp(
  binaryPath: string,
  buildArgs: (outputPath: string) => string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Buffer | null> {
  const tmpOut = path.join(os.tmpdir(), `lf-thumb-${crypto.randomUUID()}.webp`)
  try {
    await execFileAsync(binaryPath, buildArgs(tmpOut), {
      timeout: timeoutMs,
      windowsHide: true,
      signal,
    })
    const st = await fsp.stat(tmpOut).catch(() => null)
    if (!st || !st.isFile() || st.size <= 0) return null
    const buf = await fsp.readFile(tmpOut)
    return buf.length > 0 ? buf : null
  } catch {
    return null
  } finally {
    await fsp.unlink(tmpOut).catch(() => {})
  }
}

export function createBuiltinThumbProviders(
  nativeOrOptions: FolioNativeService | BuiltinThumbProvidersOptions,
): ThumbGeneratorProvider[] {
  const opts: BuiltinThumbProvidersOptions =
    'native' in nativeOrOptions ? nativeOrOptions : { native: nativeOrOptions }
  const { native, tools } = opts
  const avoidBytes = opts.heavyAvoidBytes ?? HEAVY_DESIGN_AVOID_BYTES
  const isHeavyDesign = (req: ThumbGenerateRequest): boolean =>
    shouldAvoidHeavyInFastLayer(req.ext, req.fileSize, avoidBytes)
  const generateShellThumb: ThumbGeneratorProvider['generate'] = req =>
    native.getThumbnail(req.filePath, req.maxDim, {
      allowIconFallback: false,
      preferPng: req.preferPng,
      signal: req.signal,
    })

  const providers: ThumbGeneratorProvider[] = [
    {
      id: 'psd-embedded-jpeg',
      title: 'Photoshop 内嵌 JPEG 预览',
      priority: 15,
      queueType: 'fast',
      extensions: ['.psd', '.psb'],
      async generate(req) {
        const buffer = await readPsdEmbeddedJpeg(req.filePath, req.signal)
        return buffer ? { buffer, mime: 'image/jpeg' } : null
      },
    },
    // L1a-1: SVG direct pass-through
    {
      id: 'svg-direct',
      title: 'SVG 矢量直出',
      priority: 10,
      queueType: 'fast',
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

    // L1a-2: Windows WIC Try-First image decode (avoids oversized heavy PSD/PSB/TIF)
    {
      id: 'win-wic-image',
      title: 'Windows WIC 图像缩放解码 (L1a)',
      priority: 20,
      queueType: 'fast',
      extensions: [...WIC_IMAGE_EXTS],
      canHandle(req) {
        return !isHeavyDesign(req)
      },
      async generate(req) {
        const rendered = await native.renderImageProxy(req.filePath, req.maxDim, {
          preferPng: req.preferPng,
          strictWicOnly: true,
          signal: req.signal,
        })
        if (!rendered || rendered.buffer.length === 0) return null
        return { buffer: rendered.buffer, mime: rendered.mime }
      },
    },

    // Reserve the fast queue for files that are unlikely to tie up a Shell worker.
    {
      id: 'win-shell-media',
      title: 'Windows Shell 原生外壳缩略图 (L1b)',
      priority: 30,
      queueType: 'fast',
      extensions: ['*'],
      canHandle(req) {
        return !isHeavyDesign(req)
      },
      generate: generateShellThumb,
    },
    {
      id: 'win-shell-design-heavy',
      title: 'Windows Shell 大文件缩略图',
      priority: 31,
      queueType: 'heavy',
      extensions: ['*'],
      canHandle: isHeavyDesign,
      generate: generateShellThumb,
    },
  ]

  if (tools) {
    // L2-1: ImageMagick 7 in-place composite layer extraction for PSD/PSB/TIF/AI/EPS/PDF
    providers.push({
      id: 'magick-design',
      title: 'ImageMagick 7 大文件与设计格式抽层 (L2)',
      priority: 60,
      queueType: 'heavy',
      extensions: [...MAGICK_DESIGN_EXTS],
      async generate(req) {
        const info = await tools.detectTool('magick')
        if (!info.available || !info.binaryPath) return null
        const srgbPath = tools.resolveSrgbProfilePath()
        const maxDim = Math.max(64, Math.min(1024, Math.round(req.maxDim)))
        const inputSpec = `${req.filePath}[0]`
        const buf = await runCliToTempWebp(
          info.binaryPath,
          outputPath => {
            const args = [
              '-limit',
              'memory',
              '256MiB',
              '-limit',
              'map',
              '512MiB',
              inputSpec,
            ]
            if (srgbPath) {
              args.push('-profile', srgbPath)
            } else {
              args.push('-colorspace', 'sRGB')
            }
            args.push(
              '-thumbnail',
              `${maxDim}x${maxDim}>`,
              '-strip',
              '-quality',
              '85',
              outputPath,
            )
            return args
          },
          45_000,
          req.signal,
        )
        return buf ? { buffer: buf, mime: 'image/webp' } : null
      },
    })

    // L2-2: FFmpeg fast keyframe extraction for video files
    providers.push({
      id: 'ffmpeg-video',
      title: 'FFmpeg 视频关键帧抽帧 (L2)',
      priority: 70,
      queueType: 'heavy',
      extensions: [...FFMPEG_VIDEO_EXTS],
      async generate(req) {
        const info = await tools.detectTool('ffmpeg')
        if (!info.available || !info.binaryPath) return null
        const maxDim = Math.max(64, Math.min(1024, Math.round(req.maxDim)))
        const buf = await runCliToTempWebp(
          info.binaryPath,
          outputPath => [
            '-hide_banner',
            '-loglevel',
            'error',
            '-ss',
            '00:00:01',
            '-i',
            req.filePath,
            '-vframes',
            '1',
            '-vf',
            `scale=${maxDim}:-1:force_original_aspect_ratio=decrease`,
            '-y',
            outputPath,
          ],
          30_000,
          req.signal,
        )
        return buf ? { buffer: buf, mime: 'image/webp' } : null
      },
    })
  }

  return providers
}
