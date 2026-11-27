import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FolioNativeService } from '@folio/base-contract'
import { createFolioRuntimeService } from '../../../base-runtime-host/src/host.js'
import { createFolioStorageService } from '../../../base-storage-host/src/host.js'
import { registerBaseTasksHost } from '../../../base-tasks-host/src/host.js'
import { registerBaseThumbsHost } from '../../../base-thumbs-host/src/host.js'
import { registerFeatureThumbsEagleHost, type FetchLike } from '../host.js'
import { computeDynamicPollTimeoutMs, decodeEagleThumbPath } from '../eagle-client.js'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lf-eagle-thumbs-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(dir => fsp.rm(dir, { recursive: true, force: true })),
  )
})

function createNullNative(): FolioNativeService {
  return {
    async getThumbnail() {
      return null
    },
    async renderImageProxy() {
      return null
    },
    async pickFolder() {
      return { supported: true, cancelled: true, folderPath: null }
    },
    async pickFiles() {
      return { supported: true, cancelled: true, paths: [] }
    },
    async revealPath(targetPath) {
      return { revealedPath: targetPath }
    },
    async openPath(targetPath) {
      return { openedPath: targetPath }
    },
    async setHiddenAttribute() {
      return true
    },
  }
}

describe('@folio/feature-thumbs-eagle-host', () => {
  it('computes dynamic poll timeout and decodes Chinese/space percent-encoded paths', () => {
    expect(computeDynamicPollTimeoutMs(0)).toBe(10_000)
    expect(computeDynamicPollTimeoutMs(150 * 1024 * 1024)).toBe(20_000)
    expect(
      decodeEagleThumbPath('C%3A%2FUsers%2F%E8%AE%BE%E8%AE%A1%E5%B8%88%2Fmy%20file_thumb.png'),
    ).toBe('C:/Users/设计师/my file_thumb.png')
  })

  it('switches to dedicated cache library, decodes thumbnail, moves to trash, and restores previous library', async () => {
    const dataDir = await makeTempDir()
    const sampleDir = await makeTempDir()
    const thumbDir = path.join(sampleDir, '中文 目录')
    await fsp.mkdir(thumbDir, { recursive: true })

    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02])
    const generatedThumbPath = path.join(thumbDir, '预览 图.png')
    await fsp.writeFile(generatedThumbPath, fakePng)

    const sourceFile = path.join(sampleDir, 'scene.c4d')
    await fsp.writeFile(sourceFile, Buffer.alloc(1024, 0x42))

    const userLibPath = path.join(sampleDir, 'MainWork.library')
    let activeLibPath = userLibPath
    const switchedPaths: string[] = []
    const trashedIds: string[] = []
    const tagToId = new Map<string, string>()

    const mockFetch: FetchLike = async (url, init) => {
      const parsed = new URL(url)
      if (parsed.pathname === '/api/library/info') {
        return new Response(
          JSON.stringify({ status: 'success', data: { library: { path: activeLibPath, name: path.basename(activeLibPath) } } }),
          { status: 200 },
        )
      }
      if (parsed.pathname === '/api/library/switch') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { libraryPath: string }
        activeLibPath = body.libraryPath
        switchedPaths.push(body.libraryPath)
        return new Response(JSON.stringify({ status: 'success' }), { status: 200 })
      }
      if (parsed.pathname === '/api/item/addFromPath') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { tags?: string[] }
        const tag = body.tags?.[0] ?? 'unknown'
        tagToId.set(tag, 'EAGLEITEM123')
        return new Response(JSON.stringify({ status: 'success' }), { status: 200 })
      }
      if (parsed.pathname === '/api/item/list') {
        const tag = parsed.searchParams.get('tags') ?? ''
        const id = tagToId.get(tag)
        return new Response(
          JSON.stringify({ status: 'success', data: id ? [{ id, name: 'scene.c4d' }] : [] }),
          { status: 200 },
        )
      }
      if (parsed.pathname === '/api/item/thumbnail') {
        return new Response(
          JSON.stringify({ status: 'success', data: encodeURIComponent(generatedThumbPath) }),
          { status: 200 },
        )
      }
      if (parsed.pathname === '/api/item/moveToTrash') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { itemIds?: string[] }
        trashedIds.push(...(body.itemIds ?? []))
        return new Response(JSON.stringify({ status: 'success' }), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }

    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const tasksHost = registerBaseTasksHost({ runtime })
    const thumbsHost = registerBaseThumbsHost({
      runtime,
      storage,
      native: createNullNative(),
      tasks: tasksHost.service,
    })
    const disposeEagle = registerFeatureThumbsEagleHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      thumbs: thumbsHost.service,
      fetchImpl: mockFetch,
      pollIntervalMs: 10,
    })

    // Auto generate MUST NOT invoke Eagle
    const autoRes = await thumbsHost.service.generate({ filePath: sourceFile })
    expect(autoRes).toBeNull()
    expect(switchedPaths).toHaveLength(0)

    // Manual batch via action invokes Eagle, switches to ThumbCache.library, cleans trash, and restores MainWork.library
    const { task } = await runtime.executeAction<{ task: { id: string } }>('thumbs.eagle.generate', {
      filePaths: [sourceFile],
    })
    // Wait for background task to complete
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      const snap = tasksHost.service.getTask(task.id)
      if (snap && (snap.status === 'completed' || snap.status === 'failed')) {
        expect(snap.status).toBe('completed')
        break
      }
      await new Promise(r => setTimeout(r, 20))
    }

    expect(switchedPaths.length).toBeGreaterThanOrEqual(2)
    expect(activeLibPath).toBe(userLibPath)
    expect(trashedIds).toEqual(['EAGLEITEM123'])

    const [status] = await thumbsHost.service.queryStatus([sourceFile])
    expect(status?.status).toBe('READY')
    expect(status?.providerId).toBe('eagle')

    // Space counter updated and resettable
    const eagleStatus = await runtime.executeAction<{
      online: boolean
      cumulativeImportedBytes: number
    }>('thumbs.eagle.status', {})
    expect(eagleStatus.online).toBe(true)
    expect(eagleStatus.cumulativeImportedBytes).toBe(1024)

    const resetRes = await runtime.executeAction<{ cumulativeImportedBytes: number }>(
      'thumbs.eagle.cache.reset',
      {},
    )
    expect(resetRes.cumulativeImportedBytes).toBe(0)

    disposeEagle()
    thumbsHost.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })

  it('delegates to injected FolioEagleService and FolioFsService when provided', async () => {
    const dataDir = await makeTempDir()
    const sampleDir = await makeTempDir()
    const generatedThumbPath = path.join(sampleDir, 'stub-thumb.webp')
    const fakeWebp = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ])
    await fsp.writeFile(generatedThumbPath, fakeWebp)

    const sourceFile = path.join(sampleDir, 'model.blend')
    await fsp.writeFile(sourceFile, Buffer.alloc(512, 0x11))

    const userLibPath = path.join(sampleDir, 'Main.library')
    let currentLibPath = userLibPath
    const trashedIds: string[] = []
    let sniffCalls = 0

    const stubEagle = {
      async requestJson() {
        return null as never
      },
      async ping() {
        return true
      },
      async getLibraryInfo() {
        return { path: currentLibPath, name: path.basename(currentLibPath) }
      },
      async switchLibrary(libraryPath: string) {
        currentLibPath = libraryPath
        return true
      },
      async getItem() {
        return null
      },
      async getFolder() {
        return null
      },
      async getItemThumbnailPath(itemId: string) {
        return itemId === 'STUBITEM1' ? generatedThumbPath : null
      },
      async addItemFromPath() {
        return 'STUBITEM1'
      },
      async listItems() {
        return []
      },
      async moveItemsToTrash(itemIds: readonly string[]) {
        trashedIds.push(...itemIds)
        return true
      },
      async openDeepLink() {},
      extractItemIdFromDeepLink() {
        return null
      },
    }

    const stubFs = {
      sniffImageMime(buf: Buffer) {
        sniffCalls += 1
        return buf.subarray(8, 12).toString('ascii') === 'WEBP' ? 'image/webp' : null
      },
    } as unknown as import('@folio/base-contract').FolioFsService

    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const tasksHost = registerBaseTasksHost({ runtime })
    const thumbsHost = registerBaseThumbsHost({
      runtime,
      storage,
      native: createNullNative(),
      tasks: tasksHost.service,
    })
    const disposeEagle = registerFeatureThumbsEagleHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      thumbs: thumbsHost.service,
      eagle: stubEagle,
      fs: stubFs,
      pollIntervalMs: 10,
    })

    const { task } = await runtime.executeAction<{ task: { id: string } }>('thumbs.eagle.generate', {
      filePaths: [sourceFile],
    })
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      const snap = tasksHost.service.getTask(task.id)
      if (snap && (snap.status === 'completed' || snap.status === 'failed')) {
        expect(snap.status).toBe('completed')
        break
      }
      await new Promise(r => setTimeout(r, 20))
    }

    expect(sniffCalls).toBe(1)
    expect(trashedIds).toEqual(['STUBITEM1'])
    expect(currentLibPath).toBe(userLibPath)
    const [status] = await thumbsHost.service.queryStatus([sourceFile])
    expect(status?.status).toBe('READY')
    expect(status?.mime).toBe('image/webp')

    disposeEagle()
    thumbsHost.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })
})
