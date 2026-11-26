import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  defineAction,
  type BoundedQueue,
  type FolioNativeService,
  type FolioRuntimeService,
  type FolioTasksService,
  type FolioThumbsService,
  type GeneratedThumbResult,
  type ThumbGenerateRequest,
  type ThumbGeneratorProvider,
  type ThumbProviderInfo,
} from '@folio/base-contract'
import { createBuiltinThumbProviders } from './providers.js'

export interface CreateFolioThumbsServiceOptions {
  readonly native: FolioNativeService
  readonly tasks: FolioTasksService
  readonly concurrency?: number
  readonly includeBuiltinProviders?: boolean
}

export interface ManagedFolioThumbsService extends FolioThumbsService {
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
  const queue: BoundedQueue = options.tasks.createQueue({
    name: 'base-thumbs',
    concurrency: options.concurrency ?? 4,
  })
  const providers = new Map<string, ThumbGeneratorProvider>()

  const registerProvider = (provider: ThumbGeneratorProvider): (() => void) => {
    const normalized: ThumbGeneratorProvider = {
      ...provider,
      extensions: normalizeProviderExts(provider.extensions),
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
    for (const builtin of createBuiltinThumbProviders(options.native)) {
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

  const matchingProvidersFor = (req: ThumbGenerateRequest): ThumbGeneratorProvider[] =>
    getSortedProviders().filter(p => {
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
    }))

  const listSupportedExtensions = (): string[] => {
    const set = new Set<string>()
    for (const p of providers.values()) {
      for (const ext of p.extensions) {
        if (ext !== '*') set.add(ext)
      }
    }
    return Array.from(set).sort()
  }

  const isSupported = (filePathOrName: string): boolean => {
    const ext = path.extname(filePathOrName).toLowerCase()
    if (!ext) return false
    for (const p of providers.values()) {
      if (p.extensions.includes('*') || p.extensions.includes(ext)) {
        return true
      }
    }
    return false
  }

  const generate = async (reqOptions: {
    readonly filePath: string
    readonly maxDim?: number
    readonly preferPng?: boolean
    readonly signal?: AbortSignal
  }): Promise<GeneratedThumbResult | null> => {
    const ext = path.extname(reqOptions.filePath).toLowerCase()
    const maxDim =
      typeof reqOptions.maxDim === 'number' && Number.isFinite(reqOptions.maxDim) && reqOptions.maxDim > 0
        ? Math.round(reqOptions.maxDim)
        : 360

    const req: ThumbGenerateRequest = {
      filePath: reqOptions.filePath,
      ext,
      maxDim,
      preferPng: reqOptions.preferPng,
      signal: reqOptions.signal,
    }
    const candidates = matchingProvidersFor(req)
    if (candidates.length === 0) return null

    return queue
      .enqueue<GeneratedThumbResult | null>(async qSignal => {
        const queuedReq: ThumbGenerateRequest = { ...req, signal: qSignal }
        for (const provider of candidates) {
          if (qSignal.aborted) return null
          try {
            const res = await provider.generate(queuedReq)
            if (res && res.buffer.length > 0) {
              return {
                buffer: res.buffer,
                mime: res.mime,
                providerId: provider.id,
              }
            }
          } catch {
            // Try next fallback provider for this extension
          }
        }
        return null
      }, reqOptions.signal)
      .catch(() => null)
  }

  return {
    registerProvider,
    listProviders,
    listSupportedExtensions,
    isSupported,
    generate,
    dispose(): void {
      queue.dispose()
      providers.clear()
    },
  }
}

export interface RegisterBaseThumbsHostOptions {
  readonly runtime: FolioRuntimeService
  readonly native: FolioNativeService
  readonly tasks: FolioTasksService
  readonly concurrency?: number
}

export function registerBaseThumbsHost(options: RegisterBaseThumbsHostOptions): {
  readonly service: ManagedFolioThumbsService
  readonly dispose: () => void
} {
  const service = createFolioThumbsService({
    native: options.native,
    tasks: options.tasks,
    concurrency: options.concurrency,
  })

  const disposeAction = options.runtime.registerAction(
    defineAction({
      id: 'thumbs.providers.list',
      title: '列出已注册缩略图格式生成器',
      tier: 'read',
      input: z.object({}).default({}),
      run: () => ({
        providers: service.listProviders(),
        extensions: service.listSupportedExtensions(),
      }),
    }),
  )

  return {
    service,
    dispose(): void {
      disposeAction()
      service.dispose()
    },
  }
}

export const name = 'base-thumbs-host'
export const inject = ['folioRuntime', 'folioNative', 'folioTasks'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const host = registerBaseThumbsHost({
      runtime: ctx.folioRuntime,
      native: ctx.folioNative,
      tasks: ctx.folioTasks,
    })
    const disposeProvide = ctx.provide('folioThumbs', host.service)
    return () => {
      disposeProvide()
      host.dispose()
    }
  }, 'base-thumbs-host: provide folioThumbs')
}

export default { name, inject, apply }
export { createBuiltinThumbProviders, SHELL_MEDIA_EXTS, WIC_IMAGE_EXTS } from './providers.js'
