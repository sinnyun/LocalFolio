import { z } from 'zod'
import type { FolioRuntimeService } from './runtime.js'

export type ActionTier = 'read' | 'modify' | 'delete'

export interface FolioErrorPayload {
  readonly code: string
  readonly message: string
  readonly details?: unknown
}

export class FolioError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message)
    this.name = 'FolioError'
    this.code = code
    this.status = status
    this.details = details
  }

  toPayload(): FolioErrorPayload {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details }
  }
}

export function normalizeError(error: unknown): {
  status: number
  payload: FolioErrorPayload
} {
  if (error instanceof FolioError) {
    return { status: error.status, payload: error.toPayload() }
  }
  if (error instanceof z.ZodError) {
    return {
      status: 400,
      payload: {
        code: 'invalid_input',
        message: error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '),
        details: error.issues,
      },
    }
  }
  if (error instanceof Error) {
    return {
      status: 500,
      payload: { code: 'internal_error', message: error.message },
    }
  }
  return {
    status: 500,
    payload: { code: 'internal_error', message: String(error) },
  }
}

export type ActionSource = 'rpc' | 'ai' | 'internal'

export interface ActionRunContext {
  readonly runtime: FolioRuntimeService
  readonly source: ActionSource
  readonly signal?: AbortSignal
}

export interface ActionDefinition<TInput extends z.ZodType, TOutput> {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly tier: ActionTier
  readonly exposeToDsh?: boolean
  readonly input: TInput
  readonly run: (input: z.infer<TInput>, ctx: ActionRunContext) => TOutput | Promise<TOutput>
}

export interface ActionDef<TInput extends z.ZodType = z.ZodType, TOutput = unknown>
  extends ActionDefinition<TInput, TOutput> {
  parseInput(raw: unknown): z.infer<TInput>
  toJsonSchema(): Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyActionDef = ActionDef<any, any>

export function defineAction<TInput extends z.ZodType, TOutput>(
  def: ActionDefinition<TInput, TOutput>,
): ActionDef<TInput, TOutput> {
  return {
    ...def,
    exposeToDsh: def.exposeToDsh ?? false,
    parseInput(raw: unknown): z.infer<TInput> {
      return def.input.parse(raw)
    },
    toJsonSchema(): Record<string, unknown> {
      return z.toJSONSchema(def.input) as Record<string, unknown>
    },
  }
}

export interface InvalidateEvent {
  readonly scope: string
  readonly target?: string
  readonly ts: number
}

export interface RuntimeTopicEvent {
  readonly topic: string
  readonly payload: unknown
  readonly ts: number
}

export interface EventBus {
  emitInvalidate(scope: string, target?: string): void
  emitEvent(topic: string, payload: unknown): void
  subscriberCount(): number
}
