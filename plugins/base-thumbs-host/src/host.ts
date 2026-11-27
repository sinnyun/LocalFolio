import fsp from 'node:fs/promises'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  FolioError,
  defineAction,
  type TaskActivityOptions,
  type BoundedQueue,
  type FolioNativeService,
  type FolioRuntimeService,
  type FolioStorageService,
  type FolioTasksService,
  type FolioThumbsService,
  type GeneratedThumbResult,
  type ThumbAutoBatchResult,
  type ThumbCacheStats,
  type ThumbExternalToolInfo,
  type ThumbGenerateRequest,
  type ThumbGeneratorProvider,
  type ThumbProviderInfo,
  type ThumbQueueType,
  type ThumbStatusEntry,
} from '@folio/base-contract'
import {
  DEFAULT_IGNORED_EXTS,
  HEAVY_DESIGN_AVOID_BYTES,
  isIgnoredThumbExt,
} from './blacklist.js'
import {
  buildThumbFingerprint,
  canonicalThumbPathKey,
  createThumbIndexStore,
  toThumbStatusEntry,
  type ThumbIndexRecord,
} from './index-store.js'
import { createBuiltinThumbProviders } from './providers.js'
import { createThumbToolRegistry, type ThumbToolRegistry } from './tools.js'

const MISSING_RETRY_MS = 5 * 60_000

export interface CreateFolioThumbsServiceOptions {
  readonly native: FolioNativeService
  readonly tasks: FolioTasksService
  readonly storage?: FolioStorageService
  readonly concurrency?: number
  readonly heavyConcurrency?: number
  readonly heavyAvoidBytes?: number
  readonly includeBuiltinProviders?: boolean
  readonly tools?: ThumbToolRegistry
}

export interface ManagedFolioThumbsService extends FolioThumbsService {
  readonly tools: ThumbToolRegistry
  dispose(): void
}

function normalizeProviderExts(exts: readonly string[]): string[] {
  return exts
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
    .map(e => (e === '*' || e.startsWith('.') ? e : `.${e}`))
}

