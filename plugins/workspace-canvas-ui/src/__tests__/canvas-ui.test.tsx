// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FolioUiHost } from '@folio/base-ui-kit/client'
import {
  AssetRecordType,
  PageRecordType,
  createShapeId,
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils,
  type Editor,
  type TLAsset,
  type TLImageAsset,
  type TLPageId,
} from 'tldraw'
import { FrameWorkbench } from '../../../base-frame-ui/src/frame/FrameWorkbench.js'
import { createFolioFrameService } from '../../../base-frame-ui/src/frame/service.js'
import { frameStore } from '../../../base-frame-ui/src/frame/store.js'
import {
  CANVAS_APP_ID,
  CANVAS_WORKSPACE_ID,
  LinkedImagesPanel,
  LocalImagePickerDialog,
  buildBrokenLinkSvgDataUrl,
  buildFolioLinkSrc,
  buildProxyUrl,
  buildSelfHostedAssetUrls,
  chooseLodTier,
  computeCanvasImageGeometry,
  createCanvasApp,
  createFolioAssetStore,
  extractLocalPathsFromText,
  importFileViaHost,
  isDroppedImageFile,
  resolveDroppedFilePath,
  stripInlineImagesFromSnapshot,
  bytesToBase64,
  useCanvas,
  type BoardDocument,
  type BoardMeta,
  type LinkedImageInspectResult,
} from '../client.js'

