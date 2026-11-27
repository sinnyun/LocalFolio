import type { Context } from '@deepseek-ai/cordis'
import type { FolioEagleService } from '@folio/base-contract'
import {
  createEagleClient,
  DEFAULT_EAGLE_API_BASE,
  DEFAULT_EAGLE_PING_TIMEOUT_MS,
  DEFAULT_EAGLE_TIMEOUT_MS,
  safeDecodePercent,
  type FetchLike,
} from './client.js'
import {
  buildCleanLaunchEnv,
  extractItemIdFromDeepLink,
  isValidEagleItemId,
  normalizeDeepLinkOrItemId,
  openDeepLink,
  openDeepLinkUri,
  type CleanLaunchEnvResult,
  type OpenDeepLinkOptions,
} from './deeplink.js'

export interface CreateFolioEagleServiceOptions {
  readonly defaultBaseUrl?: string
  readonly defaultTimeoutMs?: number
  readonly fetchImpl?: FetchLike
  readonly openDeepLinkImpl?: (
    deepLink: string,
  ) => Promise<{ readonly strippedElectronRunAsNode?: boolean } | void>
}

export function createFolioEagleService(
  options: CreateFolioEagleServiceOptions = {},
): FolioEagleService {
  const client = createEagleClient({
    defaultBaseUrl: options.defaultBaseUrl,
    defaultTimeoutMs: options.defaultTimeoutMs,
    fetchImpl: options.fetchImpl,
  })

  return {
    requestJson: (apiPath, reqOptions) => client.requestJson(apiPath, reqOptions),
    ping: (baseUrl, timeoutMs, signal) => client.ping(baseUrl, timeoutMs, signal),
    getLibraryInfo: (baseUrl, callOptions) => client.getLibraryInfo(baseUrl, callOptions),
    switchLibrary: (libraryPath, baseUrl, callOptions) =>
      client.switchLibrary(libraryPath, baseUrl, callOptions),
    getItem: (itemId, baseUrl, callOptions) => client.getItem(itemId, baseUrl, callOptions),
    getFolder: (folderId, baseUrl, callOptions) => client.getFolder(folderId, baseUrl, callOptions),
    getItemThumbnailPath: (itemId, baseUrl, callOptions) =>
      client.getItemThumbnailPath(itemId, baseUrl, callOptions),
    addItemFromPath: (input, baseUrl, callOptions) =>
      client.addItemFromPath(input, baseUrl, callOptions),
    listItems: (query, baseUrl, callOptions) => client.listItems(query, baseUrl, callOptions),
    moveItemsToTrash: (itemIds, baseUrl, callOptions) =>
      client.moveItemsToTrash(itemIds, baseUrl, callOptions),
    openDeepLink: itemIdOrDeepLink =>
      openDeepLink(itemIdOrDeepLink, { openUrlImpl: options.openDeepLinkImpl }),
    extractItemIdFromDeepLink,
  }
}

export const name = 'base-eagle-host'
export const inject = ['folioRuntime', 'folioFs'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const service = createFolioEagleService()
    return ctx.provide('folioEagle', service)
  }, 'base-eagle-host: provide folioEagle')
}

export default { name, inject, apply }

export {
  createEagleClient,
  DEFAULT_EAGLE_API_BASE,
  DEFAULT_EAGLE_PING_TIMEOUT_MS,
  DEFAULT_EAGLE_TIMEOUT_MS,
  safeDecodePercent,
  type FetchLike,
} from './client.js'
export {
  buildCleanLaunchEnv,
  extractItemIdFromDeepLink,
  isValidEagleItemId,
  normalizeDeepLinkOrItemId,
  openDeepLink,
  openDeepLinkUri,
  type CleanLaunchEnvResult,
  type OpenDeepLinkOptions,
} from './deeplink.js'
