import { execFile } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import type {
  JsonStore,
  PluginStorageNamespace,
  ThumbExternalToolInfo,
} from '@folio/base-contract'

const execFileAsync = promisify(execFile)

export const ThumbToolsSettingsSchema = z.object({
  magickPath: z.string().default(''),
  ffmpegPath: z.string().default(''),
  heavyAvoidMb: z.number().min(10).max(4096).default(200),
})

export type ThumbToolsSettings = z.infer<typeof ThumbToolsSettingsSchema>

export interface ThumbToolRegistry {
  getSettings(): Promise<ThumbToolsSettings>
  updateSettings(patch: Partial<ThumbToolsSettings>): Promise<ThumbToolsSettings>
  detectTool(id: 'magick' | 'ffmpeg', forceRefresh?: boolean): Promise<ThumbExternalToolInfo>
  detectAll(forceRefresh?: boolean): Promise<readonly ThumbExternalToolInfo[]>
  getCachedBinaryPath(id: 'magick' | 'ffmpeg'): string | null
  resolveSrgbProfilePath(): string | null
}

function getCommonWindowsPaths(id: 'magick' | 'ffmpeg'): string[] {
  if (process.platform !== 'win32') return []
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const localAppData = process.env.LOCALAPPDATA || ''
  const candidates: string[] = []

  if (id === 'magick') {
    try {
      const dirs = fs.readdirSync(programFiles)
      for (const name of dirs) {
        if (/^ImageMagick-7/i.test(name)) {
          candidates.push(path.join(programFiles, name, 'magick.exe'))
        }
      }
    } catch {
      // ignore
    }
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Programs', 'ImageMagick', 'magick.exe'))
    }
    candidates.push('C:\\ImageMagick\\magick.exe')
  } else {
    candidates.push(
      path.join(programFiles, 'ffmpeg', 'bin', 'ffmpeg.exe'),
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
    )
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'))
    }
  }
  return candidates
}

async function probeBinaryVersion(
  binaryPath: string,
  id: 'magick' | 'ffmpeg',
): Promise<string | null> {
  try {
    const args = id === 'magick' ? ['-version'] : ['-version']
    const { stdout, stderr } = await execFileAsync(binaryPath, args, {
      timeout: 3000,
      windowsHide: true,
    })
    const combined = `${stdout ?? ''}\n${stderr ?? ''}`
    if (id === 'magick') {
      const match = /ImageMagick\s+([0-9]+(?:\.[0-9]+)*[^\s]*)/i.exec(combined)
      return match?.[1] ?? 'installed'
    }
    const match = /ffmpeg\s+version\s+([^\s]+)/i.exec(combined)
    return match?.[1] ?? 'installed'
  } catch {
    return null
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const st = await fsp.stat(filePath)
    return st.isFile()
  } catch {
    return false
  }
}

export function createThumbToolRegistry(options?: {
  readonly storage?: PluginStorageNamespace
  readonly srgbProfilePath?: string
}): ThumbToolRegistry {
  const storage = options?.storage
  const settingsStore: JsonStore<ThumbToolsSettings> | null = storage
    ? storage.jsonStore('thumb-tools.json', ThumbToolsSettingsSchema, () => ({
        magickPath: '',
        ffmpegPath: '',
        heavyAvoidMb: 200,
      }))
    : null

  let memSettings: ThumbToolsSettings = {
    magickPath: '',
    ffmpegPath: '',
    heavyAvoidMb: 200,
  }

  const cache = new Map<'magick' | 'ffmpeg', ThumbExternalToolInfo>()

  const getSettings = async (): Promise<ThumbToolsSettings> => {
    if (!settingsStore) return memSettings
    memSettings = await settingsStore.read()
    return memSettings
  }

  const updateSettings = async (
    patch: Partial<ThumbToolsSettings>,
  ): Promise<ThumbToolsSettings> => {
    const current = await getSettings()
    const next = ThumbToolsSettingsSchema.parse({
      ...current,
      ...patch,
    })
    memSettings = next
    if (settingsStore) {
      await settingsStore.write(next)
    }
    cache.clear()
    return next
  }

  const detectTool = async (
    id: 'magick' | 'ffmpeg',
    forceRefresh = false,
  ): Promise<ThumbExternalToolInfo> => {
    if (!forceRefresh) {
      const hit = cache.get(id)
      if (hit) return hit
    }

    const settings = await getSettings()
    const configured = (id === 'magick' ? settings.magickPath : settings.ffmpegPath).trim()
    const exeName = process.platform === 'win32' ? `${id}.exe` : id

    // 1. User configured path
    if (configured && (await fileExists(configured))) {
      const version = await probeBinaryVersion(configured, id)
      if (version) {
        const info: ThumbExternalToolInfo = {
          id,
          available: true,
          binaryPath: configured,
          version,
          source: 'configured',
        }
        cache.set(id, info)
        return info
      }
    }

    // 2. Managed portable tool in plugin data/tools/<id>/
    if (storage) {
      const managedCandidates = [
        storage.dataPath('tools', id, exeName),
        storage.dataPath('tools', id, 'bin', exeName),
      ]
      for (const candidate of managedCandidates) {
        if (await fileExists(candidate)) {
          const version = await probeBinaryVersion(candidate, id)
          if (version) {
            const info: ThumbExternalToolInfo = {
              id,
              available: true,
              binaryPath: candidate,
              version,
              source: 'managed',
            }
            cache.set(id, info)
            return info
          }
        }
      }
    }

    // 3. System PATH (never invoke `convert` on Windows — strictly `magick`)
    const pathVersion = await probeBinaryVersion(id, id)
    if (pathVersion) {
      const info: ThumbExternalToolInfo = {
        id,
        available: true,
        binaryPath: id,
        version: pathVersion,
        source: 'system',
      }
      cache.set(id, info)
      return info
    }

    // 4. Common Windows installation paths
    for (const candidate of getCommonWindowsPaths(id)) {
      if (await fileExists(candidate)) {
        const version = await probeBinaryVersion(candidate, id)
        if (version) {
          const info: ThumbExternalToolInfo = {
            id,
            available: true,
            binaryPath: candidate,
            version,
            source: 'system',
          }
          cache.set(id, info)
          return info
        }
      }
    }

    const missing: ThumbExternalToolInfo = {
      id,
      available: false,
      binaryPath: null,
      version: null,
      source: 'missing',
    }
    cache.set(id, missing)
    return missing
  }

  const resolveSrgbProfilePath = (): string | null => {
    if (options?.srgbProfilePath && fs.existsSync(options.srgbProfilePath)) {
      return options.srgbProfilePath
    }
    const candidates = [
      path.resolve(__dirname, '../assets/sRGB.icc'),
      path.resolve(__dirname, '../../assets/sRGB.icc'),
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) return c
    }
    return null
  }

  return {
    getSettings,
    updateSettings,
    detectTool,
    async detectAll(forceRefresh = false): Promise<readonly ThumbExternalToolInfo[]> {
      const [magick, ffmpeg] = await Promise.all([
        detectTool('magick', forceRefresh),
        detectTool('ffmpeg', forceRefresh),
      ])
      return [magick, ffmpeg]
    },
    getCachedBinaryPath(id: 'magick' | 'ffmpeg'): string | null {
      const hit = cache.get(id)
      return hit?.available ? hit.binaryPath : null
    },
    resolveSrgbProfilePath,
  }
}
