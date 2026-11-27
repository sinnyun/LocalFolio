import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  FolioError,
  defineAction,
  type FolioEagleService,
  type FolioFsService,
  type FolioProjectsHostService,
  type FolioRuntimeService,
  type FolioStorageService,
  type FolioTasksService,
  type FolioThumbsService,
  type TaskSnapshot,
  type ThumbStatusEntry,
} from '@folio/base-contract'
import {
  createEagleThumbClient,
  DEFAULT_EAGLE_API_BASE,
  ensureEmptyEagleLibraryDir,
  type FetchLike,
} from './eagle-client.js'

const EagleThumbsStateSchema = z.object({
  apiBase: z.string().default(DEFAULT_EAGLE_API_BASE),
  cacheLibraryPath: z.string().default(''),
  spaceThresholdBytes: z.number().positive().default(5 * 1024 * 1024 * 1024), // 5 GB
  cumulativeImportedBytes: z.number().nonnegative().default(0),
})

type EagleThumbsState = z.infer<typeof EagleThumbsStateSchema>

export interface MissingExtGroup {
  readonly ext: string
  readonly count: number
  readonly totalBytes: number
  readonly items: readonly {
    readonly relPath: string
    readonly absPath: string
    readonly name: string
    readonly size: number
    readonly thumbKey: string
  }[]
}

export interface ProjectThumbsInspectResult {
  readonly projectId: string
  readonly projectName: string
  readonly readyCount: number
  readonly ignoredCount: number
  readonly missingCount: number
  readonly missingBytes: number
  readonly failedEagleCount: number
  readonly missingGroups: readonly MissingExtGroup[]
  readonly failedEagleItems: readonly {
    readonly relPath: string
    readonly absPath: string
    readonly name: string
    readonly ext: string
    readonly size: number
    readonly thumbKey: string
  }[]
}

export interface RegisterFeatureThumbsEagleHostOptions {
  readonly runtime: FolioRuntimeService
  readonly storage: FolioStorageService
  readonly tasks: FolioTasksService
  readonly thumbs: FolioThumbsService
  readonly eagle?: FolioEagleService
  readonly fs?: FolioFsService
  readonly projectsHost?: FolioProjectsHostService
  readonly fetchImpl?: FetchLike
  readonly probeTimeoutMs?: number
  readonly pollIntervalMs?: number
}

