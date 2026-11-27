export interface EagleLibraryInfo {
  readonly path: string
  readonly name: string
}

export interface EagleFolderInfo {
  readonly id: string
  readonly name: string
  readonly children?: readonly EagleFolderInfo[]
}

export interface EagleItemDetail {
  readonly id: string
  readonly name: string
  readonly ext: string
  readonly size: number
  readonly folders?: readonly string[]
  readonly tags?: readonly string[]
  readonly isDeleted?: boolean
  readonly noThumbnail?: boolean
  readonly url?: string
  readonly annotation?: string
  readonly width?: number
  readonly height?: number
  readonly modificationTime?: number
}

export interface EagleItemSummary {
  readonly id: string
  readonly name: string
  readonly ext?: string
  readonly size?: number
  readonly tags?: readonly string[]
  readonly folders?: readonly string[]
  readonly isDeleted?: boolean
}

export interface EagleAddFromPathInput {
  readonly path: string
  readonly name?: string
  readonly website?: string
  readonly tags?: readonly string[]
  readonly annotation?: string
  readonly folderId?: string
}

export interface EagleListItemsQuery {
  readonly limit?: number
  readonly offset?: number
  readonly orderBy?: string
  readonly keyword?: string
  readonly ext?: string
  readonly tags?: string | readonly string[]
  readonly folders?: string | readonly string[]
}

export interface EagleRequestOptions {
  readonly baseUrl?: string
  readonly method?: 'GET' | 'POST'
  readonly body?: unknown
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

export interface EagleCallOptions {
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

/**
 * Host Cordis service (`ctx.folioEagle`) provided by `@folio/base-eagle-host`.
 * Centralizes local Eagle desktop Web API communication (default `http://127.0.0.1:41595`),
 * timeout/abort handling, JSON envelope validation, percent-decoded thumbnail paths,
 * and cross-platform `eagle://item/{id}` deep-link launching.
 */
export interface FolioEagleService {
  requestJson<T>(path: string, options?: EagleRequestOptions): Promise<T>
  ping(baseUrl?: string, timeoutMs?: number, signal?: AbortSignal): Promise<boolean>
  getLibraryInfo(baseUrl?: string, options?: EagleCallOptions): Promise<EagleLibraryInfo | null>
  switchLibrary(
    libraryPath: string,
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<boolean>
  getItem(
    itemId: string,
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<EagleItemDetail | null>
  getFolder(
    folderId: string,
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<EagleFolderInfo | null>
  getItemThumbnailPath(
    itemId: string,
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<string | null>
  addItemFromPath(
    input: EagleAddFromPathInput,
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<string | null>
  listItems(
    query: EagleListItemsQuery,
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<readonly EagleItemSummary[]>
  moveItemsToTrash(
    itemIds: readonly string[],
    baseUrl?: string,
    options?: EagleCallOptions,
  ): Promise<boolean>
  openDeepLink(itemId: string): Promise<void>
  extractItemIdFromDeepLink(raw: string): string | null
}
