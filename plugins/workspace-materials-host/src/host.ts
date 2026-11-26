import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  FolioError,
  defineAction,
  type FolioRuntimeService,
  type FolioStorageService,
} from '@folio/base-contract'
import {
  createWindowsMaterialsDialogProvider,
  normalizeLocalPath,
  type MaterialsDialogProvider,
} from './dialogs.js'
import { createMaterialsPreviewRouteHandler } from './preview-route.js'
import { createMaterialsStore } from './store.js'
import {
  A3_LANDSCAPE_HEIGHT_PT,
  A3_LANDSCAPE_WIDTH_PT,
  ARTBOARD_SPACING_PT,
  ExportRequestSchema,
  MaterialDataScopeSchema,
  MaterialFieldCategorySchema,
  MaterialFieldsSchema,
  type MaterialFileRef,
  type MaterialFileState,
  type MaterialFields,
  type MaterialProject,
  type VectorCraftSymbolicCommand,
} from './types.js'
import {
  createRealVectorCraftBridge,
  type VectorCraftBridge,
} from './vectorcraft-bridge.js'
import {
  buildEnsureHeaderLayerCommands,
  buildHeaderCommandsForArtboard,
  formatPageNumber,
  formatSpecLine,
  parseVectorCraftDocument,
  parseVectorCraftObject,
} from './vectorcraft-parser.js'
import { createMaterialsSyncManager } from './watcher.js'

export interface RegisterWorkspaceMaterialsHostOptions {
  readonly runtime: FolioRuntimeService
  readonly storage: FolioStorageService
  readonly bridge?: VectorCraftBridge
  readonly dialogProvider?: MaterialsDialogProvider
  readonly disableAutoSync?: boolean
}

function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return normalizeLocalPath(a).toLowerCase() === normalizeLocalPath(b).toLowerCase()
}

