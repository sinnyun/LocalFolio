import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  FolioError,
  defineAction,
  observeTask,
  type FolioNativeService,
  type FolioProjectsHostService,
  type FolioRuntimeService,
  type FolioStorageService,
  type FolioTasksService,
  type ProjectArchiveMetaInfo,
  type ProjectHostRecord,
  type TaskSnapshot,
} from '@folio/base-contract'
import {
  buildDefaultArchiveFileName,
  createProjectArchiveService,
  type ArchiveCliRunner,
  type MountedArchiveHandle,
} from './archive-service.js'
import { createArchiveToolManager } from './archive-tool.js'
import {
  ArchiveCompressionMethodSchema,
  ArchiveSourceDisposalSchema,
  type ArchiveMountSessionInfo,
  type ArchiveSourceDisposal,
  type ArchiveToolStatus,
} from './types.js'

export interface RegisterFeatureArchiveHostOptions {
  readonly runtime: FolioRuntimeService
  readonly storage: FolioStorageService
  readonly tasks: FolioTasksService
  readonly native: FolioNativeService
  readonly projectsHost?: FolioProjectsHostService | null
  readonly runner?: ArchiveCliRunner
}

export interface ManagedFeatureArchiveHost {
  attachProjectsHost(projectsHost: FolioProjectsHostService): () => void
  dispose(): void
}

interface ActiveMountEntry {
  readonly info: ArchiveMountSessionInfo
  readonly handle: MountedArchiveHandle
}

