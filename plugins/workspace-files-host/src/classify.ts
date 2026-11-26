import fsp from 'node:fs/promises'
import path from 'node:path'
import type { BreadcrumbItem, FileCategory, ImageDimensions } from './types.js'

interface ExtMeta {
  readonly category: FileCategory
  readonly mime: string
}

const EXT_MAP: Readonly<Record<string, ExtMeta>> = {
  // Images
  '.png': { category: 'image', mime: 'image/png' },
  '.jpg': { category: 'image', mime: 'image/jpeg' },
  '.jpeg': { category: 'image', mime: 'image/jpeg' },
  '.jfif': { category: 'image', mime: 'image/jpeg' },
  '.webp': { category: 'image', mime: 'image/webp' },
  '.gif': { category: 'image', mime: 'image/gif' },
  '.bmp': { category: 'image', mime: 'image/bmp' },
  '.ico': { category: 'image', mime: 'image/x-icon' },
  '.avif': { category: 'image', mime: 'image/avif' },
  '.svg': { category: 'image', mime: 'image/svg+xml' },
  '.tif': { category: 'image', mime: 'image/tiff' },
  '.tiff': { category: 'image', mime: 'image/tiff' },
  '.heic': { category: 'image', mime: 'image/heic' },
  '.heif': { category: 'image', mime: 'image/heif' },
  '.psd': { category: 'image', mime: 'image/vnd.adobe.photoshop' },

  // Videos
  '.mp4': { category: 'video', mime: 'video/mp4' },
  '.m4v': { category: 'video', mime: 'video/mp4' },
  '.webm': { category: 'video', mime: 'video/webm' },
  '.mov': { category: 'video', mime: 'video/quicktime' },
  '.mkv': { category: 'video', mime: 'video/x-matroska' },
  '.avi': { category: 'video', mime: 'video/x-msvideo' },
  '.wmv': { category: 'video', mime: 'video/x-ms-wmv' },
  '.flv': { category: 'video', mime: 'video/x-flv' },

  // Audio
  '.mp3': { category: 'audio', mime: 'audio/mpeg' },
  '.wav': { category: 'audio', mime: 'audio/wav' },
  '.ogg': { category: 'audio', mime: 'audio/ogg' },
  '.flac': { category: 'audio', mime: 'audio/flac' },
  '.m4a': { category: 'audio', mime: 'audio/mp4' },
  '.aac': { category: 'audio', mime: 'audio/aac' },
  '.wma': { category: 'audio', mime: 'audio/x-ms-wma' },

  // Documents
  '.pdf': { category: 'document', mime: 'application/pdf' },
  '.doc': { category: 'document', mime: 'application/msword' },
  '.docx': {
    category: 'document',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  '.xls': { category: 'document', mime: 'application/vnd.ms-excel' },
  '.xlsx': {
    category: 'document',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  '.ppt': { category: 'document', mime: 'application/vnd.ms-powerpoint' },
  '.pptx': {
    category: 'document',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  },
  '.txt': { category: 'document', mime: 'text/plain' },
  '.md': { category: 'document', mime: 'text/markdown' },
  '.mdx': { category: 'document', mime: 'text/markdown' },
  '.rtf': { category: 'document', mime: 'application/rtf' },
  '.csv': { category: 'document', mime: 'text/csv' },
  '.log': { category: 'document', mime: 'text/plain' },

  // Code / Config
  '.ts': { category: 'code', mime: 'text/typescript' },
  '.tsx': { category: 'code', mime: 'text/tsx' },
  '.js': { category: 'code', mime: 'text/javascript' },
  '.jsx': { category: 'code', mime: 'text/jsx' },
  '.mjs': { category: 'code', mime: 'text/javascript' },
  '.cjs': { category: 'code', mime: 'text/javascript' },
  '.json': { category: 'code', mime: 'application/json' },
  '.jsonc': { category: 'code', mime: 'application/json' },
  '.yaml': { category: 'code', mime: 'application/yaml' },
  '.yml': { category: 'code', mime: 'application/yaml' },
  '.toml': { category: 'code', mime: 'application/toml' },
  '.xml': { category: 'code', mime: 'application/xml' },
  '.html': { category: 'code', mime: 'text/html' },
  '.htm': { category: 'code', mime: 'text/html' },
  '.css': { category: 'code', mime: 'text/css' },
  '.scss': { category: 'code', mime: 'text/x-scss' },
  '.py': { category: 'code', mime: 'text/x-python' },
  '.rs': { category: 'code', mime: 'text/x-rust' },
  '.go': { category: 'code', mime: 'text/x-go' },
  '.java': { category: 'code', mime: 'text/x-java-source' },
  '.c': { category: 'code', mime: 'text/x-c' },
  '.cpp': { category: 'code', mime: 'text/x-c++src' },
  '.h': { category: 'code', mime: 'text/x-chdr' },
  '.cs': { category: 'code', mime: 'text/x-csharp' },
  '.sh': { category: 'code', mime: 'application/x-sh' },
  '.ps1': { category: 'code', mime: 'text/plain' },
  '.sql': { category: 'code', mime: 'application/sql' },
  '.ini': { category: 'code', mime: 'text/plain' },
  '.env': { category: 'code', mime: 'text/plain' },

  // Archives
  '.zip': { category: 'archive', mime: 'application/zip' },
  '.rar': { category: 'archive', mime: 'application/vnd.rar' },
  '.7z': { category: 'archive', mime: 'application/x-7z-compressed' },
  '.tar': { category: 'archive', mime: 'application/x-tar' },
  '.gz': { category: 'archive', mime: 'application/gzip' },
  '.bz2': { category: 'archive', mime: 'application/x-bzip2' },
  '.xz': { category: 'archive', mime: 'application/x-xz' },
}

const TEXT_PREVIEW_EXTS = new Set([
  '.txt',
  '.md',
  '.mdx',
  '.csv',
  '.log',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.py',
  '.rs',
  '.go',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.cs',
  '.sh',
  '.ps1',
  '.sql',
  '.ini',
  '.env',
  '.svg',
])

const STREAMABLE_MEDIA_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.jfif',
  '.webp',
  '.gif',
  '.bmp',
  '.ico',
  '.avif',
  '.svg',
  '.mp4',
  '.m4v',
  '.webm',
  '.mov',
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.m4a',
  '.aac',
])

