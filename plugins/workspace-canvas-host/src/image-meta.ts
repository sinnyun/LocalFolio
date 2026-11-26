import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  BatchRelocateMatch,
  BatchRelocateResult,
  LinkCheckEntry,
  LinkedImageInspectResult,
  MissingLinkQueryItem,
} from './types.js'

export interface ImageDimensions {
  readonly width: number
  readonly height: number
}

export const IMAGE_EXT_MAP: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.psd': 'image/vnd.adobe.photoshop',
}

export function normalizeLocalPath(rawPath: string): string {
  let trimmed = rawPath.trim()
  if (!trimmed) return ''

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim()
  }
  if (!trimmed) return ''

  if (trimmed.toLowerCase().startsWith('file://')) {
    try {
      trimmed = fileURLToPath(trimmed)
    } catch {
      // Fallback: strip file:/// prefix if URL parsing fails on partial paths
      trimmed = trimmed.replace(/^file:\/\/\/?/i, '')
    }
  }

  if (/^[a-zA-Z]:$/.test(trimmed)) {
    return `${trimmed.toUpperCase()}\\`
  }

  const resolved = path.resolve(trimmed)
  if (/^[a-z]:\\/.test(resolved)) {
    return `${resolved[0].toUpperCase()}${resolved.slice(1)}`
  }
  return resolved
}

export function classifyImageFile(fileName: string): {
  readonly ext: string
  readonly mime: string
  readonly isImage: boolean
} {
  const ext = path.extname(fileName).toLowerCase()
  const mime = IMAGE_EXT_MAP[ext]
  return {
    ext,
    mime: mime ?? 'application/octet-stream',
    isImage: Boolean(mime),
  }
}

export function isImageFile(fileName: string): boolean {
  return classifyImageFile(fileName).isImage
}

function parsePngDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 24) return null
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  return width > 0 && height > 0 ? { width, height } : null
}

function parseGifDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 10) return null
  const sig = buf.subarray(0, 6).toString('ascii')
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null
  const width = buf.readUInt16LE(6)
  const height = buf.readUInt16LE(8)
  return width > 0 && height > 0 ? { width, height } : null
}

function parseBmpDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 26) return null
  if (buf[0] !== 0x42 || buf[1] !== 0x4d) return null
  const width = buf.readInt32LE(18)
  const height = Math.abs(buf.readInt32LE(22))
  return width > 0 && height > 0 ? { width, height } : null
}

function parseWebpDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 30) return null
  if (buf.subarray(0, 4).toString('ascii') !== 'RIFF') return null
  if (buf.subarray(8, 12).toString('ascii') !== 'WEBP') return null
  const chunk = buf.subarray(12, 16).toString('ascii')
  if (chunk === 'VP8 ' && buf.length >= 30) {
    const width = buf.readUInt16LE(26) & 0x3fff
    const height = buf.readUInt16LE(28) & 0x3fff
    return width > 0 && height > 0 ? { width, height } : null
  }
  if (chunk === 'VP8L' && buf.length >= 25) {
    const bits = buf.readUInt32LE(21)
    const width = (bits & 0x3fff) + 1
    const height = ((bits >> 14) & 0x3fff) + 1
    return width > 0 && height > 0 ? { width, height } : null
  }
  if (chunk === 'VP8X' && buf.length >= 30) {
    const width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1
    const height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1
    return width > 0 && height > 0 ? { width, height } : null
  }
  return null
}

function parseJpegDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let offset = 2
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buf[offset + 1]
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    if (offset + 4 > buf.length) break
    const segLen = buf.readUInt16BE(offset + 2)
    if (segLen < 2) break
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    if (isSof && offset + 9 <= buf.length) {
      const height = buf.readUInt16BE(offset + 5)
      const width = buf.readUInt16BE(offset + 7)
      return width > 0 && height > 0 ? { width, height } : null
    }
    offset += 2 + segLen
  }
  return null
}

