import type { FolioNativeService } from '@folio/base-contract'

export interface ShellThumbOptions {
  readonly allowIconFallback?: boolean
  readonly signal?: AbortSignal
}

export interface ShellThumbProvider {
  getThumbnail(
    filePath: string,
    size: number,
    options?: ShellThumbOptions,
  ): Promise<Buffer | null>
  dispose(): void
}

export function createNoopShellThumbProvider(): ShellThumbProvider {
  return {
    async getThumbnail(): Promise<Buffer | null> {
      return null
    },
    dispose(): void {
      // no-op
    },
  }
}

export function createWindowsShellThumbProvider(
  native?: FolioNativeService,
): ShellThumbProvider {
  if (!native || process.platform !== 'win32') {
    return createNoopShellThumbProvider()
  }
  return {
    async getThumbnail(filePath, size, options): Promise<Buffer | null> {
      const res = await native.getThumbnail(filePath, size, options)
      return res?.buffer ?? null
    },
    dispose(): void {
      // Lifecycle is owned by @folio/base-native-host
    },
  }
}
