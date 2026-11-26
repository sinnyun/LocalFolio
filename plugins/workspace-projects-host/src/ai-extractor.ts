import { FolioError } from '@folio/base-contract'
import { buildAiExtractionPrompts, buildProjectSample, parseAiExtractionJson } from './ai-sampler.js'
import type {
  AiExtractionOutput,
  AiModelOption,
  AiStatusResult,
  ProjectAiTrace,
  ProjectManifest,
} from './types.js'

export interface DshLlmProviderInfoLike {
  readonly id: string
  readonly name: string
}

export interface DshLlmModelInfoLike {
  readonly provider: string
  readonly id: string
  readonly name: string
}

export type DshLlmStreamChunkLike =
  | { readonly type: 'text-delta'; readonly text: string }
  | {
      readonly type: 'finish'
      readonly reason:
        | { readonly kind: 'stop' | 'tool-calls' | 'max-tokens' }
        | { readonly kind: 'error' | 'aborted'; readonly failure?: { readonly message?: string; readonly code?: string } }
    }
  | { readonly type: string }

export interface DshLlmLike {
  listProviders(): DshLlmProviderInfoLike[]
  listModels(provider: string): Promise<readonly DshLlmModelInfoLike[]>
  stream(options: {
    provider: string
    model: string
    system?: string
    messages: Array<{
      role: 'user'
      content: Array<{ type: 'text'; text: string }>
    }>
    temperature?: number
    maxTokens?: number
    signal?: AbortSignal
  }): AsyncIterable<DshLlmStreamChunkLike>
}

export interface DshDefaultModelLike {
  currentSelection(): {
    readonly provider: string
    readonly model: string
  }
}

export async function getAiStatus(
  llm: DshLlmLike | undefined,
  defaultModel: DshDefaultModelLike | undefined,
): Promise<AiStatusResult> {
  if (!llm) {
    return {
      available: false,
      defaultRoute: null,
      models: [],
      reason: '当前 DSH 运行时未挂载 LLM 服务',
    }
  }

  let providers: DshLlmProviderInfoLike[] = []
  try {
    providers = llm.listProviders()
  } catch {
    providers = []
  }

  if (providers.length === 0) {
    return {
      available: false,
      defaultRoute: null,
      models: [],
      reason: '尚未配置或启用任何 DSH 模型提供方',
    }
  }

  const models: AiModelOption[] = []
  for (const p of providers) {
    try {
      const list = await llm.listModels(p.id)
      for (const m of list) {
        models.push({ provider: m.provider, model: m.id, name: m.name })
      }
    } catch {
      // Skip providers whose catalog fails to enumerate
    }
  }

  let defaultRoute: { readonly provider: string; readonly model: string } | null = null
  if (defaultModel) {
    try {
      const sel = defaultModel.currentSelection()
      if (sel.provider && sel.model && providers.some(p => p.id === sel.provider)) {
        defaultRoute = { provider: sel.provider, model: sel.model }
      }
    } catch {
      defaultRoute = null
    }
  }

  if (!defaultRoute && models.length > 0) {
    defaultRoute = { provider: models[0]!.provider, model: models[0]!.model }
  }

  if (!defaultRoute) {
    return {
      available: false,
      defaultRoute: null,
      models,
      reason: '已注册模型提供方但未找到可用默认模型',
    }
  }

  return {
    available: true,
    defaultRoute,
    models,
  }
}

export async function resolveAiRoute(
  llm: DshLlmLike | undefined,
  defaultModel: DshDefaultModelLike | undefined,
  explicit?: { readonly provider?: string; readonly model?: string },
): Promise<{ readonly provider: string; readonly model: string }> {
  if (!llm) {
    throw new FolioError('ai_unavailable', '当前 DSH 运行时未挂载 LLM 服务', 503)
  }
  if (explicit?.provider && explicit?.model) {
    return { provider: explicit.provider, model: explicit.model }
  }
  const status = await getAiStatus(llm, defaultModel)
  if (!status.available || !status.defaultRoute) {
    throw new FolioError(
      'ai_unavailable',
      status.reason ?? '没有可用的 DSH 模型路由，请先在 DSH 设置中配置模型',
      503,
    )
  }
  return status.defaultRoute
}

