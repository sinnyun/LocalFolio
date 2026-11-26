import { getAssetUrls } from '@tldraw/assets/selfHosted'
import type { JsonObject, TLAsset, TLAssetContext, TLAssetStore, TLImageAsset } from 'tldraw'
import type { FolioLinkMeta, LinkStatus } from './types.js'

export const FOLIO_LINK_PREFIX = 'asset:folio-link/v1'
export const LEGACY_FOLIO_LINK_PREFIX = 'folio-link://v1'
export const LOD_TIERS = [256, 512, 1024, 2048] as const
export type LodTier = (typeof LOD_TIERS)[number]

export const MAX_CANVAS_ASSET_EDGE = 2048
export const MAX_INITIAL_SHAPE_EDGE = 640

const IMAGE_EXT_REGEX =
  /\.(png|jpe?g|jfif|webp|gif|bmp|ico|avif|svg|tiff?|heic|heif|psd)$/i

export function buildFolioLinkSrc(linkId: string): string {
  return `${FOLIO_LINK_PREFIX}/${encodeURIComponent(linkId)}`
}

export function isFolioLinkSrc(src: unknown): boolean {
  return (
    typeof src === 'string' &&
    (src.startsWith(FOLIO_LINK_PREFIX) || src.startsWith(LEGACY_FOLIO_LINK_PREFIX))
  )
}

export function extractFolioLinkMeta(asset: TLAsset | Record<string, unknown> | null | undefined): FolioLinkMeta | null {
  if (!asset || typeof asset !== 'object') return null
  const record = asset as { type?: unknown; meta?: unknown; props?: { src?: unknown; w?: unknown; h?: unknown; name?: unknown; mimeType?: unknown; fileSize?: unknown } }
  if (record.type !== 'image') return null
  const meta = record.meta as Record<string, unknown> | undefined
  if (!meta || meta.folioLink !== true || typeof meta.localPath !== 'string' || !meta.localPath) {
    return null
  }
  return {
    folioLink: true,
    linkId: typeof meta.linkId === 'string' && meta.linkId ? meta.linkId : String(record.props?.src ?? ''),
    localPath: meta.localPath,
    fileName:
      typeof meta.fileName === 'string' && meta.fileName
        ? meta.fileName
        : String(record.props?.name ?? 'image'),
    fileSize:
      typeof meta.fileSize === 'number' && Number.isFinite(meta.fileSize)
        ? meta.fileSize
        : Number(record.props?.fileSize ?? 0),
    mtimeMs: typeof meta.mtimeMs === 'number' && Number.isFinite(meta.mtimeMs) ? meta.mtimeMs : 0,
    naturalWidth:
      typeof meta.naturalWidth === 'number' && meta.naturalWidth > 0 ? meta.naturalWidth : null,
    naturalHeight:
      typeof meta.naturalHeight === 'number' && meta.naturalHeight > 0 ? meta.naturalHeight : null,
    mime:
      typeof meta.mime === 'string' && meta.mime
        ? meta.mime
        : String(record.props?.mimeType ?? 'image/png'),
    relinkRev:
      typeof meta.relinkRev === 'number' && Number.isFinite(meta.relinkRev) ? meta.relinkRev : 0,
  }
}

export function computeCanvasImageGeometry(
  naturalWidth: number | null,
  naturalHeight: number | null,
): {
  readonly assetW: number
  readonly assetH: number
  readonly shapeW: number
  readonly shapeH: number
} {
  const rawW = naturalWidth && naturalWidth > 0 ? naturalWidth : 1024
  const rawH = naturalHeight && naturalHeight > 0 ? naturalHeight : 768
  const maxRaw = Math.max(rawW, rawH)

  const assetScale = maxRaw > MAX_CANVAS_ASSET_EDGE ? MAX_CANVAS_ASSET_EDGE / maxRaw : 1
  const assetW = Math.max(1, Math.round(rawW * assetScale))
  const assetH = Math.max(1, Math.round(rawH * assetScale))

  const shapeScale = maxRaw > MAX_INITIAL_SHAPE_EDGE ? MAX_INITIAL_SHAPE_EDGE / maxRaw : 1
  const shapeW = Math.max(48, Math.round(rawW * shapeScale))
  const shapeH = Math.max(48, Math.round(rawH * shapeScale))

  return { assetW, assetH, shapeW, shapeH }
}

