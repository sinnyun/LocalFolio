import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { FolioError } from '@folio/lib-shared-contract'

/**
 * Resolve LocalFolio's root storage directory.
 * Defaults to `%LOCALAPPDATA%/LocalFolio` on Windows (or `LOCALFOLIO_DATA_DIR` override).
 * Never writes into DSH's `~/.dsh/storages/workspace.json` or session directories.
 */
export function resolveFolioDataRoot(override?: string): string {
  const explicit = override?.trim() || process.env.LOCALFOLIO_DATA_DIR?.trim()
  if (explicit) return path.resolve(explicit)
  if (process.platform === 'win32') {
    const localAppData =
      process.env.LOCALAPPDATA?.trim() || path.join(os.homedir(), 'AppData', 'Local')
    return path.join(localAppData, 'LocalFolio')
  }
  const xdgDataHome =
    process.env.XDG_DATA_HOME?.trim() || path.join(os.homedir(), '.local', 'share')
  return path.join(xdgDataHome, 'LocalFolio')
}

export function normalizePluginId(pluginId: string): string {
  const cleaned = pluginId.trim().replace(/^@[^/]+\//, '')
  if (!/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(cleaned)) {
    throw new FolioError('invalid_plugin_id', `非法的插件存储标识: ${pluginId}`, 400)
  }
  return cleaned
}

export function resolveSafeChildPath(baseDir: string, segments: readonly string[]): string {
  const resolvedBase = path.resolve(baseDir)
  const target = path.resolve(resolvedBase, ...segments)
  const rel = path.relative(resolvedBase, target)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new FolioError('path_escape', `禁止越界访问插件目录之外的路径: ${segments.join('/')}`, 400)
  }
  return target
}

export function ensureDirSync(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}
