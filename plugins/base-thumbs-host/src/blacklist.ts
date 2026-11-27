import path from 'node:path'

/**
 * L0 built-in misc blacklist: pure text, config, source code, logs, temp files,
 * and system executables that should be marked `IGNORED` immediately and never
 * enter the `MISSING` backlog or trigger Eagle.
 */
export const DEFAULT_IGNORED_EXTS = [
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
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.npmrc',
  '.nvmrc',
  '.ds_store',
] as const

export const DEFAULT_IGNORED_EXT_SET: ReadonlySet<string> = new Set(DEFAULT_IGNORED_EXTS)

/**
 * Heavy design file extensions that may hang or OOM WIC / Shell when oversized.
 * Files matching these extensions above `HEAVY_DESIGN_AVOID_BYTES` are bypassed
 * by L1a/L1b and handed directly to L2 specialized providers.
 */
export const HEAVY_DESIGN_EXT_SET: ReadonlySet<string> = new Set([
  '.psd',
  '.psb',
  '.tif',
  '.tiff',
])

export const HEAVY_DESIGN_AVOID_BYTES = 200 * 1024 * 1024 // 200 MB

export function normalizeExt(filePathOrExt: string): string {
  const trimmed = filePathOrExt.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('.') && !trimmed.includes('/') && !trimmed.includes('\\')) {
    return trimmed.toLowerCase()
  }
  return path.extname(trimmed).toLowerCase()
}

export function isIgnoredThumbExt(
  filePathOrExt: string,
  extraIgnored?: ReadonlySet<string>,
): boolean {
  const ext = normalizeExt(filePathOrExt)
  if (!ext) return true
  if (DEFAULT_IGNORED_EXT_SET.has(ext)) return true
  if (extraIgnored && extraIgnored.has(ext)) return true
  return false
}

export function shouldAvoidHeavyInFastLayer(
  ext: string,
  fileSize?: number,
  thresholdBytes = HEAVY_DESIGN_AVOID_BYTES,
): boolean {
  if (typeof fileSize !== 'number' || !Number.isFinite(fileSize)) return false
  return HEAVY_DESIGN_EXT_SET.has(ext.toLowerCase()) && fileSize > thresholdBytes
}