export function registerWorkspaceMaterialsHost(
  options: RegisterWorkspaceMaterialsHostOptions,
): () => void {
  const { runtime, storage } = options
  const pluginStorage = storage.forPlugin('workspace-materials-host')
  const store = createMaterialsStore(pluginStorage)
  const dialogProvider = options.dialogProvider ?? createWindowsMaterialsDialogProvider()

  let syncManager: ReturnType<typeof createMaterialsSyncManager> | null = null

  const ownsBridge = !options.bridge
  const bridge =
    options.bridge ??
    createRealVectorCraftBridge(() => store.getSettings(), {
      onBeforeWrite: filePath => {
        syncManager?.markSelfWrite(filePath)
      },
    })

  syncManager = createMaterialsSyncManager({
    bridge,
    getTrackedPaths: async () => {
      const ps = await store.listProjects()
      return ps.projects.flatMap(p => p.files.map(f => f.path))
    },
    shouldWatchFiles: async () => {
      const s = await store.getSettings()
      return s.autoWatchFiles
    },
    shouldPollLive: async () => {
      const s = await store.getSettings()
      return s.autoPollLiveControl
    },
    onExternalFileChange: filePath => {
      runtime.events.emitInvalidate('materials', filePath)
    },
    onLiveControlChange: changedPath => {
      runtime.events.emitInvalidate('materials', changedPath ?? undefined)
    },
  })

  if (!options.disableAutoSync) {
    syncManager.start()
  }

  async function inspectSingleFile(
    fileRef: MaterialFileRef,
    liveDocs?: Awaited<ReturnType<VectorCraftBridge['probeLiveControl']>>['documents'],
  ): Promise<MaterialFileState> {
    const docs = liveDocs ?? (await bridge.probeLiveControl()).documents
    const liveMatch = docs.find(d => samePath(d.path, fileRef.path))

    let stSize = 0
    let stMtime = 0
    let exists = false
    try {
      const st = await fsp.stat(fileRef.path)
      exists = st.isFile()
      stSize = st.size
      stMtime = st.mtimeMs
    } catch {
      exists = false
    }

    if (!exists) {
      return {
        fileId: fileRef.id,
        path: fileRef.path,
        name: fileRef.name,
        exists: false,
        mtimeMs: 0,
        size: 0,
        documentTitle: fileRef.name,
        artboardCount: 0,
        activeInLiveControl: Boolean(liveMatch?.active),
        dirtyInLiveControl: Boolean(liveMatch?.dirty),
        error: '文件不存在或已被移动',
        pages: [],
      }
    }

    try {
      const sidecar = await store.getFileSidecar(fileRef.path)
      let parsed
      if (liveMatch?.dirty) {
        const liveJson = await bridge.readLiveDocumentJson(fileRef.path)
        if (liveJson) {
          parsed = parseVectorCraftObject(liveJson, {
            fileId: fileRef.id,
            filePath: fileRef.path,
            fileName: fileRef.name,
            sidecarEntries: sidecar,
          })
        }
      }
      if (!parsed) {
        parsed = await parseVectorCraftDocument(fileRef.path, {
          fileId: fileRef.id,
          fileName: fileRef.name,
          sidecarEntries: sidecar,
        })
      }

      return {
        fileId: fileRef.id,
        path: fileRef.path,
        name: fileRef.name,
        exists: true,
        mtimeMs: stMtime,
        size: stSize,
        documentTitle: parsed.documentTitle,
        artboardCount: parsed.pages.length,
        activeInLiveControl: Boolean(liveMatch?.active),
        dirtyInLiveControl: Boolean(liveMatch?.dirty),
        error: null,
        pages: parsed.pages,
      }
    } catch (err) {
      return {
        fileId: fileRef.id,
        path: fileRef.path,
        name: fileRef.name,
        exists: true,
        mtimeMs: stMtime,
        size: stSize,
        documentTitle: fileRef.name,
        artboardCount: 0,
        activeInLiveControl: Boolean(liveMatch?.active),
        dirtyInLiveControl: Boolean(liveMatch?.dirty),
        error: err instanceof Error ? err.message : String(err),
        pages: [],
      }
    }
  }

  async function resolveProjectFile(
    projectId: string,
    fileId: string,
  ): Promise<{ readonly project: MaterialProject; readonly fileRef: MaterialFileRef }> {
    const project = await store.getProject(projectId)
    const fileRef = project.files.find(f => f.id === fileId)
    if (!fileRef) {
      throw new FolioError('file_not_found', `项目中未找到文件: ${fileId}`, 404)
    }
    return { project, fileRef }
  }

  async function syncAllHeadersInFile(
    project: MaterialProject,
    fileRef: MaterialFileRef,
    optionsOverride?: { readonly renameArtboards?: boolean },
  ): Promise<MaterialFileState> {
    const sidecar = await store.getFileSidecar(fileRef.path)
    const parsed = await parseVectorCraftDocument(fileRef.path, {
      fileId: fileRef.id,
      fileName: fileRef.name,
      sidecarEntries: sidecar,
    })

    const cmds: VectorCraftSymbolicCommand[] = buildEnsureHeaderLayerCommands(parsed.headerLayerId)
    for (const page of parsed.pages) {
      const existingGroups = parsed.headerGroupsByArtboardIndex.get(page.artboardIndex) ?? []
      cmds.push(
        ...buildHeaderCommandsForArtboard({
          artboardIndex: page.artboardIndex,
          x: page.x,
          y: page.y,
          width: page.widthPt,
          height: page.heightPt,
          fields: page.fields,
          projectDisplayName: project.name,
          existingHeaderGroups: existingGroups,
          renameArtboard: optionsOverride?.renameArtboards,
        }),
      )
      await store.setPageSidecar(fileRef.path, {
        artboardKey: page.artboardKey,
        fields: page.fields,
        lastRenderedSpecText: formatSpecLine(page.fields) || '待填写物料信息',
        lastRenderedTitle: page.fields.title.trim() || `第 ${page.pageNumber} 页`,
        updatedAt: Date.now(),
      })
    }

    await bridge.runBatchOnFile(fileRef.path, cmds, { save: true })
    return inspectSingleFile(fileRef)
  }

  const disposers = [
    runtime.registerAction(
      defineAction({
        id: 'materials.status',
        title: '获取 VectorCraft 运行环境与连接状态',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => bridge.getStatus(),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.settings.update',
        title: '更新物料工作区与 VectorCraft 配置',
        tier: 'modify',
        input: z.object({
          cliPath: z.string().optional(),
          appPath: z.string().optional(),
          controlPort: z.number().int().min(1024).max(65535).optional(),
          autoWatchFiles: z.boolean().optional(),
          autoPollLiveControl: z.boolean().optional(),
          defaultExportDir: z.string().optional(),
        }),
        run: async input => {
          const settings = await store.updateSettings(input)
          await syncManager?.refreshWatches()
          runtime.events.emitInvalidate('materials', 'settings')
          return { settings, status: await bridge.getStatus() }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.projects.list',
        title: '获取物料项目列表',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => store.listProjects(),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.projects.create',
        title: '新建物料项目',
        tier: 'modify',
        input: z.object({
          name: z.string().min(1),
          description: z.string().optional(),
        }),
        run: async input => {
          const res = await store.createProject(input)
          runtime.events.emitInvalidate('materials', res.project.id)
          return res
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.projects.update',
        title: '更新或切换物料项目',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
          name: z.string().optional(),
          description: z.string().optional(),
          setActive: z.boolean().optional(),
        }),
        run: async input => {
          const state = await store.updateProject(input)
          runtime.events.emitInvalidate('materials', input.id)
          return { state }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.projects.delete',
        title: '删除物料项目',
        tier: 'delete',
        input: z.object({
          id: z.string().min(1),
        }),
        run: async input => {
          const state = await store.deleteProject(input.id)
          await syncManager?.refreshWatches()
          runtime.events.emitInvalidate('materials', input.id)
          return { state }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.files.add',
        title: '将现有 .vectorcraft 文件加入项目',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          paths: z.array(z.string().min(1)).min(1),
        }),
        run: async input => {
          const res = await store.addFilesToProject(input.projectId, input.paths)
          await syncManager?.refreshWatches()
          runtime.events.emitInvalidate('materials', input.projectId)
          return res
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.files.create',
        title: '新建固定 A3 横版 .vectorcraft 文件并加入项目',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          filePath: z.string().min(1),
          title: z.string().optional(),
          artboardCount: z.number().int().min(1).max(50).default(1),
        }),
        run: async input => {
          const targetPath = input.filePath.toLowerCase().endsWith('.vectorcraft')
            ? input.filePath
            : `${input.filePath}.vectorcraft`
          const project = await store.getProject(input.projectId)
          const docTitle =
            input.title?.trim() || path.basename(targetPath, '.vectorcraft') || project.name
          await bridge.createA3Document({
            filePath: targetPath,
            title: docTitle,
            artboardCount: input.artboardCount,
          })
          const res = await store.addFilesToProject(input.projectId, [targetPath])
          const addedFile = res.added[0]
          if (addedFile) {
            await syncAllHeadersInFile(res.project, addedFile, { renameArtboards: false })
          }
          await syncManager?.refreshWatches()
          runtime.events.emitInvalidate('materials', input.projectId)
          return res
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.files.remove',
        title: '从项目中移除 .vectorcraft 文件引用',
        tier: 'delete',
        input: z.object({
          projectId: z.string().min(1),
          fileId: z.string().min(1),
        }),
        run: async input => {
          const project = await store.removeFileFromProject(input.projectId, input.fileId)
          await syncManager?.refreshWatches()
          runtime.events.emitInvalidate('materials', input.projectId)
          return { project }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.files.inspect',
        title: '解析单个 .vectorcraft 文件画板与物料信息',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
          fileId: z.string().min(1),
        }),
        run: async input => {
          const { fileRef } = await resolveProjectFile(input.projectId, input.fileId)
          return inspectSingleFile(fileRef)
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.project.inspect',
        title: '解析项目内全部 .vectorcraft 文件与页面',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
        }),
        run: async input => {
          const project = await store.getProject(input.projectId)
          const live = await bridge.probeLiveControl()
          const files = await Promise.all(
            project.files.map(f => inspectSingleFile(f, live.documents)),
          )
          return {
            project,
            files,
            liveConnected: live.connected,
            liveActiveDocumentPath: live.activePath,
          }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.pages.updateHeader',
        title: '写入画板顶部物料信息并同步到 VectorCraft 文件',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          fileId: z.string().min(1),
          artboardIndex: z.number().int().min(0),
          fields: MaterialFieldsSchema,
          renameArtboard: z.boolean().default(true),
        }),
        run: async input => {
          const { project, fileRef } = await resolveProjectFile(input.projectId, input.fileId)
          const sidecar = await store.getFileSidecar(fileRef.path)
          const parsed = await parseVectorCraftDocument(fileRef.path, {
            fileId: fileRef.id,
            fileName: fileRef.name,
            sidecarEntries: sidecar,
          })
          const page = parsed.pages.find(p => p.artboardIndex === input.artboardIndex)
          if (!page) {
            throw new FolioError('artboard_not_found', `画板索引超出范围: ${input.artboardIndex}`, 404)
          }

          const cleanFields: MaterialFields = {
            title: input.fields.title.trim(),
            showProjectName: Boolean(input.fields.showProjectName),
            projectNameOverride: input.fields.projectNameOverride.trim(),
            material: input.fields.material.trim(),
            craft: input.fields.craft.trim(),
            size: input.fields.size.trim(),
            quantity: input.fields.quantity.trim(),
            note: input.fields.note.trim(),
          }

          const existingGroups = parsed.headerGroupsByArtboardIndex.get(page.artboardIndex) ?? []
          const cmds: VectorCraftSymbolicCommand[] = [
            ...buildEnsureHeaderLayerCommands(parsed.headerLayerId),
            ...buildHeaderCommandsForArtboard({
              artboardIndex: page.artboardIndex,
              x: page.x,
              y: page.y,
              width: page.widthPt,
              height: page.heightPt,
              fields: cleanFields,
              projectDisplayName: project.name,
              existingHeaderGroups: existingGroups,
              renameArtboard: input.renameArtboard,
            }),
          ]

          const batchRes = await bridge.runBatchOnFile(fileRef.path, cmds, { save: true })

          await store.setPageSidecar(fileRef.path, {
            artboardKey: page.artboardKey,
            fields: cleanFields,
            lastRenderedSpecText: formatSpecLine(cleanFields) || '待填写物料信息',
            lastRenderedTitle: cleanFields.title || `第 ${page.pageNumber} 页`,
            updatedAt: Date.now(),
          })

          const fileState = await inspectSingleFile(fileRef)
          runtime.events.emitInvalidate('materials', fileRef.path)
          return {
            file: fileState,
            usedLiveControl: batchRes.usedLiveControl,
          }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.pages.add',
        title: '新增固定 A3 横版画板页面',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          fileId: z.string().min(1),
          fields: MaterialFieldsSchema.optional(),
        }),
        run: async input => {
          const { project, fileRef } = await resolveProjectFile(input.projectId, input.fileId)
          const before = await parseVectorCraftDocument(fileRef.path, {
            fileId: fileRef.id,
            fileName: fileRef.name,
          })
          const newIndex = before.pages.length
          const pageNum = formatPageNumber(newIndex)
          const initFields: MaterialFields = {
            title: input.fields?.title?.trim() || `第 ${pageNum} 页`,
            showProjectName: Boolean(input.fields?.showProjectName),
            projectNameOverride: input.fields?.projectNameOverride?.trim() ?? '',
            material: input.fields?.material?.trim() ?? '',
            craft: input.fields?.craft?.trim() ?? '',
            size: input.fields?.size?.trim() ?? '',
            quantity: input.fields?.quantity?.trim() ?? '',
            note: input.fields?.note?.trim() ?? '',
          }

          const last = before.pages[before.pages.length - 1]
          const newX = last ? last.x + last.widthPt + ARTBOARD_SPACING_PT : 0
          const newY = last ? last.y : 0

          const cmds: VectorCraftSymbolicCommand[] = [
            {
              command: 'artboard.new',
              params: {
                x: newX,
                y: newY,
                width: A3_LANDSCAPE_WIDTH_PT,
                height: A3_LANDSCAPE_HEIGHT_PT,
                name: initFields.title,
              },
            },
            ...buildEnsureHeaderLayerCommands(before.headerLayerId),
            ...buildHeaderCommandsForArtboard({
              artboardIndex: newIndex,
              x: newX,
              y: newY,
              width: A3_LANDSCAPE_WIDTH_PT,
              height: A3_LANDSCAPE_HEIGHT_PT,
              fields: initFields,
              projectDisplayName: project.name,
              existingHeaderGroups: [],
              renameArtboard: false,
            }),
          ]

          await bridge.runBatchOnFile(fileRef.path, cmds, { save: true })

          const after = await parseVectorCraftDocument(fileRef.path, {
            fileId: fileRef.id,
            fileName: fileRef.name,
          })
          const createdPage = after.pages[newIndex]
          if (createdPage) {
            await store.setPageSidecar(fileRef.path, {
              artboardKey: createdPage.artboardKey,
              fields: initFields,
              lastRenderedSpecText: formatSpecLine(initFields) || '待填写物料信息',
              lastRenderedTitle: initFields.title,
              updatedAt: Date.now(),
            })
          }

          const fileState = await inspectSingleFile(fileRef)
          runtime.events.emitInvalidate('materials', fileRef.path)
          return { file: fileState, addedIndex: newIndex }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.pages.duplicate',
        title: '复制画板页面并重排自动更新序号',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          fileId: z.string().min(1),
          artboardIndex: z.number().int().min(0),
        }),
        run: async input => {
          const { project, fileRef } = await resolveProjectFile(input.projectId, input.fileId)
          const sidecar = await store.getFileSidecar(fileRef.path)
          const before = await parseVectorCraftDocument(fileRef.path, {
            fileId: fileRef.id,
            fileName: fileRef.name,
            sidecarEntries: sidecar,
          })
          const sourcePage = before.pages.find(p => p.artboardIndex === input.artboardIndex)
          if (!sourcePage) {
            throw new FolioError('artboard_not_found', `画板不存在: ${input.artboardIndex}`, 404)
          }

          await bridge.runBatchOnFile(
            fileRef.path,
            [
              {
                command: 'artboard.duplicate',
                params: {
                  index: input.artboardIndex,
                  art: true,
                  lockedAndHidden: true,
                },
              },
              {
                command: 'artboard.rearrange',
                params: {
                  layout: 'row',
                  spacing: ARTBOARD_SPACING_PT,
                  moveArtwork: true,
                  lockedAndHidden: true,
                },
              },
            ],
            { save: true },
          )

          const after = await parseVectorCraftDocument(fileRef.path, {
            fileId: fileRef.id,
            fileName: fileRef.name,
            sidecarEntries: await store.getFileSidecar(fileRef.path),
          })
          const duplicatedPage = after.pages[after.pages.length - 1]
          if (duplicatedPage) {
            const copiedFields: MaterialFields = {
              ...sourcePage.fields,
              title: `${sourcePage.fields.title || sourcePage.artboardName} 副本`,
            }
            await store.setPageSidecar(fileRef.path, {
              artboardKey: duplicatedPage.artboardKey,
              fields: copiedFields,
              lastRenderedSpecText: formatSpecLine(copiedFields) || '待填写物料信息',
              lastRenderedTitle: copiedFields.title,
              updatedAt: Date.now(),
            })
          }

          const fileState = await syncAllHeadersInFile(project, fileRef, { renameArtboards: true })
          runtime.events.emitInvalidate('materials', fileRef.path)
          return { file: fileState }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.pages.delete',
        title: '删除画板页面并重排自动更新序号',
        tier: 'delete',
        input: z.object({
          projectId: z.string().min(1),
          fileId: z.string().min(1),
          artboardIndex: z.number().int().min(0),
        }),
        run: async input => {
          const { project, fileRef } = await resolveProjectFile(input.projectId, input.fileId)
          const parsed = await parseVectorCraftDocument(fileRef.path, {
            fileId: fileRef.id,
            fileName: fileRef.name,
          })
          if (parsed.pages.length <= 1) {
            throw new FolioError('last_artboard', 'VectorCraft 文档至少需要保留一个画板', 400)
          }
          const page = parsed.pages.find(p => p.artboardIndex === input.artboardIndex)
          if (!page) {
            throw new FolioError('artboard_not_found', `画板不存在: ${input.artboardIndex}`, 404)
          }

          const existingGroups = parsed.headerGroupsByArtboardIndex.get(page.artboardIndex) ?? []
          const cmds: VectorCraftSymbolicCommand[] = []
          for (const g of existingGroups) {
            if (g.locked) {
              cmds.push({ command: 'object.setProps', params: { id: g.id, locked: false } })
            }
            cmds.push({ command: 'edit.clear', params: { ids: [g.id] } })
          }
          cmds.push({
            command: 'artboard.setProps',
            params: { index: input.artboardIndex, locked: false },
          })
          cmds.push({
            command: 'artboard.delete',
            params: { index: input.artboardIndex },
          })
          cmds.push({
            command: 'artboard.rearrange',
            params: {
              layout: 'row',
              spacing: ARTBOARD_SPACING_PT,
              moveArtwork: true,
              lockedAndHidden: true,
            },
          })

          await bridge.runBatchOnFile(fileRef.path, cmds, { save: true })
          await store.removePageSidecar(fileRef.path, page.artboardKey)
          const fileState = await syncAllHeadersInFile(project, fileRef)
          runtime.events.emitInvalidate('materials', fileRef.path)
          return { file: fileState }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.pages.reorder',
        title: '调整画板顺序并自动更新所有页面序号',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          fileId: z.string().min(1),
          fromIndex: z.number().int().min(0),
          toIndex: z.number().int().min(0),
        }),
        run: async input => {
          const { project, fileRef } = await resolveProjectFile(input.projectId, input.fileId)
          if (input.fromIndex === input.toIndex) {
            return { file: await inspectSingleFile(fileRef) }
          }

          await bridge.runBatchOnFile(
            fileRef.path,
            [
              {
                command: 'artboard.reorder',
                params: { index: input.fromIndex, to: input.toIndex },
              },
              {
                command: 'artboard.rearrange',
                params: {
                  layout: 'row',
                  spacing: ARTBOARD_SPACING_PT,
                  moveArtwork: true,
                  lockedAndHidden: true,
                },
              },
            ],
            { save: true },
          )

          const fileState = await syncAllHeadersInFile(project, fileRef)
          runtime.events.emitInvalidate('materials', fileRef.path)
          return { file: fileState }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.pages.normalizeA3',
        title: '将画板统一为固定 A3 横版尺寸',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          fileId: z.string().min(1),
          artboardIndex: z.number().int().min(0).optional(),
        }),
        run: async input => {
          const { project, fileRef } = await resolveProjectFile(input.projectId, input.fileId)
          const parsed = await parseVectorCraftDocument(fileRef.path, {
            fileId: fileRef.id,
            fileName: fileRef.name,
          })
          const targets =
            input.artboardIndex !== undefined
              ? parsed.pages.filter(p => p.artboardIndex === input.artboardIndex)
              : parsed.pages

          if (targets.length === 0) {
            throw new FolioError('artboard_not_found', '未找到需要调整尺寸的画板', 404)
          }

          const cmds: VectorCraftSymbolicCommand[] = [
            {
              command: 'artboard.setProps',
              params: {
                artboards: targets.map(t => ({
                  index: t.artboardIndex,
                  locked: false,
                  width: A3_LANDSCAPE_WIDTH_PT,
                  height: A3_LANDSCAPE_HEIGHT_PT,
                })),
              },
            },
            {
              command: 'artboard.rearrange',
              params: {
                layout: 'row',
                spacing: ARTBOARD_SPACING_PT,
                moveArtwork: true,
                lockedAndHidden: true,
              },
            },
          ]

          await bridge.runBatchOnFile(fileRef.path, cmds, { save: true })
          const fileState = await syncAllHeadersInFile(project, fileRef)
          runtime.events.emitInvalidate('materials', fileRef.path)
          return { file: fileState }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.pages.syncAllHeaders',
        title: '同步刷新文件内全部画板的顶部物料信息',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          fileId: z.string().min(1),
        }),
        run: async input => {
          const { project, fileRef } = await resolveProjectFile(input.projectId, input.fileId)
          const fileState = await syncAllHeadersInFile(project, fileRef)
          runtime.events.emitInvalidate('materials', fileRef.path)
          return { file: fileState }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.vc.open',
        title: '在前台 VectorCraft 程序中打开文件并启用实时控制通道',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
          fileId: z.string().min(1),
          artboardIndex: z.number().int().min(0).optional(),
        }),
        run: async input => {
          const { fileRef } = await resolveProjectFile(input.projectId, input.fileId)
          const res = await bridge.openInGui(fileRef.path, input.artboardIndex)
          runtime.events.emitInvalidate('materials', fileRef.path)
          return res
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.vc.syncNow',
        title: '立即双向同步 VectorCraft 文件与前台实时状态',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
          fileId: z.string().min(1).optional(),
        }),
        run: async input => {
          const project = await store.getProject(input.projectId)
          const live = await bridge.probeLiveControl()
          const targetFiles = input.fileId
            ? project.files.filter(f => f.id === input.fileId)
            : project.files
          const files = await Promise.all(
            targetFiles.map(f => inspectSingleFile(f, live.documents)),
          )
          runtime.events.emitInvalidate('materials', input.projectId)
          return {
            files,
            liveConnected: live.connected,
            liveActiveDocumentPath: live.activePath,
          }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.export',
        title: '使用 VectorCraft 导出所选页面为单张图片或多页 PDF',
        tier: 'modify',
        input: ExportRequestSchema,
        run: async input => {
          const project = await store.getProject(input.projectId)
          const inspectedFiles = await Promise.all(
            project.files.map(f => inspectSingleFile(f)),
          )
          const fileMap = new Map(inspectedFiles.map(f => [f.fileId, f]))

          const resolvedItems: Array<{
            filePath: string
            fileName: string
            artboardIndex: number
            pageNumber: string
            pageTitle: string
          }> = []

          for (const sel of input.items) {
            const fileState = fileMap.get(sel.fileId)
            if (!fileState || !fileState.exists) {
              throw new FolioError('file_not_found', `导出失败，文件不存在: ${sel.fileId}`, 404)
            }
            const page = fileState.pages.find(p => p.artboardIndex === sel.artboardIndex)
            if (!page) {
              throw new FolioError('artboard_not_found', `导出失败，画板不存在: #${sel.artboardIndex + 1}`, 404)
            }
            resolvedItems.push({
              filePath: fileState.path,
              fileName: fileState.name,
              artboardIndex: page.artboardIndex,
              pageNumber: page.pageNumber,
              pageTitle: page.fields.title || page.artboardName,
            })
          }

          const exported = await bridge.exportPages({
            items: resolvedItems,
            format: input.format,
            outputDir: input.outputDir,
            ppi: input.ppi,
            mergedPdfFileName: input.mergedPdfFileName,
          })

          await store.updateSettings({ defaultExportDir: normalizeLocalPath(input.outputDir) })
          if (input.revealAfterExport && exported.length > 0) {
            await dialogProvider.revealPath(exported[0]!.path).catch(() => {})
          }
          return {
            outputDir: normalizeLocalPath(input.outputDir),
            exported,
          }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.catalog.get',
        title: '读取默认物料数据与当前项目自定义数据',
        tier: 'read',
        input: z
          .object({
            projectId: z.string().nullable().optional(),
          })
          .default({}),
        run: async input => store.getCatalog(input.projectId),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.catalog.option.upsert',
        title: '新增或编辑快捷物料字段选项',
        tier: 'modify',
        input: z.object({
          scope: MaterialDataScopeSchema,
          projectId: z.string().optional(),
          id: z.string().optional(),
          category: MaterialFieldCategorySchema,
          label: z.string().optional(),
          value: z.string().min(1),
          description: z.string().optional(),
          sortOrder: z.number().int().optional(),
        }),
        run: async input => {
          await store.upsertOption(input)
          const catalog = await store.getCatalog(input.projectId)
          runtime.events.emitInvalidate('materials', 'catalog')
          return catalog
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.catalog.option.delete',
        title: '批量删除快捷物料字段选项',
        tier: 'delete',
        input: z.object({
          scope: MaterialDataScopeSchema,
          projectId: z.string().optional(),
          ids: z.array(z.string().min(1)).min(1),
        }),
        run: async input => {
          await store.deleteOptions(input)
          const catalog = await store.getCatalog(input.projectId)
          runtime.events.emitInvalidate('materials', 'catalog')
          return catalog
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.catalog.option.copy',
        title: '在默认数据与项目数据间复制快捷字段选项',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
          fromScope: MaterialDataScopeSchema,
          toScope: MaterialDataScopeSchema,
          projectId: z.string().min(1),
        }),
        run: async input => {
          await store.copyOption(input)
          const catalog = await store.getCatalog(input.projectId)
          runtime.events.emitInvalidate('materials', 'catalog')
          return catalog
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.catalog.template.upsert',
        title: '新增或编辑物料模板',
        tier: 'modify',
        input: z.object({
          scope: MaterialDataScopeSchema,
          projectId: z.string().optional(),
          id: z.string().optional(),
          name: z.string().min(1),
          title: z.string().optional(),
          material: z.string().optional(),
          craft: z.string().optional(),
          size: z.string().optional(),
          quantity: z.string().optional(),
          note: z.string().optional(),
          showProjectName: z.boolean().optional(),
          sortOrder: z.number().int().optional(),
        }),
        run: async input => {
          await store.upsertTemplate(input)
          const catalog = await store.getCatalog(input.projectId)
          runtime.events.emitInvalidate('materials', 'catalog')
          return catalog
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.catalog.template.delete',
        title: '批量删除物料模板',
        tier: 'delete',
        input: z.object({
          scope: MaterialDataScopeSchema,
          projectId: z.string().optional(),
          ids: z.array(z.string().min(1)).min(1),
        }),
        run: async input => {
          await store.deleteTemplates(input)
          const catalog = await store.getCatalog(input.projectId)
          runtime.events.emitInvalidate('materials', 'catalog')
          return catalog
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.catalog.template.copy',
        title: '在默认数据与项目数据间复制物料模板',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
          fromScope: MaterialDataScopeSchema,
          toScope: MaterialDataScopeSchema,
          projectId: z.string().min(1),
        }),
        run: async input => {
          await store.copyTemplate(input)
          const catalog = await store.getCatalog(input.projectId)
          runtime.events.emitInvalidate('materials', 'catalog')
          return catalog
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.catalog.resetDefaults',
        title: '重置全局默认物料选项与模板数据',
        tier: 'modify',
        input: z
          .object({
            projectId: z.string().optional(),
          })
          .default({}),
        run: async input => {
          await store.resetDefaults()
          const catalog = await store.getCatalog(input.projectId)
          runtime.events.emitInvalidate('materials', 'catalog')
          return catalog
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.dialog.pickFiles',
        title: '选择本地 VectorCraft 文件',
        tier: 'read',
        input: z
          .object({
            multi: z.boolean().optional(),
            initialDir: z.string().optional(),
          })
          .default({}),
        run: async input => dialogProvider.pickVectorCraftFiles(input),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.dialog.pickSaveFile',
        title: '选择新建 VectorCraft 文件保存位置',
        tier: 'read',
        input: z
          .object({
            defaultName: z.string().optional(),
            initialDir: z.string().optional(),
          })
          .default({}),
        run: async input => dialogProvider.pickSaveVectorCraftFile(input),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.dialog.pickFolder',
        title: '选择本地导出文件夹',
        tier: 'read',
        input: z
          .object({
            initialDir: z.string().optional(),
            description: z.string().optional(),
          })
          .default({}),
        run: async input => dialogProvider.pickFolder(input),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'materials.files.reveal',
        title: '在系统资源管理器中定位文件',
        tier: 'read',
        input: z.object({
          path: z.string().min(1),
        }),
        run: async input => dialogProvider.revealPath(input.path),
      }),
    ),

    runtime.registerRoute(
      'GET',
      '/materials/preview',
      createMaterialsPreviewRouteHandler({
        cacheDir: pluginStorage.cacheDir,
        bridge,
      }),
    ),
  ]

  return () => {
    syncManager?.dispose()
    for (const dispose of disposers.reverse()) dispose()
    if (ownsBridge) {
      bridge.dispose()
    }
  }
}

