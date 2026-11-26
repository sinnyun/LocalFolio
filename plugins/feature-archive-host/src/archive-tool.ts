import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { FolioError, type PluginStorageNamespace } from '@folio/base-contract'
import {
  ArchiveSettingsSchema,
  type ArchiveCacheStats,
  type ArchiveSettings,
  type ArchiveToolStatus,
} from './types.js'

const execFileAsync = promisify(execFile)

const GITHUB_RELEASES_API = 'https://api.github.com/repos/fcorbelli/zpaqfranz/releases?per_page=8'
const MIN_BINARY_BYTES = 40 * 1024

interface GitHubReleaseAsset {
  readonly name?: string
  readonly browser_download_url?: string
  readonly size?: number
}

interface GitHubReleaseEntry {
  readonly tag_name?: string
  readonly prerelease?: boolean
  readonly draft?: boolean
  readonly assets?: readonly GitHubReleaseAsset[]
}

export interface DownloadProgressInfo {
  readonly current: number
  readonly total: number | null
  readonly message: string
}

async function isValidPeExecutable(filePath: string): Promise<boolean> {
  try {
    const st = await fsp.stat(filePath)
    if (!st.isFile() || st.size < MIN_BINARY_BYTES) return false
    const handle = await fsp.open(filePath, 'r')
    try {
      const header = Buffer.allocUnsafe(2)
      const { bytesRead } = await handle.read(header, 0, 2, 0)
      return bytesRead === 2 && header[0] === 0x4d && header[1] === 0x5a
    } finally {
      await handle.close().catch(() => {})
    }
  } catch {
    return false
  }
}

export async function detectZpaqfranzVersion(binaryPath: string): Promise<string | null> {
  if (!(await isValidPeExecutable(binaryPath))) {
    if (process.platform === 'win32') return null
    try {
      const st = await fsp.stat(binaryPath)
      if (!st.isFile()) return null
    } catch {
      return null
    }
  }

  try {
    const res = await execFileAsync(binaryPath, ['-v'], {
      timeout: 4000,
      windowsHide: true,
    }).catch((err: { stdout?: string; stderr?: string }) => ({
      stdout: err?.stdout ?? '',
      stderr: err?.stderr ?? '',
    }))
    const output = `${res.stdout ?? ''}\n${res.stderr ?? ''}`
    const match = /zpaqfranz\s+v?([0-9]+(?:\.[0-9]+)*[a-z]?)/i.exec(output)
    if (match?.[1]) return match[1]
    return 'installed'
  } catch {
    return 'installed'
  }
}

function applyMirrorPrefix(rawUrl: string, mirrorPrefix: string): string {
  const prefix = mirrorPrefix.trim()
  if (!prefix) return rawUrl
  if (prefix.endsWith('/')) return `${prefix}${rawUrl}`
  return `${prefix}/${rawUrl}`
}

function pickBestWindowsAsset(
  releases: readonly GitHubReleaseEntry[],
): { readonly tag: string; readonly asset: GitHubReleaseAsset } | null {
  for (const rel of releases) {
    if (rel.draft) continue
    const assets = rel.assets ?? []
    const exact64 = assets.find(a => /^zpaqfranz64\.exe$/i.test(a.name ?? ''))
    if (exact64?.browser_download_url) return { tag: rel.tag_name ?? 'latest', asset: exact64 }

    const exact = assets.find(a => /^zpaqfranz\.exe$/i.test(a.name ?? ''))
    if (exact?.browser_download_url) return { tag: rel.tag_name ?? 'latest', asset: exact }

    const anyWin64Exe = assets.find(a => /64.*\.exe$/i.test(a.name ?? ''))
    if (anyWin64Exe?.browser_download_url) {
      return { tag: rel.tag_name ?? 'latest', asset: anyWin64Exe }
    }

    const anyExe = assets.find(a => /\.exe$/i.test(a.name ?? ''))
    if (anyExe?.browser_download_url) return { tag: rel.tag_name ?? 'latest', asset: anyExe }

    const winZip = assets.find(a => /(win|x64|64).*\.zip$/i.test(a.name ?? ''))
    if (winZip?.browser_download_url) return { tag: rel.tag_name ?? 'latest', asset: winZip }
  }
  return null
}

