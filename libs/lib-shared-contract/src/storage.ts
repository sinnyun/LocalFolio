import type { z } from 'zod'

export interface DirEntryInfo {
  readonly name: string
  readonly path: string
  readonly isDirectory: boolean
}

/**
 * Filesystem Seam Definition.
 * Resolved via DSH `ctx.fs` when available, with a local atomic Node fs fallback.
 */
export interface FsSeam {
  readonly provider: 'dsh-ctx-fs' | 'local-node-fs'
  readText(filePath: string): Promise<string | null>
  writeText(filePath: string, content: string): Promise<void>
  exists(filePath: string): Promise<boolean>
  listDir(dirPath: string): Promise<readonly DirEntryInfo[]>
  remove(filePath: string): Promise<void>
}

export interface JsonStore<T> {
  readonly filePath: string
  read(): Promise<T>
  write(data: T): Promise<T>
  update(updater: (current: T) => T): Promise<T>
}

/**
 * Per-plugin isolated storage slice allocated by `@folio/core-host-storage`:
 *   %LOCALAPPDATA%/LocalFolio/plugins/<pluginId>/{data,cache}/
 */
export interface PluginStorageNamespace {
  readonly pluginId: string
  readonly rootDir: string
  readonly dataDir: string
  readonly cacheDir: string
  readonly fs: FsSeam
  dataPath(...segments: string[]): string
  cachePath(...segments: string[]): string
  jsonStore<T>(
    relativeFile: string,
    schema: z.ZodType<T>,
    defaultValue: () => T,
  ): JsonStore<T>
}

/**
 * Host Cordis service (`ctx.folioStorage`) provided by `@folio/core-host-storage`.
 */
export interface FolioStorageService {
  readonly rootDir: string
  readonly sharedDir: string
  readonly pluginsDir: string
  readonly fs: FsSeam
  sharedPath(...segments: string[]): string
  sharedJsonStore<T>(
    relativeFile: string,
    schema: z.ZodType<T>,
    defaultValue: () => T,
  ): JsonStore<T>
  /** Allocate an isolated storage namespace belonging strictly to `pluginId`. */
  forPlugin(pluginId: string): PluginStorageNamespace
  listRegisteredPlugins(): readonly string[]
}
