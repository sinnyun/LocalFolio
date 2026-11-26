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

export function extractEagleSourceFromMeta(
  rawMeta: Readonly<Record<string, unknown>> | null | undefined,
): EagleImageSource | null {
  if (!rawMeta || typeof rawMeta !== 'object') return null
  const raw = rawMeta.eagle
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>

  if (
    typeof rec.itemId !== 'string' ||
    !rec.itemId ||
    typeof rec.originalPath !== 'string' ||
    !rec.originalPath
  ) {
    return null
  }

  const folders: EagleFolderSource[] = Array.isArray(rec.folders)
    ? rec.folders
        .filter(
          (f): f is Record<string, unknown> =>
            Boolean(f) &&
            typeof f === 'object' &&
            typeof (f as Record<string, unknown>).id === 'string' &&
            typeof (f as Record<string, unknown>).name === 'string',
        )
        .map(f => ({
          id: String(f.id),
          name: String(f.name),
        }))
    : []

  return {
    itemId: rec.itemId,
    apiUrl: typeof rec.apiUrl === 'string' ? rec.apiUrl : '',
    name: typeof rec.name === 'string' ? rec.name : '',
    ext: typeof rec.ext === 'string' ? rec.ext : '',
    size: typeof rec.size === 'number' && Number.isFinite(rec.size) ? rec.size : 0,
    originalPath: rec.originalPath,
    originalUri: typeof rec.originalUri === 'string' ? rec.originalUri : '',
    thumbnailPath: typeof rec.thumbnailPath === 'string' ? rec.thumbnailPath : '',
    folders,
  }
}
