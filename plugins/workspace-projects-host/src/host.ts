import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  FolioError,
  defineAction,
  type FolioNativeService,
  type FolioProjectsHostService,
  type FolioRuntimeService,
  type FolioStorageService,
  type FolioTasksService,
  type FolioThumbsService,
  type ProjectArchiveMetaInfo,
  type ProjectFileResolveContext,
  type ProjectFileResolver,
  type ProjectHostManifestSnapshot,
  type ProjectHostRecord,
  type TaskSnapshot,
} from '@folio/base-contract'
import {
  extractProjectMetadataWithLlm,
  getAiStatus,
  resolveAiRoute,
  type DshDefaultModelLike,
  type DshLlmLike,
} from './ai-extractor.js'
import { buildAiExtractionPrompts, buildProjectSample } from './ai-sampler.js'
import {
  computeLibraryId,
  computeProjectId,
  isPathInside,
  normalizeProjectPath,
} from './classify.js'
import { createProjectMetaStore } from './meta-store.js'
import {
  buildEntriesForRelPaths,
  checkProjectChanges,
  classifyArchivedLiveFiles,
  discoverLibraryProjects,
  mergeDeltaFilesIntoManifest,
  scanProjectDirectory,
  type ScanProjectResult,
} from './scanner-core.js'
import {
  createProjectMediaRouteHandler,
  createProjectThumbRouteHandler,
  createProjectThumbService,
} from './thumb-service.js'
import {
  LibraryIndexSchema,
  type LibraryIndex,
  type LibraryRoot,
  type ProjectChangeSummary,
  type ProjectCheckResult,
  type ProjectDetailResult,
  type ProjectFileEntry,
  type ProjectManifest,
  type ProjectSummary,
} from './types.js'

const EMPTY_CHANGE_SUMMARY: ProjectChangeSummary = { added: 0, modified: 0, removed: 0 }

function resolveScannerWorkerPath(): string | null {
  const candidate = path.resolve(__dirname, 'scanner.worker.js')
  return fs.existsSync(candidate) ? candidate : null
}

function findCoverEntry(manifest: ProjectManifest): ProjectFileEntry | null {
  if (!manifest.coverRelPath) return null
  for (const group of manifest.groups) {
    const match = group.files.find(f => f.relPath === manifest.coverRelPath)
    if (match) return match
  }
  return null
}

function collectValidThumbKeys(manifest: ProjectManifest): Set<string> {
  const keys = new Set<string>()
  for (const group of manifest.groups) {
    for (const file of group.files) {
      keys.add(file.thumbKey)
    }
  }
  return keys
}

function normalizeArchiveMeta(
  archive: ProjectArchiveMetaInfo | null | undefined,
): ProjectManifest['archive'] {
  if (!archive) return null
  return {
    mode: archive.mode,
    engine: archive.engine,
    archiveFileName: archive.archiveFileName,
    ...(archive.archiveLayout ? { archiveLayout: archive.archiveLayout } : {}),
    ...(archive.chunkSizeGb !== undefined ? { chunkSizeGb: archive.chunkSizeGb } : {}),
    ...(archive.volumeCount !== undefined ? { volumeCount: archive.volumeCount } : {}),
    ...(archive.compressionMethod ? { compressionMethod: archive.compressionMethod } : {}),
    archiveBytes: archive.archiveBytes,
    originalBytes: archive.originalBytes,
    archivedFileCount: archive.archivedFileCount,
    archivedAt: archive.archivedAt,
    verifiedAt: archive.verifiedAt,
    sourceDisposal: archive.sourceDisposal,
    versions: archive.versions,
    extractedFiles: (archive.extractedFiles ?? []).map(item => ({
      relPath: item.relPath,
      fingerprint: item.fingerprint,
      originalFingerprint: item.originalFingerprint,
      extractedAt: item.extractedAt,
    })),
  }
}

function buildProjectSummary(options: {
  readonly libraryId: string
  readonly projectPath: string
  readonly manifest: ProjectManifest
  readonly hasChanges: boolean
  readonly changeSummary: ProjectChangeSummary
  readonly missing: boolean
  readonly metaWritable: boolean
  readonly extractedUnmodified?: number
}): ProjectSummary {
  const {
    libraryId,
    projectPath,
    manifest,
    hasChanges,
    changeSummary,
    missing,
    metaWritable,
    extractedUnmodified = 0,
  } = options
  const coverEntry = findCoverEntry(manifest)
  return {
    id: manifest.projectId,
    libraryId,
    name: manifest.name,
    path: projectPath,
    coverRelPath: manifest.coverRelPath,
    coverFingerprint: coverEntry?.fingerprint ?? null,
    coverThumbKey: coverEntry?.thumbKey ?? null,
    tags: manifest.tags,
    summary: manifest.summary,
    projectType: manifest.projectType,
    fileCount: manifest.stats.fileCount,
    folderCount: manifest.stats.folderCount,
    totalBytes: manifest.stats.totalBytes,
    lastScannedAt: manifest.lastScannedAt,
    aiExtractedAt: manifest.aiExtractedAt,
    hasChanges,
    changeSummary,
    missing,
    metaWritable,
    archived: manifest.archive?.mode === 'archived',
    archiveBytes: manifest.archive?.mode === 'archived' ? manifest.archive.archiveBytes : null,
    archiveFileName: manifest.archive?.mode === 'archived' ? manifest.archive.archiveFileName : null,
    extractedUnmodified,
  }
}

function toHostRecord(summary: ProjectSummary): ProjectHostRecord {
  return {
    id: summary.id,
    libraryId: summary.libraryId,
    name: summary.name,
    path: summary.path,
    fileCount: summary.fileCount,
    totalBytes: summary.totalBytes,
    archived: summary.archived,
    archiveBytes: summary.archiveBytes,
    archiveFileName: summary.archiveFileName,
  }
}

export interface RegisterWorkspaceProjectsHostOptions {
  readonly runtime: FolioRuntimeService
  readonly storage: FolioStorageService
  readonly tasks: FolioTasksService
  readonly native: FolioNativeService
  readonly thumbs: FolioThumbsService
  readonly workerPath?: string | null
  readonly getLlm?: () => DshLlmLike | undefined
  readonly getDefaultModel?: () => DshDefaultModelLike | undefined
}

