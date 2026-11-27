import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { FolioError } from '@folio/base-contract'

const execFileAsync = promisify(execFile)

const EAGLE_ITEM_ID_RE = /^[A-Za-z0-9]+$/
const EAGLE_DEEP_LINK_RE = /^eagle:\/\/item\/([A-Za-z0-9]+)(?:\/(?:[?#].*)?|[?#].*)?$/i

const STRIPPED_ELECTRON_ENV_KEYS = new Set([
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'NODE_OPTIONS',
  'NODE_CHANNEL_FD',
  'NODE_CHANNEL_SERIALIZATION_MODE',
])

export interface CleanLaunchEnvResult {
  readonly env: Record<string, string | undefined>
  readonly strippedElectronRunAsNode: boolean
}

export interface OpenDeepLinkOptions {
  readonly openUrlImpl?: (
    deepLink: string,
  ) => Promise<{ readonly strippedElectronRunAsNode?: boolean } | void>
}

export function isValidEagleItemId(itemId: string): boolean {
  return EAGLE_ITEM_ID_RE.test(itemId.trim())
}

export function extractItemIdFromDeepLink(raw: string): string | null {
  const match = raw.trim().match(EAGLE_DEEP_LINK_RE)
  if (!match?.[1]) return null
  return isValidEagleItemId(match[1]) ? match[1] : null
}

/**
 * Strip Electron/Node host inheritance flags (notably ELECTRON_RUN_AS_NODE=1 from
 * DeepSeek Harness Desktop) so launching Eagle.exe via protocol handler boots Eagle's
 * GUI process cleanly instead of falling back to Node.js CLI mode.
 */
export function buildCleanLaunchEnv(
  baseEnv: Readonly<Record<string, string | undefined>> = process.env,
): CleanLaunchEnvResult {
  const env: Record<string, string | undefined> = {}
  let strippedElectronRunAsNode = false
  for (const [key, value] of Object.entries(baseEnv)) {
    const upper = key.toUpperCase()
    if (STRIPPED_ELECTRON_ENV_KEYS.has(upper)) {
      if (upper === 'ELECTRON_RUN_AS_NODE' && value !== undefined) {
        strippedElectronRunAsNode = true
      }
      continue
    }
    env[key] = value
  }
  return { env, strippedElectronRunAsNode }
}

function launchDetached(
  command: string,
  args: readonly string[],
  errorPrefix: string,
  env: Record<string, string | undefined>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env,
    })
    const onError = (err: Error): void => {
      reject(new FolioError('eagle_open_failed', `${errorPrefix}: ${err.message}`, 500))
    }
    child.once('error', onError)
    child.once('spawn', () => {
      child.off('error', onError)
      child.unref()
      resolve()
    })
  })
}

export function normalizeDeepLinkOrItemId(itemIdOrDeepLink: string): {
  readonly itemId: string
  readonly deepLink: string
} {
  const trimmed = itemIdOrDeepLink.trim()
  const itemId = extractItemIdFromDeepLink(trimmed) ?? trimmed
  if (!isValidEagleItemId(itemId)) {
    throw new FolioError('invalid_eagle_item_id', 'Eagle item ID is invalid', 400)
  }
  return {
    itemId,
    deepLink: `eagle://item/${itemId}`,
  }
}

export async function openDeepLinkUri(
  deepLink: string,
): Promise<{ readonly strippedElectronRunAsNode: boolean }> {
  if (!extractItemIdFromDeepLink(deepLink)) {
    throw new FolioError('invalid_eagle_item_id', 'Eagle item ID is invalid', 400)
  }

  const { env, strippedElectronRunAsNode } = buildCleanLaunchEnv()

  if (process.platform === 'win32') {
    try {
      await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "$ErrorActionPreference = 'Stop'; Start-Process -FilePath $env:FOLIO_EAGLE_URI",
        ],
        {
          env: { ...env, FOLIO_EAGLE_URI: deepLink },
          timeout: 8000,
          windowsHide: true,
        },
      )
      return { strippedElectronRunAsNode }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new FolioError('eagle_open_failed', `cannot open ${deepLink}: ${msg}`, 500)
    }
  }

  if (process.platform === 'darwin') {
    await launchDetached('open', [deepLink], `cannot open ${deepLink}`, env)
    return { strippedElectronRunAsNode }
  }

  await launchDetached('xdg-open', [deepLink], `cannot open ${deepLink}`, env)
  return { strippedElectronRunAsNode }
}

export async function openDeepLink(
  itemIdOrDeepLink: string,
  options: OpenDeepLinkOptions = {},
): Promise<void> {
  const { deepLink } = normalizeDeepLinkOrItemId(itemIdOrDeepLink)
  const impl = options.openUrlImpl ?? openDeepLinkUri
  await impl(deepLink)
}
