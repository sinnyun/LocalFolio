import crypto from 'node:crypto'
import path from 'node:path'
import type { FileCategory } from './types.js'

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
  '.raw': { category: 'image', mime: 'image/x-raw' },
  '.dng': { category: 'image', mime: 'image/x-adobe-dng' },

  // Design / DCC / Creative projects
  '.psd': { category: 'design', mime: 'image/vnd.adobe.photoshop' },
  '.psb': { category: 'design', mime: 'image/vnd.adobe.photoshop' },
  '.ai': { category: 'design', mime: 'application/illustrator' },
  '.eps': { category: 'design', mime: 'application/postscript' },
  '.fig': { category: 'design', mime: 'application/octet-stream' },
  '.sketch': { category: 'design', mime: 'application/octet-stream' },
  '.xd': { category: 'design', mime: 'application/octet-stream' },
  '.cdr': { category: 'design', mime: 'application/cdr' },
  '.indd': { category: 'design', mime: 'application/x-indesign' },
  '.prproj': { category: 'design', mime: 'application/octet-stream' },
  '.aep': { category: 'design', mime: 'application/octet-stream' },
  '.blend': { category: 'design', mime: 'application/x-blender' },
  '.c4d': { category: 'design', mime: 'application/octet-stream' },
  '.max': { category: 'design', mime: 'application/octet-stream' },
  '.fbx': { category: 'design', mime: 'application/octet-stream' },
  '.obj': { category: 'design', mime: 'text/plain' },
  '.glb': { category: 'design', mime: 'model/gltf-binary' },
  '.gltf': { category: 'design', mime: 'model/gltf+json' },
  '.vectorcraft': { category: 'design', mime: 'application/json' },

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

  // Code
  '.ts': { category: 'code', mime: 'text/typescript' },
  '.tsx': { category: 'code', mime: 'text/tsx' },
  '.js': { category: 'code', mime: 'text/javascript' },
  '.jsx': { category: 'code', mime: 'text/jsx' },
  '.mjs': { category: 'code', mime: 'text/javascript' },
  '.cjs': { category: 'code', mime: 'text/javascript' },
  '.json': { category: 'code', mime: 'application/json' },
  '.yaml': { category: 'code', mime: 'application/yaml' },
  '.yml': { category: 'code', mime: 'application/yaml' },
  '.toml': { category: 'code', mime: 'application/toml' },
  '.xml': { category: 'code', mime: 'application/xml' },
  '.html': { category: 'code', mime: 'text/html' },
  '.htm': { category: 'code', mime: 'text/html' },
  '.css': { category: 'code', mime: 'text/css' },
  '.py': { category: 'code', mime: 'text/x-python' },
  '.rs': { category: 'code', mime: 'text/x-rust' },
  '.go': { category: 'code', mime: 'text/x-go' },

  // Archives
  '.zip': { category: 'archive', mime: 'application/zip' },
  '.rar': { category: 'archive', mime: 'application/vnd.rar' },
  '.7z': { category: 'archive', mime: 'application/x-7z-compressed' },
  '.tar': { category: 'archive', mime: 'application/x-tar' },
  '.gz': { category: 'archive', mime: 'application/gzip' },
  '.zpaq': { category: 'archive', mime: 'application/octet-stream' },
}

/**
 * L0 misc blacklist mirrored for worker-thread project scanning:
 * plain text, config, source code, logs, temp files, and executables
 * are excluded from thumbnail generation; all other extensions are
 * Try-First eligible (automatically covering .cdr, .blend, .max, etc.).
 */
const THUMB_IGNORED_EXTS = new Set([
  '.txt',
  '.md',
  '.mdx',
  '.rtf',
  '.csv',
  '.tsv',
  '.json',
  '.jsonc',
  '.json5',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.ini',
  '.cfg',
  '.conf',
  '.env',
  '.properties',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.wal',
  '.shm',
  '.log',
  '.tmp',
  '.temp',
  '.bak',
  '.swp',
  '.swo',
  '.part',
  '.crdownload',
  '.lnk',
  '.url',
  '.desktop',
  '.exe',
  '.dll',
  '.sys',
  '.drv',
  '.ocx',
  '.com',
  '.msi',
  '.msu',
  '.bat',
  '.cmd',
  '.ps1',
  '.psm1',
  '.psd1',
  '.vbs',
  '.wsf',
  '.sh',
  '.bash',
  '.zsh',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.html',
  '.htm',
  '.xhtml',
  '.map',
  '.lock',
  '.py',
  '.pyc',
  '.pyo',
  '.rs',
  '.go',
  '.java',
  '.class',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cc',
  '.cs',
  '.php',
  '.rb',
  '.lua',
  '.sql',
])

const ALPHA_EXTS = new Set(['.png', '.webp', '.gif', '.ico', '.svg', '.psd', '.psb'])

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

export const META_DIR_NAME = '.folio-meta'

const IGNORED_NAMES = new Set([
  META_DIR_NAME.toLowerCase(),
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
  '$recycle.bin',
  'system volume information',
  '__pycache__',
  '.next',
  '.nuxt',
  '.turbo',
])