async function computeCacheStats(cacheDir: string): Promise<ArchiveCacheStats> {
  let fileCount = 0
  let totalBytes = 0
  const walk = async (dir: string): Promise<void> => {
    let entries: fs.Dirent[]
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile()) {
        try {
          const st = await fsp.stat(fullPath)
          fileCount += 1
          totalBytes += st.size
        } catch {
          // ignore
        }
      }
    }
  }
  await walk(cacheDir)
  return { fileCount, totalBytes, cacheDir }
}

export async function pruneDirectoryLru(
  rootDir: string,
  maxBytes: number,
  excludePath?: string,
): Promise<{ readonly removedFiles: number; readonly freedBytes: number }> {
  const entries: Array<{ fullPath: string; size: number; mtimeMs: number }> = []
  let totalBytes = 0

  const walk = async (dir: string): Promise<void> => {
    let items: fs.Dirent[]
    try {
      items = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of items) {
      const fullPath = path.join(dir, item.name)
      if (item.isDirectory()) {
        await walk(fullPath)
      } else if (item.isFile()) {
        try {
          const st = await fsp.stat(fullPath)
          totalBytes += st.size
          entries.push({ fullPath, size: st.size, mtimeMs: Math.max(st.atimeMs, st.mtimeMs) })
        } catch {
          // ignore
        }
      }
    }
  }

  await walk(rootDir)
  if (totalBytes <= maxBytes) {
    return { removedFiles: 0, freedBytes: 0 }
  }

  entries.sort((a, b) => a.mtimeMs - b.mtimeMs)
  let removedFiles = 0
  let freedBytes = 0
  const normalizedExclude = excludePath ? path.resolve(excludePath).toLowerCase() : ''

  for (const item of entries) {
    if (totalBytes <= maxBytes) break
    if (normalizedExclude && path.resolve(item.fullPath).toLowerCase() === normalizedExclude) {
      continue
    }
    try {
      await fsp.unlink(item.fullPath)
      totalBytes -= item.size
      freedBytes += item.size
      removedFiles += 1
    } catch {
      // ignore
    }
  }
  return { removedFiles, freedBytes }
}

export interface ArchiveToolManager {
  readonly managedDir: string
  readonly managedBinaryPath: string
  readonly extractCacheDir: string
  getSettings(): Promise<ArchiveSettings>
  updateSettings(patch: Partial<ArchiveSettings>): Promise<ArchiveSettings>
  getStatus(): Promise<ArchiveToolStatus>
  requireActiveBinary(): Promise<string>
  downloadManagedBinary(options?: {
    readonly mirrorPrefix?: string
    readonly directUrl?: string
    readonly signal?: AbortSignal
    readonly onProgress?: (info: DownloadProgressInfo) => void
  }): Promise<ArchiveToolStatus>
  importLocalBinary(sourceExePath: string): Promise<ArchiveToolStatus>
  clearExtractCache(): Promise<ArchiveCacheStats>
  pruneExtractCache(excludePath?: string): Promise<void>
}

