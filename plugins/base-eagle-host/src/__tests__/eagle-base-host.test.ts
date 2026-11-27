import { describe, expect, it, vi } from 'vitest'
import { FolioError } from '@folio/base-contract'
import {
  buildCleanLaunchEnv,
  createFolioEagleService,
  DEFAULT_EAGLE_API_BASE,
  extractItemIdFromDeepLink,
  isValidEagleItemId,
  normalizeDeepLinkOrItemId,
  safeDecodePercent,
  type FetchLike,
} from '../host.js'

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify({ status: 'success', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('@folio/base-eagle-host', () => {
  it('validates item IDs, extracts deep links, and strips Electron launch env vars', () => {
    expect(isValidEagleItemId('MUF1LNTTIIFPG')).toBe(true)
    expect(isValidEagleItemId('bad-id')).toBe(false)
    expect(isValidEagleItemId('')).toBe(false)

    expect(extractItemIdFromDeepLink('eagle://item/MUF1LNTTIIFPG')).toBe('MUF1LNTTIIFPG')
    expect(extractItemIdFromDeepLink('EAGLE://ITEM/ABC123/?foo=1')).toBe('ABC123')
    expect(extractItemIdFromDeepLink('eagle://item/ABC123#hash')).toBe('ABC123')
    expect(extractItemIdFromDeepLink('https://example.com/item/ABC123')).toBeNull()
    expect(extractItemIdFromDeepLink('eagle://item/bad-id')).toBeNull()

    expect(normalizeDeepLinkOrItemId('MUF1LNTTIIFPG')).toEqual({
      itemId: 'MUF1LNTTIIFPG',
      deepLink: 'eagle://item/MUF1LNTTIIFPG',
    })
    expect(normalizeDeepLinkOrItemId('eagle://item/MUF1LNTTIIFPG?x=1')).toEqual({
      itemId: 'MUF1LNTTIIFPG',
      deepLink: 'eagle://item/MUF1LNTTIIFPG',
    })
    expect(() => normalizeDeepLinkOrItemId('bad id & calc')).toThrowError(FolioError)

    const cleaned = buildCleanLaunchEnv({
      PATH: 'C:\\Windows\\System32',
      SystemRoot: 'C:\\Windows',
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
    })
    expect(buildCleanLaunchEnv({ PATH: '/usr/bin' }).strippedElectronRunAsNode).toBe(false)
  })

  it('decodes percent-encoded paths safely and throws FolioError on malformed encoding', () => {
    expect(
      safeDecodePercent('C%3A%2FUsers%2F%E8%AE%BE%E8%AE%A1%E5%B8%88%2Fmy%20file_thumb.png'),
    ).toBe('C:/Users/设计师/my file_thumb.png')

    expect(() => safeDecodePercent('%E0%A4%A')).toThrowError(FolioError)
    try {
      safeDecodePercent('%E0%A4%A')
    } catch (err) {
      expect(err).toBeInstanceOf(FolioError)
      expect((err as FolioError).code).toBe('eagle_thumbnail_decode_failed')
    }
  })

  it('handles HTTP errors, invalid JSON, envelope errors, timeouts, and external AbortSignal', async () => {
    // HTTP error
    const httpErrService = createFolioEagleService({
      fetchImpl: async () => new Response('Server Error', { status: 500 }),
    })
    await expect(httpErrService.requestJson('/api/application/info')).rejects.toMatchObject({
      code: 'eagle_api_http_error',
      status: 502,
    })

    // Invalid JSON
    const badJsonService = createFolioEagleService({
      fetchImpl: async () => new Response('not-json', { status: 200 }),
    })
    await expect(badJsonService.requestJson('/api/application/info')).rejects.toMatchObject({
      code: 'eagle_api_invalid_json',
      status: 502,
    })

    // Envelope status !== 'success'
    const envErrService = createFolioEagleService({
      fetchImpl: async () =>
        new Response(JSON.stringify({ status: 'error', message: 'library locked' }), {
          status: 200,
        }),
    })
    await expect(envErrService.requestJson('/api/library/info')).rejects.toMatchObject({
      code: 'eagle_api_error',
      message: 'library locked',
      status: 502,
    })

    // Network unreachable
    const offlineService = createFolioEagleService({
      fetchImpl: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:41595')
      },
    })
    await expect(offlineService.requestJson('/api/library/info')).rejects.toMatchObject({
      code: 'eagle_api_unreachable',
      status: 502,
    })
    expect(await offlineService.ping()).toBe(false)

    // Request timeout via AbortController
    const slowFetch: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            const abortErr = new Error('The operation was aborted')
            abortErr.name = 'AbortError'
            reject(abortErr)
          },
          { once: true },
        )
      })
    const timeoutService = createFolioEagleService({ fetchImpl: slowFetch })
    await expect(
      timeoutService.requestJson('/api/application/info', { timeoutMs: 25 }),
    ).rejects.toMatchObject({
      code: 'eagle_api_timeout',
      status: 504,
    })

    // External AbortSignal pre-aborted & mid-flight abort
    const preAborted = new AbortController()
    preAborted.abort()
    await expect(
      timeoutService.requestJson('/api/application/info', { signal: preAborted.signal }),
    ).rejects.toMatchObject({
      code: 'aborted',
      status: 499,
    })

    const midController = new AbortController()
    setTimeout(() => midController.abort(), 15)
    await expect(
      timeoutService.requestJson('/api/application/info', {
        timeoutMs: 5000,
        signal: midController.signal,
      }),
    ).rejects.toMatchObject({
      code: 'aborted',
      status: 499,
    })
  })

  it('implements ping, library info/switch, item/folder/thumbnail queries, addFromPath, listItems, moveToTrash, and openDeepLink', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = []
    let activeLib = 'D:\\Main.library'

    const stubFetch: FetchLike = async (urlStr, init) => {
      const parsed = new URL(urlStr)
      const method = init?.method ?? 'GET'
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url: urlStr, method, body })

      if (parsed.pathname === '/api/application/info') {
        return jsonOk({ version: '4.0.0' })
      }
      if (parsed.pathname === '/api/library/info') {
        return jsonOk({ library: { path: activeLib, name: 'Main' } })
      }
      if (parsed.pathname === '/api/library/switch') {
        activeLib = (body as { libraryPath: string }).libraryPath
        return jsonOk({})
      }
      if (parsed.pathname === '/api/v2/item/get') {
        const id = parsed.searchParams.get('id')
        if (id === 'ITEM001') {
          return jsonOk({
            data: [
              {
                id: 'ITEM001',
                name: 'hero',
                ext: 'png',
                size: 1234,
                folders: ['FLD_CHILD'],
                isDeleted: false,
                noThumbnail: false,
              },
            ],
          })
        }
        if (id === 'DUP001') {
          return jsonOk([
            { id: 'DUP001', name: 'a', ext: 'png', size: 1 },
            { id: 'DUP001', name: 'b', ext: 'png', size: 2 },
          ])
        }
        return jsonOk({ data: [] })
      }
      if (parsed.pathname === '/api/v2/folder/get') {
        return jsonOk({
          data: [
            {
              id: 'FLD_ROOT',
              name: 'Root',
              children: [{ id: 'FLD_CHILD', name: '场景参考', children: [] }],
            },
          ],
        })
      }
      if (parsed.pathname === '/api/item/thumbnail') {
        const id = parsed.searchParams.get('id')
        if (id === 'ITEM001') {
          return jsonOk('D%3A%5CMain.library%5Cimages%5CITEM001.info%5C%E9%A2%84%E8%A7%88.png')
        }
        if (id === 'BADENC') {
          return jsonOk('%E0%A4%A')
        }
        return jsonOk('')
      }
      if (parsed.pathname === '/api/item/addFromPath') {
        return jsonOk('NEWITEM99')
      }
      if (parsed.pathname === '/api/item/list') {
        return jsonOk([{ id: 'NEWITEM99', name: 'scene.c4d', isDeleted: false }])
      }
      if (parsed.pathname === '/api/item/moveToTrash') {
        return jsonOk({})
      }
      return new Response('Not Found', { status: 404 })
    }

    const openedDeepLinks: string[] = []
    const eagle = createFolioEagleService({
      fetchImpl: stubFetch,
      openDeepLinkImpl: async deepLink => {
        openedDeepLinks.push(deepLink)
        return { strippedElectronRunAsNode: true }
      },
    })

    expect(await eagle.ping()).toBe(true)
    expect(calls[0]?.url).toBe(`${DEFAULT_EAGLE_API_BASE}/api/application/info`)

    expect(await eagle.getLibraryInfo()).toEqual({
      path: 'D:\\Main.library',
      name: 'Main',
    })
    expect(await eagle.switchLibrary('D:\\Cache.library')).toBe(true)
    expect(activeLib).toBe('D:\\Cache.library')

    const item = await eagle.getItem('ITEM001')
    expect(item).toMatchObject({ id: 'ITEM001', name: 'hero', ext: 'png', size: 1234 })
    expect(await eagle.getItem('MISSING')).toBeNull()
    await expect(eagle.getItem('DUP001')).rejects.toMatchObject({
      code: 'eagle_item_ambiguous',
      status: 409,
    })
    await expect(eagle.getItem('bad-id')).rejects.toMatchObject({
      code: 'invalid_eagle_item_id',
      status: 400,
    })

    expect(await eagle.getFolder('FLD_CHILD')).toEqual({
      id: 'FLD_CHILD',
      name: '场景参考',
      children: [],
    })
    expect(await eagle.getFolder('NOPE')).toBeNull()

    expect(await eagle.getItemThumbnailPath('ITEM001')).toBe(
      'D:\\Main.library\\images\\ITEM001.info\\预览.png',
    )
    expect(await eagle.getItemThumbnailPath('EMPTY')).toBeNull()
    await expect(eagle.getItemThumbnailPath('BADENC')).rejects.toMatchObject({
      code: 'eagle_thumbnail_decode_failed',
      status: 502,
    })

    const addedId = await eagle.addItemFromPath({
      path: '/tmp/scene.c4d',
      name: 'scene.c4d',
      tags: ['lf_thumb_1'],
    })
    expect(addedId).toBe('NEWITEM99')

    const listed = await eagle.listItems({ tags: ['lf_thumb_1'], limit: 5 })
    expect(listed).toEqual([{ id: 'NEWITEM99', name: 'scene.c4d', isDeleted: false }])

    expect(await eagle.moveItemsToTrash(['NEWITEM99'])).toBe(true)
    expect(await eagle.moveItemsToTrash([])).toBe(true)

    await eagle.openDeepLink('ITEM001')
    await eagle.openDeepLink('eagle://item/ITEM002/?foo=1')
    expect(openedDeepLinks).toEqual(['eagle://item/ITEM001', 'eagle://item/ITEM002'])
    await expect(eagle.openDeepLink('invalid id!')).rejects.toMatchObject({
      code: 'invalid_eagle_item_id',
      status: 400,
    })
    expect(eagle.extractItemIdFromDeepLink('eagle://item/ITEM001')).toBe('ITEM001')

    // Ping falls back to /api/library/info when /api/application/info returns 404
    const fallbackEagle = createFolioEagleService({
      fetchImpl: async urlStr => {
        const parsed = new URL(urlStr)
        if (parsed.pathname === '/api/application/info') {
          return new Response('Not Found', { status: 404 })
        }
        if (parsed.pathname === '/api/library/info') {
          return jsonOk({ library: { path: 'D:\\Fallback.library', name: 'Fallback' } })
        }
        return new Response('Not Found', { status: 404 })
      },
    })
    expect(await fallbackEagle.ping('http://127.0.0.1:41599/')).toBe(true)
  })

  it('supports baseUrl overrides on individual calls', async () => {
    const requestedUrls: string[] = []
    const stubFetch: FetchLike = async urlStr => {
      requestedUrls.push(urlStr)
      return jsonOk({ library: { path: '/tmp/Lib.library', name: 'Lib' } })
    }
    const eagle = createFolioEagleService({ fetchImpl: stubFetch })
    await eagle.getLibraryInfo('http://127.0.0.1:50000/')
    expect(requestedUrls).toEqual(['http://127.0.0.1:50000/api/library/info'])
  })
})
