export type GeneratedThumbMime = 'image/jpeg' | 'image/png' | 'image/svg+xml' | 'image/webp'

export interface ThumbGenerateRequest {
  readonly filePath: string
  readonly ext: string
  readonly maxDim: number
  readonly preferPng?: boolean
  readonly signal?: AbortSignal
}

export interface GeneratedThumbResult {
  readonly buffer: Buffer
  readonly mime: GeneratedThumbMime
  readonly providerId: string
}

export interface ThumbGeneratorProvider {
  readonly id: string
  readonly title?: string
  /** Lowercased extensions like `.png`, `.psd`, `.blend`, or `'*'` as catch-all. */
  readonly extensions: readonly string[]
  /** Lower priority runs earlier. Defaults to 100. */
  readonly priority?: number
  canHandle?(req: ThumbGenerateRequest): boolean
  generate(req: ThumbGenerateRequest): Promise<Omit<GeneratedThumbResult, 'providerId'> | null>
}

export interface ThumbProviderInfo {
  readonly id: string
  readonly title: string
  readonly extensions: readonly string[]
  readonly priority: number
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
  isSupported(filePathOrName: string): boolean
  generate(options: {
    readonly filePath: string
    readonly maxDim?: number
    readonly preferPng?: boolean
    readonly signal?: AbortSignal
  }): Promise<GeneratedThumbResult | null>
}
