import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFolioRuntimeService,
  type ManagedFolioRuntime,
} from '../../../base-runtime-host/src/host.js'
import { createFolioStorageService } from '../../../base-storage-host/src/host.js'
import {
  buildCleanLaunchEnv,
  createEagleLinksService,
  extractEagleItemIdFromDeepLink,
  extractEagleItemIdFromPath,
  isValidEagleItemId,
  registerFeatureCanvasEagleHost,
  type EagleOpenItemResult,
  type EaglePathResolveEntry,
  type EagleImageSource,
} from '../host.js'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAD0lEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64',
)

const TINY_THUMB = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

describe('@folio/feature-canvas-eagle-host', () => {
  let tmpDir: string
  let dataDir: string
  let libraryDir: string
  let runtime: ManagedFolioRuntime
  let disposePlugin: () => void
  let openedUrls: string[]
  let fetchCalls: string[]
  let eagleApiOnline: boolean

  let itemDir: string
  let originalPath: string
  let thumbnailPath: string
  let noThumbDir: string
  let noThumbPath: string
  let ambiguousDir: string
  let ambiguousOriginalPath: string
  let plainImagePath: string

  beforeEach(async () => {
    tmpDir = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'folio-eagle-host-')))
    dataDir = path.join(tmpDir, 'appdata')
    libraryDir = path.join(tmpDir, 'MyLibrary.library', 'images')

    itemDir = path.join(libraryDir, 'MUF1LNTTIIFPG.info')
    originalPath = path.join(itemDir, 'artwork hero.png')
    thumbnailPath = path.join(itemDir, 'artwork hero_thumbnail.png')

    noThumbDir = path.join(libraryDir, 'NOTHUMB001.info')
    noThumbPath = path.join(noThumbDir, 'direct.png')

    ambiguousDir = path.join(libraryDir, 'AMBIG001.info')
    ambiguousOriginalPath = path.join(ambiguousDir, 'dup-a.png')

    plainImagePath = path.join(tmpDir, 'plain.png')

    await fsp.mkdir(itemDir, { recursive: true })
    await fsp.mkdir(noThumbDir, { recursive: true })
    await fsp.mkdir(ambiguousDir, { recursive: true })

    await fsp.writeFile(originalPath, TINY_PNG)
    await fsp.writeFile(thumbnailPath, TINY_THUMB)
    await fsp.writeFile(noThumbPath, TINY_PNG)
    await fsp.writeFile(ambiguousOriginalPath, TINY_PNG)
    await fsp.writeFile(path.join(ambiguousDir, 'dup-b.png'), TINY_PNG)
    await fsp.writeFile(path.join(ambiguousDir, 'dup_thumbnail.png'), TINY_THUMB)
    await fsp.writeFile(plainImagePath, TINY_PNG)

    openedUrls = []
    fetchCalls = []
    eagleApiOnline = true

    const stubFetch: typeof fetch = vi.fn(async input => {
      const urlStr = String(input)
      fetchCalls.push(urlStr)
      if (!eagleApiOnline) {
        throw new Error('connect ECONNREFUSED 127.0.0.1:41595')
      }

      const url = new URL(urlStr)
      const jsonOk = (data: unknown) =>
        new Response(JSON.stringify({ status: 'success', data }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })

      if (url.pathname === '/api/v2/item/get') {
        const id = url.searchParams.get('id')
        if (id === 'MUF1LNTTIIFPG') {
          return jsonOk({
            data: [
              {
                id: 'MUF1LNTTIIFPG',
                name: 'WILDWOOD - LAIKA',
                ext: 'png',
                size: TINY_PNG.length,
                folders: ['FLD_CHILD'],
                isDeleted: false,
                noThumbnail: false,
              },
            ],
          })
        }
        if (id === 'NOTHUMB001') {
          return jsonOk({
            data: [
              {
                id: 'NOTHUMB001',
                name: 'Direct Image',
                ext: 'png',
                size: TINY_PNG.length,
                folders: [],
                isDeleted: false,
                noThumbnail: true,
              },
            ],
          })
        }
        if (id === 'TRASHED001') {
          return jsonOk({
            data: [
              {
                id: 'TRASHED001',
                name: 'Deleted',
                ext: 'png',
                size: 10,
                folders: [],
                isDeleted: true,
                noThumbnail: false,
              },
            ],
          })
        }
        if (id === 'AMBIG001') {
          return jsonOk({
            data: [
              {
                id: 'AMBIG001',
                name: 'Ambiguous',
                ext: 'png',
                size: TINY_PNG.length,
                folders: [],
                isDeleted: false,
                noThumbnail: false,
              },
            ],
          })
        }
        return jsonOk({ data: [] })
      }

      if (url.pathname === '/api/item/thumbnail') {
        const id = url.searchParams.get('id')
        if (id === 'MUF1LNTTIIFPG') {
          return jsonOk(encodeURIComponent(thumbnailPath))
        }
        if (id === 'NOTHUMB001') {
          return jsonOk(encodeURIComponent(noThumbPath))
        }
        if (id === 'AMBIG001') {
          return jsonOk(encodeURIComponent(path.join(ambiguousDir, 'dup_thumbnail.png')))
        }
        return jsonOk('')
      }

      if (url.pathname === '/api/application/info') {
        return jsonOk({
          version: '4.0.0',
          buildVersion: '20260401',
        })
      }

      if (url.pathname === '/api/v2/folder/get') {
        return jsonOk({
          data: [
            {
              id: 'FLD_ROOT',
              name: '灵感库',
              children: [
                {
                  id: 'FLD_CHILD',
                  name: '场景参考',
                  children: [],
                },
              ],
            },
          ],
        })
      }

      return new Response('Not Found', { status: 404 })
    }) as typeof fetch

    const service = createEagleLinksService({
      fetchImpl: stubFetch,
      openUrlImpl: async deepLink => {
        openedUrls.push(deepLink)
        return { strippedElectronRunAsNode: true }
      },
    })

    const storage = createFolioStorageService({ dataDir })
    runtime = createFolioRuntimeService({ storage })
    disposePlugin = registerFeatureCanvasEagleHost({ runtime, service })
  })

  afterEach(async () => {
    disposePlugin()
    runtime.dispose()
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  it('validates Eagle item IDs, deep links, and .info paths', () => {
    expect(isValidEagleItemId('MUF1LNTTIIFPG')).toBe(true)
    expect(isValidEagleItemId('MUF1-BAD')).toBe(false)
    expect(isValidEagleItemId('')).toBe(false)

    expect(extractEagleItemIdFromDeepLink('eagle://item/MUF1LNTTIIFPG')).toBe('MUF1LNTTIIFPG')
    expect(extractEagleItemIdFromDeepLink('EAGLE://ITEM/ABC123/?foo=1')).toBe('ABC123')
    expect(extractEagleItemIdFromDeepLink('https://example.com/item/ABC123')).toBeNull()

    expect(extractEagleItemIdFromPath('D:\\Lib\\images\\MUF1LNTTIIFPG.info\\shot.png')).toBe(
      'MUF1LNTTIIFPG',
    )
    expect(extractEagleItemIdFromPath('D:\\Photos\\plain.png')).toBeNull()
  })

  it('resolves Eagle .info originals, noThumbnail items, file URLs, and skips non-Eagle or thumbnail files', async () => {
    const plainOnly = await runtime.executeAction<{ items: EaglePathResolveEntry[] }>(
      'canvas.eagle.resolveFromPaths',
      { paths: [plainImagePath] },
    )
    expect(plainOnly.items[0]?.source).toBeNull()
    expect(fetchCalls).toHaveLength(0)

    const resolved = await runtime.executeAction<{ items: EaglePathResolveEntry[] }>(
      'canvas.eagle.resolveFromPaths',
      {
        paths: [
          pathToFileURL(originalPath).href,
          thumbnailPath,
          noThumbPath,
        ],
      },
    )

    expect(resolved.items[0]?.source).toMatchObject({
      itemId: 'MUF1LNTTIIFPG',
      name: 'WILDWOOD - LAIKA',
      apiUrl: 'http://127.0.0.1:41595/api/v2/item/get?id=MUF1LNTTIIFPG',
      folders: [{ id: 'FLD_CHILD', name: '场景参考' }],
    })
    expect(resolved.items[0]?.source?.originalPath.toLowerCase()).toBe(originalPath.toLowerCase())
    expect(resolved.items[0]?.source?.originalUri).toBe(
      pathToFileURL(resolved.items[0]!.source!.originalPath).href,
    )

    // Dropped thumbnail inside .info must NOT be treated as the original
    expect(resolved.items[1]?.source).toBeNull()
    expect(resolved.items[1]?.error).toBeUndefined()

    // noThumbnail item resolves directly
    expect(resolved.items[2]?.source).toMatchObject({
      itemId: 'NOTHUMB001',
      name: 'Direct Image',
      folders: [],
    })
  })

  it('returns per-item error without throwing when Eagle Web API is offline during drop', async () => {
    eagleApiOnline = false
    const res = await runtime.executeAction<{ items: EaglePathResolveEntry[] }>(
      'canvas.eagle.resolveFromPaths',
      { paths: [originalPath] },
    )
    expect(res.items[0]?.source).toBeNull()
    expect(res.items[0]?.error).toContain('Eagle Web API request failed')
  })

  it('resolves eagle://item/{id} deep links and fails closed on missing, trashed, or ambiguous items', async () => {
    const byDeepLink = await runtime.executeAction<{ source: EagleImageSource }>(
      'canvas.eagle.resolveById',
      { itemId: 'eagle://item/MUF1LNTTIIFPG' },
    )
    expect(byDeepLink.source.itemId).toBe('MUF1LNTTIIFPG')
    expect(byDeepLink.source.originalPath.toLowerCase()).toBe(originalPath.toLowerCase())

    await expect(
      runtime.executeAction('canvas.eagle.resolveById', { itemId: 'MISSING001' }),
    ).rejects.toThrow(/not found/i)

    await expect(
      runtime.executeAction('canvas.eagle.resolveById', { itemId: 'TRASHED001' }),
    ).rejects.toThrow(/trash/i)

    await expect(
      runtime.executeAction('canvas.eagle.resolveById', { itemId: 'AMBIG001' }),
    ).rejects.toThrow(/multiple Eagle sibling files/i)
  })

  it('strips Electron host env flags, validates item IDs, and opens Eagle deep links', async () => {
    const cleaned = buildCleanLaunchEnv({
      PATH: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
      USERPROFILE: 'C:\\Users\\Test',
      ELECTRON_RUN_AS_NODE: '1',
      electron_no_attach_console: '1',
      NODE_OPTIONS: '--max-old-space-size=4096',
      NODE_CHANNEL_FD: '3',
      NODE_CHANNEL_SERIALIZATION_MODE: 'advanced',
    })
    expect(cleaned.strippedElectronRunAsNode).toBe(true)
    expect(cleaned.env).toEqual({
      PATH: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
      USERPROFILE: 'C:\\Users\\Test',
    })

    const unflagged = buildCleanLaunchEnv({ PATH: 'C:\\Windows\\System32' })
    expect(unflagged.strippedElectronRunAsNode).toBe(false)

    const res = await runtime.executeAction<EagleOpenItemResult>('canvas.eagle.openItem', {
      itemId: 'MUF1LNTTIIFPG',
    })
    expect(res).toMatchObject({
      itemId: 'MUF1LNTTIIFPG',
      deepLink: 'eagle://item/MUF1LNTTIIFPG',
      strippedElectronRunAsNode: true,
    })
    expect(typeof res.durationMs).toBe('number')
    expect(openedUrls).toEqual(['eagle://item/MUF1LNTTIIFPG'])

    await expect(
      runtime.executeAction('canvas.eagle.openItem', { itemId: 'bad id & calc' }),
    ).rejects.toThrow(/invalid/i)
  })
})
