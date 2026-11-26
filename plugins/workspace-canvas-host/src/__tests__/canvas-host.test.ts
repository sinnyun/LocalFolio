import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createFolioRuntimeService,
  type ManagedFolioRuntime,
} from '../../../base-runtime-host/src/host.js'
import { createFolioStorageService } from '../../../base-storage-host/src/host.js'
import {
  createWindowsWicImageProxyProvider,
  registerWorkspaceCanvasHost,
  sanitizeBoardSnapshot,
  snapLodTier,
  type CanvasDialogProvider,
  type ImageProxyProvider,
} from '../host.js'
import type {
  BatchRelocateResult,
  BoardDocument,
  BoardMeta,
  BoardSaveResult,
  CanvasCacheStats,
  CanvasListDirResult,
  CanvasRootsResult,
  LinkCheckEntry,
  LinkedImageInspectResult,
} from '../types.js'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAD0lEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64',
)

describe('@folio/workspace-canvas-host', () => {
  let tmpDir: string
  let dataDir: string
  let sampleRoot: string
  let assetsRoot: string
  let runtime: ManagedFolioRuntime
  let disposeCanvas: () => void
  let proxyCalls: Array<{ filePath: string; tier: number; preferPng?: boolean }>

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'folio-canvas-host-'))
    dataDir = path.join(tmpDir, 'appdata')
    sampleRoot = path.join(tmpDir, 'images')
    assetsRoot = path.join(tmpDir, 'tldraw-assets')

    await fsp.mkdir(path.join(sampleRoot, 'nested'), { recursive: true })
    await fsp.mkdir(path.join(assetsRoot, 'icons'), { recursive: true })
    await fsp.writeFile(path.join(sampleRoot, 'hero.png'), TINY_PNG)
    await fsp.writeFile(path.join(sampleRoot, 'vector.svg'), '<svg width="120" height="80"></svg>', 'utf8')
    await fsp.writeFile(path.join(sampleRoot, 'readme.txt'), 'not an image', 'utf8')
    await fsp.writeFile(path.join(sampleRoot, 'nested', 'moved-photo.png'), TINY_PNG)
    await fsp.writeFile(path.join(assetsRoot, 'icons', 'demo.svg'), '<svg></svg>', 'utf8')

    proxyCalls = []
    const stubProxyProvider: ImageProxyProvider = {
      async renderProxy(filePath, tier, opts) {
        proxyCalls.push({ filePath, tier, preferPng: opts?.preferPng })
        return { buffer: TINY_PNG, mime: 'image/png' }
      },
      dispose() {},
    }

    const stubDialogProvider: CanvasDialogProvider = {
      async pickImages() {
        return { supported: true, cancelled: false, paths: [path.join(sampleRoot, 'hero.png')] }
      },
      async pickFolder() {
        return { supported: true, cancelled: false, folderPath: sampleRoot }
      },
      async revealPath(target) {
        return { revealedPath: target }
      },
    }

    const storage = createFolioStorageService({ dataDir })
    runtime = createFolioRuntimeService({
      storage,
      admit: req => req.headers['x-test-auth'] === 'ok' || 401,
    })

    disposeCanvas = registerWorkspaceCanvasHost({
      runtime,
      storage,
      proxyProvider: stubProxyProvider,
      dialogProvider: stubDialogProvider,
      tldrawAssetsRoot: assetsRoot,
    })
  })

  afterEach(async () => {
    disposeCanvas()
    runtime.dispose()
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  it('creates a default board and supports create, rename, duplicate, save, and delete', async () => {
    const initial = await runtime.executeAction<{ boards: BoardMeta[] }>('canvas.boards.list', {})
    expect(initial.boards).toHaveLength(1)
    expect(initial.boards[0]?.title).toBe('默认画板')

    const created = await runtime.executeAction<{ board: BoardMeta }>('canvas.boards.create', {
      title: '分镜参考',
    })
    expect(created.board.title).toBe('分镜参考')

    const renamed = await runtime.executeAction<{ board: BoardMeta }>('canvas.boards.rename', {
      id: created.board.id,
      title: '概念设计板',
    })
    expect(renamed.board.title).toBe('概念设计板')

    const duplicated = await runtime.executeAction<{ board: BoardMeta }>('canvas.boards.duplicate', {
      id: created.board.id,
    })
    expect(duplicated.board.title).toBe('概念设计板 副本')

    const loaded = await runtime.executeAction<BoardDocument>('canvas.boards.get', {
      id: created.board.id,
    })
    expect(loaded.id).toBe(created.board.id)

    const removed = await runtime.executeAction<{ deletedId: string; boards: BoardMeta[] }>(
      'canvas.boards.delete',
      { id: duplicated.board.id },
    )
    expect(removed.deletedId).toBe(duplicated.board.id)
    expect(removed.boards.some(b => b.id === duplicated.board.id)).toBe(false)
  })

  it('enforces link-only persistence by stripping inline data:image base64 URLs', async () => {
    const { boards } = await runtime.executeAction<{ boards: BoardMeta[] }>('canvas.boards.list', {})
    const boardId = boards[0]!.id

    const dirtySnapshot = {
      document: {
        store: {
          'asset:inline': {
            id: 'asset:inline',
            typeName: 'asset',
            type: 'image',
            props: {
              name: 'pasted.png',
              src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
              w: 100,
              h: 100,
              mimeType: 'image/png',
              isAnimated: false,
            },
            meta: {},
          },
          'asset:linked': {
            id: 'asset:linked',
            typeName: 'asset',
            type: 'image',
            props: {
              name: 'hero.png',
              src: 'asset:folio-link/v1/link-1',
              w: 2,
              h: 3,
              mimeType: 'image/png',
              isAnimated: false,
            },
            meta: {
              folioLink: true,
              linkId: 'link-1',
              localPath: path.join(sampleRoot, 'hero.png'),
            },
          },
        },
        schema: { schemaVersion: 2, sequences: {} },
      },
    }

    const clientCheck = sanitizeBoardSnapshot(dirtySnapshot)
    expect(clientCheck.strippedInlineCount).toBe(1)
    expect(clientCheck.imageCount).toBe(1)

    const saved = await runtime.executeAction<BoardSaveResult>('canvas.boards.save', {
      id: boardId,
      snapshot: dirtySnapshot,
      brokenCount: 0,
    })
    expect(saved.strippedInlineCount).toBe(1)
    expect(saved.meta.imageCount).toBe(1)

    const diskPath = path.join(
      dataDir,
      'plugins',
      'workspace-canvas-host',
      'data',
      'boards',
      `${boardId}.json`,
    )
    const rawOnDisk = await fsp.readFile(diskPath, 'utf8')
    expect(rawOnDisk).not.toContain('data:image/png;base64')
    expect(rawOnDisk).toContain('asset:folio-link/v1/link-1')
  })

  it('inspects images, checks broken links, and batch-relocates moved files in a folder', async () => {
    const heroPath = path.join(sampleRoot, 'hero.png')
    const svgPath = path.join(sampleRoot, 'vector.svg')
    const missingOldPath = path.join(sampleRoot, 'old-folder', 'moved-photo.png')

    const inspectRes = await runtime.executeAction<{ items: LinkedImageInspectResult[] }>(
      'canvas.links.inspect',
      { paths: [heroPath, svgPath, missingOldPath] },
    )
    expect(inspectRes.items[0]).toMatchObject({
      exists: true,
      isImage: true,
      naturalWidth: 2,
      naturalHeight: 3,
    })
    expect(inspectRes.items[1]).toMatchObject({
      exists: true,
      isImage: true,
      naturalWidth: 120,
      naturalHeight: 80,
    })
    expect(inspectRes.items[2]?.exists).toBe(false)

    const checkRes = await runtime.executeAction<{ items: LinkCheckEntry[] }>(
      'canvas.links.check',
      { paths: [heroPath, missingOldPath] },
    )
    expect(checkRes.items.find(i => i.path === path.resolve(heroPath))?.exists).toBe(true)
    expect(checkRes.items.find(i => i.path === path.resolve(missingOldPath))?.exists).toBe(false)

    const relocateRes = await runtime.executeAction<BatchRelocateResult>(
      'canvas.links.relocateInFolder',
      {
        folderPath: sampleRoot,
        missingItems: [
          {
            linkId: 'link-moved',
            fileName: 'moved-photo.png',
            expectedSize: TINY_PNG.length,
          },
        ],
      },
    )
    expect(relocateRes.matches).toHaveLength(1)
    expect(relocateRes.matches[0]?.linkId).toBe('link-moved')
    expect(relocateRes.matches[0]?.inspected.path).toBe(
      path.resolve(path.join(sampleRoot, 'nested', 'moved-photo.png')),
    )
  })

  it('serves snapped LOD proxies with disk caching, ETag 304, missing 404, and cache clearing', async () => {
    expect(snapLodTier(100)).toBe(256)
    expect(snapLodTier(300)).toBe(512)
    expect(snapLodTier(1024)).toBe(1024)
    expect(snapLodTier(9000)).toBe(2048)

    const heroPath = path.join(sampleRoot, 'hero.png')
    const url = `http://127.0.0.1/lf/canvas/proxy?path=${encodeURIComponent(heroPath)}&tier=8000&v=1`

    const res1 = await runtime.rpc.fetch(
      new Request(url, { headers: { 'x-test-auth': 'ok' } }),
    )
    expect(res1.status).toBe(200)
    expect(res1.headers.get('x-folio-lod-tier')).toBe('2048')
    expect(res1.headers.get('x-folio-link-status')).toBe('ok')
    const etag = res1.headers.get('etag')
    expect(etag).toBeTruthy()
    expect(proxyCalls).toHaveLength(1)
    expect(proxyCalls[0]?.tier).toBe(2048)

    // Second request must hit disk cache without invoking proxyProvider again
    const res2 = await runtime.rpc.fetch(
      new Request(url, { headers: { 'x-test-auth': 'ok' } }),
    )
    expect(res2.status).toBe(200)
    expect(proxyCalls).toHaveLength(1)

    // ETag conditional request returns 304
    const res304 = await runtime.rpc.fetch(
      new Request(url, {
        headers: { 'x-test-auth': 'ok', 'if-none-match': etag! },
      }),
    )
    expect(res304.status).toBe(304)

    const stats1 = await runtime.executeAction<CanvasCacheStats>('canvas.cache.stats', {})
    expect(stats1.fileCount).toBe(1)
    expect(stats1.totalBytes).toBeGreaterThan(0)

    const cleared = await runtime.executeAction<CanvasCacheStats>('canvas.cache.clear', {})
    expect(cleared.fileCount).toBe(0)
    expect(cleared.totalBytes).toBe(0)

    // Missing file returns 404 + x-folio-link-status: missing
    const missingRes = await runtime.rpc.fetch(
      new Request(
        `http://127.0.0.1/lf/canvas/proxy?path=${encodeURIComponent(path.join(sampleRoot, 'gone.png'))}&tier=512`,
        { headers: { 'x-test-auth': 'ok' } },
      ),
    )
    expect(missingRes.status).toBe(404)
    expect(missingRes.headers.get('x-folio-link-status')).toBe('missing')
  })

  it('serves self-hosted @tldraw/assets safely and blocks path traversal', async () => {
    const okRes = await runtime.rpc.fetch(
      new Request('http://127.0.0.1/lf/canvas/tldraw-asset?f=icons%2Fdemo.svg', {
        headers: { 'x-test-auth': 'ok' },
      }),
    )
    expect(okRes.status).toBe(200)
    expect(okRes.headers.get('content-type')).toBe('image/svg+xml')
    expect(await okRes.text()).toContain('<svg>')

    const traversalRes = await runtime.rpc.fetch(
      new Request('http://127.0.0.1/lf/canvas/tldraw-asset?f=..%2Fimages%2Fhero.png', {
        headers: { 'x-test-auth': 'ok' },
      }),
    )
    expect(traversalRes.status).toBe(403)
  })

  it('lists local roots and filters directory listings to subdirectories and images', async () => {
    const roots = await runtime.executeAction<CanvasRootsResult>('canvas.fs.roots', {})
    expect(roots.drives.length).toBeGreaterThan(0)

    const dir = await runtime.executeAction<CanvasListDirResult>('canvas.fs.list', {
      path: sampleRoot,
    })
    const names = dir.entries.map(e => e.name)
    expect(names).toContain('nested')
    expect(names).toContain('hero.png')
    expect(names).toContain('vector.svg')
    expect(names).not.toContain('readme.txt')
  })

  it.runIf(process.platform === 'win32')(
    'renders PNG and JPEG LOD proxies via real Windows WIC worker including special-character paths',
    async () => {
      const specialPath = path.join(sampleRoot, '测试 #1 100%.png')
      await fsp.writeFile(specialPath, TINY_PNG)
      const provider = createWindowsWicImageProxyProvider()
      try {
        const pngRes = await provider.renderProxy(specialPath, 512, { preferPng: true })
        expect(pngRes).not.toBeNull()
        expect(pngRes?.mime).toBe('image/png')
        expect(pngRes?.buffer.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))

        const jpgRes = await provider.renderProxy(specialPath, 256, { preferPng: false })
        expect(jpgRes).not.toBeNull()
        expect(jpgRes?.mime).toBe('image/jpeg')
        expect(jpgRes?.buffer.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
      } finally {
        provider.dispose()
      }
    },
    15_000,
  )
})
