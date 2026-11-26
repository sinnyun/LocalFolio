// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FolioUiHost } from '@folio/base-ui-kit/client'
import { FrameWorkbench } from '../../../base-frame-ui/src/frame/FrameWorkbench.js'
import { createFolioFrameService } from '../../../base-frame-ui/src/frame/service.js'
import { frameStore } from '../../../base-frame-ui/src/frame/store.js'
import {
  CANVAS_APP_ID,
  CANVAS_WORKSPACE_ID,
  LinkedImagesPanel,
  createCanvasApp,
  createFolioCanvasService,
  useCanvas,
  type BoardDocument,
  type BoardMeta,
  type LinkedImageInspectResult,
} from '../../../workspace-canvas-ui/src/client.js'
import {
  createEagleLinkSourceProvider,
  extractEagleDeepLinkIds,
  isPotentialEagleInfoPath,
  resetEagleDebugStore,
  type EagleImageSource,
} from '../client.js'

describe('@folio/feature-canvas-eagle-ui helpers', () => {
  it('recognizes candidate Eagle .info paths and eagle://item/{id} deep links', () => {
    expect(isPotentialEagleInfoPath('D:\\EagleLib\\images\\MUF1LNTTIIFPG.info\\shot.png')).toBe(
      true,
    )
    expect(isPotentialEagleInfoPath('file:///D:/EagleLib/MUF1LNTTIIFPG.info/shot.png')).toBe(true)
    expect(isPotentialEagleInfoPath('D:\\Photos\\regular.png')).toBe(false)

    expect(
      extractEagleDeepLinkIds(
        'eagle://item/MUF1LNTTIIFPG\nhttps://example.com\neagle://item/MUF1LNTTIIFPG\neagle://item/ABC999/',
      ),
    ).toEqual(['MUF1LNTTIIFPG', 'ABC999'])
  })
})