function parseSvgDimensions(buf: Buffer): ImageDimensions | null {
  const head = buf.toString('utf8')
  const svgTag = head.match(/<svg\b([^>]*)>/i)?.[1]
  if (!svgTag) return null
  const wMatch = svgTag.match(/\bwidth\s*=\s*["']\s*([0-9]+(?:\.[0-9]+)?)(?:px)?\s*["']/i)
  const hMatch = svgTag.match(/\bheight\s*=\s*["']\s*([0-9]+(?:\.[0-9]+)?)(?:px)?\s*["']/i)
  if (wMatch && hMatch) {
    const width = Math.round(Number(wMatch[1]))
    const height = Math.round(Number(hMatch[1]))
    if (width > 0 && height > 0) return { width, height }
  }
  const vbMatch = svgTag.match(
    /\bviewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9]+(?:\.[0-9]+)?)\s*["']/i,
  )
  if (vbMatch) {
    const width = Math.round(Number(vbMatch[1]))
    const height = Math.round(Number(vbMatch[2]))
    if (width > 0 && height > 0) return { width, height }
  }
  return null
}

export function parseImageDimensionsFromBuffer(buf: Buffer, ext: string): ImageDimensions | null {
  const lower = ext.toLowerCase()
  if (lower === '.png') return parsePngDimensions(buf)
  if (lower === '.jpg' || lower === '.jpeg' || lower === '.jfif') return parseJpegDimensions(buf)
  if (lower === '.gif') return parseGifDimensions(buf)
  if (lower === '.webp') return parseWebpDimensions(buf)
  if (lower === '.bmp') return parseBmpDimensions(buf)
  if (lower === '.svg') return parseSvgDimensions(buf)
  return null
}

export async function readImageDimensions(
  filePath: string,
  ext: string,
): Promise<ImageDimensions | null> {
  const lower = ext.toLowerCase()
  if (
    lower !== '.png' &&
    lower !== '.jpg' &&
    lower !== '.jpeg' &&
    lower !== '.jfif' &&
    lower !== '.gif' &&
    lower !== '.webp' &&
    lower !== '.bmp' &&
    lower !== '.svg'
  ) {
    return null
  }
  let handle: fsp.FileHandle | null = null
  try {
    handle = await fsp.open(filePath, 'r')
    const buf = Buffer.allocUnsafe(65536)
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
    return parseImageDimensionsFromBuffer(buf.subarray(0, bytesRead), lower)
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => {})
  }
}

export async function inspectLinkedImage(rawPath: string): Promise<LinkedImageInspectResult> {
  const normalized = normalizeLocalPath(rawPath)
  const fileName = normalized ? path.basename(normalized) : ''
  const classified = classifyImageFile(fileName)

  if (!normalized) {
    return {
      path: '',
      exists: false,
      fileName: '',
      ext: '',
      mime: 'application/octet-stream',
      size: 0,
      mtimeMs: 0,
      naturalWidth: null,
      naturalHeight: null,
      isImage: false,
    }
  }

  let st: fs.Stats | null = null
  try {
    st = await fsp.stat(normalized)
  } catch {
    st = null
  }

  if (!st || !st.isFile()) {
    return {
      path: normalized,
      exists: false,
      fileName,
      ext: classified.ext,
      mime: classified.mime,
      size: 0,
      mtimeMs: 0,
      naturalWidth: null,
      naturalHeight: null,
      isImage: classified.isImage,
    }
  }

  const dims = classified.isImage ? await readImageDimensions(normalized, classified.ext) : null

  return {
    path: normalized,
    exists: true,
    fileName,
    ext: classified.ext,
    mime: classified.mime,
    size: st.size,
    mtimeMs: st.mtimeMs,
    naturalWidth: dims?.width ?? null,
    naturalHeight: dims?.height ?? null,
    isImage: classified.isImage,
  }
}

const STAT_BATCH_SIZE = 32

export async function checkLinkedImages(paths: readonly string[]): Promise<LinkCheckEntry[]> {
  const unique = Array.from(new Set(paths.map(normalizeLocalPath).filter(Boolean)))
  const results: LinkCheckEntry[] = []

  for (let i = 0; i < unique.length; i += STAT_BATCH_SIZE) {
    const batch = unique.slice(i, i + STAT_BATCH_SIZE)
    const checked = await Promise.all(
      batch.map(async targetPath => {
        try {
          const st = await fsp.stat(targetPath)
          if (!st.isFile()) {
            return { path: targetPath, exists: false, size: null, mtimeMs: null }
          }
          return {
            path: targetPath,
            exists: true,
            size: st.size,
            mtimeMs: st.mtimeMs,
          }
        } catch {
          return { path: targetPath, exists: false, size: null, mtimeMs: null }
        }
      }),
    )
    results.push(...checked)
  }

  return results
}

const RELOCATE_SCAN_MAX_DEPTH = 2
const RELOCATE_SCAN_CAP = 5000

interface ScannedCandidate {
  readonly path: string
  readonly nameLower: string
}

export async function relocateMissingImagesInFolder(
  rawFolderPath: string,
  missingItems: readonly MissingLinkQueryItem[],
): Promise<BatchRelocateResult> {
  const folderPath = normalizeLocalPath(rawFolderPath)
  if (!folderPath || missingItems.length === 0) {
    return { folderPath, scannedFiles: 0, matches: [] }
  }

  const byNameLower = new Map<string, string[]>()
  let scannedFiles = 0

  const queue: Array<{ dir: string; depth: number }> = [{ dir: folderPath, depth: 0 }]
  while (queue.length > 0 && scannedFiles < RELOCATE_SCAN_CAP) {
    const current = queue.shift()!
    let dirents: fs.Dirent[]
    try {
      dirents = await fsp.readdir(current.dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const dirent of dirents) {
      if (scannedFiles >= RELOCATE_SCAN_CAP) break
      if (dirent.name.startsWith('.')) continue
      const fullPath = normalizeLocalPath(path.join(current.dir, dirent.name))
      if (dirent.isDirectory()) {
        if (current.depth < RELOCATE_SCAN_MAX_DEPTH) {
          queue.push({ dir: fullPath, depth: current.depth + 1 })
        }
        continue
      }
      if (!dirent.isFile()) continue
      scannedFiles += 1
      if (!isImageFile(dirent.name)) continue
      const key = dirent.name.toLowerCase()
      const list = byNameLower.get(key)
      if (list) list.push(fullPath)
      else byNameLower.set(key, [fullPath])
    }
  }

  const matches: BatchRelocateMatch[] = []
  const candidateCache = new Map<string, LinkedImageInspectResult>()

  const getInspected = async (candidatePath: string): Promise<LinkedImageInspectResult> => {
    const cached = candidateCache.get(candidatePath)
    if (cached) return cached
    const inspected = await inspectLinkedImage(candidatePath)
    candidateCache.set(candidatePath, inspected)
    return inspected
  }

  for (const item of missingItems) {
    const key = path.basename(item.fileName).toLowerCase()
    const candidates = byNameLower.get(key)
    if (!candidates || candidates.length === 0) continue

    let chosen: LinkedImageInspectResult | null = null
    if (candidates.length === 1 || item.expectedSize === undefined) {
      chosen = await getInspected(candidates[0]!)
    } else {
      for (const candidatePath of candidates) {
        const inspected = await getInspected(candidatePath)
        if (!chosen) chosen = inspected
        if (inspected.exists && inspected.size === item.expectedSize) {
          chosen = inspected
          break
        }
      }
    }

    if (chosen && chosen.exists) {
      matches.push({ linkId: item.linkId, inspected: chosen })
    }
  }

  return {
    folderPath,
    scannedFiles,
    matches,
  }
}

export type { ScannedCandidate }
