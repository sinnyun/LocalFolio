// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { FolioUiHost, SidebarProvider } from '@folio/base-ui-kit/client'
import {
  MaterialsMain,
  MaterialsProvider,
  MaterialsSidebar,
  MaterialsStatus,
  type CatalogResponse,
  type MaterialFileState,
  type MaterialProject,
  type ProjectsState,
  type VectorCraftStatus,
} from '../client.js'

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const dummyFrame = {
  appId: 'materials.workbench',
  layout: {
    leftCollapsed: false,
    leftWidth: 264,
    rightCollapsed: false,
    rightWidth: 320,
  },
  listApps: () => [],
  activateApp: () => {},
  setLeftCollapsed: () => {},
  setRightCollapsed: () => {},
  toggleLeft: () => {},
  toggleRight: () => {},
  setLeftWidth: () => {},
  setRightWidth: () => {},
  resetLayout: () => {},
}

describe('@folio/workspace-materials-ui', () => {
  let rpcCalls: Array<{ action: string; body: Record<string, unknown> }>
  let project: MaterialProject
  let fileState: MaterialFileState
  let catalog: CatalogResponse
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    rpcCalls = []
    project = {
      id: 'proj-1',
      name: '2026 春季新品发布会',
      description: '主会场物料',
      files: [
        {
          id: 'vcfile-1',
          path: 'D:\\Projects\\发布会物料.vectorcraft',
          name: '发布会物料.vectorcraft',
          addedAt: 1000,
        },
      ],
      createdAt: 1000,
      updatedAt: 1000,
    }

    fileState = {
      fileId: 'vcfile-1',
      path: 'D:\\Projects\\发布会物料.vectorcraft',
      name: '发布会物料.vectorcraft',
      exists: true,
      mtimeMs: 2000,
      size: 50000,
      documentTitle: '发布会物料',
      artboardCount: 2,
      activeInLiveControl: false,
      dirtyInLiveControl: false,
      error: null,
      pages: [
        {
          fileId: 'vcfile-1',
          filePath: 'D:\\Projects\\发布会物料.vectorcraft',
          fileName: '发布会物料.vectorcraft',
          artboardIndex: 0,
          artboardId: 1,
          artboardKey: 'id:1',
          artboardName: '主舞台',
          pageNumber: '01',
          x: 0,
          y: 0,
          widthPt: 1190.55,
          heightPt: 841.89,
          widthMm: 420,
          heightMm: 297,
          isA3Landscape: true,
          hasMaterialHeader: true,
          headerGroupId: 10,
          headerLocked: true,
          specText: '喷绘布+桁架 | 四周打孔 | 600×300cm | 1 套 | 需现场安装',
          syncSource: 'header',
          fields: {
            title: '主舞台',
            showProjectName: false,
            projectNameOverride: '',
            material: '喷绘布+桁架',
            craft: '四周打孔',
            size: '600×300cm',
            quantity: '1 套',
            note: '需现场安装',
          },
        },
        {
          fileId: 'vcfile-1',
          filePath: 'D:\\Projects\\发布会物料.vectorcraft',
          fileName: '发布会物料.vectorcraft',
          artboardIndex: 1,
          artboardId: 2,
          artboardKey: 'id:2',
          artboardName: '签到处',
          pageNumber: '02',
          x: 1210.55,
          y: 0,
          widthPt: 1190.55,
          heightPt: 841.89,
          widthMm: 420,
          heightMm: 297,
          isA3Landscape: true,
          hasMaterialHeader: true,
          headerGroupId: 20,
          headerLocked: true,
          specText: '10mm 安迪板 | UV平板直喷 | 400×300cm | 1 套 | 含安装',
          syncSource: 'header',
          fields: {
            title: '签到处',
            showProjectName: true,
            projectNameOverride: '',
            material: '10mm 安迪板',
            craft: 'UV平板直喷',
            size: '400×300cm',
            quantity: '1 套',
            note: '含安装',
          },
        },
      ],
    }

    catalog = {
      defaultOptions: [
        {
          id: 'def-mat-1',
          category: 'material',
          label: '3mm 亚克力',
          value: '3mm 亚克力',
          description: '透明亚克力',
          sortOrder: 1,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      defaultTemplates: [
        {
          id: 'def-tpl-1',
          name: '标准易拉宝',
          title: '易拉宝',
          material: 'PP合成纸',
          craft: '覆哑膜',
          size: '80×200cm',
          quantity: '4 个',
          note: '含底座',
          showProjectName: false,
          sortOrder: 1,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      projectOptions: [
        {
          id: 'proj-mat-1',
          category: 'material',
          label: '项目专属铝塑板',
          value: '项目专属铝塑板',
          description: '当前项目自定义',
          sortOrder: 1,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      projectTemplates: [],
    }

    const vcStatus: VectorCraftStatus = {
      cliPath: 'C:\\Program Files\\VectorCraft\\vectorcraft-cli.exe',
      cliFound: true,
      cliVersion: 'vectorcraft-cli 0.24.1',
      appPath: 'C:\\Program Files\\VectorCraft\\vectorcraft.exe',
      appFound: true,
      controlPort: 7979,
      liveConnected: false,
      liveActiveDocumentPath: null,
      liveOpenDocuments: [],
      settings: {
        version: 1,
        cliPath: '',
        appPath: '',
        controlPort: 7979,
        autoWatchFiles: true,
        autoPollLiveControl: true,
        defaultExportDir: 'D:\\Exports',
      },
    }

    originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const action = decodeURIComponent(url.split('/lf/rpc/')[1] ?? '')
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
      rpcCalls.push({ action, body })

      switch (action) {
        case 'materials.projects.list': {
          const ps: ProjectsState = {
            version: 1,
            activeProjectId: project.id,
            projects: [project],
          }
          return jsonOk(ps)
        }
        case 'materials.status':
          return jsonOk(vcStatus)
        case 'materials.catalog.get':
          return jsonOk(catalog)
        case 'materials.project.inspect':
          return jsonOk({
            project,
            files: [fileState],
            liveConnected: false,
            liveActiveDocumentPath: null,
          })
        case 'materials.pages.updateHeader': {
          const idx = Number(body.artboardIndex ?? 0)
          const fields = body.fields as MaterialFileState['pages'][number]['fields']
          fileState = {
            ...fileState,
            pages: fileState.pages.map(p =>
              p.artboardIndex === idx
                ? {
                    ...p,
                    fields,
                    specText: [
                      fields.material,
                      fields.craft,
                      fields.size,
                      fields.quantity,
                      fields.note,
                    ]
                      .filter(Boolean)
                      .join(' | '),
                  }
                : p,
            ),
          }
          return jsonOk({ file: fileState, usedLiveControl: false })
        }
        case 'materials.pages.reorder': {
          const from = Number(body.fromIndex)
          const to = Number(body.toIndex)
          const nextPages = [...fileState.pages]
          const [moved] = nextPages.splice(from, 1)
          if (moved) nextPages.splice(to, 0, moved)
          fileState = {
            ...fileState,
            pages: nextPages.map((p, i) => ({
              ...p,
              artboardIndex: i,
              pageNumber: String(i + 1).padStart(2, '0'),
            })),
          }
          return jsonOk({ file: fileState })
        }
        case 'materials.export':
          return jsonOk({
            outputDir: String(body.outputDir ?? 'D:\\Exports'),
            exported: [
              {
                path: 'D:\\Exports\\2026 春季新品发布会_物料.pdf',
                format: 'pdf',
                bytes: 24576,
                warnings: [],
              },
            ],
          })
        case 'materials.catalog.option.upsert': {
          const newOpt = {
            id: 'proj-opt-new',
            category: body.category as CatalogResponse['projectOptions'][number]['category'],
            label: String(body.value),
            value: String(body.value),
            description: String(body.description ?? ''),
            sortOrder: 2,
            createdAt: 2000,
            updatedAt: 2000,
          }
          catalog = {
            ...catalog,
            projectOptions: [...catalog.projectOptions, newOpt],
          }
          return jsonOk(catalog)
        }
        case 'materials.catalog.option.delete': {
          const ids = new Set(body.ids as string[])
          catalog = {
            ...catalog,
            defaultOptions: catalog.defaultOptions.filter(o => !ids.has(o.id)),
            projectOptions: catalog.projectOptions.filter(o => !ids.has(o.id)),
          }
          return jsonOk(catalog)
        }
        default:
          return jsonOk({})
      }
    }) as typeof globalThis.fetch
  })

  afterEach(() => {
    cleanup()
    globalThis.fetch = originalFetch
  })

  function renderWorkspace() {
    return render(
      <div data-lf-shell="">
        <FolioUiHost />
        <MaterialsProvider>
          <SidebarProvider>
            <MaterialsSidebar appId="materials.workbench" frame={dummyFrame} />
            <MaterialsMain appId="materials.workbench" frame={dummyFrame} />
            <MaterialsStatus />
          </SidebarProvider>
        </MaterialsProvider>
      </div>,
    )
  }

  it('supports Layer 1 select-all & export, Layer 2 slide reorder & quick-pick header write, and Data Manager tables', async () => {
    const { container } = renderWorkspace()

    await waitFor(() => {
      expect(container.querySelector('[data-lf-page-card="vcfile-1::0"]')).not.toBeNull()
    })

    // Layer 1: select all pages and open Export PDF dialog
    fireEvent.click(container.querySelector('[data-lf-pages-select-all=""]')!)
    expect(container.textContent).toContain('已选 2 页')

    fireEvent.click(container.querySelector('[data-lf-export-pdf-btn=""]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-export-dialog=""]')).not.toBeNull()
    })
    fireEvent.click(document.querySelector('[data-lf-export-confirm-btn=""]')!)
    await waitFor(() => {
      expect(rpcCalls.some(c => c.action === 'materials.export')).toBe(true)
    })

    // Enter Layer 2 slide editor on page 0
    fireEvent.click(container.querySelector('[data-lf-page-edit-btn="vcfile-1::0"]')!)
    await waitFor(() => {
      expect(container.querySelector('[data-lf-page-editor-view=""]')).not.toBeNull()
      expect(container.querySelector('[data-lf-material-info-panel=""]')).not.toBeNull()
    })

    // Quick-pick dropdown for 材质 -> pick project custom option "项目专属铝塑板"
    fireEvent.click(container.querySelector('[data-lf-quick-pick-toggle="field-material"]')!)
    await waitFor(() => {
      expect(
        container.querySelector('[data-lf-quick-pick-option="项目专属铝塑板"]'),
      ).not.toBeNull()
    })
    fireEvent.click(container.querySelector('[data-lf-quick-pick-option="项目专属铝塑板"]')!)

    await waitFor(() => {
      const updateCall = rpcCalls.find(c => c.action === 'materials.pages.updateHeader')
      expect(updateCall).toBeDefined()
      expect((updateCall?.body.fields as { material: string }).material).toBe('项目专属铝塑板')
    })

    // Reorder slide 0 down to index 1
    fireEvent.click(container.querySelector('[data-lf-slide-move-down="0"]')!)
    await waitFor(() => {
      const reorderCall = rpcCalls.find(c => c.action === 'materials.pages.reorder')
      expect(reorderCall).toBeDefined()
      expect(reorderCall?.body).toMatchObject({ fromIndex: 0, toIndex: 1 })
    })

    // Open Material Data Manager and verify Default vs Project data tables
    fireEvent.click(container.querySelector('[data-lf-materials-open-data=""]')!)
    await waitFor(() => {
      expect(container.querySelector('[data-lf-data-manager=""]')).not.toBeNull()
      expect(container.textContent).toContain('项目专属铝塑板')
    })

    const defaultTab = container.querySelector('[data-lf-data-scope-default=""]')!
    fireEvent.mouseDown(defaultTab, { button: 0 })
    fireEvent.click(defaultTab)
    await waitFor(() => {
      expect(container.textContent).toContain('3mm 亚克力')
    })
  })
})
