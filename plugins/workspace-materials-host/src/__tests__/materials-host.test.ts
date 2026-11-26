import fs from 'node:fs'
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
  A3_LANDSCAPE_HEIGHT_PT,
  A3_LANDSCAPE_WIDTH_PT,
  buildHeaderCommandsForArtboard,
  compileCliCommands,
  extractVectorCraftJson,
  formatPageNumber,
  formatSpecLine,
  isA3LandscapeSize,
  parseSpecLine,
  parseVectorCraftObject,
  registerWorkspaceMaterialsHost,
  type CatalogState,
  type ExportResult,
  type MaterialFileState,
  type MaterialProject,
  type MaterialsDialogProvider,
  type ProjectsState,
} from '../host.js'

const REAL_VC_CLI = 'C:\\Program Files\\VectorCraft\\vectorcraft-cli.exe'
const hasRealCli = fs.existsSync(REAL_VC_CLI)

describe('@folio/workspace-materials-host pure parser & command builder', () => {
  it('formats page numbers, spec lines, and parses structured fields with optional prefixes', () => {
    expect(formatPageNumber(0)).toBe('01')
    expect(formatPageNumber(11)).toBe('12')

    expect(
      formatSpecLine({
        material: '10mm 安迪板',
        craft: 'UV平板直喷',
        size: '400×300cm',
        quantity: '2 块',
        note: '需现场安装',
      }),
    ).toBe('10mm 安迪板 | UV平板直喷 | 400×300cm | 2 块 | 需现场安装')

    expect(parseSpecLine('亚克力 | 激光切割 | 80×180cm | 4个 | 含底座')).toEqual({
      material: '亚克力',
      craft: '激光切割',
      size: '80×180cm',
      quantity: '4个',
      note: '含底座',
    })

    expect(parseSpecLine('材质 喷绘布 | 工艺 打孔 | 尺寸 600×300cm | 数量 1套 | 备注 留白')).toEqual({
      material: '喷绘布',
      craft: '打孔',
      size: '600×300cm',
      quantity: '1套',
      note: '留白',
    })

    expect(isA3LandscapeSize(A3_LANDSCAPE_WIDTH_PT, A3_LANDSCAPE_HEIGHT_PT)).toBe(true)
    expect(isA3LandscapeSize(800, 600)).toBe(false)
  })

  it('extracts JSON before VCBLOBS trailer and detects live GUI edits vs sidecar', () => {
    const sampleDoc = {
      format: 'vectorcraft',
      document: {
        title: '测试物料',
        artboards: [
          { id: 1, name: '主舞台', rect: { x0: 0, y0: 0, x1: A3_LANDSCAPE_WIDTH_PT, y1: A3_LANDSCAPE_HEIGHT_PT } },
          { id: 2, name: '签到区', rect: { x0: 1210.55, y0: 0, x1: 2401.1, y1: A3_LANDSCAPE_HEIGHT_PT } },
        ],
        layers: [
          {
            id: 2,
            name: 'LF Material Header',
            kind: {
              type: 'layer',
              children: [
                {
                  id: 20,
                  name: 'LF_MATERIAL_HEADER_1',
                  locked: true,
                  kind: {
                    type: 'group',
                    children: [
                      {
                        id: 21,
                        name: 'LF_MATERIAL_BAND',
                        kind: {
                          type: 'path',
                          live: { shape: 'rectangle', w: 1158, h: 52, xf: [1, 0, 0, 1, 16, 16] },
                        },
                      },
                      {
                        id: 22,
                        name: 'LF_PAGE_TITLE',
                        kind: { type: 'text', xf: [1, 0, 0, 1, 70, 48], runs: [{ text: '主舞台背景' }] },
                      },
                      {
                        id: 23,
                        name: 'LF_PROJECT_NAME',
                        kind: { type: 'text', xf: [1, 0, 0, 1, 200, 47], runs: [{ text: '- 春季发布会' }] },
                      },
                      {
                        id: 24,
                        name: 'LF_MATERIAL_SPEC',
                        kind: {
                          type: 'text',
                          xf: [1, 0, 0, 1, 1162, 46],
                          runs: [{ text: '桁架喷绘布 | 打孔绑扎 | 600×300cm | 1套 | 现场修改备注' }],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    }

    const withBlob = Buffer.concat([
      Buffer.from(JSON.stringify(sampleDoc), 'utf8'),
      Buffer.from('\nVCBLOBS\x89PNG\r\n\x1a\n', 'latin1'),
    ])
    const extracted = extractVectorCraftJson(withBlob)
    const parsed = parseVectorCraftObject(extracted, {
      fileId: 'f1',
      filePath: 'D:\\demo.vectorcraft',
      fileName: 'demo.vectorcraft',
      sidecarEntries: {
        'id:1': {
          artboardKey: 'id:1',
          fields: {
            title: '主舞台背景',
            showProjectName: true,
            projectNameOverride: '',
            material: '桁架喷绘布',
            craft: '打孔绑扎',
            size: '600×300cm',
            quantity: '1套',
            note: '旧备注',
          },
          lastRenderedSpecText: '桁架喷绘布 | 打孔绑扎 | 600×300cm | 1套 | 旧备注',
          lastRenderedTitle: '主舞台背景',
          updatedAt: 1000,
        },
      },
    })

    expect(parsed.pages).toHaveLength(2)
    expect(parsed.pages[0]?.syncSource).toBe('live-edited')
    expect(parsed.pages[0]?.fields.note).toBe('现场修改备注')
    expect(parsed.pages[0]?.fields.showProjectName).toBe(true)
    expect(parsed.pages[0]?.fields.projectNameOverride).toBe('春季发布会')
  })

  it('compiles symbolic command refs with --in step offset', () => {
    const cmds = buildHeaderCommandsForArtboard({
      artboardIndex: 0,
      x: 0,
      y: 0,
      width: A3_LANDSCAPE_WIDTH_PT,
      height: A3_LANDSCAPE_HEIGHT_PT,
      fields: {
        title: '签到墙',
        showProjectName: true,
        projectNameOverride: '',
        material: '雪弗板',
        craft: 'UV直喷',
        size: '400×300cm',
        quantity: '1套',
        note: '现场安装',
      },
      projectDisplayName: '发布会项目',
      existingHeaderGroups: [],
      renameArtboard: true,
    })

    const compiled = compileCliCommands(cmds, 0)
    const groupStep = compiled.find(c => c.command === 'object.group')
    expect(groupStep).toBeDefined()
    const ids = groupStep?.params.ids as string[]
    expect(ids).toHaveLength(6)
    expect(ids[0]).toMatch(/^\$\d+\.id$/)
    const lockStep = compiled[compiled.length - 1]
    expect(lockStep?.command).toBe('object.setProps')
    expect(lockStep?.params.locked).toBe(true)
    expect(lockStep?.params.name).toBe('LF_MATERIAL_HEADER_1')
  })
})

describe('@folio/workspace-materials-host RPC & VectorCraft E2E', () => {
  let tmpDir: string
  let dataDir: string
  let workDir: string
  let exportDir: string
  let runtime: ManagedFolioRuntime
  let disposeMaterials: () => void

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'folio-materials-host-'))
    dataDir = path.join(tmpDir, 'appdata')
    workDir = path.join(tmpDir, 'projects')
    exportDir = path.join(tmpDir, 'exports')
    await fsp.mkdir(workDir, { recursive: true })
    await fsp.mkdir(exportDir, { recursive: true })

    const stubDialog: MaterialsDialogProvider = {
      async pickVectorCraftFiles() {
        return { supported: true, cancelled: true, paths: [] }
      },
      async pickSaveVectorCraftFile() {
        return { supported: true, cancelled: true, filePath: null }
      },
      async pickFolder() {
        return { supported: true, cancelled: false, folderPath: exportDir }
      },
      async revealPath(targetPath) {
        return { revealedPath: targetPath }
      },
    }

    const storage = createFolioStorageService({ dataDir })
    runtime = createFolioRuntimeService({
      storage,
      admit: req => req.headers['x-test-auth'] === 'ok' || 401,
    })

    disposeMaterials = registerWorkspaceMaterialsHost({
      runtime,
      storage,
      dialogProvider: stubDialog,
      disableAutoSync: true,
    })
  })

  afterEach(async () => {
    disposeMaterials()
    runtime.dispose()
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  it('manages projects and default vs project material catalog tables', async () => {
    const created = await runtime.executeAction<{
      state: ProjectsState
      project: MaterialProject
    }>('materials.projects.create', {
      name: '春季展会物料',
      description: '主会场制作清单',
    })
    expect(created.project.name).toBe('春季展会物料')

    const initialCat = await runtime.executeAction<CatalogState & {
      defaultOptions: unknown[]
      defaultTemplates: unknown[]
      projectOptions: unknown[]
      projectTemplates: unknown[]
    }>('materials.catalog.get', { projectId: created.project.id })
    expect(initialCat.defaultOptions.length).toBeGreaterThan(10)
    expect(initialCat.defaultTemplates.length).toBeGreaterThan(5)
    expect(initialCat.projectOptions).toHaveLength(0)

    const afterOpt = await runtime.executeAction<{
      projectOptions: Array<{ id: string; value: string; category: string }>
    }>('materials.catalog.option.upsert', {
      scope: 'project',
      projectId: created.project.id,
      category: 'material',
      value: '拉丝不锈钢底座',
      description: '项目专用材质',
    })
    expect(afterOpt.projectOptions).toHaveLength(1)
    expect(afterOpt.projectOptions[0]?.value).toBe('拉丝不锈钢底座')

    const afterTpl = await runtime.executeAction<{
      projectTemplates: Array<{ id: string; name: string }>
    }>('materials.catalog.template.upsert', {
      scope: 'project',
      projectId: created.project.id,
      name: 'VIP 签到牌',
      title: 'VIP 签到台',
      material: '拉丝不锈钢底座',
      craft: '激光雕刻',
      size: '30×40cm',
      quantity: '4 个',
      note: '配绒布套',
    })
    expect(afterTpl.projectTemplates).toHaveLength(1)

    await runtime.executeAction('materials.catalog.option.delete', {
      scope: 'project',
      projectId: created.project.id,
      ids: [afterOpt.projectOptions[0]!.id],
    })
    const afterDel = await runtime.executeAction<{ projectOptions: unknown[] }>(
      'materials.catalog.get',
      { projectId: created.project.id },
    )
    expect(afterDel.projectOptions).toHaveLength(0)
  })

  it.skipIf(!hasRealCli)(
    'creates A3 VectorCraft doc, writes headers, reorders artboards with auto-renumbering, exports PNG/PDF, and serves preview route',
    async () => {
      const { project } = await runtime.executeAction<{ project: MaterialProject }>(
        'materials.projects.create',
        { name: 'E2E 物料项目' },
      )

      const vcPath = path.join(workDir, 'demo.vectorcraft')
      const fileCreate = await runtime.executeAction<{
        project: MaterialProject
        added: Array<{ id: string; path: string }>
      }>('materials.files.create', {
        projectId: project.id,
        filePath: vcPath,
        title: 'E2E 物料文件',
        artboardCount: 2,
      })

      const fileId = fileCreate.added[0]!.id
      expect(fs.existsSync(vcPath)).toBe(true)

      const inspected1 = await runtime.executeAction<MaterialFileState>('materials.files.inspect', {
        projectId: project.id,
        fileId,
      })
      expect(inspected1.pages).toHaveLength(2)
      expect(inspected1.pages[0]?.isA3Landscape).toBe(true)
      expect(inspected1.pages[0]?.pageNumber).toBe('01')
      expect(inspected1.pages[1]?.pageNumber).toBe('02')

      // Write header on page 0 and page 1
      await runtime.executeAction('materials.pages.updateHeader', {
        projectId: project.id,
        fileId,
        artboardIndex: 0,
        fields: {
          title: '主舞台',
          showProjectName: true,
          projectNameOverride: '',
          material: '桁架喷绘布',
          craft: '四周打孔',
          size: '600×300cm',
          quantity: '1 套',
          note: '含搭建',
        },
      })

      const afterUpdate = await runtime.executeAction<{ file: MaterialFileState }>(
        'materials.pages.updateHeader',
        {
          projectId: project.id,
          fileId,
          artboardIndex: 1,
          fields: {
            title: '签到墙',
            showProjectName: false,
            projectNameOverride: '',
            material: '10mm 雪弗板',
            craft: 'UV直喷',
            size: '400×300cm',
            quantity: '1 套',
            note: '现场安装',
          },
        },
      )

      expect(afterUpdate.file.pages[0]?.fields.title).toBe('主舞台')
      expect(afterUpdate.file.pages[1]?.fields.title).toBe('签到墙')
      expect(afterUpdate.file.pages[0]?.specText).toBe('桁架喷绘布 | 四周打孔 | 600×300cm | 1 套 | 含搭建')

      // Reorder page 1 ("签到墙") to index 0 -> page 0 should become 签到墙 with pageNumber "01"
      const reordered = await runtime.executeAction<{ file: MaterialFileState }>(
        'materials.pages.reorder',
        {
          projectId: project.id,
          fileId,
          fromIndex: 1,
          toIndex: 0,
        },
      )
      expect(reordered.file.pages[0]?.fields.title).toBe('签到墙')
      expect(reordered.file.pages[0]?.pageNumber).toBe('01')
      expect(reordered.file.pages[1]?.fields.title).toBe('主舞台')
      expect(reordered.file.pages[1]?.pageNumber).toBe('02')

      // Add a 3rd A3 page
      const addedRes = await runtime.executeAction<{ file: MaterialFileState; addedIndex: number }>(
        'materials.pages.add',
        {
          projectId: project.id,
          fileId,
          fields: {
            title: '导视立牌',
            showProjectName: false,
            projectNameOverride: '',
            material: '10mm 雪弗板',
            craft: '异形模切',
            size: '80×180cm',
            quantity: '4 个',
            note: '配底座',
          },
        },
      )
      expect(addedRes.addedIndex).toBe(2)
      expect(addedRes.file.pages).toHaveLength(3)
      expect(addedRes.file.pages[2]?.pageNumber).toBe('03')

      // Export PNG for pages 0 and 2
      const pngExport = await runtime.executeAction<ExportResult>('materials.export', {
        projectId: project.id,
        items: [
          { fileId, artboardIndex: 0 },
          { fileId, artboardIndex: 2 },
        ],
        format: 'png',
        outputDir: exportDir,
        ppi: 72,
        revealAfterExport: false,
      })
      expect(pngExport.exported).toHaveLength(2)
      for (const item of pngExport.exported) {
        expect(fs.existsSync(item.path)).toBe(true)
        expect(fs.statSync(item.path).size).toBeGreaterThan(500)
      }

      // Export merged multi-page PDF
      const pdfExport = await runtime.executeAction<ExportResult>('materials.export', {
        projectId: project.id,
        items: [
          { fileId, artboardIndex: 0 },
          { fileId, artboardIndex: 1 },
          { fileId, artboardIndex: 2 },
        ],
        format: 'pdf-merged',
        outputDir: exportDir,
        ppi: 150,
        mergedPdfFileName: '物料合集',
        revealAfterExport: false,
      })
      expect(pdfExport.exported).toHaveLength(1)
      expect(fs.existsSync(pdfExport.exported[0]!.path)).toBe(true)
      expect(fs.statSync(pdfExport.exported[0]!.path).size).toBeGreaterThan(1000)

      // Test preview HTTP route + ETag
      const prevUrl = `http://127.0.0.1:3081/lf/materials/preview?path=${encodeURIComponent(vcPath)}&artboard=0&ppi=72`
      const prevRes = await runtime.rpc.fetch(
        new Request(prevUrl, {
          headers: { host: '127.0.0.1:3081', 'x-test-auth': 'ok' },
        }),
      )
      expect(prevRes.status).toBe(200)
      expect(prevRes.headers.get('content-type')).toBe('image/png')
      const pngBuf = Buffer.from(await prevRes.arrayBuffer())
      expect(pngBuf.subarray(0, 4).toString('hex')).toBe('89504e47')

      const etag = prevRes.headers.get('etag')!
      const notModified = await runtime.rpc.fetch(
        new Request(prevUrl, {
          headers: {
            host: '127.0.0.1:3081',
            'x-test-auth': 'ok',
            'if-none-match': etag,
          },
        }),
      )
      expect(notModified.status).toBe(304)
    },
    30_000,
  )
})