describe('@folio/feature-canvas-eagle-ui integration', () => {
  let boardsState: BoardMeta[]
  let docsState: Record<string, BoardDocument>
  let openCalls: string[]
  let resolveFromPathsCalls: string[][]
  let resolveByIdCalls: string[]

  const eagleOriginalPath = 'D:\\EagleLib\\images\\MUF1LNTTIIFPG.info\\WILDWOOD.jpg'
  const plainRelinkPath = 'D:\\Photos\\replacement.png'

  const sampleEagleSource: EagleImageSource = {
    itemId: 'MUF1LNTTIIFPG',
    apiUrl: 'http://127.0.0.1:41595/api/v2/item/get?id=MUF1LNTTIIFPG',
    name: 'WILDWOOD - LAIKA',
    ext: 'jpg',
    size: 42000,
    originalPath: eagleOriginalPath,
    originalUri: 'file:///D:/EagleLib/images/MUF1LNTTIIFPG.info/WILDWOOD.jpg',
    thumbnailPath: 'D:\\EagleLib\\images\\MUF1LNTTIIFPG.info\\WILDWOOD_thumbnail.png',
    folders: [{ id: 'FLD1', name: '场景参考' }],
  }

  type CanvasEditor = NonNullable<Parameters<ReturnType<typeof useCanvas>['attachEditor']>[0]>

  function createMockEditor(boardId: string): CanvasEditor {
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
      createShapes: (
        shapes: Array<{ id: string; type: string; x: number; y: number; props: Record<string, unknown> }>,
      ) => {
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
    } as unknown as CanvasEditor
  }

  function TestCanvasStage(): React.ReactElement {
    const {
      activeBoardId,
      activeDoc,
      linkedImages,
      relinkPanelOpen,
      setRelinkPanelOpen,
      attachEditor,
      insertLinkedImages,
      insertFromExternalText,
      relinkAsset,
    } = useCanvas()

    React.useEffect(() => {
      if (!activeDoc || activeDoc.id !== activeBoardId) return
      const editor = createMockEditor(activeBoardId)
      attachEditor(editor)
      return () => {
        attachEditor(null)
      }
    }, [activeBoardId, activeDoc?.id, attachEditor])

    return (
      <div data-lf-canvas-stage="">
        <button
          type="button"
          data-lf-canvas-links-pill=""
          onClick={() => setRelinkPanelOpen(!relinkPanelOpen)}
        >
          {`图片链接 (${linkedImages.length})`}
        </button>
        <button
          type="button"
          data-lf-test-drop-eagle-path=""
          onClick={() => void insertLinkedImages([eagleOriginalPath])}
        >
          drop-eagle-path
        </button>
        <button
          type="button"
          data-lf-test-drop-eagle-deeplink=""
          onClick={() => void insertFromExternalText('eagle://item/MUF1LNTTIIFPG')}
        >
          drop-eagle-deeplink
        </button>
        <button
          type="button"
          data-lf-test-relink-plain=""
          onClick={() => {
            const first = linkedImages[0]
            if (first) void relinkAsset(first.assetId, plainRelinkPath)
          }}
        >
          relink-plain
        </button>
        <LinkedImagesPanel />
      </div>
    )
  }

  beforeEach(() => {
    localStorage.clear()
    resetEagleDebugStore()
    openCalls = []
    resolveFromPathsCalls = []
    resolveByIdCalls = []

    const now = Date.now()
    boardsState = [
      {
        id: 'board-1',
        title: 'Eagle 画板',
        createdAt: now - 1000,
        updatedAt: now,
        imageCount: 0,
        brokenCount: 0,
      },
    ]
    docsState = {
      'board-1': {
        version: 1,
        id: 'board-1',
        updatedAt: now,
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
          case 'canvas.boards.save': {
            const id = String(body.id)
            docsState[id] = {
              version: 1,
              id,
              snapshot: body.snapshot as Record<string, unknown>,
              updatedAt: Date.now(),
            }
            return ok({
              meta: boardsState[0],
              updatedAt: Date.now(),
              strippedInlineCount: 0,
            })
          }
          case 'canvas.eagle.resolveFromPaths': {
            const paths = (body.paths as string[]) ?? []
            resolveFromPathsCalls.push(paths)
            return ok({
              items: paths.map(p => ({
                path: p,
                source: p === eagleOriginalPath ? sampleEagleSource : null,
              })),
            })
          }
          case 'canvas.eagle.resolveById': {
            const itemId = String(body.itemId ?? '')
            resolveByIdCalls.push(itemId)
            return ok({ source: sampleEagleSource })
          }
          case 'canvas.eagle.openItem': {
            const itemId = String(body.itemId ?? '')
            openCalls.push(itemId)
            return ok({
              itemId,
              deepLink: `eagle://item/${itemId}`,
              durationMs: 12,
              strippedElectronRunAsNode: true,
            })
          }
          case 'canvas.links.inspect': {
            const paths = (body.paths as string[]) ?? []
            const items: LinkedImageInspectResult[] = paths.map(p => ({
              path: p,
              exists: true,
              fileName: p.split(/[\\/]/).pop() ?? 'image.png',
              ext: p.endsWith('.jpg') ? '.jpg' : '.png',
              mime: p.endsWith('.jpg') ? 'image/jpeg' : 'image/png',
              size: 42000,
              mtimeMs: 1700000000,
              naturalWidth: 1920,
              naturalHeight: 1080,
              isImage: true,
            }))
            return ok({ items })
          }
          case 'canvas.links.check': {
            const paths = (body.paths as string[]) ?? []
            return ok({
              items: paths.map(p => ({
                path: p,
                exists: true,
                size: 42000,
                mtimeMs: 1700000000,
              })),
            })
          }
          case 'canvas.cache.stats':
            return ok({
              fileCount: 0,
              totalBytes: 0,
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

  it('converts Eagle drops & deep links into canvas links, persists metadata, opens in Eagle, and cleans up on relink/dispose', async () => {
    frameStore.reset()
    const canvasService = createFolioCanvasService()
    const disposeProvider = canvasService.registerLinkSource(createEagleLinkSourceProvider())

    const frame = createFolioFrameService({
      View: FrameWorkbench,
      openWorkspace: vi.fn(),
    })
    frame.registerApp(
      createCanvasApp({
        CanvasStageComponent: TestCanvasStage,
        canvasService,
      }),
    )
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
      expect(document.querySelector('[data-lf-test-drop-eagle-path]')).toBeTruthy()
    })

    // 1. Drop Eagle .info original image path -> converts to canvas link & persists Eagle metadata
    fireEvent.click(document.querySelector('[data-lf-test-drop-eagle-path]')!)
    await waitFor(() => {
      expect(screen.getByText('图片链接 (1)')).toBeTruthy()
    })
    expect(resolveFromPathsCalls).toEqual([[eagleOriginalPath]])

    const storeAfterDrop = (
      docsState['board-1']!.snapshot.document as { store: Record<string, Record<string, unknown>> }
    ).store
    const assetEntries = Object.values(storeAfterDrop).filter(
      r => r.typeName === 'asset' && r.type === 'image',
    )
    expect(assetEntries).toHaveLength(1)
    const firstAssetId = String(assetEntries[0]!.id)
    const firstMeta = assetEntries[0]!.meta as Record<string, unknown>
    expect(firstMeta.folioLink).toBe(true)
    expect(firstMeta.localPath).toBe(eagleOriginalPath)
    expect(firstMeta.eagle).toMatchObject({
      itemId: 'MUF1LNTTIIFPG',
      name: 'WILDWOOD - LAIKA',
      folders: [{ id: 'FLD1', name: '场景参考' }],
    })

    // 2. Open LinkedImagesPanel -> displays Eagle source badge, expandable 6 fields, and Open in Eagle button
    fireEvent.click(document.querySelector('[data-lf-canvas-links-pill]')!)
    await waitFor(() => {
      expect(document.querySelector(`[data-lf-eagle-source="${firstAssetId}"]`)).toBeTruthy()
    })
    expect(document.querySelector(`[data-lf-eagle-source="${firstAssetId}"]`)?.textContent).toContain(
      'WILDWOOD - LAIKA',
    )
    expect(document.querySelector(`[data-lf-eagle-source="${firstAssetId}"]`)?.textContent).toContain(
      '场景参考',
    )

    fireEvent.click(document.querySelector(`[data-lf-eagle-toggle="${firstAssetId}"]`)!)
    await waitFor(() => {
      expect(document.querySelector(`[data-lf-eagle-details="${firstAssetId}"]`)).toBeTruthy()
    })
    const detailsText =
      document.querySelector(`[data-lf-eagle-details="${firstAssetId}"]`)?.textContent ?? ''
    expect(detailsText).toContain('MUF1LNTTIIFPG')
    expect(detailsText).toContain('场景参考')
    expect(detailsText).toContain('WILDWOOD.jpg')
    expect(detailsText).toContain('WILDWOOD_thumbnail.png')

    fireEvent.click(document.querySelector(`[data-lf-eagle-open-btn="${firstAssetId}"]`)!)
    await waitFor(() => {
      expect(openCalls).toEqual(['MUF1LNTTIIFPG'])
      expect(
        document.querySelector(`[data-lf-eagle-open-status="${firstAssetId}"]`)?.textContent,
      ).toContain('已派发')
    })

    // 2b. Expand Eagle debug panel and inspect recorded RPC trace
    fireEvent.click(document.querySelector('[data-lf-eagle-debug-toggle]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-eagle-debug-panel]')).toBeTruthy()
    })
    const logsText = document.querySelector('[data-lf-eagle-debug-logs]')?.textContent ?? ''
    expect(logsText).toContain('canvas.eagle.openItem')
    expect(logsText).toContain('ELECTRON_RUN_AS_NODE')

    // 3. Drop/paste eagle://item/{id} deep link -> resolves via canvas.eagle.resolveById
    fireEvent.click(document.querySelector('[data-lf-test-drop-eagle-deeplink]')!)
    await waitFor(() => {
      expect(screen.getByText('图片链接 (2)')).toBeTruthy()
    })
    expect(resolveByIdCalls).toEqual(['MUF1LNTTIIFPG'])

    // 4. Relinking to a non-Eagle path clears meta.eagle
    fireEvent.click(document.querySelector('[data-lf-test-relink-plain]')!)
    await waitFor(() => {
      expect(document.querySelector(`[data-lf-eagle-source="${firstAssetId}"]`)).toBeNull()
    })

    // 5. Disposing the Eagle provider cleanly removes Eagle UI from remaining items
    disposeProvider()
    await waitFor(() => {
      expect(document.querySelector('[data-lf-eagle-source]')).toBeNull()
      expect(document.querySelector('[data-lf-eagle-open-btn]')).toBeNull()
    })
  })
})