export const name = 'workspace-materials-host'
export const inject = ['folioRuntime', 'folioStorage'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () =>
      registerWorkspaceMaterialsHost({
        runtime: ctx.folioRuntime,
        storage: ctx.folioStorage,
      }),
    'workspace-materials-host: actions + vectorcraft bridge + preview route',
  )
}

export default { name, inject, apply }

export * from './types.js'
export { createDefaultCatalog } from './defaults.js'
export { createMaterialsStore } from './store.js'
export {
  buildEnsureHeaderLayerCommands,
  buildHeaderCommandsForArtboard,
  extractVectorCraftJson,
  formatPageNumber,
  formatSpecLine,
  isA3LandscapeSize,
  parseSpecLine,
  parseVectorCraftDocument,
  parseVectorCraftObject,
} from './vectorcraft-parser.js'
export { compileCliCommands, createRealVectorCraftBridge } from './vectorcraft-bridge.js'
export type { LiveDocumentSummary, LiveProbeResult, VectorCraftBridge } from './vectorcraft-bridge.js'
export { createMaterialsPreviewRouteHandler } from './preview-route.js'
export { createWindowsMaterialsDialogProvider, normalizeLocalPath, revealLocalPath } from './dialogs.js'
export type { MaterialsDialogProvider } from './dialogs.js'
