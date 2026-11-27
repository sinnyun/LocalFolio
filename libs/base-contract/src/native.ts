export interface NativeThumbOptions {
  readonly allowIconFallback?: boolean
  readonly preferPng?: boolean
  readonly signal?: AbortSignal
}

export interface NativeImageProxyOptions {
  readonly preferPng?: boolean
  readonly strictWicOnly?: boolean
  readonly signal?: AbortSignal
}

export interface NativeImageProxyResult {
  readonly buffer: Buffer
  readonly mime: 'image/jpeg' | 'image/png'
}

export interface NativePickFolderOptions {
  readonly title?: string
  readonly initialDir?: string
}

export interface NativePickFolderResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly folderPath: string | null
}

export interface NativePickFilesOptions {
  readonly title?: string
  readonly filter?: string
  readonly multi?: boolean
  readonly initialDir?: string
}

export interface NativePickFilesResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly paths: readonly string[]
}

export interface NativePickSaveFileOptions {
  readonly title?: string
  readonly filter?: string
  readonly defaultExt?: string
  readonly defaultName?: string
  readonly initialDir?: string
}

export interface NativePickSaveFileResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly filePath: string | null
}

/**
 * Host Cordis service (`ctx.folioNative`) provided by `@folio/base-native-host`.
 * Centralizes Windows native Shell/WIC thumbnail & proxy worker pools,
 * OS file/folder pickers, explorer reveal, default-app open, and hidden attributes.
 */
export interface FolioNativeService {
  getThumbnail(
    filePath: string,
    size: number,
    options?: NativeThumbOptions,
  ): Promise<NativeImageProxyResult | null>
  renderImageProxy(
    filePath: string,
    maxDim: number,
    options?: NativeImageProxyOptions,
  ): Promise<NativeImageProxyResult | null>
  pickFolder(options?: NativePickFolderOptions): Promise<NativePickFolderResult>
  pickFiles(options?: NativePickFilesOptions): Promise<NativePickFilesResult>
  pickSaveFile?(options?: NativePickSaveFileOptions): Promise<NativePickSaveFileResult>
  revealPath(targetPath: string): Promise<{ readonly revealedPath: string }>
  openPath(targetPath: string): Promise<{ readonly openedPath: string }>
  setHiddenAttribute(targetPath: string, hidden?: boolean): Promise<boolean>
  recyclePaths?(paths: readonly string[]): Promise<{ readonly recycled: number }>
}