export function createArchiveToolManager(storage: PluginStorageNamespace): ArchiveToolManager {
  const managedDir = storage.dataPath('tools', 'zpaqfranz')
  const managedBinaryPath = path.join(managedDir, 'zpaqfranz.exe')
  const extractCacheDir = storage.cachePath('extracted')

  const settingsStore = storage.jsonStore<ArchiveSettings>(
    'archive-settings.json',
    ArchiveSettingsSchema,
    () => ({
      mirrorPrefix: '',
      customBinaryPath: null,
      defaultSourceDisposal: 'recycle',
      extractCacheMaxMb: 512,
      hideMetaDir: true,
    }),
  )

  const getStatus = async (): Promise<ArchiveToolStatus> => {
    const settings = await settingsStore.read()
    const cacheStats = await computeCacheStats(extractCacheDir)

    if (settings.customBinaryPath) {
      const customVer = await detectZpaqfranzVersion(settings.customBinaryPath)
      if (customVer) {
        return {
          installed: true,
          source: 'custom',
          version: customVer,
          binaryPath: settings.customBinaryPath,
          managedDir,
          managedBinaryPath,
          settings,
          cacheStats,
        }
      }
    }

    const managedVer = await detectZpaqfranzVersion(managedBinaryPath)
    if (managedVer) {
      return {
        installed: true,
        source: 'managed',
        version: managedVer,
        binaryPath: managedBinaryPath,
        managedDir,
        managedBinaryPath,
        settings,
        cacheStats,
      }
    }

    return {
      installed: false,
      source: 'none',
      version: null,
      binaryPath: null,
      managedDir,
      managedBinaryPath,
      settings,
      cacheStats,
    }
  }

  return {
    managedDir,
    managedBinaryPath,
    extractCacheDir,

    getSettings: () => settingsStore.read(),

    async updateSettings(patch) {
      return settingsStore.update(curr => ({
        ...curr,
        ...patch,
      }))
    },

    getStatus,

    async requireActiveBinary(): Promise<string> {
      const status = await getStatus()
      if (!status.installed || !status.binaryPath) {
        throw new FolioError(
          'archive_tool_missing',
          '尚未安装 zpaqfranz 归档引擎，请先在「归档设置」中一键下载安装',
          400,
        )
      }
      return status.binaryPath
    },

    async downloadManagedBinary(options = {}): Promise<ArchiveToolStatus> {
      const settings = await settingsStore.read()
      const mirrorPrefix = options.mirrorPrefix ?? settings.mirrorPrefix
      if (options.mirrorPrefix !== undefined && options.mirrorPrefix !== settings.mirrorPrefix) {
        await settingsStore.update(curr => ({ ...curr, mirrorPrefix: options.mirrorPrefix! }))
      }

      options.onProgress?.({ current: 0, total: null, message: '正在获取 zpaqfranz 最新版本信息…' })

      let downloadUrl = options.directUrl?.trim() ?? ''
      let assetName = 'zpaqfranz.exe'
      let releaseTag = 'latest'

      if (!downloadUrl) {
        const apiUrl = applyMirrorPrefix(GITHUB_RELEASES_API, mirrorPrefix)
        const relResp = await fetch(apiUrl, {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'LocalFolio-ArchiveFeature',
          },
          signal: options.signal,
        })
        if (!relResp.ok) {
          throw new FolioError(
            'tool_download_failed',
            `无法访问 GitHub Releases (${relResp.status})，可尝试填写镜像前缀或手动导入本地 exe`,
            502,
          )
        }
        const releases = (await relResp.json()) as GitHubReleaseEntry[]
        const picked = pickBestWindowsAsset(Array.isArray(releases) ? releases : [])
        if (!picked?.asset.browser_download_url) {
          throw new FolioError(
            'tool_asset_not_found',
            '未在 zpaqfranz Release 中找到 Windows 可执行文件',
            404,
          )
        }
        releaseTag = picked.tag
        assetName = picked.asset.name ?? 'zpaqfranz.exe'
        downloadUrl = applyMirrorPrefix(picked.asset.browser_download_url, mirrorPrefix)
      } else {
        assetName = path.basename(new URL(downloadUrl).pathname) || 'zpaqfranz.exe'
      }

      await fsp.mkdir(managedDir, { recursive: true })
      const isZip = assetName.toLowerCase().endsWith('.zip')
      const tmpDownload = path.join(
        managedDir,
        `${assetName}.${crypto.randomUUID().slice(0, 8)}.tmp`,
      )
      const unpackDir = isZip
        ? path.join(managedDir, `.unpack-${crypto.randomUUID().slice(0, 8)}`)
        : null

      try {
        options.onProgress?.({
          current: 0,
          total: null,
          message: `正在下载 ${assetName} (${releaseTag})…`,
        })

        const binResp = await fetch(downloadUrl, {
          headers: { 'User-Agent': 'LocalFolio-ArchiveFeature' },
          signal: options.signal,
        })
        if (!binResp.ok || !binResp.body) {
          throw new FolioError(
            'tool_download_failed',
            `下载失败 (HTTP ${binResp.status})，请检查网络或配置镜像`,
            502,
          )
        }

        const totalHeader = Number(binResp.headers.get('content-length') ?? '0')
        const total = Number.isFinite(totalHeader) && totalHeader > 0 ? totalHeader : null
        const writer = fs.createWriteStream(tmpDownload)
        let received = 0

        try {
          const reader = binResp.body.getReader()
          while (true) {
            if (options.signal?.aborted) {
              throw new FolioError('aborted', '下载已取消', 499)
            }
            const { done, value } = await reader.read()
            if (done) break
            if (value && value.byteLength > 0) {
              received += value.byteLength
              await new Promise<void>((resolve, reject) => {
                writer.write(Buffer.from(value), err => (err ? reject(err) : resolve()))
              })
              options.onProgress?.({
                current: received,
                total,
                message: total
                  ? `下载中 ${Math.round((received / total) * 100)}% (${(received / 1024 / 1024).toFixed(2)} MB)`
                  : `已下载 ${(received / 1024 / 1024).toFixed(2)} MB`,
              })
            }
          }
          await new Promise<void>((resolve, reject) => {
            writer.end((err?: Error | null) => (err ? reject(err) : resolve()))
          })
        } catch (err) {
          writer.destroy()
          throw err
        }

        let extractedExePath = tmpDownload
        if (isZip && unpackDir) {
          options.onProgress?.({ current: received, total, message: '正在解压下载包…' })
          await fsp.mkdir(unpackDir, { recursive: true })
          await execFileAsync(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `Expand-Archive -LiteralPath '${tmpDownload.replace(/'/g, "''")}' -DestinationPath '${unpackDir.replace(/'/g, "''")}' -Force`,
            ],
            { timeout: 30_000, windowsHide: true },
          )
          const candidates = await fsp.readdir(unpackDir, { recursive: true })
          const found = candidates.find(name => /zpaqfranz(?:64)?\.exe$/i.test(String(name)))
          if (!found) {
            throw new FolioError('tool_invalid_archive', '压缩包内未找到 zpaqfranz.exe', 500)
          }
          extractedExePath = path.join(unpackDir, String(found))
        }

        if (!(await isValidPeExecutable(extractedExePath))) {
          throw new FolioError(
            'tool_invalid_binary',
            '下载的文件不是有效的 Windows 可执行程序',
            500,
          )
        }

        const stagedTarget = `${managedBinaryPath}.staged.${crypto.randomUUID().slice(0, 8)}`
        await fsp.copyFile(extractedExePath, stagedTarget)
        await fsp.rename(stagedTarget, managedBinaryPath)

        await settingsStore.update(curr => ({ ...curr, customBinaryPath: null }))
        options.onProgress?.({
          current: total ?? received,
          total: total ?? received,
          message: 'zpaqfranz 安装完成',
        })
        return await getStatus()
      } finally {
        await fsp.unlink(tmpDownload).catch(() => {})
        if (unpackDir) {
          await fsp.rm(unpackDir, { recursive: true, force: true }).catch(() => {})
        }
      }
    },

    async importLocalBinary(sourceExePath: string): Promise<ArchiveToolStatus> {
      const normalized = path.resolve(sourceExePath.trim())
      if (!normalized || !(await isValidPeExecutable(normalized))) {
        throw new FolioError(
          'tool_invalid_binary',
          '所选文件不是有效的 Windows zpaqfranz.exe 可执行文件',
          400,
        )
      }
      await fsp.mkdir(managedDir, { recursive: true })
      const staged = `${managedBinaryPath}.import.${crypto.randomUUID().slice(0, 8)}`
      await fsp.copyFile(normalized, staged)
      await fsp.rename(staged, managedBinaryPath)
      await settingsStore.update(curr => ({ ...curr, customBinaryPath: null }))
      return getStatus()
    },

    async clearExtractCache(): Promise<ArchiveCacheStats> {
      await fsp.rm(extractCacheDir, { recursive: true, force: true }).catch(() => {})
      return computeCacheStats(extractCacheDir)
    },

    async pruneExtractCache(excludePath?: string): Promise<void> {
      const settings = await settingsStore.read()
      const maxBytes = settings.extractCacheMaxMb * 1024 * 1024
      await pruneDirectoryLru(extractCacheDir, maxBytes, excludePath)
    },
  }
}
