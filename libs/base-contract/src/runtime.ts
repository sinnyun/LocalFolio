import type { z } from 'zod'
import type { ActionDef, ActionSource, AnyActionDef, EventBus } from './action.js'
import type { FolioStorageService } from './storage.js'

export type FolioRouteMethod = 'GET' | 'HEAD'

export type FolioRouteHandler = (request: Request) => Response | Promise<Response>

/**
 * Host Cordis service (`ctx.folioRuntime`) provided by `@folio/base-runtime-host`.
 * Independent Host plugins inject `['folioRuntime', 'folioStorage']` and register actions here.
 */
export interface FolioRuntimeService {
  readonly routePrefix: string
  readonly storage: FolioStorageService
  readonly events: EventBus
  readonly rpc: { readonly fetch: (request: Request) => Response | Promise<Response> }
  registerAction<TInput extends z.ZodType, TOutput>(
    action: ActionDef<TInput, TOutput>,
  ): () => void
  registerRoute(method: FolioRouteMethod, subPath: string, handler: FolioRouteHandler): () => void
  getAction(id: string): AnyActionDef | undefined
  listActions(): readonly AnyActionDef[]
  executeAction<T = unknown>(
    id: string,
    rawInput: unknown,
    options?: {
      source?: ActionSource
      signal?: AbortSignal
    },
  ): Promise<T>
}
