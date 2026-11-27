import type { TaskActivityOptions } from './tasks.js'

export type GeneratedThumbMime = 'image/jpeg' | 'image/png' | 'image/svg+xml' | 'image/webp'

export type ThumbIndexStatus = 'READY' | 'MISSING' | 'IGNORED' | 'FAILED_EAGLE'

export type ThumbQueueType = 'fast' | 'heavy' | 'eagle'

export interface ThumbGenerateRequest {
  readonly filePath: string
  readonly ext: string
  readonly maxDim: number
  readonly fileSize?: number
  readonly mtimeMs?: number
  readonly preferPng?: boolean
  readonly signal?: AbortSignal
}

export interface GeneratedThumbResult {
  readonly buffer: Buffer
  readonly mime: GeneratedThumbMime
  readonly providerId: string
  readonly cachePath?: string | null
}

export interface ThumbGeneratorProvider {
  readonly id: string
  readonly title?: string
  /** Lowercased extensions like `.png`, `.psd`, `.blend`, or `'*'` as catch-all. */
  readonly extensions: readonly string[]
  /** Lower priority runs earlier. Defaults to 100. */
  readonly priority?: number
  /** Concurrency lane for this provider. Defaults to `'fast'`. */
  readonly queueType?: ThumbQueueType
  /** When true, this provider is strictly isolated from automatic generation (e.g. L3 Eagle). */
  readonly manualOnly?: boolean
  canHandle?(req: ThumbGenerateRequest): boolean
  generate(req: ThumbGenerateRequest): Promise<Omit<GeneratedThumbResult, 'providerId'> | null>
}

export interface ThumbProviderInfo {
  readonly id: string
  readonly title: string
  readonly extensions: readonly string[]
  readonly priority: number
  readonly queueType: ThumbQueueType
  readonly manualOnly: boolean
}

export interface ThumbStatusEntry {
  readonly filePath: string
  readonly status: ThumbIndexStatus
  readonly providerId: string | null
  readonly cachePath: string | null
  readonly mime: GeneratedThumbMime | null
  readonly ext: string
  readonly fileSize: number
  readonly updatedAt: number
}

export interface ThumbAutoBatchResult {
  readonly ready: readonly ThumbStatusEntry[]
  readonly missing: readonly ThumbStatusEntry[]
  readonly ignored: readonly ThumbStatusEntry[]
}

export interface ThumbCacheStats {
  readonly entryCount: number
  readonly readyCount: number
  readonly missingCount: number
  readonly ignoredCount: number
  readonly failedEagleCount: number
  readonly cacheFileCount: number
  readonly cacheBytes: number
  readonly storageBackend: 'node-sqlite' | 'json-store' | 'memory'
}

export interface ThumbExternalToolInfo {
  readonly id: 'magick' | 'ffmpeg'
  readonly available: boolean
  readonly binaryPath: string | null
  readonly version: string | null
  readonly source: 'configured' | 'managed' | 'system' | 'missing'
}

/**
 * Extensible thumbnail generation capability (`ctx.folioThumbs`),
 * provided by `@folio/base-thumbs-host`.
 * Other plugins can register new format providers via `registerProvider()`.
 */
export interface FolioThumbsService {
  registerProvider(provider: ThumbGeneratorProvider): () => void
  listProviders(): readonly ThumbProviderInfo[]
  listSupportedExtensions(): readonly string[]
  listIgnoredExtensions(): readonly string[]
  isIgnored(filePathOrName: string): boolean
  isSupported(filePathOrName: string): boolean
  generate(options: {
    readonly filePath: string
    readonly maxDim?: number
    readonly preferPng?: boolean
    readonly force?: boolean
    readonly transient?: boolean
    readonly signal?: AbortSignal
    readonly activity?: Omit<TaskActivityOptions<unknown>, 'isSuccessful' | 'signal'>
  }): Promise<GeneratedThumbResult | null>
  generateAutoBatch(
    filePaths: readonly string[],
    options?: {
      readonly maxDim?: number
      readonly preferPng?: boolean
      readonly force?: boolean
      readonly signal?: AbortSignal
      readonly onProgress?: (current: number, total: number, filePath: string) => void
    },
  ): Promise<ThumbAutoBatchResult>
  queryStatus(filePaths: readonly string[]): Promise<readonly ThumbStatusEntry[]>
  generateManual(options: {
    readonly providerId: string
    readonly filePaths: readonly string[]
    readonly maxDim?: number
    readonly preferPng?: boolean
    readonly signal?: AbortSignal
    readonly onProgress?: (current: number, total: number, filePath: string) => void
  }): Promise<readonly ThumbStatusEntry[]>
  getCacheStats(): Promise<ThumbCacheStats>
  clearCache(): Promise<{ readonly removedFiles: number; readonly clearedEntries: number }>
}