export function classifyProjectFile(
  fileName: string,
  supportedThumbExts?: ReadonlySet<string>,
): {
  readonly ext: string
  readonly category: FileCategory
  readonly mime: string
  readonly thumbSupported: boolean
} {
  const ext = path.extname(fileName).toLowerCase()
  const known = EXT_MAP[ext]
  const explicitlySupported = Boolean(supportedThumbExts && supportedThumbExts.has(ext))
  const thumbSupported = Boolean(ext) && (explicitlySupported || !THUMB_IGNORED_EXTS.has(ext))
  return {
    ext,
    category: known?.category ?? 'other',
    mime: known?.mime ?? 'application/octet-stream',
    thumbSupported,
  }
}

export function isIgnoredEntryName(name: string, isDirectory: boolean): boolean {
  const lower = name.toLowerCase()
  if (IGNORED_NAMES.has(lower)) return true
  if (lower.startsWith('~$') || lower.endsWith('.tmp')) return true
  if (isDirectory && name.startsWith('.')) return true
  return false
}

export function isAlphaThumbExt(ext: string): boolean {
  return ALPHA_EXTS.has(ext.toLowerCase())
}

export function isStreamableMediaExt(ext: string): boolean {
  return STREAMABLE_MEDIA_EXTS.has(ext.toLowerCase())
}

export function normalizeProjectPath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.includes('\0')) return ''
  if (/^[a-zA-Z]:$/.test(trimmed)) {
    return `${trimmed.toUpperCase()}\\`
  }
  const resolved = path.resolve(trimmed)
  if (/^[a-z]:\\/.test(resolved)) {
    return `${resolved[0].toUpperCase()}${resolved.slice(1)}`
  }
  return resolved
}

export function isPathInside(rootDir: string, candidatePath: string): boolean {
  const normRoot = normalizeProjectPath(rootDir)
  const normCand = normalizeProjectPath(candidatePath)
  if (!normRoot || !normCand) return false
  const rel =
    process.platform === 'win32'
      ? path.relative(normRoot.toLowerCase(), normCand.toLowerCase())
      : path.relative(normRoot, normCand)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

export function toPosixRelPath(relPath: string): string {
  return relPath.split(path.sep).join('/')
}

export function computeProjectId(projectPath: string): string {
  const norm = normalizeProjectPath(projectPath).toLowerCase()
  return `prj_${crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16)}`
}

export function computeLibraryId(rootPath: string): string {
  const norm = normalizeProjectPath(rootPath).toLowerCase()
  return `lib_${crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16)}`
}

export function makeFingerprint(size: number, mtimeMs: number): string {
  return `${size}:${Math.trunc(mtimeMs)}`
}

export function computeThumbKey(relPath: string, fingerprint: string): string {
  return crypto
    .createHash('sha256')
    .update(`${relPath.toLowerCase()}|${fingerprint}`)
    .digest('hex')
    .slice(0, 24)
}

export function sanitizeFileNameSegment(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  return cleaned || 'item'
}

export function buildCoverFileName(projectName: string): string {
  return `${sanitizeFileNameSegment(projectName)}-封面.jpg`
}

export function buildArchiveFileName(projectName: string): string {
  return `${sanitizeFileNameSegment(projectName)}.zpaq`
}

function shortenFileNameMiddle(fileName: string, maxLen: number): string {
  if (fileName.length <= maxLen) return fileName
  if (maxLen <= 12) return fileName.slice(0, maxLen)
  const headLen = Math.max(8, Math.floor((maxLen - 1) * 0.68))
  const tailLen = Math.max(3, maxLen - headLen - 1)
  return `${fileName.slice(0, headLen)}~${fileName.slice(-tailLen)}`
}

export function buildReadableThumbRelPath(
  relPath: string,
  thumbKey: string,
  ext: 'jpg' | 'png' | 'webp',
  projectPath?: string,
): string {
  const posixRel = toPosixRelPath(relPath)
  const slashIdx = posixRel.lastIndexOf('/')
  const folderRel = slashIdx > 0 ? posixRel.slice(0, slashIdx) : ''
  const rawBaseName = slashIdx >= 0 ? posixRel.slice(slashIdx + 1) : posixRel
  const cleanBase = sanitizeFileNameSegment(rawBaseName)
  const shortKey = thumbKey.slice(0, 8)
  const suffix = `__${shortKey}.${ext}`
  const thumbFile = `${cleanBase}${suffix}`
  const candidate = folderRel ? `${folderRel}/${thumbFile}` : thumbFile

  const winPrefixLen = projectPath
    ? path.join(projectPath, META_DIR_NAME, 'thumbs').length + 1
    : 0
  const maxRelLen = winPrefixLen > 0 ? Math.max(48, 235 - winPrefixLen) : 160

  if (candidate.length <= maxRelLen && thumbFile.length <= 120) {
    return candidate
  }

  const maxNameChars = Math.max(16, Math.min(80, maxRelLen - (folderRel ? folderRel.length + 1 : 0) - suffix.length))
  const shortenedInFolder = `${shortenFileNameMiddle(cleanBase, maxNameChars)}${suffix}`
  const inFolderCandidate = folderRel ? `${folderRel}/${shortenedInFolder}` : shortenedInFolder
  if (inFolderCandidate.length <= maxRelLen) {
    return inFolderCandidate
  }

  const flatMaxName = Math.max(16, Math.min(80, maxRelLen - suffix.length))
  return `${shortenFileNameMiddle(cleanBase, flatMaxName)}${suffix}`
}