export async function extractProjectMetadataWithLlm(options: {
  readonly llm: DshLlmLike | undefined
  readonly defaultModel: DshDefaultModelLike | undefined
  readonly projectPath: string
  readonly manifest: ProjectManifest
  readonly provider?: string
  readonly model?: string
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  readonly onTrace?: (trace: ProjectAiTrace) => Promise<void> | void
}): Promise<{
  readonly extracted: AiExtractionOutput
  readonly route: { readonly provider: string; readonly model: string }
  readonly trace: ProjectAiTrace
}> {
  const { llm, defaultModel, projectPath, manifest, signal, timeoutMs = 45_000, onTrace } = options
  const route = await resolveAiRoute(llm, defaultModel, {
    provider: options.provider,
    model: options.model,
  })
  if (!llm) {
    throw new FolioError('ai_unavailable', '当前 DSH 运行时未挂载 LLM 服务', 503)
  }

  const sample = await buildProjectSample(projectPath, manifest)
  const { system, user } = buildAiExtractionPrompts(sample)
  const sampledFiles = sample.textSnippets.map(s => s.relPath)

  const controller = new AbortController()
  const onParentAbort = (): void => controller.abort()
  if (signal) {
    if (signal.aborted) {
      const err = new Error('任务已取消')
      err.name = 'AbortError'
      throw err
    }
    signal.addEventListener('abort', onParentAbort, { once: true })
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  timer.unref?.()

  let rawText = ''
  try {
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
      temperature: 0.2,
      maxTokens: 600,
      signal: controller.signal,
    })) {
      if (chunk.type === 'text-delta' && 'text' in chunk && typeof chunk.text === 'string') {
        rawText += chunk.text
      } else if (chunk.type === 'finish' && 'reason' in chunk) {
        const reason = chunk.reason
        if (reason.kind === 'error') {
          throw new FolioError(
            'ai_request_failed',
            reason.failure?.message ?? 'DSH 模型调用失败',
            502,
          )
        }
        if (reason.kind === 'aborted') {
          if (signal?.aborted) {
            const err = new Error('任务已取消')
            err.name = 'AbortError'
            throw err
          }
          throw new FolioError('ai_timeout', 'DSH 模型请求被中断或超时', 504)
        }
      }
    }

    const parsed = parseAiExtractionJson(rawText)

    // Verify recommendedCoverRelPath exists in manifest (never accept hallucinated paths)
    let verifiedCover: string | null = null
    if (parsed.recommendedCoverRelPath) {
      const exists = manifest.groups.some(g =>
        g.files.some(f => f.relPath === parsed.recommendedCoverRelPath && f.thumbSupported),
      )
      if (exists) verifiedCover = parsed.recommendedCoverRelPath
    }

    const extracted: AiExtractionOutput = {
      ...parsed,
      recommendedCoverRelPath: verifiedCover,
    }
    const trace: ProjectAiTrace = {
      extractedAt: Date.now(),
      provider: route.provider,
      model: route.model,
      status: 'success',
      error: null,
      systemPrompt: system,
      userPrompt: user,
      sampledFiles,
      coverCandidates: [...sample.coverCandidates],
      rawResponse: rawText,
      parsedOutput: extracted,
    }
    await onTrace?.(trace)
    return { route, extracted, trace }
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError'
    if (!isAbort) {
      const errorTrace: ProjectAiTrace = {
        extractedAt: Date.now(),
        provider: route.provider,
        model: route.model,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
        systemPrompt: system,
        userPrompt: user,
        sampledFiles,
        coverCandidates: [...sample.coverCandidates],
        rawResponse: rawText,
        parsedOutput: null,
      }
      try {
        await onTrace?.(errorTrace)
      } catch {
        // Ignore trace persistence error so original AI failure surfaces
      }
    }
    throw err
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onParentAbort)
  }
}