export interface ManagedWorkspaceProjectsHost {
  readonly service: FolioProjectsHostService
  dispose(): void
}

export function createWorkspaceProjectsHost(
  options: RegisterWorkspaceProjectsHostOptions,
): ManagedWorkspaceProjectsHost {
  const { runtime, storage, tasks, native, thumbs } = options
  const workerPath = options.workerPath !== undefined ? options.workerPath : resolveScannerWorkerPath()
  const readLlm = (): DshLlmLike | undefined => options.getLlm?.()
  const readDefaultModel = (): DshDefaultModelLike | undefined => options.getDefaultModel?.()

  const pluginStorage = storage.forPlugin('workspace-projects-host')
  const indexStore = pluginStorage.jsonStore<LibraryIndex>(
    'index.json',
    LibraryIndexSchema,
    () => ({
      version: 1,
      libraries: [],
      projects: [],
    }),
  )
  const metaStore = createProjectMetaStore(pluginStorage, native)
  const thumbService = createProjectThumbService({ metaStore, thumbs })
  const fileResolvers = new Map<string, ProjectFileResolver>()

  const getSortedResolvers = (): ProjectFileResolver[] =>
    Array.from(fileResolvers.values()).sort((a, b) => {
      const oa = a.order ?? 100
      const ob = b.order ?? 100
      if (oa !== ob) return oa - ob
      return a.id.localeCompare(b.id)
    })

  const runScanInWorker = async (
    projectPath: string,
    existingManifest: ProjectManifest | null,
    signal?: AbortSignal,
    onProgress?: (payload: unknown) => void,
  ): Promise<ScanProjectResult> => {
    const supportedThumbExts = thumbs.listSupportedExtensions()
    if (workerPath) {
      return tasks.runWorker<ScanProjectResult>({
        workerPath,
        input: { op: 'scan-project', projectPath, existingManifest, supportedThumbExts },
        signal,
        onProgress,
      })
    }
    return scanProjectDirectory(projectPath, existingManifest, onProgress, {
      supportedThumbExts,
    })
  }

  const runCheckInWorker = async (
    projectPath: string,
    manifest: ProjectManifest,
    signal?: AbortSignal,
  ): Promise<ProjectCheckResult> => {
    if (workerPath) {
      return tasks.runWorker<ProjectCheckResult>({
        workerPath,
        input: { op: 'check-changes', projectPath, manifest },
        signal,
      })
    }
    return checkProjectChanges(projectPath, manifest)
  }

  const resolveProjectById = async (projectId: string): Promise<ProjectSummary | null> => {
    const idx = await indexStore.read()
    return idx.projects.find(p => p.id === projectId) ?? null
  }

  const ensureCoverThumbnail = async (
    projectPath: string,
    manifest: ProjectManifest,
    signal?: AbortSignal,
    hideMetaDir = true,
  ): Promise<string | null> => {
    const coverEntry = findCoverEntry(manifest)
    if (!coverEntry || !coverEntry.thumbSupported) return null
    const rendered = await thumbService.ensureProjectCover(
      projectPath,
      manifest.projectId,
      manifest.name,
      coverEntry,
      manifest.coverThumbFile,
      { signal, hideMetaDir },
    )
    return rendered?.fileName ?? null
  }

  const upsertProjectsInIndex = async (
    libraryId: string,
    libraryLastScannedAt: number | null,
    summaries: readonly ProjectSummary[],
    replaceLibraryProjects: boolean,
  ): Promise<void> => {
    await indexStore.update(curr => {
      const incomingIds = new Set(summaries.map(s => s.id))
      const keptProjects = curr.projects.filter(p => {
        if (replaceLibraryProjects && p.libraryId === libraryId) return false
        if (incomingIds.has(p.id)) return false
        return true
      })
      const nextProjects = [...keptProjects, ...summaries].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
      )
      const libraryCount = nextProjects.filter(p => p.libraryId === libraryId).length
      const nextLibraries = curr.libraries.map(lib =>
        lib.id === libraryId
          ? {
              ...lib,
              lastScannedAt: libraryLastScannedAt ?? lib.lastScannedAt,
              projectCount: libraryCount,
            }
          : lib,
      )
      return {
        version: 1,
        libraries: nextLibraries,
        projects: nextProjects,
      }
    })
  }

  const syncSingleProject = async (
    summary: ProjectSummary,
    signal?: AbortSignal,
  ): Promise<ProjectDetailResult> => {
    const existing = await metaStore.readManifest(summary.path, summary.id)
    const scanRes = await runScanInWorker(summary.path, existing, signal)
    const coverThumbFile = await ensureCoverThumbnail(summary.path, scanRes.manifest, signal)
    const finalManifest: ProjectManifest = {
      ...scanRes.manifest,
      projectId: summary.id,
      name: existing?.name ?? summary.name,
      coverThumbFile,
    }
    const writeRes = await metaStore.writeManifest(summary.path, finalManifest)
    if (finalManifest.archive?.mode !== 'archived') {
      await metaStore.pruneOrphanThumbs(
        summary.path,
        summary.id,
        collectValidThumbKeys(finalManifest),
      )
    }
    const nextSummary = buildProjectSummary({
      libraryId: summary.libraryId,
      projectPath: summary.path,
      manifest: finalManifest,
      hasChanges: false,
      changeSummary: EMPTY_CHANGE_SUMMARY,
      missing: false,
      metaWritable: writeRes.metaWritable,
    })
    await upsertProjectsInIndex(summary.libraryId, null, [nextSummary], false)
    runtime.events.emitInvalidate('projects', summary.id)
    return { summary: nextSummary, manifest: finalManifest }
  }

  const extractSingleProjectWithAi = async (
    summary: ProjectSummary,
    opts: {
      readonly applyCover?: boolean
      readonly provider?: string
      readonly model?: string
      readonly signal?: AbortSignal
    },
  ): Promise<{
    readonly detail: ProjectDetailResult
    readonly extracted: Awaited<ReturnType<typeof extractProjectMetadataWithLlm>>['extracted']
  }> => {
    let manifest = await metaStore.readManifest(summary.path, summary.id)
    if (!manifest) {
      const scanRes = await runScanInWorker(summary.path, null, opts.signal)
      manifest = { ...scanRes.manifest, projectId: summary.id, name: summary.name }
    }

    const { extracted, trace } = await extractProjectMetadataWithLlm({
      llm: readLlm(),
      defaultModel: readDefaultModel(),
      projectPath: summary.path,
      manifest,
      provider: opts.provider,
      model: opts.model,
      signal: opts.signal,
      onTrace: async errOrSuccessTrace => {
        if (errOrSuccessTrace.status === 'error') {
          await metaStore.writeManifest(summary.path, {
            ...manifest,
            updatedAt: Date.now(),
            aiLastTrace: errOrSuccessTrace,
          })
          runtime.events.emitInvalidate('projects', summary.id)
        }
      },
    })

    const nextCoverRelPath =
      opts.applyCover !== false && extracted.recommendedCoverRelPath
        ? extracted.recommendedCoverRelPath
        : manifest.coverRelPath

    const now = Date.now()
    const mergedManifest: ProjectManifest = {
      ...manifest,
      updatedAt: now,
      projectType: extracted.projectType,
      summary: extracted.summary,
      tags: extracted.tags,
      aiExtractedAt: now,
      aiLastTrace: trace,
      coverRelPath: nextCoverRelPath,
    }
    const coverThumbFile = await ensureCoverThumbnail(
      summary.path,
      mergedManifest,
      opts.signal,
    )
    const finalManifest: ProjectManifest = {
      ...mergedManifest,
      coverThumbFile,
    }
    const writeRes = await metaStore.writeManifest(summary.path, finalManifest)
    const nextSummary = buildProjectSummary({
      libraryId: summary.libraryId,
      projectPath: summary.path,
      manifest: finalManifest,
      hasChanges: summary.hasChanges,
      changeSummary: summary.changeSummary,
      missing: summary.missing,
      metaWritable: writeRes.metaWritable,
    })
    await upsertProjectsInIndex(summary.libraryId, null, [nextSummary], false)
    runtime.events.emitInvalidate('projects', summary.id)
    return {
      detail: { summary: nextSummary, manifest: finalManifest },
      extracted,
    }
  }

  const enqueueLibraryScanTask = (library: LibraryRoot, mode: 'add' | 'rescan'): TaskSnapshot => {
    const handle = tasks.enqueue({
      scope: 'projects',
      queue: 'projects-scan',
      concurrency: 2,
      pausable: true,
      cancellable: true,
      title: `${mode === 'add' ? '导入项目库' : '扫描变更'}：${library.name}`,
      meta: { libraryId: library.id, rootPath: library.rootPath, mode },
      run: async helpers => {
        helpers.throwIfAborted()
        helpers.reportProgress({ current: 0, total: null, message: '正在发现项目文件夹…' })
        const discovered = await discoverLibraryProjects(library.rootPath)
        const total = discovered.length
        const results: ProjectSummary[] = []
        let lastInvalidateAt = 0

        for (let i = 0; i < discovered.length; i += 1) {
          helpers.throwIfAborted()
          await helpers.waitIfPaused()
          const item = discovered[i]!
          const projectId = computeProjectId(item.path)

          helpers.reportProgress({
            current: i,
            total,
            message: `扫描 (${i + 1}/${total})：${item.name}`,
            detail: { projectName: item.name },
          })

          const existingManifest = await metaStore.readManifest(item.path, projectId)
          if (existingManifest) {
            const check = await runCheckInWorker(item.path, existingManifest, helpers.signal)
            const coverThumbFile = await ensureCoverThumbnail(
              item.path,
              existingManifest,
              helpers.signal,
            )
            const manifestWithThumb =
              coverThumbFile && coverThumbFile !== existingManifest.coverThumbFile
                ? { ...existingManifest, coverThumbFile }
                : existingManifest
            const summary = buildProjectSummary({
              libraryId: library.id,
              projectPath: item.path,
              manifest: manifestWithThumb,
              hasChanges: check.hasChanges,
              changeSummary: check.changeSummary,
              missing: check.missing,
              metaWritable: true,
            })
            results.push(summary)
          } else {
            const scanRes = await runScanInWorker(item.path, null, helpers.signal)
            const coverThumbFile = await ensureCoverThumbnail(
              item.path,
              scanRes.manifest,
              helpers.signal,
            )
            const finalManifest: ProjectManifest = {
              ...scanRes.manifest,
              projectId,
              name: item.name,
              coverThumbFile,
            }
            const writeRes = await metaStore.writeManifest(item.path, finalManifest)
            results.push(
              buildProjectSummary({
                libraryId: library.id,
                projectPath: item.path,
                manifest: finalManifest,
                hasChanges: false,
                changeSummary: EMPTY_CHANGE_SUMMARY,
                missing: false,
                metaWritable: writeRes.metaWritable,
              }),
            )
          }

          const now = Date.now()
          if (now - lastInvalidateAt > 800) {
            lastInvalidateAt = now
            await upsertProjectsInIndex(library.id, null, results, false)
            runtime.events.emitInvalidate('projects', library.id)
          }
        }

        const completedAt = Date.now()
        await upsertProjectsInIndex(library.id, completedAt, results, true)
        runtime.events.emitInvalidate('projects', library.id)
        helpers.reportProgress({
          current: total,
          total,
          message: `已完成 ${total} 个项目的扫描`,
        })
        return { projectCount: results.length }
      },
    })
    return handle.snapshot()
  }

  const disposers = [
    runtime.registerAction(
      defineAction({
        id: 'projects.libraries.list',
        title: '获取项目库与项目轻量索引',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => indexStore.read(),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.libraries.pickFolder',
        title: '打开系统文件夹选择框添加项目库',
        tier: 'read',
        input: z
          .object({
            initialDir: z.string().optional(),
          })
          .default({}),
        run: async input =>
          native.pickFolder({
            title: '选择要加入项目库的根目录',
            initialDir: input.initialDir,
          }),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.libraries.add',
        title: '添加项目库根目录并启动后台扫描',
        tier: 'modify',
        input: z.object({
          rootPath: z.string().min(1),
          name: z.string().optional(),
        }),
        run: async input => {
          const normalizedRoot = normalizeProjectPath(input.rootPath)
          if (!normalizedRoot) {
            throw new FolioError('invalid_path', '库目录路径不能为空', 400)
          }
          let st: fs.Stats
          try {
            st = await fsp.stat(normalizedRoot)
          } catch {
            throw new FolioError('not_found', `库目录不存在: ${normalizedRoot}`, 404)
          }
          if (!st.isDirectory()) {
            throw new FolioError('not_a_directory', `目标不是有效文件夹: ${normalizedRoot}`, 400)
          }

          const libraryId = computeLibraryId(normalizedRoot)
          const libName = input.name?.trim() || path.basename(normalizedRoot) || normalizedRoot
          const now = Date.now()
          let savedLibrary!: LibraryRoot

          await indexStore.update(curr => {
            const existing = curr.libraries.find(l => l.id === libraryId)
            if (existing) {
              savedLibrary = { ...existing, name: libName }
              return {
                ...curr,
                libraries: curr.libraries.map(l => (l.id === libraryId ? savedLibrary : l)),
              }
            }
            savedLibrary = {
              id: libraryId,
              name: libName,
              rootPath: normalizedRoot,
              addedAt: now,
              lastScannedAt: null,
              projectCount: 0,
            }
            return {
              ...curr,
              libraries: [...curr.libraries, savedLibrary],
            }
          })

          runtime.events.emitInvalidate('projects', libraryId)
          const task = enqueueLibraryScanTask(savedLibrary, 'add')
          return { library: savedLibrary, task }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.libraries.remove',
        title: '移除项目库索引（不删除磁盘文件）',
        tier: 'delete',
        input: z.object({
          libraryId: z.string().min(1),
        }),
        run: async input => {
          await indexStore.update(curr => ({
            version: 1,
            libraries: curr.libraries.filter(l => l.id !== input.libraryId),
            projects: curr.projects.filter(p => p.libraryId !== input.libraryId),
          }))
          runtime.events.emitInvalidate('projects', input.libraryId)
          return { removedLibraryId: input.libraryId }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.libraries.rescan',
        title: '后台重新扫描项目库并检测变更',
        tier: 'modify',
        input: z.object({
          libraryId: z.string().min(1),
        }),
        run: async input => {
          const idx = await indexStore.read()
          const lib = idx.libraries.find(l => l.id === input.libraryId)
          if (!lib) {
            throw new FolioError('library_not_found', `项目库不存在: ${input.libraryId}`, 404)
          }
          const task = enqueueLibraryScanTask(lib, 'rescan')
          return { library: lib, task }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.detail.get',
        title: '获取单个项目的就地清单与分组结构',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
        }),
        run: async (input): Promise<ProjectDetailResult> => {
          const summary = await resolveProjectById(input.projectId)
          if (!summary) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          let manifest = await metaStore.readManifest(summary.path, summary.id)
          if (!manifest) {
            const scanRes = await runScanInWorker(summary.path, null)
            manifest = { ...scanRes.manifest, projectId: summary.id, name: summary.name }
            const writeRes = await metaStore.writeManifest(summary.path, manifest)
            const refreshedSummary = buildProjectSummary({
              libraryId: summary.libraryId,
              projectPath: summary.path,
              manifest,
              hasChanges: false,
              changeSummary: EMPTY_CHANGE_SUMMARY,
              missing: false,
              metaWritable: writeRes.metaWritable,
            })
            await upsertProjectsInIndex(summary.libraryId, null, [refreshedSummary], false)
            return { summary: refreshedSummary, manifest }
          }
          return { summary, manifest }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.checkChanges',
        title: '检测单个项目的文件变更（size+mtimeMs）',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
        }),
        run: async (input): Promise<ProjectCheckResult> => {
          const summary = await resolveProjectById(input.projectId)
          if (!summary) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const manifest = await metaStore.readManifest(summary.path, summary.id)
          if (!manifest) {
            return {
              projectId: summary.id,
              hasChanges: true,
              changeSummary: { added: 0, modified: 0, removed: 0 },
              missing: false,
            }
          }
          const check = await runCheckInWorker(summary.path, manifest)
          await indexStore.update(curr => ({
            ...curr,
            projects: curr.projects.map(p =>
              p.id === summary.id
                ? {
                    ...p,
                    hasChanges: check.hasChanges,
                    changeSummary: check.changeSummary,
                    missing: check.missing,
                    extractedUnmodified: check.extractedUnmodified ?? 0,
                  }
                : p,
            ),
          }))
          runtime.events.emitInvalidate('projects', summary.id)
          return check
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.sync',
        title: '增量更新项目元数据并清理失效缩略图',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
        }),
        run: async (input): Promise<ProjectDetailResult> => {
          const summary = await resolveProjectById(input.projectId)
          if (!summary) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          return syncSingleProject(summary)
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.meta.update',
        title: '更新项目摘要、类型、标签或封面',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          summary: z.string().optional(),
          projectType: z.string().optional(),
          tags: z.array(z.string()).optional(),
          coverRelPath: z.string().nullable().optional(),
        }),
        run: async (input): Promise<ProjectDetailResult> => {
          const currentSummary = await resolveProjectById(input.projectId)
          if (!currentSummary) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          let manifest = await metaStore.readManifest(currentSummary.path, currentSummary.id)
          if (!manifest) {
            const scanRes = await runScanInWorker(currentSummary.path, null)
            manifest = { ...scanRes.manifest, projectId: currentSummary.id, name: currentSummary.name }
          }

          let nextCoverRelPath = manifest.coverRelPath
          if (input.coverRelPath !== undefined) {
            if (input.coverRelPath === null) {
              nextCoverRelPath = null
            } else {
              const target = input.coverRelPath
              const existsInManifest = manifest.groups.some(g =>
                g.files.some(f => f.relPath === target),
              )
              if (!existsInManifest) {
                throw new FolioError('invalid_cover', `封面文件不在项目清单中: ${target}`, 400)
              }
              nextCoverRelPath = target
            }
          }

          const cleanTags =
            input.tags !== undefined
              ? Array.from(new Set(input.tags.map(t => t.trim()).filter(Boolean)))
              : manifest.tags

          const updatedManifest: ProjectManifest = {
            ...manifest,
            updatedAt: Date.now(),
            summary: input.summary !== undefined ? input.summary : manifest.summary,
            projectType: input.projectType !== undefined ? input.projectType : manifest.projectType,
            tags: cleanTags,
            coverRelPath: nextCoverRelPath,
          }
          const coverThumbFile = await ensureCoverThumbnail(currentSummary.path, updatedManifest)
          const finalManifest: ProjectManifest = {
            ...updatedManifest,
            coverThumbFile,
          }

          const writeRes = await metaStore.writeManifest(currentSummary.path, finalManifest)
          const nextSummary = buildProjectSummary({
            libraryId: currentSummary.libraryId,
            projectPath: currentSummary.path,
            manifest: finalManifest,
            hasChanges: currentSummary.hasChanges,
            changeSummary: currentSummary.changeSummary,
            missing: currentSummary.missing,
            metaWritable: writeRes.metaWritable,
          })
          await upsertProjectsInIndex(currentSummary.libraryId, null, [nextSummary], false)
          runtime.events.emitInvalidate('projects', currentSummary.id)
          return { summary: nextSummary, manifest: finalManifest }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.thumbs.warmGroup',
        title: '按需预热指定文件夹分组缩略图',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          folderRelPath: z.string(),
          limit: z.number().int().min(1).max(60).optional().default(24),
        }),
        run: async input => {
          const summary = await resolveProjectById(input.projectId)
          if (!summary) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const manifest = await metaStore.readManifest(summary.path, summary.id)
          if (!manifest) return { warmed: 0 }
          const group = manifest.groups.find(g => g.relPath === input.folderRelPath)
          if (!group) return { warmed: 0 }
          const warmed = await thumbService.warmGroupThumbs(
            summary.path,
            summary.id,
            group.files,
            input.limit,
          )
          return { warmed }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.file.open',
        title: '使用系统默认程序打开项目文件',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
          relPath: z.string().min(1),
        }),
        run: async input => {
          const summary = await resolveProjectById(input.projectId)
          if (!summary) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const absPath = normalizeProjectPath(path.join(summary.path, input.relPath))
          if (!isPathInside(summary.path, absPath)) {
            throw new FolioError('forbidden_path', '拒绝越权路径访问', 403)
          }
          const liveStat = await fsp.stat(absPath).catch(() => null)
          if (liveStat?.isFile()) {
            const res = await native.openPath(absPath)
            return { ...res, extractedFromArchive: false }
          }

          const manifest = await metaStore.readManifest(summary.path, summary.id)
          const entry = manifest?.groups.flatMap(g => g.files).find(f => f.relPath === input.relPath)
          const ctx: ProjectFileResolveContext = {
            project: toHostRecord(summary),
            relPath: input.relPath,
            thumbKey: entry?.thumbKey,
            archive: manifest?.archive ?? null,
          }
          for (const resolver of getSortedResolvers()) {
            if (!resolver.resolveForOpen) continue
            const resolved = await resolver.resolveForOpen(ctx)
            if (resolved?.localPath) {
              const openRes = await native.openPath(resolved.localPath)
              return {
                ...openRes,
                extractedFromArchive: Boolean(resolved.extractedFromArchive),
              }
            }
          }

          throw new FolioError('not_found', `文件不存在: ${input.relPath}`, 404)
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.file.reveal',
        title: '在系统资源管理器中定位项目或文件',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
          relPath: z.string().optional(),
        }),
        run: async input => {
          const summary = await resolveProjectById(input.projectId)
          if (!summary) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const targetPath = input.relPath
            ? normalizeProjectPath(path.join(summary.path, input.relPath))
            : summary.path
          if (input.relPath && !isPathInside(summary.path, targetPath)) {
            throw new FolioError('forbidden_path', '拒绝越权路径访问', 403)
          }
          const exists = await fsp.stat(targetPath).catch(() => null)
          if (exists) {
            return native.revealPath(targetPath)
          }

          if (input.relPath) {
            const manifest = await metaStore.readManifest(summary.path, summary.id)
            const entry = manifest?.groups
              .flatMap(g => g.files)
              .find(f => f.relPath === input.relPath)
            const ctx: ProjectFileResolveContext = {
              project: toHostRecord(summary),
              relPath: input.relPath,
              thumbKey: entry?.thumbKey,
              archive: manifest?.archive ?? null,
            }
            for (const resolver of getSortedResolvers()) {
              if (!resolver.resolveForReveal) continue
              const resolved = await resolver.resolveForReveal(ctx)
              if (resolved?.localPath) {
                return native.revealPath(resolved.localPath)
              }
            }
          }

          return native.revealPath(targetPath)
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.ai.status',
        title: '检查 DSH 模型连接与可用 AI 路由',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => getAiStatus(readLlm(), readDefaultModel()),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.ai.previewSample',
        title: '预览将发送给 AI 的项目采样与提示词',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
        }),
        run: async input => {
          const summary = await resolveProjectById(input.projectId)
          if (!summary) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          let manifest = await metaStore.readManifest(summary.path, summary.id)
          if (!manifest) {
            const scanRes = await runScanInWorker(summary.path, null)
            manifest = { ...scanRes.manifest, projectId: summary.id, name: summary.name }
          }
          const sample = await buildProjectSample(summary.path, manifest)
          const { system, user } = buildAiExtractionPrompts(sample)
          return {
            sample,
            systemPrompt: system,
            userPrompt: user,
          }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.ai.extract',
        title: 'AI 采样并提取单个项目元数据',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          applyCover: z.boolean().optional().default(true),
          provider: z.string().optional(),
          model: z.string().optional(),
        }),
        run: async input => {
          const summary = await resolveProjectById(input.projectId)
          if (!summary) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          await resolveAiRoute(readLlm(), readDefaultModel(), {
            provider: input.provider,
            model: input.model,
          })
          const handle = tasks.enqueue({
            scope: 'projects',
            queue: 'projects-ai',
            concurrency: 1,
            pausable: false,
            cancellable: true,
            title: `AI 提取项目信息：${summary.name}`,
            meta: { projectId: summary.id, mode: 'ai-single' },
            run: async helpers => {
              helpers.reportProgress({
                current: 0,
                total: 1,
                message: `正在分析目录与说明文档：${summary.name}`,
              })
              const res = await extractSingleProjectWithAi(summary, {
                applyCover: input.applyCover,
                provider: input.provider,
                model: input.model,
                signal: helpers.signal,
              })
              helpers.reportProgress({
                current: 1,
                total: 1,
                message: `已完成 AI 提取：${summary.name}`,
              })
              return res
            },
          })
          return handle.done
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.ai.extractBatch',
        title: '后台队列批量 AI 提取项目元数据',
        tier: 'modify',
        input: z.object({
          libraryId: z.string().optional(),
          projectIds: z.array(z.string().min(1)).optional(),
          onlyUnextracted: z.boolean().optional().default(false),
          applyCover: z.boolean().optional().default(true),
          provider: z.string().optional(),
          model: z.string().optional(),
        }),
        run: async input => {
          await resolveAiRoute(readLlm(), readDefaultModel(), {
            provider: input.provider,
            model: input.model,
          })
          const idx = await indexStore.read()
          const idSet = input.projectIds ? new Set(input.projectIds) : null
          const targets = idx.projects.filter(p => {
            if (p.missing) return false
            if (idSet && !idSet.has(p.id)) return false
            if (input.libraryId && p.libraryId !== input.libraryId) return false
            if (input.onlyUnextracted && p.aiExtractedAt !== null) return false
            return true
          })

          if (targets.length === 0) {
            return { task: null, total: 0 }
          }

          const handle = tasks.enqueue({
            scope: 'projects',
            queue: 'projects-ai',
            concurrency: 1,
            pausable: true,
            cancellable: true,
            title: `AI 批量提取 (${targets.length} 个项目)`,
            meta: { total: targets.length, mode: 'ai-batch' },
            run: async helpers => {
              let succeeded = 0
              let failed = 0
              for (let i = 0; i < targets.length; i += 1) {
                helpers.throwIfAborted()
                await helpers.waitIfPaused()
                const target = targets[i]!
                helpers.reportProgress({
                  current: i,
                  total: targets.length,
                  message: `AI 提取 (${i + 1}/${targets.length})：${target.name}`,
                })
                try {
                  await extractSingleProjectWithAi(target, {
                    applyCover: input.applyCover,
                    provider: input.provider,
                    model: input.model,
                    signal: helpers.signal,
                  })
                  succeeded += 1
                } catch (err) {
                  if (helpers.signal.aborted) throw err
                  failed += 1
                }
              }
              helpers.reportProgress({
                current: targets.length,
                total: targets.length,
                message: `AI 批量提取完成（成功 ${succeeded}${failed > 0 ? `，失败 ${failed}` : ''}）`,
              })
              return { succeeded, failed }
            },
          })

          return { task: handle.snapshot(), total: targets.length }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.batch.tag',
        title: '批量添加或移除项目标签',
        tier: 'modify',
        input: z.object({
          projectIds: z.array(z.string().min(1)).min(1),
          addTags: z.array(z.string()).optional().default([]),
          removeTags: z.array(z.string()).optional().default([]),
        }),
        run: async input => {
          const addClean = input.addTags.map(t => t.trim()).filter(Boolean)
          const removeSet = new Set(input.removeTags.map(t => t.trim()).filter(Boolean))
          const idx = await indexStore.read()
          const targetSet = new Set(input.projectIds)
          const targets = idx.projects.filter(p => targetSet.has(p.id))
          const updatedSummaries: ProjectSummary[] = []

          for (const summary of targets) {
            let manifest = await metaStore.readManifest(summary.path, summary.id)
            if (!manifest) {
              const scanRes = await runScanInWorker(summary.path, null)
              manifest = { ...scanRes.manifest, projectId: summary.id, name: summary.name }
            }
            const nextTags = Array.from(
              new Set([
                ...manifest.tags.filter(t => !removeSet.has(t)),
                ...addClean,
              ]),
            )
            const nextManifest: ProjectManifest = {
              ...manifest,
              updatedAt: Date.now(),
              tags: nextTags,
            }
            const writeRes = await metaStore.writeManifest(summary.path, nextManifest)
            updatedSummaries.push(
              buildProjectSummary({
                libraryId: summary.libraryId,
                projectPath: summary.path,
                manifest: nextManifest,
                hasChanges: summary.hasChanges,
                changeSummary: summary.changeSummary,
                missing: summary.missing,
                metaWritable: writeRes.metaWritable,
              }),
            )
          }

          if (updatedSummaries.length > 0) {
            await indexStore.update(curr => {
              const map = new Map(updatedSummaries.map(s => [s.id, s]))
              return {
                ...curr,
                projects: curr.projects.map(p => map.get(p.id) ?? p),
              }
            })
            runtime.events.emitInvalidate('projects')
          }
          return { updatedCount: updatedSummaries.length }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'projects.batch.sync',
        title: '后台批量增量更新项目元数据',
        tier: 'modify',
        input: z.object({
          libraryId: z.string().optional(),
          projectIds: z.array(z.string().min(1)).optional(),
          onlyChanged: z.boolean().optional().default(true),
        }),
        run: async input => {
          const idx = await indexStore.read()
          const idSet = input.projectIds ? new Set(input.projectIds) : null
          const targets = idx.projects.filter(p => {
            if (idSet && !idSet.has(p.id)) return false
            if (input.libraryId && p.libraryId !== input.libraryId) return false
            if (input.onlyChanged && !p.hasChanges) return false
            return true
          })

          if (targets.length === 0) {
            return { task: null, total: 0 }
          }

          const handle = tasks.enqueue({
            scope: 'projects',
            queue: 'projects-scan',
            concurrency: 2,
            pausable: true,
            cancellable: true,
            title: `批量增量更新 (${targets.length} 个项目)`,
            meta: { total: targets.length, mode: 'batch-sync' },
            run: async helpers => {
              let synced = 0
              for (let i = 0; i < targets.length; i += 1) {
                helpers.throwIfAborted()
                await helpers.waitIfPaused()
                const target = targets[i]!
                helpers.reportProgress({
                  current: i,
                  total: targets.length,
                  message: `增量更新 (${i + 1}/${targets.length})：${target.name}`,
                })
                await syncSingleProject(target, helpers.signal)
                synced += 1
              }
              helpers.reportProgress({
                current: targets.length,
                total: targets.length,
                message: `已完成 ${synced} 个项目的增量更新`,
              })
              return { synced }
            },
          })

          return { task: handle.snapshot(), total: targets.length }
        },
      }),
    ),

    runtime.registerRoute(
      'GET',
      '/projects/thumb',
      createProjectThumbRouteHandler({
        resolveProjectSummary: resolveProjectById,
        resolveProjectManifest: (p, id) => metaStore.readManifest(p, id),
        thumbService,
        metaStore,
      }),
    ),

    runtime.registerRoute(
      'GET',
      '/projects/media',
      createProjectMediaRouteHandler({
        resolveProjectPath: async id => (await resolveProjectById(id))?.path ?? null,
        resolveMediaFilePath: async (projectId, relPath, signal) => {
          const summary = await resolveProjectById(projectId)
          if (!summary) return null
          const manifest = await metaStore.readManifest(summary.path, summary.id)
          const entry = manifest?.groups.flatMap(g => g.files).find(f => f.relPath === relPath)
          const ctx: ProjectFileResolveContext = {
            project: toHostRecord(summary),
            relPath,
            thumbKey: entry?.thumbKey,
            archive: manifest?.archive ?? null,
            signal,
          }
          for (const resolver of getSortedResolvers()) {
            if (!resolver.resolveForMedia) continue
            const resolved = await resolver.resolveForMedia(ctx)
            if (resolved?.localPath) return resolved.localPath
          }
          return null
        },
      }),
    ),
  ]

  const service: FolioProjectsHostService = {
    async resolveProject(projectId: string): Promise<ProjectHostRecord | null> {
      const summary = await resolveProjectById(projectId)
      return summary ? toHostRecord(summary) : null
    },

    async listProjects(): Promise<readonly ProjectHostRecord[]> {
      const idx = await indexStore.read()
      return idx.projects.map(toHostRecord)
    },

    async readProjectSnapshot(projectId: string): Promise<ProjectHostManifestSnapshot | null> {
      const summary = await resolveProjectById(projectId)
      if (!summary) return null
      let manifest = await metaStore.readManifest(summary.path, summary.id)
      if (!manifest) {
        const scanRes = await runScanInWorker(summary.path, null)
        manifest = { ...scanRes.manifest, projectId: summary.id, name: summary.name }
        await metaStore.writeManifest(summary.path, manifest)
      }
      return {
        projectId: manifest.projectId,
        name: manifest.name,
        archive: manifest.archive ?? null,
        stats: {
          fileCount: manifest.stats.fileCount,
          folderCount: manifest.stats.folderCount,
          totalBytes: manifest.stats.totalBytes,
        },
        files: manifest.groups.flatMap(g =>
          g.files.map(f => ({
            relPath: f.relPath,
            name: f.name,
            size: f.size,
            fingerprint: f.fingerprint,
            thumbKey: f.thumbKey,
            thumbSupported: f.thumbSupported,
          })),
        ),
      }
    },

    async warmProjectThumbs(projectId, warmOpts = {}) {
      const summary = await resolveProjectById(projectId)
      if (!summary) {
        throw new FolioError('project_not_found', `项目不存在: ${projectId}`, 404)
      }
      let manifest = await metaStore.readManifest(summary.path, summary.id)
      if (!manifest) {
        const scanRes = await runScanInWorker(summary.path, null, warmOpts.signal)
        manifest = { ...scanRes.manifest, projectId: summary.id, name: summary.name }
      }
      const allFiles = manifest.groups.flatMap(g => g.files)
      const warmRes = await thumbService.warmAllProjectThumbs(summary.path, summary.id, allFiles, {
        signal: warmOpts.signal,
        hideMetaDir: warmOpts.hideMetaDir,
        onProgress: warmOpts.onProgress,
      })
      const coverThumbFile = await ensureCoverThumbnail(
        summary.path,
        manifest,
        warmOpts.signal,
        warmOpts.hideMetaDir ?? true,
      )
      const updatedManifest: ProjectManifest = {
        ...manifest,
        updatedAt: Date.now(),
        coverThumbFile,
      }
      await metaStore.writeManifest(summary.path, updatedManifest, {
        hideMetaDir: warmOpts.hideMetaDir,
      })
      return warmRes
    },

    async warmProjectFileThumbs(projectId, relPaths, warmOpts = {}) {
      const summary = await resolveProjectById(projectId)
      if (!summary) {
        throw new FolioError('project_not_found', `项目不存在: ${projectId}`, 404)
      }
      if (relPaths.length === 0) return { total: 0, warmed: 0 }
      const entries = await buildEntriesForRelPaths(
        summary.path,
        relPaths,
        thumbs.listSupportedExtensions(),
      )
      return thumbService.warmAllProjectThumbs(summary.path, summary.id, entries, {
        signal: warmOpts.signal,
        hideMetaDir: warmOpts.hideMetaDir,
        onProgress: warmOpts.onProgress,
      })
    },

    async inspectArchivedLiveFiles(projectId: string) {
      const summary = await resolveProjectById(projectId)
      if (!summary) {
        throw new FolioError('project_not_found', `项目不存在: ${projectId}`, 404)
      }
      const manifest = await metaStore.readManifest(summary.path, summary.id)
      if (!manifest || manifest.archive?.mode !== 'archived') {
        return {
          projectId: summary.id,
          archived: false,
          cleanExtracted: [],
          modifiedExtracted: [],
          addedFiles: [],
        }
      }
      return classifyArchivedLiveFiles(
        summary.path,
        manifest,
        thumbs.listSupportedExtensions(),
      )
    },

    async commitArchivedDeltaFiles(projectId, commitOpts) {
      const summary = await resolveProjectById(projectId)
      if (!summary) {
        throw new FolioError('project_not_found', `项目不存在: ${projectId}`, 404)
      }
      const hideMetaDir = commitOpts.hideMetaDir ?? true
      let manifest = await metaStore.readManifest(summary.path, summary.id)
      if (!manifest) {
        const scanRes = await runScanInWorker(summary.path, null)
        manifest = { ...scanRes.manifest, projectId: summary.id, name: summary.name }
      }
      const mergedManifest = await mergeDeltaFilesIntoManifest(
        summary.path,
        manifest,
        commitOpts.deltaRelPaths,
        thumbs.listSupportedExtensions(),
      )
      const withArchive: ProjectManifest = {
        ...mergedManifest,
        archive: normalizeArchiveMeta(commitOpts.archive),
      }
      const coverWasUpdated =
        withArchive.coverRelPath !== null &&
        (!withArchive.coverThumbFile || commitOpts.deltaRelPaths.includes(withArchive.coverRelPath))
      const coverThumbFile = coverWasUpdated
        ? await ensureCoverThumbnail(summary.path, withArchive, undefined, hideMetaDir)
        : withArchive.coverThumbFile
      const finalManifest: ProjectManifest = {
        ...withArchive,
        coverThumbFile,
      }
      const writeRes = await metaStore.writeManifest(summary.path, finalManifest, { hideMetaDir })
      const nextSummary = buildProjectSummary({
        libraryId: summary.libraryId,
        projectPath: summary.path,
        manifest: finalManifest,
        hasChanges: false,
        changeSummary: EMPTY_CHANGE_SUMMARY,
        missing: false,
        metaWritable: writeRes.metaWritable,
        extractedUnmodified: commitOpts.archive.extractedFiles?.length ?? 0,
      })
      await upsertProjectsInIndex(summary.libraryId, null, [nextSummary], false)
      runtime.events.emitInvalidate('projects', summary.id)
    },

    async updateProjectArchiveMeta(projectId, archive: ProjectArchiveMetaInfo | null, metaOpts = {}) {
      const summary = await resolveProjectById(projectId)
      if (!summary) {
        throw new FolioError('project_not_found', `项目不存在: ${projectId}`, 404)
      }
      const hideMetaDir = metaOpts.hideMetaDir ?? true
      let manifest = await metaStore.readManifest(summary.path, summary.id)

      if (archive === null && metaOpts.rescanIfLive) {
        const baseManifest: ProjectManifest | null = manifest
          ? { ...manifest, archive: null }
          : null
        const scanRes = await runScanInWorker(summary.path, baseManifest)
        const nextManifest: ProjectManifest = {
          ...scanRes.manifest,
          projectId: summary.id,
          name: manifest?.name ?? summary.name,
          archive: null,
        }
        const coverThumbFile = await ensureCoverThumbnail(
          summary.path,
          nextManifest,
          undefined,
          hideMetaDir,
        )
        const finalManifest: ProjectManifest = { ...nextManifest, coverThumbFile }
        const writeRes = await metaStore.writeManifest(summary.path, finalManifest, { hideMetaDir })
        const nextSummary = buildProjectSummary({
          libraryId: summary.libraryId,
          projectPath: summary.path,
          manifest: finalManifest,
          hasChanges: false,
          changeSummary: EMPTY_CHANGE_SUMMARY,
          missing: false,
          metaWritable: writeRes.metaWritable,
          extractedUnmodified: 0,
        })
        await upsertProjectsInIndex(summary.libraryId, null, [nextSummary], false)
        runtime.events.emitInvalidate('projects', summary.id)
        return
      }

      if (!manifest) {
        const scanRes = await runScanInWorker(summary.path, null)
        manifest = { ...scanRes.manifest, projectId: summary.id, name: summary.name }
      }
      const normalizedArchive = normalizeArchiveMeta(archive)
      const nextManifest: ProjectManifest = {
        ...manifest,
        updatedAt: Date.now(),
        archive: normalizedArchive,
      }
      const checkAfter =
        normalizedArchive?.mode === 'archived'
          ? await classifyArchivedLiveFiles(
              summary.path,
              nextManifest,
              thumbs.listSupportedExtensions(),
            )
          : null
      const hasChanges = checkAfter
        ? checkAfter.addedFiles.length > 0 || checkAfter.modifiedExtracted.length > 0
        : false
      const changeSummary: ProjectChangeSummary = checkAfter
        ? {
            added: checkAfter.addedFiles.length,
            modified: checkAfter.modifiedExtracted.length,
            removed: 0,
          }
        : EMPTY_CHANGE_SUMMARY

      const writeRes = await metaStore.writeManifest(summary.path, nextManifest, { hideMetaDir })
      const nextSummary = buildProjectSummary({
        libraryId: summary.libraryId,
        projectPath: summary.path,
        manifest: nextManifest,
        hasChanges,
        changeSummary,
        missing: false,
        metaWritable: writeRes.metaWritable,
        extractedUnmodified: checkAfter?.cleanExtracted.length ?? 0,
      })
      await upsertProjectsInIndex(summary.libraryId, null, [nextSummary], false)
      runtime.events.emitInvalidate('projects', summary.id)
    },

    async setProjectMetaDirHidden(projectPath: string, hidden: boolean): Promise<boolean> {
      return metaStore.ensureMetaDirHidden(projectPath, hidden)
    },

    registerFileResolver(resolver: ProjectFileResolver): () => void {
      fileResolvers.set(resolver.id, resolver)
      return () => {
        if (fileResolvers.get(resolver.id) === resolver) {
          fileResolvers.delete(resolver.id)
        }
      }
    },
  }

  return {
    service,
    dispose() {
      for (const dispose of disposers.reverse()) dispose()
      fileResolvers.clear()
      thumbService.dispose()
    },
  }
}