export function chooseLodTier(
  naturalWidth: number | null,
  naturalHeight: number | null,
  steppedScreenScale: number,
  dpr: number,
): LodTier {
  const { assetW, assetH } = computeCanvasImageGeometry(naturalWidth, naturalHeight)
  const logicalMax = Math.max(assetW, assetH)
  const safeScale = Number.isFinite(steppedScreenScale) && steppedScreenScale > 0 ? steppedScreenScale : 1
  const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const desiredPx = Math.max(64, Math.min(2048, Math.round(logicalMax * safeScale * safeDpr)))

  for (const tier of LOD_TIERS) {
    if (desiredPx <= tier) return tier
  }
  return 2048
}

export function buildProxyUrl(
  localPath: string,
  tier: number,
  mtimeMs: number,
  relinkRev: number,
): string {
  const params = new URLSearchParams({
    path: localPath,
    tier: String(tier),
    v: String(Math.trunc(mtimeMs || 0)),
    rev: String(Math.trunc(relinkRev || 0)),
  })
  return `/lf/canvas/proxy?${params.toString()}`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * In-memory SVG placeholder returned by `TLAssetStore.resolve` when a linked
 * image has been moved or deleted. Never written into the board snapshot.
 */
export function buildBrokenLinkSvgDataUrl(fileName: string, localPath: string): string {
  const safeName = escapeXml(fileName.slice(0, 42) || '缺失的图片链接')
  const safePath = escapeXml(localPath.length > 56 ? `...${localPath.slice(-53)}` : localPath)
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">',
    '<rect x="2" y="2" width="476" height="316" rx="14" fill="#fef3c7" stroke="#d97706" stroke-width="3" stroke-dasharray="10 6"/>',
    '<circle cx="240" cy="112" r="28" fill="#fde68a" stroke="#d97706" stroke-width="2.5"/>',
    '<path d="M240 97v17M240 123v3" stroke="#b45309" stroke-width="4" stroke-linecap="round"/>',
    '<text x="240" y="172" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="#92400e">图片链接已失效或文件已移动</text>',
    `<text x="240" y="204" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="#78350f">${safeName}</text>`,
    `<text x="240" y="232" text-anchor="middle" font-family="monospace" font-size="11" fill="#a16207">${safePath}</text>`,
    '<text x="240" y="272" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" fill="#b45309">请在顶部「图片链接」小面板中重新选择链接图片</text>',
    '</svg>',
  ].join('')
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function buildSelfHostedAssetUrls() {
  return getAssetUrls(assetUrl => {
    const clean = assetUrl.replace(/^\.\//, '')
    return `/lf/canvas/tldraw-asset?f=${encodeURIComponent(clean)}`
  })
}

export interface HostPathBridge {
  /** Absolute harness-host path of one picked file, or empty when the shell has none for it. */
  pathFor?(file: File): string
}

/**
 * Resolve the real disk path of a dropped/pasted file. Electron can attach a
 * legacy `File.path`, while the DSH Desktop preload exposes the equivalent
 * `__DSH_HOST_PATHS__.pathFor(file)`. A served browser page has neither.
 */
export function resolveDroppedFilePath(file: File): string | null {
  const legacyPath = (file as File & { path?: unknown }).path
  if (typeof legacyPath === 'string' && legacyPath.trim().length > 0) {
    return legacyPath.trim()
  }

  const bridge = (globalThis as { __DSH_HOST_PATHS__?: HostPathBridge }).__DSH_HOST_PATHS__
  if (bridge && typeof bridge.pathFor === 'function') {
    try {
      const resolved = bridge.pathFor(file)
      if (typeof resolved === 'string' && resolved.trim().length > 0) {
        return resolved.trim()
      }
    } catch {
      // The desktop bridge rejects synthetic files it does not own.
    }
  }
  return null
}

export function isDroppedImageFile(file: File): boolean {
  if (typeof file.type === 'string' && file.type.toLowerCase().startsWith('image/')) {
    return true
  }
  return isImagePathCandidate(file.name ?? '')
}

/** Base64-encode arbitrary bytes without blowing the argument limit of `btoa`. */
export function bytesToBase64(bytes: Uint8Array): string {
  const step = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step))
  }
  return btoa(binary)
}