describe('LOD & link-only pure helpers', () => {
  it('computes capped geometry and stepped LOD tiers up to 2048px', () => {
    const geom = computeCanvasImageGeometry(10000, 8000)
    expect(geom.assetW).toBe(2048)
    expect(geom.assetH).toBe(1638)
    expect(geom.shapeW).toBe(640)
    expect(geom.shapeH).toBe(512)

    expect(chooseLodTier(10000, 8000, 0.125, 1)).toBe(256)
    expect(chooseLodTier(10000, 8000, 0.25, 1)).toBe(512)
    expect(chooseLodTier(10000, 8000, 0.5, 1)).toBe(1024)
    expect(chooseLodTier(10000, 8000, 4, 2)).toBe(2048)

    const proxy = buildProxyUrl('D:\\Photos\\big.png', 1024, 1700000000, 2)
    expect(proxy).toContain('/lf/canvas/proxy?')
    expect(proxy).toContain('tier=1024')
    expect(proxy).toContain('rev=2')

    const broken = buildBrokenLinkSvgDataUrl('big.png', 'D:\\Photos\\big.png')
    expect(broken.startsWith('data:image/svg+xml')).toBe(true)
    expect(decodeURIComponent(broken)).toContain('图片链接已失效或文件已移动')

    const urls = buildSelfHostedAssetUrls()
    expect(urls.translations['zh-cn']).toBe('/lf/canvas/tldraw-asset?f=translations%2Fzh-cn.json')
    expect(urls.icons['tool-arrow']).toContain('/lf/canvas/tldraw-asset?f=icons%2F')
  })

  it('imports pathless web images through the host, resolves LOD or broken placeholder, and strips inline data URLs', async () => {
    const blocked = vi.fn()
    const imported = vi.fn(async (file: File) => ({
      src: buildFolioLinkSrc('web-1'),
      meta: {
        folioLink: true,
        linkId: 'web-1',
        localPath: `C:\\Folio\\imports\\${file.name}`,
      },
    }))
    let status: 'ok' | 'missing' = 'ok'

    const assetStore = createFolioAssetStore({
      getLinkStatus: () => status,
      onBlockedWebUpload: blocked,
      onElectronFileLink: async (_asset, localPath) => ({
        src: buildFolioLinkSrc('e1'),
        meta: { folioLink: true, linkId: 'e1', localPath },
      }),
      onWebFileImport: imported,
    })

    const fakeFile = new File([new Uint8Array([1, 2, 3])], 'raw.png', { type: 'image/png' })
    const uploaded = await assetStore.upload({ id: 'asset:1' } as TLAsset, fakeFile)
    expect(uploaded.src).toBe(buildFolioLinkSrc('web-1'))
    expect(imported).toHaveBeenCalledWith(fakeFile)
    expect(blocked).not.toHaveBeenCalled()

    const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    await expect(
      assetStore.upload({ id: 'asset:2' } as TLAsset, textFile),
    ).rejects.toThrow()
    expect(blocked).toHaveBeenCalledWith(textFile)

    const linkedAsset = {
      id: 'asset:link',
      typeName: 'asset',
      type: 'image',
      props: {
        name: 'shot.png',
        src: buildFolioLinkSrc('link-1'),
        w: 2048,
        h: 1024,
        mimeType: 'image/png',
        isAnimated: false,
      },
      meta: {
        folioLink: true,
        linkId: 'link-1',
        localPath: 'D:\\Art\\shot.png',
        fileName: 'shot.png',
        fileSize: 4096,
        mtimeMs: 1000,
        naturalWidth: 4096,
        naturalHeight: 2048,
        mime: 'image/png',
        relinkRev: 0,
      },
    } as unknown as TLImageAsset

    const okResolved = assetStore.resolve?.(linkedAsset, {
      screenScale: 0.25,
      steppedScreenScale: 0.25,
      dpr: 1,
      networkEffectiveType: '4g',
      shouldResolveToOriginal: false,
    })
    expect(okResolved).toContain('/lf/canvas/proxy?')
    expect(okResolved).toContain('tier=512')

    status = 'missing'
    const missingResolved = assetStore.resolve?.(linkedAsset, {
      screenScale: 0.25,
      steppedScreenScale: 0.25,
      dpr: 1,
      networkEffectiveType: '4g',
      shouldResolveToOriginal: false,
    })
    expect(String(missingResolved)).toContain('data:image/svg+xml')

    const cleaned = stripInlineImagesFromSnapshot({
      document: {
        store: {
          'asset:bad': {
            typeName: 'asset',
            type: 'image',
            props: { src: 'data:image/jpeg;base64,/9j/4AAQ' },
          },
        },
      },
    })
    const cleanedStore = (cleaned.document as { store: Record<string, { props: { src: string } }> })
      .store
    expect(cleanedStore['asset:bad']?.props.src).toBe('')

    expect(
      extractLocalPathsFromText('"C:\\Temp\\pic.png"\nhttps://example.com/a.png\nD:\\Docs\\note.txt'),
    ).toEqual(['C:\\Temp\\pic.png'])
  })

  it('resolves disk paths from the legacy File.path slot and the DSH desktop bridge', () => {
    const pathless = new File([new Uint8Array([1])], '拖入.png', { type: 'image/png' })
    expect(resolveDroppedFilePath(pathless)).toBeNull()
    expect(isDroppedImageFile(pathless)).toBe(true)
    expect(
      isDroppedImageFile(new File(['text'], 'notes.txt', { type: 'text/plain' })),
    ).toBe(false)
    expect(
      isDroppedImageFile({ name: 'extension-only.webp', type: '' } as unknown as File),
    ).toBe(true)

    const legacy = { name: 'a.png', type: 'image/png', path: 'D:\\Pics\\a.png' } as unknown as File
    expect(resolveDroppedFilePath(legacy)).toBe('D:\\Pics\\a.png')

    ;(globalThis as { __DSH_HOST_PATHS__?: unknown }).__DSH_HOST_PATHS__ = {
      pathFor: (file: File) => `D:\\Bridged\\${file.name}`,
    }
    try {
      expect(resolveDroppedFilePath(pathless)).toBe('D:\\Bridged\\拖入.png')
    } finally {
      delete (globalThis as { __DSH_HOST_PATHS__?: unknown }).__DSH_HOST_PATHS__
    }

    expect(bytesToBase64(new Uint8Array([72, 105]))).toBe('SGk=')
    expect(bytesToBase64(new Uint8Array(0))).toBe('')
  })

  it('passes real tldraw store schema validation when inserting linked image assets and shapes', () => {
    const store = createTLStore({
      shapeUtils: defaultShapeUtils,
      bindingUtils: defaultBindingUtils,
    })

    const assetId = AssetRecordType.createId()
    const assetWithDims = AssetRecordType.create({
      id: assetId,
      type: 'image',
      props: {
        name: 'artwork.png',
        src: buildFolioLinkSrc('ec9af6d2-353a-45a3-9d37-ce32e9daa83d'),
        w: 2048,
        h: 1536,
        mimeType: 'image/png',
        isAnimated: false,
        fileSize: 123456,
      },
      meta: {
        folioLink: true,
        linkId: 'ec9af6d2-353a-45a3-9d37-ce32e9daa83d',
        localPath: 'D:\\Art\\artwork.png',
        fileName: 'artwork.png',
        fileSize: 123456,
        mtimeMs: 1700000000,
        naturalWidth: 4096,
        naturalHeight: 3072,
        mime: 'image/png',
        relinkRev: 0,
      },
    })

    const assetNullDims = AssetRecordType.create({
      id: AssetRecordType.createId(),
      type: 'image',
      props: {
        name: 'photo.heic',
        src: buildFolioLinkSrc('heic-1'),
        w: 1024,
        h: 768,
        mimeType: 'image/heic',
        isAnimated: false,
        fileSize: 654321,
      },
      meta: {
        folioLink: true,
        linkId: 'heic-1',
        localPath: 'D:\\Art\\photo.heic',
        fileName: 'photo.heic',
        fileSize: 654321,
        mtimeMs: 1700000001,
        naturalWidth: null,
        naturalHeight: null,
        mime: 'image/heic',
        relinkRev: 0,
      },
    })

    expect(() => store.put([assetWithDims, assetNullDims])).not.toThrow()
    expect(store.get(assetId)?.props.src).toBe(
      'asset:folio-link/v1/ec9af6d2-353a-45a3-9d37-ce32e9daa83d',
    )

    const pageId = 'page:page' as TLPageId
    store.put([
      PageRecordType.create({
        id: pageId,
        name: 'Page 1',
        index: 'a1' as never,
      }),
    ])
    const shapeId = createShapeId()
    expect(() =>
      store.put([
        {
          id: shapeId,
          typeName: 'shape',
          type: 'image',
          parentId: pageId!,
          index: 'a1' as never,
          x: 0,
          y: 0,
          rotation: 0,
          opacity: 1,
          isLocked: false,
          meta: {},
          props: {
            w: 640,
            h: 480,
            assetId,
            playing: true,
            url: '',
            crop: null,
            flipX: false,
            flipY: false,
            altText: '',
          },
        },
      ]),
    ).not.toThrow()
  })
})