export function registerFeatureThumbsEagleHost(
  options: RegisterFeatureThumbsEagleHostOptions,
): () => void {
  const { runtime, storage, tasks, thumbs, eagle, fs, projectsHost } = options
  const pluginStorage = storage.forPlugin('feature-thumbs-eagle-host')
  const defaultCacheLibraryPath = pluginStorage.dataPath('ThumbCache.library')

  const stateStore = pluginStorage.jsonStore('eagle-thumbs-state.json', EagleThumbsStateSchema, () => ({
    apiBase: DEFAULT_EAGLE_API_BASE,
    cacheLibraryPath: defaultCacheLibraryPath,
    spaceThresholdBytes: 5 * 1024 * 1024 * 1024,
    cumulativeImportedBytes: 0,
  }))

  let activeBatchCount = 0

  const getEffectiveState = async (): Promise<EagleThumbsState> => {
    const s = await stateStore.read()
    return {
      ...s,
      apiBase: s.apiBase.trim() || DEFAULT_EAGLE_API_BASE,
      cacheLibraryPath: s.cacheLibraryPath.trim() || defaultCacheLibraryPath,
    }
  }

  const createClient = async () => {
    const state = await getEffectiveState()
    return {
      state,
      client: createEagleThumbClient({
        apiBase: state.apiBase,
        eagle,
        fs,
        fetchImpl: options.fetchImpl,
        probeTimeoutMs: options.probeTimeoutMs,
        pollIntervalMs: options.pollIntervalMs,
      }),
    }
  }

  // Register L3 manual-only Eagle provider into ctx.folioThumbs
  const disposeProvider = thumbs.registerProvider({
    id: 'eagle',
    title: 'Eagle 本地 API 手动兜底 (L3)',
    priority: 200,
    queueType: 'eagle',
    manualOnly: true,
    extensions: ['*'],
    async generate(req) {
      const { state, client } = await createClient()
      const res = await client.extractThumbnail({
        filePath: req.filePath,
        fileSize: req.fileSize ?? 0,
        cacheLibraryPath: state.cacheLibraryPath,
        // When invoked individually outside batch wrapper, restore immediately
        restoreLibrary: activeBatchCount === 0,
        signal: req.signal,
      })
      if (!res) return null
      await stateStore.update(curr => ({
        ...curr,
        cumulativeImportedBytes: curr.cumulativeImportedBytes + (req.fileSize ?? 0),
      }))
      return { buffer: res.buffer, mime: res.mime }
    },
  })

  const disposers = [
    disposeProvider,

    runtime.registerAction(
      defineAction({
        id: 'thumbs.eagle.status',
        title: '检测 Eagle 缩略图兜底服务状态与缓存库空间',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => {
          const { state, client } = await createClient()
          const library = await client.probeLibraryInfo()
          return {
            online: Boolean(library),
            currentLibrary: library,
            apiBase: state.apiBase,
            cacheLibraryPath: state.cacheLibraryPath,
            cumulativeImportedBytes: state.cumulativeImportedBytes,
            spaceThresholdBytes: state.spaceThresholdBytes,
            spaceWarning: state.cumulativeImportedBytes >= state.spaceThresholdBytes,
            busy: activeBatchCount > 0,
          }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'thumbs.eagle.settings.update',
        title: '更新 Eagle 缩略图补全配置',
        tier: 'modify',
        input: z.object({
          apiBase: z.string().url().optional(),
          cacheLibraryPath: z.string().min(1).optional(),
          spaceThresholdGb: z.number().min(0.5).max(100).optional(),
        }),
        run: async input => {
          const updated = await stateStore.update(curr => ({
            ...curr,
            apiBase: input.apiBase ?? curr.apiBase,
            cacheLibraryPath: input.cacheLibraryPath ?? curr.cacheLibraryPath,
            spaceThresholdBytes:
              typeof input.spaceThresholdGb === 'number'
                ? Math.round(input.spaceThresholdGb * 1024 * 1024 * 1024)
                : curr.spaceThresholdBytes,
          }))
          return updated
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'thumbs.eagle.project.inspect',
        title: '按后缀聚合统计项目内无缩略图与 Eagle 失败文件',
        tier: 'read',
        input: z.object({
          projectId: z.string().min(1),
        }),
        run: async (input): Promise<ProjectThumbsInspectResult> => {
          if (!projectsHost) {
            throw new FolioError('projects_host_unavailable', '项目库宿主服务未启用', 503)
          }
          const project = await projectsHost.resolveProject(input.projectId)
          const snapshot = await projectsHost.readProjectSnapshot(input.projectId)
          if (!project || !snapshot) {
            throw new FolioError('project_not_found', `项目不存在: ${input.projectId}`, 404)
          }

          const absPaths = snapshot.files.map(f => path.join(project.path, f.relPath))
          const statuses = await thumbs.queryStatus(absPaths)

          const groupMap = new Map<
            string,
            {
              ext: string
              count: number
              totalBytes: number
              items: Array<{
                relPath: string
                absPath: string
                name: string
                size: number
                thumbKey: string
              }>
            }
          >()
          const failedEagleItems: Array<{
            relPath: string
            absPath: string
            name: string
            ext: string
            size: number
            thumbKey: string
          }> = []

          let readyCount = 0
          let ignoredCount = 0
          let missingCount = 0
          let missingBytes = 0

          for (let i = 0; i < snapshot.files.length; i += 1) {
            const file = snapshot.files[i]!
            const absPath = absPaths[i]!
            const st = statuses[i]
            const ext = path.extname(file.name).toLowerCase() || '(无后缀)'

            if (!st || st.status === 'MISSING') {
              if (thumbs.isIgnored(file.name)) {
                ignoredCount += 1
                continue
              }
              missingCount += 1
              missingBytes += file.size
              let group = groupMap.get(ext)
              if (!group) {
                group = { ext, count: 0, totalBytes: 0, items: [] }
                groupMap.set(ext, group)
              }
              group.count += 1
              group.totalBytes += file.size
              group.items.push({
                relPath: file.relPath,
                absPath,
                name: file.name,
                size: file.size,
                thumbKey: file.thumbKey,
              })
            } else if (st.status === 'READY') {
              readyCount += 1
            } else if (st.status === 'IGNORED') {
              ignoredCount += 1
            } else if (st.status === 'FAILED_EAGLE') {
              failedEagleItems.push({
                relPath: file.relPath,
                absPath,
                name: file.name,
                ext,
                size: file.size,
                thumbKey: file.thumbKey,
              })
            }
          }

          const missingGroups: MissingExtGroup[] = Array.from(groupMap.values()).sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count
            return a.ext.localeCompare(b.ext)
          })

          return {
            projectId: project.id,
            projectName: project.name,
            readyCount,
            ignoredCount,
            missingCount,
            missingBytes,
            failedEagleCount: failedEagleItems.length,
            missingGroups,
            failedEagleItems,
          }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'thumbs.eagle.generate',
        title: '提交手动勾选的文件至 Eagle 串行队列补全缩略图',
        tier: 'modify',
        input: z.object({
          filePaths: z.array(z.string().min(1)).min(1),
          projectId: z.string().optional(),
          maxDim: z.number().int().positive().max(1024).optional(),
        }),
        run: async (input): Promise<{ readonly task: TaskSnapshot }> => {
          const { state, client } = await createClient()
          const preInfo = await client.probeLibraryInfo()
          if (!preInfo) {
            throw new FolioError(
              'eagle_offline',
              '未检测到正在运行的 Eagle 服务，请先打开 Eagle 后再试',
              503,
            )
          }

          const handle = tasks.enqueue({
            scope: 'thumbs-eagle',
            queue: 'thumbs-eagle-batch',
            concurrency: 1,
            title: `Eagle 补全缩略图（${input.filePaths.length} 个文件）`,
            pausable: false,
            cancellable: true,
            meta: {
              projectId: input.projectId ?? null,
              totalFiles: input.filePaths.length,
            },
            run: async helpers => {
              activeBatchCount += 1
              const previousLibraryPath = preInfo.path
              let results: readonly ThumbStatusEntry[] = []
              try {
                helpers.reportProgress({
                  current: 0,
                  total: input.filePaths.length,
                  message: '正在准备 Eagle 专用缓存库...',
                })
                results = await thumbs.generateManual({
                  providerId: 'eagle',
                  filePaths: input.filePaths,
                  maxDim: input.maxDim ?? 360,
                  signal: helpers.signal,
                  onProgress: (current, total, fp) => {
                    helpers.reportProgress({
                      current,
                      total,
                      message: `Eagle 补全中：${path.basename(fp)}`,
                    })
                  },
                })

                // Mirror completed thumbnails into project .folio-meta if triggered from Project Library
                if (input.projectId && projectsHost) {
                  const project = await projectsHost.resolveProject(input.projectId)
                  if (project) {
                    const readyRelPaths = results
                      .filter(r => r.status === 'READY')
                      .map(r => path.relative(project.path, r.filePath).replace(/\\/g, '/'))
                      .filter(rel => rel && !rel.startsWith('..') && !path.isAbsolute(rel))
                    if (readyRelPaths.length > 0) {
                      await projectsHost
                        .warmProjectFileThumbs(input.projectId, readyRelPaths, {
                          signal: helpers.signal,
                        })
                        .catch(() => {})
                    }
                  }
                }

                runtime.events.emitInvalidate('projects')
                runtime.events.emitInvalidate('files')
                return {
                  total: results.length,
                  ready: results.filter(r => r.status === 'READY').length,
                  failed: results.filter(r => r.status === 'FAILED_EAGLE').length,
                }
              } finally {
                activeBatchCount = Math.max(0, activeBatchCount - 1)
                if (
                  previousLibraryPath &&
                  path.resolve(previousLibraryPath).toLowerCase() !==
                    path.resolve(state.cacheLibraryPath).toLowerCase()
                ) {
                  await client.switchLibrary(previousLibraryPath).catch(() => false)
                }
              }
            },
          })

          return { task: handle.snapshot() }
        },
      }),
    ),

    runtime.registerAction(
      defineAction({
        id: 'thumbs.eagle.cache.reset',
        title: '重建清空 Eagle 专用缓存库并重置累计体积计数',
        tier: 'delete',
        input: z.object({}).default({}),
        run: async () => {
          if (activeBatchCount > 0) {
            throw new FolioError('eagle_busy', 'Eagle 队列正在执行任务，请等待空闲后再清理缓存库', 409)
          }
          const state = await getEffectiveState()
          await fsp.rm(state.cacheLibraryPath, { recursive: true, force: true })
          await ensureEmptyEagleLibraryDir(state.cacheLibraryPath)
          const updated = await stateStore.update(curr => ({
            ...curr,
            cumulativeImportedBytes: 0,
          }))
          return {
            cacheLibraryPath: updated.cacheLibraryPath,
            cumulativeImportedBytes: updated.cumulativeImportedBytes,
          }
        },
      }),
    ),
  ]

  return () => {
    for (const dispose of disposers.reverse()) {
      dispose()
    }
  }
}

export const name = 'feature-thumbs-eagle-host'
export const inject = [
  'folioRuntime',
  'folioStorage',
  'folioTasks',
  'folioThumbs',
  'folioEagle',
  'folioFs',
  'folioProjectsHost',
] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () =>
      registerFeatureThumbsEagleHost({
        runtime: ctx.folioRuntime,
        storage: ctx.folioStorage,
        tasks: ctx.folioTasks,
        thumbs: ctx.folioThumbs,
        eagle: ctx.folioEagle,
        fs: ctx.folioFs,
        projectsHost: ctx.folioProjectsHost,
      }),
    'feature-thumbs-eagle-host: manual Eagle thumbnail provider & actions',
  )
}

export default { name, inject, apply }
export {
  createEagleThumbClient,
  decodeEagleThumbPath,
  computeDynamicPollTimeoutMs,
  type FetchLike,
} from './eagle-client.js'