export interface CreateFolioAssetStoreOptions {
  readonly getLinkStatus: (linkId: string) => LinkStatus
  readonly onBlockedWebUpload: (file: File) => void
  readonly onElectronFileLink: (
    asset: TLAsset,
    localPath: string,
  ) => Promise<{ readonly src: string; readonly meta: JsonObject }>
  readonly onWebFileImport: (
    file: File,
  ) => Promise<{ readonly src: string; readonly meta: JsonObject }>
}

export function createFolioAssetStore(options: CreateFolioAssetStoreOptions): TLAssetStore {
  return {
    async upload(asset, file) {
      const localPath = resolveDroppedFilePath(file)
      if (localPath) {
        return options.onElectronFileLink(asset, localPath)
      }
      if (isDroppedImageFile(file)) {
        return options.onWebFileImport(file)
      }
      options.onBlockedWebUpload(file)
      throw new Error('LocalFolio 画板不直接嵌入图片二进制，请使用文件链接导入。')
    },

    resolve(asset: TLAsset, ctx: TLAssetContext): string | null {
      const meta = extractFolioLinkMeta(asset)
      if (!meta) {
        const src = (asset as TLImageAsset).props?.src
        if (typeof src === 'string' && src.length > 0 && !src.startsWith('data:')) {
          return src
        }
        return null
      }

      const status = options.getLinkStatus(meta.linkId)
      if (status === 'missing') {
        return buildBrokenLinkSvgDataUrl(meta.fileName, meta.localPath)
      }

      // Even when `shouldResolveToOriginal` is true (e.g. clipboard/export), keep
      // canvas proxy capped at 2048px so ultra-high-res files never overload memory.
      const scale = ctx.shouldResolveToOriginal ? 2 : ctx.steppedScreenScale
      const tier = chooseLodTier(meta.naturalWidth, meta.naturalHeight, scale, ctx.dpr)
      return buildProxyUrl(meta.localPath, tier, meta.mtimeMs, meta.relinkRev)
    },
  }
}

/**
 * Client-side guard before sending a board snapshot to Host RPC: strips any
 * inline `data:` URLs on image assets so raw images never leave the client or
 * get persisted.
 */
export function stripInlineImagesFromSnapshot(
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  const cloned = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>
  const stripStore = (store: Record<string, unknown> | undefined) => {
    if (!store) return
    for (const raw of Object.values(store)) {
      if (!raw || typeof raw !== 'object') continue
      const rec = raw as Record<string, unknown>
      if (rec.typeName === 'asset' && rec.type === 'image') {
        const props = rec.props as Record<string, unknown> | undefined
        if (props && typeof props.src === 'string' && props.src.startsWith('data:')) {
          props.src = ''
        }
      }
    }
  }
  const doc = cloned.document as { store?: Record<string, unknown> } | undefined
  stripStore(doc?.store)
  stripStore(cloned.store as Record<string, unknown> | undefined)
  return cloned
}

export function isImagePathCandidate(rawPath: string): boolean {
  const trimmed = rawPath.trim().replace(/^["']|["']$/g, '')
  if (!trimmed) return false
  return IMAGE_EXT_REGEX.test(trimmed)
}

export function extractLocalPathsFromText(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)

  const paths: string[] = []
  for (const line of lines) {
    const isWinAbs = /^[a-zA-Z]:[\\/]/.test(line)
    const isUnc = line.startsWith('\\\\')
    const isFileUrl = /^file:\/\//i.test(line)
    if ((isWinAbs || isUnc || isFileUrl) && isImagePathCandidate(line)) {
      paths.push(line)
    }
  }
  return paths
}