const WINDOWS_THUMB_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.jfif',
  '.webp',
  '.gif',
  '.bmp',
  '.ico',
  '.avif',
  '.svg',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
  '.psd',
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
  '.exe',
  '.lnk',
])

export function classifyFile(
  fileName: string,
  isDir: boolean,
): { readonly ext: string; readonly category: FileCategory; readonly mime: string; readonly thumbSupported: boolean } {
  if (isDir) {
    return {
      ext: '',
      category: 'folder',
      mime: 'inode/directory',
      thumbSupported: true,
    }
  }
  const ext = path.extname(fileName).toLowerCase()
  const known = EXT_MAP[ext]
  return {
    ext,
    category: known?.category ?? 'other',
    mime: known?.mime ?? 'application/octet-stream',
    thumbSupported: WINDOWS_THUMB_EXTS.has(ext),
  }
}

export function isTextPreviewable(ext: string): boolean {
  return TEXT_PREVIEW_EXTS.has(ext.toLowerCase())
}

export function isStreamableMediaExt(ext: string): boolean {
  return STREAMABLE_MEDIA_EXTS.has(ext.toLowerCase())
}

export function isHiddenName(name: string): boolean {
  return name.startsWith('.')
}

export function normalizeBrowsePath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''
  // Normalize bare Windows drive letters like "C:" -> "C:\"
  if (/^[a-zA-Z]:$/.test(trimmed)) {
    return `${trimmed.toUpperCase()}\\`
  }
  const resolved = path.resolve(trimmed)
  // Uppercase Windows drive letter for consistent comparisons
  if (/^[a-z]:\\/.test(resolved)) {
    return `${resolved[0].toUpperCase()}${resolved.slice(1)}`
  }
  return resolved
}

export function getParentPath(dirPath: string): string | null {
  const normalized = normalizeBrowsePath(dirPath)
  if (!normalized) return null
  const parsed = path.parse(normalized)
  if (parsed.root === normalized) return null
  const parent = path.dirname(normalized)
  if (!parent || parent === normalized) return null
  return normalizeBrowsePath(parent)
}

export function buildBreadcrumbs(dirPath: string): BreadcrumbItem[] {
  const normalized = normalizeBrowsePath(dirPath)
  if (!normalized) return []
  const parsed = path.parse(normalized)
  const root = parsed.root
  const crumbs: BreadcrumbItem[] = []

  if (root) {
    const rootLabel = root.endsWith('\\') && root.length === 3 ? root.slice(0, 2) : root
    crumbs.push({ name: rootLabel, path: root })
  }

  const rest = normalized.slice(root.length)
  if (!rest) return crumbs

  const parts = rest.split(/[\\/]+/).filter(Boolean)
  let acc = root
  for (const part of parts) {
    acc = path.join(acc, part)
    crumbs.push({ name: part, path: normalizeBrowsePath(acc) })
  }
  return crumbs
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
