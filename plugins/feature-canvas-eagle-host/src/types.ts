export interface EagleFolderSource {
  readonly id: string
  readonly name: string
}

export interface EagleImageSource {
  readonly itemId: string
  readonly apiUrl: string
  readonly name: string
  readonly ext: string
  readonly size: number
  readonly originalPath: string
  readonly originalUri: string
  readonly thumbnailPath: string
  readonly folders: readonly EagleFolderSource[]
}

export interface EaglePathResolveEntry {
  readonly path: string
  readonly source: EagleImageSource | null
  readonly error?: string
}

export interface EagleOpenItemResult {
  readonly itemId: string
  readonly deepLink: string
  readonly durationMs: number
  readonly strippedElectronRunAsNode: boolean
}