describe('@folio/workspace-canvas-ui integration', () => {
  let boardsState: BoardMeta[]
  let docsState: Record<string, BoardDocument>
  let existingFiles: Set<string>
  let nextPickImage: string | null
  let nextPickFolder: string | null
  let importSessions: Map<string, { fileName: string; chunks: string[] }>
  let lastImportedChunks: string[]
  let importSeq: number

  function createMockEditor(boardId: string): Editor {
    const records = new Map<string, Record<string, unknown>>()
    const docStore =
      ((docsState[boardId]?.snapshot?.document as { store?: Record<string, Record<string, unknown>> })
        ?.store ?? {})
    for (const [k, v] of Object.entries(docStore)) {
      records.set(k, JSON.parse(JSON.stringify(v)) as Record<string, unknown>)
    }

    const syncToDoc = () => {
      docsState[boardId] = {
        version: 1,
        id: boardId,
        snapshot: {
          document: {
            store: Object.fromEntries(records.entries()),
            schema: { schemaVersion: 2, sequences: {} },
          },
        },
        updatedAt: Date.now(),
      }
    }

    return {
      store: {
        allRecords: () => Array.from(records.values()),
        serialize: () => Object.fromEntries(records.entries()),
        getSnapshot: () => ({
          document: {
            store: Object.fromEntries(records.entries()),
            schema: { schemaVersion: 2, sequences: {} },
          },
          session: { version: 0, currentPageId: 'page:page', pageStates: [] },
        }),
      },
      getAsset: (id: string) => records.get(id),
      getCurrentPageShapes: () =>
        Array.from(records.values()).filter(r => r.typeName === 'shape'),
      createAssets: (assets: Array<{ id: string }>) => {
        for (const a of assets) records.set(a.id, JSON.parse(JSON.stringify(a)))
        syncToDoc()
      },
      createShapes: (shapes: Array<{ id: string; type: string; x: number; y: number; props: Record<string, unknown> }>) => {
        for (const s of shapes) {
          records.set(s.id, { ...s, typeName: 'shape' })
        }
        syncToDoc()
      },
      updateAssets: (assets: Array<{ id: string }>) => {
        for (const a of assets) records.set(a.id, JSON.parse(JSON.stringify(a)))
        syncToDoc()
      },
      updateShapes: (shapes: Array<{ id: string; props?: Record<string, unknown> }>) => {
        for (const s of shapes) {
          const prev = records.get(s.id)
          if (prev) {
            records.set(s.id, {
              ...prev,
              props: { ...(prev.props as Record<string, unknown>), ...(s.props ?? {}) },
            })
          }
        }
        syncToDoc()
      },
      run: (fn: () => void) => fn(),
      select: vi.fn(),
      zoomToSelection: vi.fn(),
      getViewportPageBounds: () => ({ center: { x: 200, y: 200 } }),
    } as unknown as Editor
  }

  function TestCanvasStage(): React.ReactElement {
    const {
      activeBoardId,
      activeDoc,
      linkedImages,
      brokenCount,
      relinkPanelOpen,
      setRelinkPanelOpen,
      setRelinkFilter,
      attachEditor,
      importDroppedFiles,
    } = useCanvas()

    const [attachedBoardId, setAttachedBoardId] = React.useState<string | null>(null)
    React.useEffect(() => {
      if (!activeDoc || activeDoc.id !== activeBoardId) return
      const editor = createMockEditor(activeBoardId)
      attachEditor(editor)
      setAttachedBoardId(activeBoardId)
      return () => {
        attachEditor(null)
        setAttachedBoardId(null)
      }
    }, [activeBoardId, activeDoc?.id, attachEditor])

    return (
      <div
        data-lf-canvas-stage=""
        onKeyDown={e => {
          if (e.key === 'Escape' && relinkPanelOpen) {
            e.preventDefault()
            setRelinkPanelOpen(false)
          }
        }}
      >
        <div data-lf-mock-tldraw={activeBoardId}>
          <span data-lf-mock-attached-editor={attachedBoardId ?? ''} />
          <button
            type="button"
            data-lf-canvas-links-pill=""
            onClick={() => {
              if (brokenCount > 0) setRelinkFilter('missing')
              setRelinkPanelOpen(!relinkPanelOpen)
            }}
          >
            {brokenCount > 0
              ? `${brokenCount} 张图片已移动 · 重新链接`
              : `图片链接 (${linkedImages.length})`}
          </button>
          <button
            type="button"
            data-lf-test-drop-import=""
            onClick={() => {
              const bytes = new Uint8Array([137, 80, 78, 71])
              const dropped = {
                name: '拖入的截图.png',
                type: 'image/png',
                size: bytes.length,
                slice: (start: number, end: number) => ({
                  arrayBuffer: async () => bytes.slice(start, end).buffer,
                }),
              } as unknown as File
              void importDroppedFiles([dropped])
            }}
          >
            drop-image
          </button>
        </div>
        <LinkedImagesPanel />
        <LocalImagePickerDialog />
      </div>
    )
  }

  beforeEach(() => {
    localStorage.clear()
    existingFiles = new Set(['D:\\Moved\\poster.png'])
    nextPickImage = 'D:\\Moved\\poster.png'
    nextPickFolder = 'D:\\Moved'
    importSessions = new Map()
    lastImportedChunks = []
    importSeq = 0

    const now = Date.now()
    boardsState = [
      {
        id: 'board-1',
        title: '主画板',
        createdAt: now - 5000,
        updatedAt: now - 1000,
        imageCount: 1,
        brokenCount: 1,
      },
      {
        id: 'board-2',
        title: '灵感草稿',
        createdAt: now - 10000,
        updatedAt: now - 2000,
        imageCount: 0,
        brokenCount: 0,
      },
    ]

    docsState = {
      'board-1': {
        version: 1,
        id: 'board-1',
        updatedAt: now - 1000,
        snapshot: {
          document: {
            store: {
              'asset:broken-1': {
                id: 'asset:broken-1',
                typeName: 'asset',
                type: 'image',
                props: {
                  name: 'poster.png',
                  src: buildFolioLinkSrc('link-broken-1'),
                  w: 1600,
                  h: 1200,
                  mimeType: 'image/png',
                  isAnimated: false,
                  fileSize: 88000,
                },
                meta: {
                  folioLink: true,
                  linkId: 'link-broken-1',
                  localPath: 'D:\\OldFolder\\poster.png',
                  fileName: 'poster.png',
                  fileSize: 88000,
                  mtimeMs: 123456,
                  naturalWidth: 3200,
                  naturalHeight: 2400,
                  mime: 'image/png',
                  relinkRev: 0,
                },
              },
              'shape:img-1': {
                id: 'shape:img-1',
                typeName: 'shape',
                type: 'image',
                x: 100,
                y: 100,
                props: {
                  assetId: 'asset:broken-1',
                  w: 400,
                  h: 300,
                },
              },
            },
            schema: { schemaVersion: 2, sequences: {} },
          },
        },
      },
      'board-2': {
        version: 1,
        id: 'board-2',
        updatedAt: now - 2000,
        snapshot: {
          document: { store: {}, schema: { schemaVersion: 2, sequences: {} } },
        },
      },
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const actionId = decodeURIComponent(url.split('/lf/rpc/')[1] ?? '')
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}

        const ok = (data: unknown) =>
          new Response(JSON.stringify({ ok: true, data }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })

        switch (actionId) {
          case 'canvas.boards.list':
            return ok({ boards: boardsState })
          case 'canvas.boards.get':
            return ok(docsState[String(body.id)])
          case 'canvas.boards.create': {
            const created: BoardMeta = {
              id: 'board-3',
              title: String(body.title || '未命名画板 3'),
              createdAt: Date.now(),
              updatedAt: Date.now(),
              imageCount: 0,
              brokenCount: 0,
            }
            boardsState = [created, ...boardsState]
            docsState[created.id] = {
              version: 1,
              id: created.id,
              updatedAt: created.updatedAt,
              snapshot: { document: { store: {}, schema: { schemaVersion: 2, sequences: {} } } },
            }
            return ok({ board: created })
          }
          case 'canvas.boards.rename': {
            boardsState = boardsState.map(b =>
              b.id === body.id ? { ...b, title: String(body.title) } : b,
            )
            return ok({ board: boardsState.find(b => b.id === body.id) })
          }
          case 'canvas.boards.save': {
            const id = String(body.id)
            boardsState = boardsState.map(b =>
              b.id === id
                ? { ...b, brokenCount: Number(body.brokenCount ?? 0), updatedAt: Date.now() }
                : b,
            )
            return ok({
              meta: boardsState.find(b => b.id === id),
              updatedAt: Date.now(),
              strippedInlineCount: 0,
            })
          }
          case 'canvas.links.importBegin': {
            importSeq += 1
            const importId = `import-${importSeq}`
            importSessions.set(importId, {
              fileName: String(body.fileName ?? 'import.png'),
              chunks: [],
            })
            return ok({ importId, chunkBytes: 1024 * 1024, maxBytes: 128 * 1024 * 1024 })
          }
          case 'canvas.links.importChunk': {
            const session = importSessions.get(String(body.importId))
            if (!session) {
              return new Response(
                JSON.stringify({
                  ok: false,
                  error: { code: 'import_session_missing', message: '导入会话不存在' },
                }),
                { status: 404, headers: { 'content-type': 'application/json' } },
              )
            }
            session.chunks.push(String(body.data ?? ''))
            return ok({ receivedBytes: session.chunks.join('').length })
          }
          case 'canvas.links.importFinish': {
            const importId = String(body.importId)
            const session = importSessions.get(importId)
            importSessions.delete(importId)
            lastImportedChunks = session?.chunks ?? []
            const importedPath = `C:\\Folio\\imports\\${importSeq}\\${session?.fileName ?? 'import.png'}`
            existingFiles.add(importedPath)
            return ok({
              item: {
                path: importedPath,
                exists: true,
                fileName: session?.fileName ?? 'import.png',
                ext: '.png',
                mime: 'image/png',
                size: 4,
                mtimeMs: Date.now(),
                naturalWidth: 1200,
                naturalHeight: 800,
                isImage: true,
              },
            })
          }
          case 'canvas.links.importAbort': {
            importSessions.delete(String(body.importId))
            return ok({ aborted: true })
          }
          case 'canvas.links.check': {
            const paths = (body.paths as string[]) ?? []
            return ok({
              items: paths.map(p => ({
                path: p,
                exists: existingFiles.has(p),
                size: existingFiles.has(p) ? 88000 : null,
                mtimeMs: existingFiles.has(p) ? 999999 : null,
              })),
            })
          }
          case 'canvas.links.inspect': {
            const paths = (body.paths as string[]) ?? []
            const items: LinkedImageInspectResult[] = paths.map(p => ({
              path: p,
              exists: existingFiles.has(p),
              fileName: p.split(/[\\/]/).pop() ?? 'poster.png',
              ext: '.png',
              mime: 'image/png',
              size: 88000,
              mtimeMs: 999999,
              naturalWidth: 3200,
              naturalHeight: 2400,
              isImage: true,
            }))
            return ok({ items })
          }
          case 'canvas.links.relocateInFolder': {
            return ok({
              folderPath: String(body.folderPath),
              scannedFiles: 1,
              matches: [
                {
                  linkId: 'link-broken-1',
                  inspected: {
                    path: 'D:\\Moved\\poster.png',
                    exists: true,
                    fileName: 'poster.png',
                    ext: '.png',
                    mime: 'image/png',
                    size: 88000,
                    mtimeMs: 999999,
                    naturalWidth: 3200,
                    naturalHeight: 2400,
                    isImage: true,
                  },
                },
              ],
            })
          }
          case 'canvas.dialog.pickImages':
            return ok({
              supported: true,
              cancelled: !nextPickImage,
              paths: nextPickImage ? [nextPickImage] : [],
            })
          case 'canvas.dialog.pickFolder':
            return ok({
              supported: true,
              cancelled: !nextPickFolder,
              folderPath: nextPickFolder,
            })
          case 'canvas.cache.stats':
            return ok({
              fileCount: 2,
              totalBytes: 20480,
              maxBytes: 256 * 1024 * 1024,
              maxFiles: 1500,
              tiers: [256, 512, 1024, 2048],
            })
          default:
            return ok({})
        }
      }) as typeof fetch,
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('streams pathless dropped image bytes to the host in RPC-sized chunks', async () => {
    const payload = new Uint8Array(1024 * 1024 * 2 + 17)
    for (let index = 0; index < payload.length; index += 1) payload[index] = index % 251
    let sliceCalls = 0

    const fakeFile = {
      name: '5-1-1.png',
      type: 'image/png',
      size: payload.length,
      slice(start: number, end: number) {
        sliceCalls += 1
        return { arrayBuffer: async () => payload.slice(start, end).buffer }
      },
    } as unknown as File

    const item = await importFileViaHost(fakeFile)
    expect(item.fileName).toBe('5-1-1.png')
    expect(item.exists).toBe(true)
    expect(sliceCalls).toBe(3)
    expect(lastImportedChunks).toHaveLength(3)
    for (const chunk of lastImportedChunks) {
      // base64 of a 1 MiB chunk stays below the shared 2 MB RPC body ceiling
      expect(chunk.length).toBeLessThanOrEqual(1_398_104)
    }
    const decoded = Buffer.concat(lastImportedChunks.map(chunk => Buffer.from(chunk, 'base64')))
    expect(decoded.equals(Buffer.from(payload))).toBe(true)
  })

  it('auto-imports a pathless dropped image and adds it as a linked image', async () => {
    frameStore.reset()
    const frame = createFolioFrameService({
      View: FrameWorkbench,
      openWorkspace: vi.fn(),
    })
    frame.registerApp(createCanvasApp({ CanvasStageComponent: TestCanvasStage }))
    frame.attachHostWorkspace(CANVAS_WORKSPACE_ID)
    frame.activateApp(CANVAS_APP_ID)

    render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(FolioUiHost),
        React.createElement(
          'div',
          { 'data-lf-shell': '', style: { width: 1200, height: 800 } },
          React.createElement(FrameWorkbench),
        ),
      ),
    )

    await waitFor(() => {
      expect(document.querySelector('[data-lf-canvas-board-btn="board-2"]')).toBeTruthy()
    })
    fireEvent.click(document.querySelector('[data-lf-canvas-board-btn="board-2"]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-mock-tldraw="board-2"]')).toBeTruthy()
      expect(
        document.querySelector('[data-lf-mock-attached-editor="board-2"]'),
      ).toBeTruthy()
    })

    fireEvent.click(document.querySelector('[data-lf-test-drop-import]')!)
    await waitFor(() => {
      expect(screen.getByText('图片链接 (1)')).toBeTruthy()
    })

    fireEvent.click(document.querySelector('[data-lf-canvas-links-pill]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-canvas-relink-panel]')).toBeTruthy()
      expect(screen.getByText('拖入的截图.png')).toBeTruthy()
    })
    expect(existingFiles.has('C:\\Folio\\imports\\1\\拖入的截图.png')).toBe(true)
  })

  it('renders left board list and full right canvas area, detects broken links, and relinks via mini-panel', async () => {
    frameStore.reset()
    const frame = createFolioFrameService({
      View: FrameWorkbench,
      openWorkspace: vi.fn(),
    })
    const app = createCanvasApp({ CanvasStageComponent: TestCanvasStage })
    frame.registerApp(app)
    frame.attachHostWorkspace(CANVAS_WORKSPACE_ID)
    frame.activateApp(CANVAS_APP_ID)

    render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(FolioUiHost),
        React.createElement(
          'div',
          { 'data-lf-shell': '', style: { width: 1200, height: 800 } },
          React.createElement(FrameWorkbench),
        ),
      ),
    )

    // Left board list and right canvas stage exist; NO Right frame inspector
    await waitFor(() => {
      expect(document.querySelector('[data-lf-canvas-board-btn="board-1"]')?.textContent).toContain('主画板')
      expect(screen.getByText('灵感草稿')).toBeTruthy()
    })
    expect(document.querySelector('[data-lf-frame-right]')).toBeNull()
    expect(document.querySelector('[data-lf-mock-tldraw="board-1"]')).toBeTruthy()

    // Broken link pill appears automatically
    await waitFor(() => {
      expect(screen.getByText('1 张图片已移动 · 重新链接')).toBeTruthy()
    })

    // Open mini-panel and verify broken image item is shown
    fireEvent.click(document.querySelector('[data-lf-canvas-links-pill]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-canvas-relink-panel]')).toBeTruthy()
      expect(screen.getByText('poster.png')).toBeTruthy()
      expect(screen.getByText('已移动/缺失')).toBeTruthy()
    })

    // Pressing Escape inside stage closes mini-panel and prevents shell exit
    const stageEl = document.querySelector('[data-lf-canvas-stage]')!
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    stageEl.dispatchEvent(escEvent)
    expect(escEvent.defaultPrevented).toBe(true)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-canvas-relink-panel]')).toBeNull()
    })

    // Re-open mini-panel and click "重新选择" to relink moved image
    fireEvent.click(document.querySelector('[data-lf-canvas-links-pill]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-relink-btn="asset:broken-1"]')).toBeTruthy()
    })
    fireEvent.click(document.querySelector('[data-lf-relink-btn="asset:broken-1"]')!)

    await waitFor(() => {
      expect(screen.getByText('图片链接 (1)')).toBeTruthy()
      expect(screen.getByText('没有失效的图片链接')).toBeTruthy()
    })
    fireEvent.click(document.querySelector('[data-lf-relink-filter="all"]')!)
    await waitFor(() => {
      expect(screen.getByText('D:\\Moved\\poster.png')).toBeTruthy()
    })

    // Create new board from sidebar "+" action
    fireEvent.click(document.querySelector('[data-lf-canvas-new-board]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-mock-tldraw="board-3"]')).toBeTruthy()
    })

    // Switch back to board-2 from sidebar
    fireEvent.click(document.querySelector('[data-lf-canvas-board-btn="board-2"]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-mock-tldraw="board-2"]')).toBeTruthy()
    })
  })

  it('batch-relocates missing images from a chosen folder via mini-panel', async () => {
    frameStore.reset()
    const frame = createFolioFrameService({
      View: FrameWorkbench,
      openWorkspace: vi.fn(),
    })
    frame.registerApp(createCanvasApp({ CanvasStageComponent: TestCanvasStage }))
    frame.attachHostWorkspace(CANVAS_WORKSPACE_ID)
    frame.activateApp(CANVAS_APP_ID)

    render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(FolioUiHost),
        React.createElement(
          'div',
          { 'data-lf-shell': '', style: { width: 1200, height: 800 } },
          React.createElement(FrameWorkbench),
        ),
      ),
    )

    await waitFor(() => {
      expect(screen.getByText('1 张图片已移动 · 重新链接')).toBeTruthy()
    })

    fireEvent.click(document.querySelector('[data-lf-canvas-links-pill]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-relink-batch]')).toBeTruthy()
    })

    fireEvent.click(document.querySelector('[data-lf-relink-batch]')!)
    await waitFor(() => {
      expect(screen.getByText('图片链接 (1)')).toBeTruthy()
      expect(screen.getByText('没有失效的图片链接')).toBeTruthy()
    })
    fireEvent.click(document.querySelector('[data-lf-relink-filter="all"]')!)
    await waitFor(() => {
      expect(screen.getByText('D:\\Moved\\poster.png')).toBeTruthy()
    })
  })
})