export function registerWorkspaceProjectsHost(
  options: RegisterWorkspaceProjectsHostOptions,
): () => void {
  return createWorkspaceProjectsHost(options).dispose
}

export const name = 'workspace-projects-host'
export const inject = [
  'folioRuntime',
  'folioStorage',
  'folioTasks',
  'folioNative',
  'folioThumbs',
] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const host = createWorkspaceProjectsHost({
      runtime: ctx.folioRuntime,
      storage: ctx.folioStorage,
      tasks: ctx.folioTasks,
      native: ctx.folioNative,
      thumbs: ctx.folioThumbs,
      getLlm: () =>
        (ctx as unknown as { get?: (k: string) => unknown }).get?.('llm') as
          | DshLlmLike
          | undefined,
      getDefaultModel: () =>
        (ctx as unknown as { get?: (k: string) => unknown }).get?.('agentDefaultModel') as
          | DshDefaultModelLike
          | undefined,
    })
    const disposeProvide = ctx.provide('folioProjectsHost', host.service)
    return () => {
      disposeProvide()
      host.dispose()
    }
  }, 'workspace-projects-host: actions + thumb/media routes + folioProjectsHost')
}

export default { name, inject, apply }

export * from './types.js'
export * from './classify.js'
export * from './scanner-core.js'
export * from './ai-sampler.js'
export * from './ai-extractor.js'