export function createFolioThumbsService(
  options: CreateFolioThumbsServiceOptions,
): ManagedFolioThumbsService {
  const pluginStorage = options.storage?.forPlugin('base-thumbs-host')
  const indexStore = createThumbIndexStore({ storage: pluginStorage })
  const tools = options.tools ?? createThumbToolRegistry({ storage: pluginStorage })

  const fastQueue: BoundedQueue = options.tasks.createQueue({
    name: 'thumbs-fast',
    concurrency: options.concurrency ?? 4,
  })
  const heavyQueue: BoundedQueue = options.tasks.createQueue({
    name: 'thumbs-heavy',
    concurrency: options.heavyConcurrency ?? 2,
  })
  const eagleQueue: BoundedQueue = options.tasks.createQueue({
    name: 'thumbs-eagle',
    concurrency: 1,
  })

  const queueFor = (queueType?: ThumbQueueType): BoundedQueue => {
    if (queueType === 'heavy') return heavyQueue
    if (queueType === 'eagle') return eagleQueue
    return fastQueue
  }

  const providers = new Map<string, ThumbGeneratorProvider>()

  const registerProvider = (provider: ThumbGeneratorProvider): (() => void) => {
    const normalized: ThumbGeneratorProvider = {
      ...provider,
      extensions: normalizeProviderExts(provider.extensions),
      queueType: provider.queueType ?? 'fast',
      manualOnly: Boolean(provider.manualOnly),
    }
    providers.set(provider.id, normalized)
    return () => {
      const current = providers.get(provider.id)
      if (current === normalized) {
        providers.delete(provider.id)
      }
    }
  }

  if (options.includeBuiltinProviders !== false) {
    for (const builtin of createBuiltinThumbProviders({
      native: options.native,
      tools,
      heavyAvoidBytes: options.heavyAvoidBytes ?? HEAVY_DESIGN_AVOID_BYTES,
    })) {
      registerProvider(builtin)
    }
  }

  const getSortedProviders = (): ThumbGeneratorProvider[] =>
    Array.from(providers.values()).sort((a, b) => {
      const pa = a.priority ?? 100
      const pb = b.priority ?? 100
      if (pa !== pb) return pa - pb
      return a.id.localeCompare(b.id)
    })

  const matchingAutoProvidersFor = (req: ThumbGenerateRequest): ThumbGeneratorProvider[] =>
    getSortedProviders().filter(p => {
      if (p.manualOnly) return false
      const extMatched = p.extensions.includes('*') || p.extensions.includes(req.ext)
      if (!extMatched) return false
      if (p.canHandle) return p.canHandle(req)
      return true
    })

  const listProviders = (): ThumbProviderInfo[] =>
    getSortedProviders().map(p => ({
      id: p.id,
      title: p.title ?? p.id,
      extensions: [...p.extensions],
      priority: p.priority ?? 100,
      queueType: p.queueType ?? 'fast',
      manualOnly: Boolean(p.manualOnly),
    }))

  const listSupportedExtensions = (): string[] => {
    const set = new Set<string>()
    for (const p of providers.values()) {
      if (p.manualOnly) continue
      for (const ext of p.extensions) {
        if (ext !== '*') set.add(ext)
      }
    }
    return Array.from(set).sort()
  }

  const listIgnoredExtensions = (): readonly string[] => [...DEFAULT_IGNORED_EXTS]

  const isIgnored = (filePathOrName: string): boolean => isIgnoredThumbExt(filePathOrName)

  const isSupported = (filePathOrName: string): boolean => {
    if (isIgnored(filePathOrName)) return false
    const ext = path.extname(filePathOrName).toLowerCase()
    if (!ext) return false
    for (const p of providers.values()) {
      if (p.manualOnly) continue
      if (p.extensions.includes('*') || p.extensions.includes(ext)) {
        return true
      }
    }
    return false
  }

  const resolveAbsCachePath = (rel: string): string =>
    indexStore.cacheDir ? path.join(indexStore.cacheDir, rel) : rel

  const statSourceFile = async (
    filePath: string,
  ): Promise<{ readonly size: number; readonly mtimeMs: number; readonly fingerprint: string } | null> => {
    try {
      const st = await fsp.stat(filePath)
      if (!st.isFile()) return null
      return {
        size: st.size,
        mtimeMs: st.mtimeMs,
        fingerprint: buildThumbFingerprint(st.size, st.mtimeMs),
      }
    } catch {
      return null
    }
  }

  const runProviderInLane = async (
    provider: ThumbGeneratorProvider,
    req: ThumbGenerateRequest,
  ): Promise<Omit<GeneratedThumbResult, 'providerId'> | null> => {
    const lane = queueFor(provider.queueType)
    return lane
      .enqueue<Omit<GeneratedThumbResult, 'providerId'> | null>(async qSignal => {
        if (qSignal.aborted) return null
        try {
          const res = await provider.generate({ ...req, signal: qSignal })
          if (res && res.buffer.length > 0) return res
          return null
        } catch {
          return null
        }
      }, req.signal)
      .catch(() => null)
  }

  const generateWithRecord = async (reqOptions: {
    readonly filePath: string
    readonly maxDim?: number
    readonly preferPng?: boolean
    readonly force?: boolean
    readonly transient?: boolean
    readonly signal?: AbortSignal
    readonly activity?: Omit<TaskActivityOptions<unknown>, 'isSuccessful' | 'signal'>
  }): Promise<{
    readonly result: GeneratedThumbResult | null
    readonly record: ThumbIndexRecord
  }> => {
    const filePath = path.resolve(reqOptions.filePath)
    const canonicalKey = canonicalThumbPathKey(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const maxDim =
      typeof reqOptions.maxDim === 'number' && Number.isFinite(reqOptions.maxDim) && reqOptions.maxDim > 0
        ? Math.round(reqOptions.maxDim)
        : 360

    const stat = await statSourceFile(filePath)
    const fileSize = stat?.size ?? 0
    const mtimeMs = stat?.mtimeMs ?? 0
    const fingerprint = stat?.fingerprint ?? '0_0'
    const now = Date.now()

    // L0-1: Misc blacklist -> IGNORED
    if (isIgnored(filePath)) {
      const ignoredRec: ThumbIndexRecord = {
        filePath,
        canonicalKey,
        fingerprint,
        status: 'IGNORED',
        providerId: null,
        thumbPath: null,
        mime: null,
        ext,
        fileSize,
        updatedAt: now,
      }
      if (!reqOptions.transient) await indexStore.upsert(ignoredRec)
      return { result: null, record: ignoredRec }
    }

    if (!stat) {
      const missingRec: ThumbIndexRecord = {
        filePath,
        canonicalKey,
        fingerprint,
        status: 'MISSING',
        providerId: null,
        thumbPath: null,
        mime: null,
        ext,
        fileSize: 0,
        updatedAt: now,
      }
      return { result: null, record: missingRec }
    }

    // L0-2: Idempotency check against persisted index
    const existing = reqOptions.transient ? null : await indexStore.get(filePath)
    if (existing && existing.fingerprint === fingerprint && !reqOptions.force) {
      if (existing.status === 'IGNORED') {
        return { result: null, record: existing }
      }
      if (
        existing.status === 'FAILED_EAGLE' ||
        (existing.status === 'MISSING' && now - existing.updatedAt < MISSING_RETRY_MS)
      ) {
        return { result: null, record: existing }
      }
      if (existing.status === 'READY') {
        if (existing.thumbPath) {
          const cachedBuf = await indexStore.readCacheFile(existing.thumbPath)
          if (cachedBuf && cachedBuf.length > 0 && existing.mime && existing.providerId) {
            return {
              result: {
                buffer: cachedBuf,
                mime: existing.mime,
                providerId: existing.providerId,
                cachePath: resolveAbsCachePath(existing.thumbPath),
              },
              record: existing,
            }
          }
          // Cache image was deleted on disk!
          // If it came from Eagle, reset to MISSING and NEVER auto-trigger Eagle.
          if (existing.providerId === 'eagle') {
            const resetRec: ThumbIndexRecord = {
              ...existing,
              status: 'MISSING',
              providerId: null,
              thumbPath: null,
              mime: null,
              updatedAt: now,
            }
            await indexStore.upsert(resetRec)
            return { result: null, record: resetRec }
          }
        }
        // Non-eagle READY with missing cache (or in-memory mode): fall through to re-run L1~L2
      }
    }

    // L1a -> L1b -> L2 automatic pipeline (strictly excluding manualOnly providers)
    const req: ThumbGenerateRequest = {
      filePath,
      ext,
      fileSize,
      mtimeMs,
      maxDim,
      preferPng: reqOptions.preferPng,
      signal: reqOptions.signal,
    }
    const candidates = matchingAutoProvidersFor(req)

    const run = async () => {
      for (const provider of candidates) {
        if (reqOptions.signal?.aborted) break
        const res = await runProviderInLane(provider, req)
        if (res && res.buffer.length > 0) {
          const cacheRel = reqOptions.transient ? null : await indexStore.writeCacheFile({
            filePath,
            fingerprint,
            maxDim,
            mime: res.mime,
            buffer: res.buffer,
          })
          const readyRec: ThumbIndexRecord = {
            filePath,
            canonicalKey,
            fingerprint,
            status: 'READY',
            providerId: provider.id,
            thumbPath: cacheRel,
            mime: res.mime,
            ext,
            fileSize,
            updatedAt: Date.now(),
          }
          if (!reqOptions.transient) await indexStore.upsert(readyRec)
          return {
            result: {
              buffer: res.buffer,
              mime: res.mime,
              providerId: provider.id,
              cachePath: cacheRel ? resolveAbsCachePath(cacheRel) : null,
            },
            record: readyRec,
          }
        }
      }

      // Auto pipeline exhausted -> MISSING
      const missingRec: ThumbIndexRecord = {
        filePath,
        canonicalKey,
        fingerprint,
        status: 'MISSING',
        providerId: null,
        thumbPath: null,
        mime: null,
        ext,
        fileSize,
        updatedAt: Date.now(),
      }
      if (!reqOptions.transient && !reqOptions.signal?.aborted) await indexStore.upsert(missingRec)
      return { result: null, record: missingRec }
    }
    if (reqOptions.activity && !reqOptions.signal?.aborted) {
      return options.tasks.observe({
        ...reqOptions.activity,
        signal: reqOptions.signal,
        isSuccessful: outcome => Boolean(outcome.result),
      }, run)
    }
    return run()
  }

  const generate = async (reqOptions: {
    readonly filePath: string
    readonly maxDim?: number
    readonly preferPng?: boolean
    readonly force?: boolean
    readonly transient?: boolean
    readonly signal?: AbortSignal
    readonly activity?: Omit<TaskActivityOptions<unknown>, 'isSuccessful' | 'signal'>
  }): Promise<GeneratedThumbResult | null> => {
    const { result } = await generateWithRecord(reqOptions)
    return result
  }

  const generateAutoBatch = async (
    filePaths: readonly string[],
    opts: {
      readonly maxDim?: number
      readonly preferPng?: boolean
      readonly force?: boolean
      readonly signal?: AbortSignal
      readonly onProgress?: (current: number, total: number, filePath: string) => void
    } = {},
  ): Promise<ThumbAutoBatchResult> => {
    const ready: ThumbStatusEntry[] = []
    const missing: ThumbStatusEntry[] = []
    const ignored: ThumbStatusEntry[] = []
    const total = filePaths.length
    let done = 0

    await Promise.all(
      filePaths.map(async fp => {
        if (opts.signal?.aborted) return
        const { record } = await generateWithRecord({
          filePath: fp,
          maxDim: opts.maxDim,
          preferPng: opts.preferPng,
          force: opts.force,
          signal: opts.signal,
        })
        const entry = toThumbStatusEntry(record, resolveAbsCachePath)
        if (record.status === 'READY') ready.push(entry)
        else if (record.status === 'IGNORED') ignored.push(entry)
        else missing.push(entry)
        done += 1
        opts.onProgress?.(done, total, fp)
      }),
    )

    return { ready, missing, ignored }
  }

  const queryStatus = async (filePaths: readonly string[]): Promise<readonly ThumbStatusEntry[]> => {
    const results: ThumbStatusEntry[] = []
    for (const rawPath of filePaths) {
      const filePath = path.resolve(rawPath)
      const ext = path.extname(filePath).toLowerCase()
      const stat = await statSourceFile(filePath)
      const fileSize = stat?.size ?? 0
      const fingerprint = stat?.fingerprint ?? '0_0'

      if (isIgnored(filePath)) {
        results.push({
          filePath,
          status: 'IGNORED',
          providerId: null,
          cachePath: null,
          mime: null,
          ext,
          fileSize,
          updatedAt: Date.now(),
        })
        continue
      }

      const existing = await indexStore.get(filePath)
      if (existing && existing.fingerprint === fingerprint) {
        if (existing.status === 'READY' && existing.thumbPath) {
          const exists = await indexStore.cacheFileExists(existing.thumbPath)
          if (!exists) {
            const reset: ThumbIndexRecord = {
              ...existing,
              status: 'MISSING',
              providerId: null,
              thumbPath: null,
              mime: null,
              updatedAt: Date.now(),
            }
            await indexStore.upsert(reset)
            results.push(toThumbStatusEntry(reset, resolveAbsCachePath))
            continue
          }
        }
        results.push(toThumbStatusEntry(existing, resolveAbsCachePath))
        continue
      }

      results.push({
        filePath,
        status: 'MISSING',
        providerId: null,
        cachePath: null,
        mime: null,
        ext,
        fileSize,
        updatedAt: 0,
      })
    }
    return results
  }

  const generateManual = async (opts: {
    readonly providerId: string
    readonly filePaths: readonly string[]
    readonly maxDim?: number
    readonly preferPng?: boolean
    readonly signal?: AbortSignal
    readonly onProgress?: (current: number, total: number, filePath: string) => void
  }): Promise<readonly ThumbStatusEntry[]> => {
    const provider = providers.get(opts.providerId)
    if (!provider) {
      throw new FolioError('thumb_provider_not_found', `未注册缩略图生成器: ${opts.providerId}`, 404)
    }

    const maxDim =
      typeof opts.maxDim === 'number' && Number.isFinite(opts.maxDim) && opts.maxDim > 0
        ? Math.round(opts.maxDim)
        : 360
    const results: ThumbStatusEntry[] = []
    const total = opts.filePaths.length

    for (let i = 0; i < total; i += 1) {
      if (opts.signal?.aborted) break
      const filePath = path.resolve(opts.filePaths[i]!)
      const canonicalKey = canonicalThumbPathKey(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const stat = await statSourceFile(filePath)
      const fileSize = stat?.size ?? 0
      const mtimeMs = stat?.mtimeMs ?? 0
      const fingerprint = stat?.fingerprint ?? '0_0'

      if (!stat) {
        const failedRec: ThumbIndexRecord = {
          filePath,
          canonicalKey,
          fingerprint,
          status: provider.id === 'eagle' ? 'FAILED_EAGLE' : 'MISSING',
          providerId: null,
          thumbPath: null,
          mime: null,
          ext,
          fileSize: 0,
          updatedAt: Date.now(),
        }
        await indexStore.upsert(failedRec)
        results.push(toThumbStatusEntry(failedRec, resolveAbsCachePath))
        opts.onProgress?.(i + 1, total, filePath)
        continue
      }

      const req: ThumbGenerateRequest = {
        filePath,
        ext,
        fileSize,
        mtimeMs,
        maxDim,
        preferPng: opts.preferPng,
        signal: opts.signal,
      }

      const res = await runProviderInLane(provider, req)
      if (res && res.buffer.length > 0) {
        const cacheRel = await indexStore.writeCacheFile({
          filePath,
          fingerprint,
          maxDim,
          mime: res.mime,
          buffer: res.buffer,
        })
        const readyRec: ThumbIndexRecord = {
          filePath,
          canonicalKey,
          fingerprint,
          status: 'READY',
          providerId: provider.id,
          thumbPath: cacheRel,
          mime: res.mime,
          ext,
          fileSize,
          updatedAt: Date.now(),
        }
        await indexStore.upsert(readyRec)
        results.push(toThumbStatusEntry(readyRec, resolveAbsCachePath))
      } else {
        const failedRec: ThumbIndexRecord = {
          filePath,
          canonicalKey,
          fingerprint,
          status: provider.id === 'eagle' ? 'FAILED_EAGLE' : 'MISSING',
          providerId: null,
          thumbPath: null,
          mime: null,
          ext,
          fileSize,
          updatedAt: Date.now(),
        }
        await indexStore.upsert(failedRec)
        results.push(toThumbStatusEntry(failedRec, resolveAbsCachePath))
      }

      opts.onProgress?.(i + 1, total, filePath)
    }

    return results
  }

  return {
    tools,
    registerProvider,
    listProviders,
    listSupportedExtensions,
    listIgnoredExtensions,
    isIgnored,
    isSupported,
    generate,
    generateAutoBatch,
    queryStatus,
    generateManual,
    getCacheStats: () => indexStore.getStats(),
    clearCache: () => indexStore.clearAll(),
    dispose(): void {
      fastQueue.dispose()
      heavyQueue.dispose()
      eagleQueue.dispose()
      indexStore.dispose()
      providers.clear()
    },
  }
}

export interface RegisterBaseThumbsHostOptions {
  readonly runtime: FolioRuntimeService
  readonly native: FolioNativeService
  readonly tasks: FolioTasksService
  readonly storage?: FolioStorageService
  readonly concurrency?: number
}

export function registerBaseThumbsHost(options: RegisterBaseThumbsHostOptions): {
  readonly service: ManagedFolioThumbsService
  readonly dispose: () => void
} {
  const service = createFolioThumbsService({
    native: options.native,
    tasks: options.tasks,
    storage: options.storage,
    concurrency: options.concurrency,
  })

  const disposers = [
    options.runtime.registerAction(
      defineAction({
        id: 'thumbs.providers.list',
        title: '列出已注册缩略图格式生成器',
        tier: 'read',
        input: z.object({}).default({}),
        run: () => ({
          providers: service.listProviders(),
          extensions: service.listSupportedExtensions(),
          ignoredExtensions: service.listIgnoredExtensions(),
        }),
      }),
    ),

    options.runtime.registerAction(
      defineAction({
        id: 'thumbs.status.query',
        title: '查询文件缩略图持久化状态',
        tier: 'read',
        input: z.object({
          filePaths: z.array(z.string().min(1)),
        }),
        run: async input => ({
          entries: await service.queryStatus(input.filePaths),
        }),
      }),
    ),

    options.runtime.registerAction(
      defineAction({
        id: 'thumbs.auto.batch',
        title: '批量自动生成本地缩略图（L0~L2，不触发 Eagle）',
        tier: 'modify',
        input: z.object({
          filePaths: z.array(z.string().min(1)),
          maxDim: z.number().int().positive().max(1024).optional(),
          force: z.boolean().optional(),
        }),
        run: async input => options.tasks.enqueue({
          scope: 'thumbs',
          title: `批量生成缩略图（${input.filePaths.length} 个文件）`,
          queue: 'thumbs-auto-batch',
          concurrency: 1,
          pausable: false,
          run: async helpers => {
            const result = await service.generateAutoBatch(input.filePaths, {
              maxDim: input.maxDim,
              force: input.force,
              signal: helpers.signal,
              onProgress: (current, total, filePath) => {
                helpers.reportProgress({ current, total, message: path.basename(filePath) })
              },
            })
            helpers.reportProgress({
              current: input.filePaths.length,
              total: input.filePaths.length,
              detail: { succeeded: result.ready.length, failed: result.missing.length, ignored: result.ignored.length },
            })
            return result
          },
        }).done,
      }),
    ),

    options.runtime.registerAction(
      defineAction({
        id: 'thumbs.manual.run',
        title: '使用指定手动兜底引擎补全缩略图',
        tier: 'modify',
        input: z.object({
          providerId: z.string().min(1),
          filePaths: z.array(z.string().min(1)),
          maxDim: z.number().int().positive().max(1024).optional(),
        }),
        run: async input => ({
          entries: await service.generateManual({
            providerId: input.providerId,
            filePaths: input.filePaths,
            maxDim: input.maxDim,
          }),
        }),
      }),
    ),

    options.runtime.registerAction(
      defineAction({
        id: 'thumbs.tools.status',
        title: '检测 L2 外部缩略图工具（ImageMagick / FFmpeg）状态',
        tier: 'read',
        input: z.object({ refresh: z.boolean().optional() }).default({}),
        run: async input => {
          const [tools, settings] = await Promise.all([
            service.tools.detectAll(Boolean(input.refresh)),
            service.tools.getSettings(),
          ])
          return { tools: tools as readonly ThumbExternalToolInfo[], settings }
        },
      }),
    ),

    options.runtime.registerAction(
      defineAction({
        id: 'thumbs.tools.config',
        title: '配置 L2 外部缩略图工具路径与避让阈值',
        tier: 'modify',
        input: z.object({
          magickPath: z.string().optional(),
          ffmpegPath: z.string().optional(),
          heavyAvoidMb: z.number().min(10).max(4096).optional(),
        }),
        run: async input => {
          const settings = await service.tools.updateSettings(input)
          const tools = await service.tools.detectAll(true)
          return { settings, tools }
        },
      }),
    ),

    options.runtime.registerAction(
      defineAction({
        id: 'thumbs.cache.stats',
        title: '获取缩略图索引与中央缓存统计',
        tier: 'read',
        input: z.object({}).default({}),
        run: async (): Promise<ThumbCacheStats> => service.getCacheStats(),
      }),
    ),

    options.runtime.registerAction(
      defineAction({
        id: 'thumbs.cache.clear',
        title: '清理缩略图索引与中央缓存',
        tier: 'delete',
        input: z.object({}).default({}),
        run: async () => service.clearCache(),
      }),
    ),
  ]

  return {
    service,
    dispose(): void {
      for (const dispose of disposers) {
        dispose()
      }
      service.dispose()
    },
  }
}

export const name = 'base-thumbs-host'
export const inject = ['folioRuntime', 'folioNative', 'folioTasks', 'folioStorage'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const host = registerBaseThumbsHost({
      runtime: ctx.folioRuntime,
      native: ctx.folioNative,
      tasks: ctx.folioTasks,
      storage: ctx.folioStorage,
    })
    const disposeProvide = ctx.provide('folioThumbs', host.service)
    return () => {
      disposeProvide()
      host.dispose()
    }
  }, 'base-thumbs-host: provide folioThumbs')
}

export default { name, inject, apply }
export {
  DEFAULT_IGNORED_EXTS,
  HEAVY_DESIGN_AVOID_BYTES,
  HEAVY_DESIGN_EXT_SET,
  isIgnoredThumbExt,
  shouldAvoidHeavyInFastLayer,
} from './blacklist.js'
export {
  createBuiltinThumbProviders,
  FFMPEG_VIDEO_EXTS,
  MAGICK_DESIGN_EXTS,
  SHELL_MEDIA_EXTS,
  WIC_IMAGE_EXTS,
} from './providers.js'
export { createThumbToolRegistry } from './tools.js'