export function registerFeatureArchiveHost(
  options: RegisterFeatureArchiveHostOptions,
): ManagedFeatureArchiveHost {
  const { runtime, storage, tasks, native } = options
  const pluginStorage = storage.forPlugin('feature-archive-host')
  const toolManager = createArchiveToolManager(pluginStorage)
  const archiveService = createProjectArchiveService({
    toolManager,
    native,
    runner: options.runner,
    tasks,
  })

  let attachedProjectsHost: FolioProjectsHostService | null = options.projectsHost ?? null
  let attachedResolverDisposer: (() => void) | null = null
  const activeMounts = new Map<string, ActiveMountEntry>()

  const listActiveMountInfos = (): ArchiveMountSessionInfo[] =>
    Array.from(activeMounts.values()).map(entry => entry.info)

  const getStatusWithMounts = async (): Promise<ArchiveToolStatus> => {
    const base = await toolManager.getStatus()
    return {
      ...base,
      activeMounts: listActiveMountInfos(),
    }
  }

  const unmountProjectIfMounted = async (projectId: string): Promise<boolean> => {
    const entry = activeMounts.get(projectId)
    if (!entry) return false
    activeMounts.delete(projectId)
    await entry.handle.unmount().catch(() => {})
    runtime.events.emitInvalidate('archive', projectId)
    return true
  }

  const requireProjectsHost = (): FolioProjectsHostService => {
    if (!attachedProjectsHost) {
      throw new FolioError(
        'projects_host_unavailable',
        '项目库后端服务未就绪（workspace-projects-host）',
        503,
      )
    }
    return attachedProjectsHost
  }

  const attachProjectsHost = (projectsHost: FolioProjectsHostService): (() => void) => {
    attachedResolverDisposer?.()
    attachedProjectsHost = projectsHost
    attachedResolverDisposer = projectsHost.registerFileResolver({
      id: 'feature-archive-zpaq',
      order: 10,
      async resolveForOpen(ctx) {
        if (ctx.archive?.mode !== 'archived' || !ctx.archive.archiveFileName) return null
        const localPath = await archiveService.ensureExtractedFile({
          projectPath: ctx.project.path,
          projectId: ctx.project.id,
          projectName: ctx.project.name,
          archiveFileName: ctx.archive.archiveFileName,
          relPath: ctx.relPath,
          thumbKey: ctx.thumbKey ?? 'open',
          signal: ctx.signal,
        })
        return { localPath, extractedFromArchive: true }
      },
      async resolveForMedia(ctx) {
        if (ctx.archive?.mode !== 'archived' || !ctx.archive.archiveFileName) return null
        const localPath = await archiveService.ensureExtractedFile({
          projectPath: ctx.project.path,
          projectId: ctx.project.id,
          projectName: ctx.project.name,
          archiveFileName: ctx.archive.archiveFileName,
          relPath: ctx.relPath,
          thumbKey: ctx.thumbKey ?? 'media',
          signal: ctx.signal,
        })
        return { localPath }
      },
      async resolveForReveal(ctx) {
        if (ctx.archive?.mode !== 'archived' || !ctx.archive.archiveFileName) return null
        const artifacts = await archiveService.listArchiveArtifacts(
          ctx.project.path,
          ctx.archive.archiveFileName,
        )
        return { localPath: artifacts.primaryRevealPath ?? ctx.project.path }
      },
    })

    return () => {
      attachedResolverDisposer?.()
      attachedResolverDisposer = null
      if (attachedProjectsHost === projectsHost) {
        attachedProjectsHost = null
      }
    }
  }

  if (options.projectsHost) {
    attachProjectsHost(options.projectsHost)
  }

  const requirePackTool = async () => {
    const binaryPath = await toolManager.requireActiveBinary()
    const toolStatus = await toolManager.getStatus()
    if (!toolStatus.supportsChunkBackup) {
      throw new FolioError(
        'archive_tool_outdated',
        `当前 zpaqfranz (${toolStatus.version ?? 'unknown'}) 版本过旧，不支持 -chunk 固定大小分卷（需 ≥ 65.11），请在「归档设置」中一键更新`,
        400,
      )
    }
    return { binaryPath, settings: toolStatus.settings }
  }

  const enqueueProjectPack = (
    projectsHost: FolioProjectsHostService,
    project: ProjectHostRecord,
    { binaryPath, settings }: Awaited<ReturnType<typeof requirePackTool>>,
    sourceDisposal: ArchiveSourceDisposal = settings.defaultSourceDisposal,
  ): TaskSnapshot => {
    const handle = tasks.enqueue({
      scope: 'projects',
      queue: 'archive-ops',
      concurrency: 1,
      pausable: false,
      cancellable: true,
      title: `分卷归档打包：${project.name}`,
      meta: { projectId: project.id, projectName: project.name, mode: 'archive-pack' },
      run: async helpers => {
        helpers.throwIfAborted()
        const currentSnapshot = await projectsHost.readProjectSnapshot(project.id)
        if (!currentSnapshot) {
          throw new FolioError('project_not_found', `项目清单不可用: ${project.name}`, 404)
        }
        if (currentSnapshot.archive?.mode === 'archived') {
          helpers.reportProgress({ current: 1, total: 1, message: '项目已归档，已跳过' })
          return { skipped: true }
        }
        await projectsHost.syncProject(project.id, helpers.signal)
        helpers.throwIfAborted()
        helpers.reportProgress({
          current: 5,
          total: 100,
          message: '步骤 1/4：预热项目全部 360px 缩略图与封面…',
        })

        const warmRes = await projectsHost.warmProjectThumbs(project.id, {
          signal: helpers.signal,
          hideMetaDir: settings.hideMetaDir,
          onProgress: (done, total, rel, failed) => {
            const pct = total > 0 ? 5 + Math.round((done / total) * 30) : 35
            helpers.reportProgress({
              current: pct,
              total: 100,
              message: `步骤 1/4：生成缩略图 (${done}/${total}) ${path.basename(rel)}`,
              detail: { succeeded: done - failed, failed },
            })
          },
        })
        const thumbProgress = { succeeded: warmRes.total - warmRes.failed, failed: warmRes.failed }

        helpers.throwIfAborted()
        const snapshot = await projectsHost.readProjectSnapshot(project.id)
        if (!snapshot) {
          throw new FolioError('project_not_found', `项目清单不可用: ${project.name}`, 404)
        }

        const archiveFileName =
          snapshot.archive?.archiveFileName || buildDefaultArchiveFileName(snapshot.name)
        const entries = await archiveService.collectTopLevelPackEntries(
          project.path,
          archiveFileName,
        )
        if (entries.length === 0) {
          throw new FolioError('archive_empty_source', '项目目录中没有可归档的原始文件', 400)
        }

        helpers.reportProgress({
          current: 35,
          total: 100,
          message: `步骤 2/4：正在按 ${settings.chunkSizeGb}GB/卷 去重打包为 ${archiveFileName}…`,
          detail: thumbProgress,
        })

        await archiveService.runner.add({
          binaryPath,
          projectPath: project.path,
          archiveFileName,
          entries,
          layout: 'backup-chunk',
          chunkSizeGb: settings.chunkSizeGb,
          compressionMethod: settings.compressionMethod,
          signal: helpers.signal,
          onProgress: (pct, line) => {
            const mapped = pct !== null ? 35 + Math.round(pct * 0.4) : 50
            helpers.reportProgress({
              current: Math.min(75, mapped),
              total: 100,
              message: `步骤 2/4：打包中 ${line}`,
              detail: thumbProgress,
            })
          },
        })

        helpers.throwIfAborted()
        helpers.reportProgress({
          current: 75,
          total: 100,
          message: '步骤 3/4：正在校验 .zpaq 分卷归档完整性…',
          detail: thumbProgress,
        })

        await archiveService.runner.test({
          binaryPath,
          projectPath: project.path,
          archiveFileName,
          signal: helpers.signal,
          onProgress: (pct, line) => {
            const mapped = pct !== null ? 75 + Math.round(pct * 0.15) : 82
            helpers.reportProgress({
              current: Math.min(90, mapped),
              total: 100,
              message: `步骤 3/4：校验中 ${line}`,
              detail: thumbProgress,
            })
          },
        })

        helpers.throwIfAborted()
        helpers.reportProgress({
          current: 92,
          total: 100,
          detail: thumbProgress,
          message:
            sourceDisposal === 'keep'
              ? '步骤 4/4：保存归档状态（保留源文件）…'
              : sourceDisposal === 'recycle'
                ? '步骤 4/4：正在将已归档源文件移入系统回收站…'
                : '步骤 4/4：正在清理已归档源文件…',
        })

        const artifacts = await archiveService.listArchiveArtifacts(
          project.path,
          archiveFileName,
        )
        if (artifacts.volumeFiles.length === 0) {
          throw new FolioError(
            'archive_missing',
            `未检测到已生成的归档分卷文件: ${archiveFileName}`,
            500,
          )
        }
        helpers.throwIfAborted()
        const disposed = await archiveService.disposeSourceEntries(
          project.path,
          entries,
          sourceDisposal,
        )
        const now = Date.now()
        const archiveMeta: ProjectArchiveMetaInfo = {
          mode: 'archived',
          engine: 'zpaqfranz',
          archiveFileName,
          archiveLayout: 'backup-chunk',
          chunkSizeGb: settings.chunkSizeGb,
          volumeCount: artifacts.volumeFiles.length,
          compressionMethod: settings.compressionMethod,
          archiveBytes: artifacts.totalBytes,
          originalBytes: snapshot.stats.totalBytes,
          archivedFileCount: snapshot.stats.fileCount,
          archivedAt: now,
          verifiedAt: now,
          sourceDisposal,
          versions: (snapshot.archive?.versions ?? 0) + 1,
        }
        await projectsHost.updateProjectArchiveMeta(project.id, archiveMeta, {
          hideMetaDir: settings.hideMetaDir,
        })

        helpers.reportProgress({
          current: 100,
          total: 100,
          message: `分卷归档完成：${archiveFileName}（共 ${artifacts.volumeFiles.length} 卷，缩略图预热 ${warmRes.warmed} 张）`,
          detail: thumbProgress,
        })
        return { archive: archiveMeta, disposed }
      },
    })

    return handle.snapshot()
  }

  const isPackPending = (projectId: string, snapshots: readonly TaskSnapshot[]): boolean =>
    snapshots.some(task =>
      task.meta?.mode === 'archive-pack' &&
      task.meta.projectId === projectId &&
      (task.status === 'queued' || task.status === 'running' || task.status === 'paused'),
    )

  const enqueueArchiveThumbs = async (input: {
    readonly projectId: string
    readonly relPaths?: readonly string[]
    readonly retryOf?: string
  }) => {
    const projectsHost = requireProjectsHost()
    const project = await projectsHost.resolveProject(input.projectId)
    const snapshot = await projectsHost.readProjectSnapshot(input.projectId)
    if (!project || !snapshot) throw new FolioError('project_not_found', '项目不存在', 404)
    if (snapshot.archive?.mode !== 'archived') {
      throw new FolioError('not_archived', '当前项目尚未归档', 400)
    }
    const filesByPath = new Map(snapshot.files.map(file => [file.relPath, file]))
    const requested = input.relPaths
      ? [...new Set(input.relPaths)]
      : snapshot.files.filter(file => file.thumbSupported).map(file => file.relPath)
    const selected = requested.map(relPath => {
      const file = filesByPath.get(relPath)
      if (!file?.thumbSupported) {
        throw new FolioError('invalid_thumb_target', `文件不在归档清单中或不支持缩略图: ${relPath}`, 400)
      }
      return file
    })
    const handle = tasks.enqueue({
      scope: 'projects',
      queue: 'archive-ops',
      concurrency: 1,
      pausable: true,
      cancellable: true,
      title: `归档内补缩略图：${project.name}`,
      retry: { kind: 'archive-thumbs', params: { projectId: project.id } },
      ...(input.retryOf ? { retryOf: input.retryOf } : {}),
      meta: { projectId: project.id, projectName: project.name, mode: 'archive-thumbs' },
      run: async helpers => {
        const current = await projectsHost.readProjectSnapshot(project.id)
        if (
          current?.archive?.mode !== 'archived' ||
          current.archive.versions !== snapshot.archive?.versions ||
          current.archive.archiveFileName !== snapshot.archive?.archiveFileName
        ) {
          throw new FolioError('archive_changed', '归档已变更，请刷新项目后重试', 409)
        }
        const archiveFileName = current.archive.archiveFileName
        const currentByPath = new Map(current.files.map(file => [file.relPath, file.thumbKey]))
        const { hideMetaDir } = await toolManager.getSettings()
        helpers.items.define(
          selected.map(file => ({ key: file.relPath, label: file.name })),
        )
        let succeeded = 0
        let failed = 0
        let lastError: string | null = null
        const report = (message: string): void => {
          helpers.reportProgress({
            current: succeeded + failed,
            total: selected.length,
            message,
            detail: { succeeded, failed, lastError },
          })
        }

        for (const file of selected) {
          await helpers.items.checkpoint()
          report(`正在补图：${file.relPath}`)
          helpers.items.begin(file.relPath)
          try {
            if (currentByPath.get(file.relPath) !== file.thumbKey) {
              throw new Error('归档文件记录已变更')
            }
            const ready = await projectsHost.cacheProjectFileThumb(project.id, file, () =>
              archiveService.extractTemporaryThumbSource({
                projectPath: project.path,
                archiveFileName,
                relPath: file.relPath,
                signal: helpers.signal,
              }), { signal: helpers.signal, hideMetaDir })
            if (!ready) throw new Error('本机取图链路未生成缩略图')
            helpers.items.succeed(file.relPath)
            succeeded += 1
          } catch (err) {
            helpers.throwIfAborted()
            const message = err instanceof Error ? err.message : String(err)
            helpers.items.fail(file.relPath, message)
            failed += 1
            lastError = `${file.relPath}：${message}`
          }
          report(`已处理 ${succeeded + failed}/${selected.length} 个文件`)
        }
        if (succeeded === 0 && lastError) {
          throw new FolioError('archive_thumbs_failed', lastError, 422)
        }
        return { succeeded, failed }
      },
    })
    return handle
  }

  const disposers = [
    tasks.registerRetryHandler({
      kind: 'archive-thumbs',
      retry: ({ task, items, wholeTask }) => {
        const projectId =
          typeof task.retry?.params?.projectId === 'string'
            ? task.retry.params.projectId
            : typeof task.meta?.projectId === 'string'
              ? task.meta.projectId
              : ''
        if (!projectId) {
          throw new FolioError('task_retry_invalid', '归档补图任务缺少项目标识', 400)
        }
        return enqueueArchiveThumbs({
          projectId,
          ...(!wholeTask && items.length > 0
            ? { relPaths: items.map(item => item.key) }
            : {}),
          retryOf: task.id,
        }).then(handle => handle.snapshot())
      },
    }),

    runtime.registerAction(
      defineAction({
        id: 'archive.tool.status',
        title: '查询 zpaqfranz 归档引擎安装状态与缓存统计',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => getStatusWithMounts(),
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.tool.download',
        title: '一键下载安装 zpaqfranz 到插件固定目录',
        tier: 'modify',
        input: z
          .object({
            mirrorPrefix: z.string().optional(),
            directUrl: z.string().optional(),
          })
          .default({}),
        run: async input => {
          const handle = tasks.enqueue({
            scope: 'projects',
            queue: 'archive-ops',
            concurrency: 1,
            pausable: false,
            cancellable: true,
            title: '下载安装 zpaqfranz 归档引擎',
            meta: { mode: 'tool-download' },
            run: async helpers => {
              const status = await toolManager.downloadManagedBinary({
                mirrorPrefix: input.mirrorPrefix,
                directUrl: input.directUrl,
                signal: helpers.signal,
                onProgress: p => {
                  helpers.reportProgress(p)
                },
              })
              runtime.events.emitInvalidate('archive')
              return { ...status, activeMounts: listActiveMountInfos() }
            },
          })
          return { task: handle.snapshot() }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.tool.pickLocal',
        title: '手动选择本地 zpaqfranz.exe 导入固定目录',
        tier: 'modify',
        input: z
          .object({
            filePath: z.string().optional(),
          })
          .default({}),
        run: async input => {
          let chosenPath = input.filePath?.trim() ?? ''
          if (!chosenPath) {
            const pick = await native.pickFiles({
              title: '选择本地 zpaqfranz.exe 程序',
              filter: '可执行程序 (*.exe)|*.exe|所有文件 (*.*)|*.*',
              multi: false,
            })
            if (pick.cancelled || pick.paths.length === 0) {
              return { cancelled: true, status: await getStatusWithMounts() }
            }
            chosenPath = pick.paths[0]!
          }
          await toolManager.importLocalBinary(chosenPath)
          runtime.events.emitInvalidate('archive')
          return { cancelled: false, status: await getStatusWithMounts() }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.tool.revealDir',
        title: '在资源管理器中打开 zpaqfranz 托管工具目录',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => {
          await fsp.mkdir(toolManager.managedDir, { recursive: true })
          const existsExe = await fsp.stat(toolManager.managedBinaryPath).catch(() => null)
          return native.revealPath(existsExe ? toolManager.managedBinaryPath : toolManager.managedDir)
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.settings.update',
        title: '更新归档备份插件配置',
        tier: 'modify',
        input: z.object({
          mirrorPrefix: z.string().optional(),
          customBinaryPath: z.string().nullable().optional(),
          defaultSourceDisposal: ArchiveSourceDisposalSchema.optional(),
          extractCacheMaxMb: z.number().int().min(64).max(16384).optional(),
          hideMetaDir: z.boolean().optional(),
          chunkSizeGb: z.number().min(0.25).max(1024).optional(),
          compressionMethod: ArchiveCompressionMethodSchema.optional(),
          useSequentialExtract: z.boolean().optional(),
        }),
        run: async input => {
          const updated = await toolManager.updateSettings(input)
          if (input.hideMetaDir !== undefined && attachedProjectsHost) {
            const projects = await attachedProjectsHost.listProjects()
            await Promise.all(
              projects.map(p =>
                attachedProjectsHost!.setProjectMetaDirHidden(p.path, updated.hideMetaDir),
              ),
            )
          }
          runtime.events.emitInvalidate('archive')
          return getStatusWithMounts()
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.cache.clear',
        title: '清空临时提取文件缓存',
        tier: 'modify',
        input: z.object({}).default({}),
        run: async () => {
          const cacheStats = await toolManager.clearExtractCache()
          runtime.events.emitInvalidate('archive')
          return { cacheStats }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.project.pack',
        title: '生成完整缩略图并将项目打包去重归档为 .zpaq',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          sourceDisposal: ArchiveSourceDisposalSchema.optional(),
        }),
        run: async input => {
          const projectsHost = requireProjectsHost()
          const project = await projectsHost.resolveProject(input.projectId)
          if (!project) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const tool = await requirePackTool()
          if (isPackPending(project.id, tasks.listTasks('projects'))) {
            throw new FolioError('archive_pack_pending', '项目已在归档队列中', 409)
          }
          return { task: enqueueProjectPack(projectsHost, project, tool, input.sourceDisposal) }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.projects.packBatch',
        title: '按顺序将选中的未归档项目加入归档队列',
        tier: 'modify',
        input: z.object({
          projectIds: z.array(z.string().min(1)).min(1),
          sourceDisposal: ArchiveSourceDisposalSchema.optional(),
        }),
        run: async input => {
          const projectsHost = requireProjectsHost()
          const projectIds = [...new Set(input.projectIds)]
          const selected = await Promise.all(projectIds.map(id => projectsHost.resolveProject(id)))
          const eligible = selected.filter((project): project is ProjectHostRecord => Boolean(project && !project.archived))
          if (eligible.length === 0) return { tasks: [], skippedCount: projectIds.length }

          const tool = await requirePackTool()
          const existingTasks = tasks.listTasks('projects')
          const queued = eligible
            .filter(project => !isPackPending(project.id, existingTasks))
            .map(project => enqueueProjectPack(projectsHost, project, tool, input.sourceDisposal))
          return { tasks: queued, skippedCount: projectIds.length - queued.length }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.project.rebuildThumbs',
        title: '从归档包为选中的文件补缩略图',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          relPaths: z.array(z.string().min(1)).min(1),
        }),
        run: async input => {
          const handle = await enqueueArchiveThumbs({
            projectId: input.projectId,
            relPaths: input.relPaths,
          })
          return { task: handle.snapshot() }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.project.verify',
        title: '校验项目 .zpaq 归档包完整性',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
        }),
        run: async input => {
          const projectsHost = requireProjectsHost()
          const binaryPath = await toolManager.requireActiveBinary()
          const project = await projectsHost.resolveProject(input.projectId)
          if (!project) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const snapshot = await projectsHost.readProjectSnapshot(project.id)
          if (!snapshot?.archive || snapshot.archive.mode !== 'archived') {
            throw new FolioError('not_archived', '当前项目尚未归档', 400)
          }
          const archiveMeta = snapshot.archive

          const handle = tasks.enqueue({
            scope: 'projects',
            queue: 'archive-ops',
            concurrency: 1,
            pausable: false,
            cancellable: true,
            title: `校验归档：${project.name}`,
            meta: { projectId: project.id, projectName: project.name, mode: 'archive-verify' },
            run: async helpers => {
              helpers.reportProgress({
                current: 10,
                total: 100,
                message: `正在校验 ${archiveMeta.archiveFileName}…`,
              })
              await archiveService.runner.test({
                binaryPath,
                projectPath: project.path,
                archiveFileName: archiveMeta.archiveFileName,
                signal: helpers.signal,
                onProgress: (pct, line) => {
                  helpers.reportProgress({
                    current: pct !== null ? Math.min(95, Math.round(pct)) : 50,
                    total: 100,
                    message: `校验中：${line}`,
                  })
                },
              })
              const nextMeta: ProjectArchiveMetaInfo = {
                ...archiveMeta,
                verifiedAt: Date.now(),
              }
              await projectsHost.updateProjectArchiveMeta(project.id, nextMeta)
              helpers.reportProgress({
                current: 100,
                total: 100,
                message: `校验通过：${archiveMeta.archiveFileName}`,
              })
              return { verified: true, verifiedAt: nextMeta.verifiedAt }
            },
          })

          return { task: handle.snapshot() }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.project.restore',
        title: '将 .zpaq 归档包解包还原回项目目录',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          mode: z
            .enum([
              'restore_and_remove_archive',
              'extract_all_keep_archive',
              'recover_keep_archive',
            ])
            .optional(),
          removeArchive: z.boolean().optional(),
          recover: z.boolean().optional(),
        }),
        run: async input => {
          const projectsHost = requireProjectsHost()
          const binaryPath = await toolManager.requireActiveBinary()
          const project = await projectsHost.resolveProject(input.projectId)
          if (!project) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const snapshot = await projectsHost.readProjectSnapshot(project.id)
          if (!snapshot?.archive || snapshot.archive.mode !== 'archived') {
            throw new FolioError('not_archived', '当前项目尚未归档', 400)
          }
          const archiveMeta = snapshot.archive
          const settings = await toolManager.getSettings()
          const resolvedMode = input.recover
            ? 'recover_keep_archive'
            : (input.mode ??
              (input.removeArchive === false
                ? 'extract_all_keep_archive'
                : 'restore_and_remove_archive'))
          const isRecover = resolvedMode === 'recover_keep_archive'

          const handle = tasks.enqueue({
            scope: 'projects',
            queue: 'archive-ops',
            concurrency: 1,
            pausable: false,
            cancellable: true,
            title: isRecover
              ? `坏包抢救还原：${project.name}`
              : resolvedMode === 'extract_all_keep_archive'
                ? `全部提取（保留包）：${project.name}`
                : `解包还原并移除包：${project.name}`,
            meta: { projectId: project.id, projectName: project.name, mode: 'archive-restore', resolvedMode },
            run: async helpers => {
              helpers.reportProgress({
                current: 10,
                total: 100,
                message: isRecover
                  ? `正在逐块校验并抢救还原 ${archiveMeta.archiveFileName}…`
                  : `正在${settings.useSequentialExtract ? '顺序' : ''}解包 ${archiveMeta.archiveFileName}…`,
              })
              await archiveService.runner.extractAll({
                binaryPath,
                projectPath: project.path,
                archiveFileName: archiveMeta.archiveFileName,
                sequential: settings.useSequentialExtract,
                recover: isRecover,
                signal: helpers.signal,
                onProgress: (pct, line) => {
                  helpers.reportProgress({
                    current: pct !== null ? Math.min(82, Math.round(pct * 0.82)) : 45,
                    total: 100,
                    message: `${isRecover ? '抢救中' : '解包中'}：${line}`,
                  })
                },
              })

              if (resolvedMode === 'extract_all_keep_archive' || isRecover) {
                helpers.reportProgress({
                  current: 88,
                  total: 100,
                  message: '正在登记已提取文件指纹（保持归档态，可直接清理）…',
                })
                const now = Date.now()
                const extractedFiles: Array<{
                  readonly relPath: string
                  readonly fingerprint: string
                  readonly originalFingerprint: string
                  readonly extractedAt: number
                }> = []
                for (const file of snapshot.files) {
                  const abs = path.join(project.path, ...file.relPath.split('/'))
                  const st = await fsp.stat(abs).catch(() => null)
                  if (!st?.isFile()) continue
                  extractedFiles.push({
                    relPath: file.relPath,
                    fingerprint: `${st.size}:${Math.trunc(st.mtimeMs)}`,
                    originalFingerprint: file.fingerprint,
                    extractedAt: now,
                  })
                }
                await projectsHost.updateProjectArchiveMeta(
                  project.id,
                  {
                    ...archiveMeta,
                    extractedFiles,
                  },
                  { hideMetaDir: settings.hideMetaDir },
                )
                runtime.events.emitInvalidate('archive', project.id)
                helpers.reportProgress({
                  current: 100,
                  total: 100,
                  message: isRecover
                    ? `坏包抢救完成：已还原 ${extractedFiles.length}/${snapshot.files.length} 个完好文件（原归档包已保留）`
                    : `已全部提取 ${extractedFiles.length} 个文件到原位置（保留 ${archiveMeta.archiveFileName}）`,
                })
                return {
                  restored: true,
                  mode: resolvedMode,
                  recovered: isRecover,
                  extractedCount: extractedFiles.length,
                  totalExpected: snapshot.files.length,
                }
              }

              await unmountProjectIfMounted(project.id)

              helpers.reportProgress({
                current: 86,
                total: 100,
                message: `正在将 ${archiveMeta.archiveFileName} 分卷归档移入回收站…`,
              })
              const artifacts = await archiveService.listArchiveArtifacts(
                project.path,
                archiveMeta.archiveFileName,
              )
              const toRemove = [...artifacts.allFiles, ...artifacts.transientFiles].map(f => f.name)
              await archiveService.disposeSourceEntries(
                project.path,
                toRemove.length > 0 ? toRemove : [archiveMeta.archiveFileName],
                'recycle',
              )

              helpers.reportProgress({
                current: 92,
                total: 100,
                message: '正在重新同步项目索引…',
              })
              await projectsHost.updateProjectArchiveMeta(project.id, null, {
                rescanIfLive: true,
                hideMetaDir: settings.hideMetaDir,
              })
              runtime.events.emitInvalidate('archive', project.id)
              helpers.reportProgress({
                current: 100,
                total: 100,
                message: `已完整解包还原「${project.name}」并清理归档包`,
              })
              return { restored: true, mode: resolvedMode }
            },
          })

          return { task: handle.snapshot() }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.project.inspectLive',
        title: '分类检查项目磁盘中现存文件及残留归档包',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
        }),
        run: async input => {
          const projectsHost = requireProjectsHost()
          const inspection = await projectsHost.inspectArchivedLiveFiles(input.projectId)
          if (inspection.archived) {
            return { ...inspection, leftoverArchiveFiles: [] }
          }
          const project = await projectsHost.resolveProject(input.projectId)
          if (!project) {
            return { ...inspection, leftoverArchiveFiles: [] }
          }
          const leftoverArchiveFiles: Array<{ name: string; size: number }> = []
          const dirEntries = await fsp.readdir(project.path, { withFileTypes: true }).catch(() => [])
          for (const entry of dirEntries) {
            if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.zpaq')) continue
            const st = await fsp.stat(path.join(project.path, entry.name)).catch(() => null)
            if (st?.isFile()) {
              leftoverArchiveFiles.push({ name: entry.name, size: st.size })
            }
          }
          return { ...inspection, leftoverArchiveFiles }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.project.removeLeftoverArchive',
        title: '清理已解包项目根目录残留的 .zpaq 归档包',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          archiveFileName: z.string().min(1),
          disposal: z.enum(['recycle', 'delete']).optional().default('recycle'),
        }),
        run: async input => {
          const projectsHost = requireProjectsHost()
          const project = await projectsHost.resolveProject(input.projectId)
          if (!project) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const safeName = path.basename(input.archiveFileName)
          if (
            !safeName ||
            safeName !== input.archiveFileName ||
            !safeName.toLowerCase().endsWith('.zpaq')
          ) {
            throw new FolioError('invalid_archive_name', '非法归档文件名', 400)
          }
          const settings = await toolManager.getSettings()
          await archiveService.disposeSourceEntries(project.path, [safeName], input.disposal)
          await projectsHost.updateProjectArchiveMeta(project.id, null, {
            rescanIfLive: true,
            hideMetaDir: settings.hideMetaDir,
          })
          runtime.events.emitInvalidate('archive', project.id)
          return { removed: safeName }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.project.cleanExtracted',
        title: '直接删除已归档项目中未修改的临时提取文件',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          relPaths: z.array(z.string().min(1)).optional(),
        }),
        run: async input => {
          const projectsHost = requireProjectsHost()
          const project = await projectsHost.resolveProject(input.projectId)
          if (!project) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const snapshot = await projectsHost.readProjectSnapshot(project.id)
          if (!snapshot?.archive || snapshot.archive.mode !== 'archived') {
            throw new FolioError('not_archived', '当前项目尚未归档', 400)
          }
          const inspection = await projectsHost.inspectArchivedLiveFiles(project.id)
          const filterSet = input.relPaths ? new Set(input.relPaths) : null

          const cleanTargets = inspection.cleanExtracted
            .map(f => f.relPath)
            .filter(rel => !filterSet || filterSet.has(rel))
          const skippedModifiedCount = filterSet
            ? inspection.modifiedExtracted.filter(f => filterSet.has(f.relPath)).length
            : inspection.modifiedExtracted.length

          const settings = await toolManager.getSettings()
          const removedCount = await archiveService.removeFilesAndPruneDirs(
            project.path,
            cleanTargets,
            'delete',
          )
          const removedSet = new Set(cleanTargets)
          const nextExtracted = (snapshot.archive.extractedFiles ?? []).filter(
            item => !removedSet.has(item.relPath),
          )
          await projectsHost.updateProjectArchiveMeta(
            project.id,
            {
              ...snapshot.archive,
              extractedFiles: nextExtracted,
            },
            { hideMetaDir: settings.hideMetaDir },
          )
          runtime.events.emitInvalidate('archive', project.id)
          return {
            removedCount,
            removedRelPaths: cleanTargets,
            skippedModifiedCount,
          }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.project.append',
        title: '将新增或已修改的文件增量追加打包到项目 .zpaq 归档',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          sourceDisposal: ArchiveSourceDisposalSchema.optional(),
          cleanUnmodifiedExtracted: z.boolean().optional().default(true),
        }),
        run: async input => {
          const projectsHost = requireProjectsHost()
          const binaryPath = await toolManager.requireActiveBinary()
          const project = await projectsHost.resolveProject(input.projectId)
          if (!project) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const snapshot = await projectsHost.readProjectSnapshot(project.id)
          if (!snapshot?.archive || snapshot.archive.mode !== 'archived') {
            throw new FolioError('not_archived', '当前项目尚未归档，请先执行首次归档打包', 400)
          }
          const archiveMeta = snapshot.archive
          const toolStatus = await toolManager.getStatus()
          const settings = toolStatus.settings
          const layout = archiveMeta.archiveLayout ?? 'single'
          if (layout === 'backup-chunk' && !toolStatus.supportsChunkBackup) {
            throw new FolioError(
              'archive_tool_outdated',
              `当前 zpaqfranz (${toolStatus.version ?? 'unknown'}) 版本过旧，不支持 -chunk 分卷追加（需 ≥ 65.11），请在「归档设置」中一键更新`,
              400,
            )
          }
          const sourceDisposal = input.sourceDisposal ?? settings.defaultSourceDisposal

          const handle = tasks.enqueue({
            scope: 'projects',
            queue: 'archive-ops',
            concurrency: 1,
            pausable: false,
            cancellable: true,
            title: `增量追加归档：${project.name}`,
            meta: { projectId: project.id, projectName: project.name, mode: 'archive-append' },
            run: async helpers => {
              helpers.throwIfAborted()
              const inspection = await projectsHost.inspectArchivedLiveFiles(project.id)
              const deltaItems = [...inspection.addedFiles, ...inspection.modifiedExtracted]
              const deltaRelPaths = deltaItems.map(f => f.relPath)
              if (deltaRelPaths.length === 0) {
                throw new FolioError(
                  'archive_no_delta',
                  '没有检测到新增或已修改的文件，无需追加归档',
                  400,
                )
              }

              helpers.reportProgress({
                current: 5,
                total: 100,
                message: `步骤 1/4：为 ${deltaRelPaths.length} 个增量文件生成 360px 缩略图…`,
              })

              const warmRes = await projectsHost.warmProjectFileThumbs(
                project.id,
                deltaRelPaths,
                {
                  signal: helpers.signal,
                  hideMetaDir: settings.hideMetaDir,
                  onProgress: (done, total, rel) => {
                    const pct = total > 0 ? 5 + Math.round((done / total) * 30) : 35
                    helpers.reportProgress({
                      current: pct,
                      total: 100,
                      message: `步骤 1/4：生成缩略图 (${done}/${total}) ${path.basename(rel)}`,
                    })
                  },
                },
              )

              helpers.throwIfAborted()
              helpers.reportProgress({
                current: 35,
                total: 100,
                message: `步骤 2/4：正在增量追加打包到 ${archiveMeta.archiveFileName}…`,
              })

              const addEntries = deltaRelPaths.map(rel => rel.split('/').join(path.sep))
              await archiveService.runner.add({
                binaryPath,
                projectPath: project.path,
                archiveFileName: archiveMeta.archiveFileName,
                entries: addEntries,
                layout,
                chunkSizeGb: archiveMeta.chunkSizeGb ?? settings.chunkSizeGb,
                compressionMethod: settings.compressionMethod,
                signal: helpers.signal,
                onProgress: (pct, line) => {
                  const mapped = pct !== null ? 35 + Math.round(pct * 0.4) : 55
                  helpers.reportProgress({
                    current: Math.min(75, mapped),
                    total: 100,
                    message: `步骤 2/4：追加打包中 ${line}`,
                  })
                },
              })

              helpers.throwIfAborted()
              helpers.reportProgress({
                current: 75,
                total: 100,
                message: '步骤 3/4：正在校验增量后的 .zpaq 完整性…',
              })

              await archiveService.runner.test({
                binaryPath,
                projectPath: project.path,
                archiveFileName: archiveMeta.archiveFileName,
                signal: helpers.signal,
                onProgress: (pct, line) => {
                  const mapped = pct !== null ? 75 + Math.round(pct * 0.15) : 82
                  helpers.reportProgress({
                    current: Math.min(90, mapped),
                    total: 100,
                    message: `步骤 3/4：校验中 ${line}`,
                  })
                },
              })

              helpers.throwIfAborted()
              helpers.reportProgress({
                current: 92,
                total: 100,
                message: '步骤 4/4：正在合并清单并清理已追加文件…',
              })

              const cleanRelPaths =
                input.cleanUnmodifiedExtracted && sourceDisposal !== 'keep'
                  ? inspection.cleanExtracted.map(f => f.relPath)
                  : []
              const deltaSet = new Set(deltaRelPaths)
              const cleanedSet = new Set(cleanRelPaths)
              const remainingExtracted = (archiveMeta.extractedFiles ?? []).filter(
                item => !deltaSet.has(item.relPath) && !cleanedSet.has(item.relPath),
              )

              // Recompute exact totals across existing snapshot + delta
              const mergedSizes = new Map(snapshot.files.map(f => [f.relPath, f.size]))
              for (const item of deltaItems) {
                mergedSizes.set(item.relPath, item.size)
              }
              let nextOriginalBytes = 0
              for (const sz of mergedSizes.values()) nextOriginalBytes += sz

              const artifacts = await archiveService.listArchiveArtifacts(
                project.path,
                archiveMeta.archiveFileName,
              )
              const now = Date.now()
              const nextArchiveMeta: ProjectArchiveMetaInfo = {
                ...archiveMeta,
                volumeCount: Math.max(1, artifacts.volumeFiles.length),
                archiveBytes: artifacts.totalBytes,
                originalBytes: nextOriginalBytes,
                archivedFileCount: mergedSizes.size,
                archivedAt: now,
                verifiedAt: now,
                versions: (archiveMeta.versions ?? 1) + 1,
                extractedFiles: remainingExtracted,
              }

              await projectsHost.commitArchivedDeltaFiles(project.id, {
                deltaRelPaths,
                archive: nextArchiveMeta,
                hideMetaDir: settings.hideMetaDir,
              })

              const disposedDelta = await archiveService.removeFilesAndPruneDirs(
                project.path,
                deltaRelPaths,
                sourceDisposal,
              )
              const cleanedUnmodified =
                cleanRelPaths.length > 0
                  ? await archiveService.removeFilesAndPruneDirs(
                      project.path,
                      cleanRelPaths,
                      'delete',
                    )
                  : 0

              runtime.events.emitInvalidate('archive', project.id)
              helpers.reportProgress({
                current: 100,
                total: 100,
                message: `增量追加完成（v${nextArchiveMeta.versions}，新增/更新 ${deltaRelPaths.length} 个文件，缩略图预热 ${warmRes.warmed} 张）`,
              })
              return {
                archive: nextArchiveMeta,
                appendedCount: deltaRelPaths.length,
                disposedDelta,
                cleanedUnmodified,
              }
            },
          })

          return { task: handle.snapshot() }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.file.extractInPlace',
        title: '将归档内单个文件直接提取回项目原位置',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          relPath: z.string().min(1),
          reveal: z.boolean().optional().default(true),
        }),
        run: async input => {
          const projectsHost = requireProjectsHost()
          const project = await projectsHost.resolveProject(input.projectId)
          if (!project) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const snapshot = await projectsHost.readProjectSnapshot(project.id)
          if (!snapshot?.archive || snapshot.archive.mode !== 'archived') {
            throw new FolioError('not_archived', '当前项目尚未归档', 400)
          }
          const manifestFile = snapshot.files.find(f => f.relPath === input.relPath)
          if (!manifestFile) {
            throw new FolioError('not_found', `文件不在归档清单中: ${input.relPath}`, 404)
          }

          const archiveFileName = snapshot.archive.archiveFileName
          const extracted = await observeTask(tasks, {
            scope: 'projects', key: `extract:${project.id}`, title: `归档文件提取：${project.name}`,
            item: input.relPath, meta: { projectId: project.id, projectName: project.name },
          }, () => archiveService.extractFileInPlace({
            projectPath: project.path,
            archiveFileName,
            relPath: input.relPath,
          }))

          const settings = await toolManager.getSettings()
          const prevList = snapshot.archive.extractedFiles ?? []
          const nextExtracted = [
            ...prevList.filter(item => item.relPath !== input.relPath),
            {
              relPath: input.relPath,
              fingerprint: extracted.fingerprint,
              originalFingerprint: manifestFile.fingerprint,
              extractedAt: Date.now(),
            },
          ]

          await projectsHost.updateProjectArchiveMeta(
            project.id,
            {
              ...snapshot.archive,
              extractedFiles: nextExtracted,
            },
            { hideMetaDir: settings.hideMetaDir },
          )

          if (input.reveal) {
            await native.revealPath(extracted.extractedPath).catch(() => {})
          }
          runtime.events.emitInvalidate('archive', project.id)
          return extracted
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.file.extractTo',
        title: '从归档中提取或复制单个文件到指定目录',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          relPath: z.string().min(1),
          destDir: z.string().optional(),
          reveal: z.boolean().optional().default(true),
        }),
        run: async input => {
          const projectsHost = requireProjectsHost()
          const project = await projectsHost.resolveProject(input.projectId)
          if (!project) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const snapshot = await projectsHost.readProjectSnapshot(project.id)
          const archiveFileName =
            snapshot?.archive?.archiveFileName || buildDefaultArchiveFileName(project.name)

          let destDir = input.destDir?.trim() ?? ''
          if (!destDir) {
            const pick = await native.pickFolder({
              title: `选择「${path.basename(input.relPath)}」的提取目标文件夹`,
              initialDir: project.path,
            })
            if (pick.cancelled || !pick.folderPath) {
              return { cancelled: true, extractedPath: null }
            }
            destDir = pick.folderPath
          }

          const extractedPath = await observeTask(tasks, {
            scope: 'projects', key: `extract:${project.id}`, title: `归档文件提取：${project.name}`,
            item: input.relPath, meta: { projectId: project.id, projectName: project.name },
          }, () => archiveService.extractFileToDestination({
            projectPath: project.path,
            archiveFileName,
            relPath: input.relPath,
            destDir,
          }))

          if (input.reveal) {
            await native.revealPath(extractedPath).catch(() => {})
          }
          return { cancelled: false, extractedPath }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.project.exportArchive',
        title: '导出项目的 .zpaq 归档包到指定目录',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
          destDir: z.string().optional(),
          reveal: z.boolean().optional().default(true),
        }),
        run: async input => {
          const projectsHost = requireProjectsHost()
          const project = await projectsHost.resolveProject(input.projectId)
          if (!project) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const snapshot = await projectsHost.readProjectSnapshot(project.id)
          if (!snapshot?.archive || snapshot.archive.mode !== 'archived') {
            throw new FolioError('not_archived', '当前项目尚未生成归档包', 400)
          }

          let destDir = input.destDir?.trim() ?? ''
          if (!destDir) {
            const pick = await native.pickFolder({
              title: `选择归档包「${snapshot.archive.archiveFileName}」导出目录`,
              initialDir: project.path,
            })
            if (pick.cancelled || !pick.folderPath) {
              return { cancelled: true, exportedPath: null }
            }
            destDir = pick.folderPath
          }

          const archiveFileName = snapshot.archive.archiveFileName
          const exported = await observeTask(tasks, {
            scope: 'projects', key: `archive-export:${project.id}`, title: `导出归档包：${project.name}`,
            item: archiveFileName, meta: { projectId: project.id, projectName: project.name },
          }, () => archiveService.exportArchiveToDestination({
            projectPath: project.path,
            archiveFileName,
            destDir,
          }))

          if (input.reveal) {
            await native.revealPath(exported.exportedPath).catch(() => {})
          }
          return {
            cancelled: false,
            exportedPath: exported.exportedPath,
            exportedFiles: exported.exportedFiles,
          }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.project.mount',
        title: '将项目 .zpaq 归档挂载为只读虚拟盘符（免解压浏览）',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
          allVersions: z.boolean().optional().default(false),
          driveLetter: z.string().optional(),
          openInExplorer: z.boolean().optional().default(true),
        }),
        run: async input => {
          const projectsHost = requireProjectsHost()
          const binaryPath = await toolManager.requireActiveBinary()
          if (!archiveService.runner.mount) {
            throw new FolioError(
              'archive_mount_unsupported',
              '当前归档运行器不支持虚拟盘挂载',
              501,
            )
          }
          const project = await projectsHost.resolveProject(input.projectId)
          if (!project) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }
          const snapshot = await projectsHost.readProjectSnapshot(project.id)
          if (!snapshot?.archive || snapshot.archive.mode !== 'archived') {
            throw new FolioError('not_archived', '当前项目尚未归档', 400)
          }

          const existing = activeMounts.get(project.id)
          if (existing) {
            if (input.openInExplorer && existing.info.mountPoint) {
              await native.openPath(existing.info.mountPoint).catch(() => {})
            }
            return { mount: existing.info, alreadyMounted: true }
          }

          const artifacts = await archiveService.listArchiveArtifacts(
            project.path,
            snapshot.archive.archiveFileName,
          )
          if (artifacts.volumeFiles.length === 0) {
            throw new FolioError(
              'archive_missing',
              `归档包不存在: ${snapshot.archive.archiveFileName}`,
              404,
            )
          }

          const archiveAbsPath = path.join(project.path, snapshot.archive.archiveFileName)
          const handle = await archiveService.runner.mount({
            binaryPath,
            projectPath: project.path,
            archiveAbsPath,
            allVersions: input.allVersions,
            driveLetter: input.driveLetter,
          })

          const info: ArchiveMountSessionInfo = {
            projectId: project.id,
            projectName: project.name,
            archiveFileName: snapshot.archive.archiveFileName,
            mountPoint: handle.mountPoint,
            allVersions: Boolean(input.allVersions),
            startedAt: Date.now(),
            pid: handle.pid,
          }
          activeMounts.set(project.id, { info, handle })

          void handle.onExit.then(() => {
            const current = activeMounts.get(project.id)
            if (current?.handle === handle) {
              activeMounts.delete(project.id)
              runtime.events.emitInvalidate('archive', project.id)
            }
          })

          if (input.openInExplorer && info.mountPoint) {
            await native.openPath(info.mountPoint).catch(() => {})
          }
          runtime.events.emitInvalidate('archive', project.id)
          return { mount: info, alreadyMounted: false }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'archive.project.unmount',
        title: '卸载已挂载的项目 .zpaq 只读虚拟盘',
        tier: 'modify',
        input: z.object({
          projectId: z.string().min(1),
        }),
        run: async input => {
          const unmounted = await unmountProjectIfMounted(input.projectId)
          return { unmounted }
        },
      }),
    ),
  ]

  return {
    attachProjectsHost,
    dispose() {
      for (const entry of activeMounts.values()) {
        void entry.handle.unmount().catch(() => {})
      }
      activeMounts.clear()
      attachedResolverDisposer?.()
      attachedResolverDisposer = null
      attachedProjectsHost = null
      for (const dispose of disposers.reverse()) dispose()
    },
  }
}

export const name = 'feature-archive-host'
export const inject = ['folioRuntime', 'folioStorage', 'folioTasks', 'folioNative'] as const

export function apply(ctx: Context): void {
  let host: ManagedFeatureArchiveHost | null = null

  ctx.effect(() => {
    host = registerFeatureArchiveHost({
      runtime: ctx.folioRuntime,
      storage: ctx.folioStorage,
      tasks: ctx.folioTasks,
      native: ctx.folioNative,
      projectsHost: ctx.get('folioProjectsHost'),
    })
    return () => {
      host?.dispose()
      host = null
    }
  }, 'feature-archive-host: archive actions & zpaqfranz tool manager')

  ;(
    ctx as unknown as {
      inject(
        deps: string[],
        cb: (scope: Context) => void,
      ): void
    }
  ).inject(['folioProjectsHost'], scope => {
    if (!scope.folioProjectsHost) return
    scope.effect(
      () => host?.attachProjectsHost(scope.folioProjectsHost!) ?? (() => {}),
      'feature-archive-host: attach ProjectFileResolver onto folioProjectsHost',
    )
  })
}

export default { name, inject, apply }
export * from './types.js'
export * from './archive-tool.js'
export * from './archive-service.js'
