import * as React from 'react'
import type { FolioErrorPayload, InvalidateEvent } from './action.js'

const INVALIDATE_EVENT_NAME = 'folio:invalidate'

export class RpcError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(code: string, message: string, status = 500, details?: unknown) {
    super(message)
    this.name = 'RpcError'
    this.code = code
    this.status = status
    this.details = details
  }
}

interface RpcEnvelope<T> {
  ok: boolean
  data?: T
  error?: FolioErrorPayload
}

export interface RpcCallOptions {
  readonly signal?: AbortSignal
  readonly baseUrl?: string
  readonly prefix?: string
}

export async function rpcCall<TOutput = unknown, TInput = Record<string, unknown>>(
  actionId: string,
  input?: TInput,
  options: RpcCallOptions = {},
): Promise<TOutput> {
  const baseUrl = options.baseUrl ?? ''
  const prefix = (options.prefix ?? '/lf').replace(/\/+$/, '')
  const url = `${baseUrl}${prefix}/rpc/${encodeURIComponent(actionId)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(input ?? {}),
    signal: options.signal,
  })

  let payload: RpcEnvelope<TOutput> | null = null
  try {
    payload = (await response.json()) as RpcEnvelope<TOutput>
  } catch {
    throw new RpcError('invalid_response', `RPC 响应解析失败 (${response.status})`, response.status)
  }

  if (!response.ok || !payload?.ok) {
    const err = payload?.error
    throw new RpcError(
      err?.code ?? 'rpc_error',
      err?.message ?? `RPC 请求失败 (${response.status})`,
      response.status,
      err?.details,
    )
  }

  return payload.data as TOutput
}

export function actionScopeOf(actionId: string): string {
  const dot = actionId.indexOf('.')
  return dot > 0 ? actionId.slice(0, dot) : actionId
}

export function dispatchFolioInvalidate(event: InvalidateEvent): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<InvalidateEvent>(INVALIDATE_EVENT_NAME, { detail: event }))
}

export interface UseActionQueryOptions {
  readonly enabled?: boolean
  readonly baseUrl?: string
  readonly prefix?: string
}

export interface UseActionQueryResult<TOutput> {
  readonly data: TOutput | undefined
  readonly error: RpcError | null
  readonly isLoading: boolean
  readonly refetch: () => Promise<void>
}

/**
 * Cross-bundle safe RPC query hook (zero module-scoped React Context singletons).
 * Automatically refetches when `base-shell-ui`'s SSE bridge broadcasts a matching invalidation scope.
 */
export function useActionQuery<TOutput = unknown, TInput = Record<string, unknown>>(
  actionId: string,
  input?: TInput,
  options: UseActionQueryOptions = {},
): UseActionQueryResult<TOutput> {
  const { enabled = true, baseUrl, prefix } = options
  const inputKey = JSON.stringify(input ?? {})
  const [data, setData] = React.useState<TOutput | undefined>(undefined)
  const [error, setError] = React.useState<RpcError | null>(null)
  const [isLoading, setIsLoading] = React.useState<boolean>(enabled)
  const [tick, setTick] = React.useState(0)

  const inputRef = React.useRef(input)
  inputRef.current = input

  const fetchOnce = React.useCallback(
    async (signal?: AbortSignal) => {
      if (!enabled) return
      setIsLoading(prev => (data === undefined ? true : prev))
      try {
        const res = await rpcCall<TOutput, TInput>(actionId, inputRef.current, {
          signal,
          baseUrl,
          prefix,
        })
        if (!signal?.aborted) {
          setData(res)
          setError(null)
        }
      } catch (err) {
        if (!signal?.aborted) {
          setError(
            err instanceof RpcError
              ? err
              : new RpcError('rpc_error', err instanceof Error ? err.message : String(err)),
          )
        }
      } finally {
        if (!signal?.aborted) setIsLoading(false)
      }
    },
    [actionId, enabled, baseUrl, prefix, inputKey],
  )

  React.useEffect(() => {
    if (!enabled) {
      setIsLoading(false)
      return undefined
    }
    const controller = new AbortController()
    void fetchOnce(controller.signal)
    return () => {
      controller.abort()
    }
  }, [fetchOnce, enabled, tick])

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined
    const scope = actionScopeOf(actionId)
    const onInvalidate = (ev: Event): void => {
      const detail = (ev as CustomEvent<InvalidateEvent>).detail
      if (!detail) return
      if (detail.scope === '*' || detail.scope === 'all' || detail.scope === scope) {
        setTick(t => t + 1)
      }
    }
    window.addEventListener(INVALIDATE_EVENT_NAME, onInvalidate)
    return () => {
      window.removeEventListener(INVALIDATE_EVENT_NAME, onInvalidate)
    }
  }, [actionId, enabled])

  const refetch = React.useCallback(async () => {
    await fetchOnce()
  }, [fetchOnce])

  return { data, error, isLoading, refetch }
}

export interface UseActionMutationOptions<TOutput> {
  readonly baseUrl?: string
  readonly prefix?: string
  readonly onSuccess?: (data: TOutput) => void
  readonly onError?: (error: RpcError) => void
}

export interface UseActionMutationResult<TOutput, TInput> {
  readonly data: TOutput | undefined
  readonly error: RpcError | null
  readonly isPending: boolean
  readonly mutate: (input: TInput) => void
  readonly mutateAsync: (input: TInput) => Promise<TOutput>
}

export function useActionMutation<TOutput = unknown, TInput = Record<string, unknown>>(
  actionId: string,
  options: UseActionMutationOptions<TOutput> = {},
): UseActionMutationResult<TOutput, TInput> {
  const [data, setData] = React.useState<TOutput | undefined>(undefined)
  const [error, setError] = React.useState<RpcError | null>(null)
  const [isPending, setIsPending] = React.useState(false)

  const optsRef = React.useRef(options)
  optsRef.current = options

  const mutateAsync = React.useCallback(
    async (input: TInput): Promise<TOutput> => {
      setIsPending(true)
      setError(null)
      try {
        const res = await rpcCall<TOutput, TInput>(actionId, input, {
          baseUrl: optsRef.current.baseUrl,
          prefix: optsRef.current.prefix,
        })
        setData(res)
        optsRef.current.onSuccess?.(res)
        return res
      } catch (err) {
        const rpcErr =
          err instanceof RpcError
            ? err
            : new RpcError('rpc_error', err instanceof Error ? err.message : String(err))
        setError(rpcErr)
        optsRef.current.onError?.(rpcErr)
        throw rpcErr
      } finally {
        setIsPending(false)
      }
    },
    [actionId],
  )

  const mutate = React.useCallback(
    (input: TInput) => {
      void mutateAsync(input).catch(() => {})
    },
    [mutateAsync],
  )

  return { data, error, isPending, mutate, mutateAsync }
}

export interface UseFolioEventsOptions {
  readonly enabled?: boolean
  readonly baseUrl?: string
  readonly prefix?: string
  readonly reconnectBaseMs?: number
  readonly onInvalidate?: (event: InvalidateEvent) => void
}

export function useFolioEvents(options: UseFolioEventsOptions = {}): void {
  const {
    enabled = true,
    baseUrl = '',
    prefix = '/lf',
    reconnectBaseMs = 1500,
    onInvalidate,
  } = options
  const onInvalidateRef = React.useRef(onInvalidate)
  onInvalidateRef.current = onInvalidate
  const hasConnectedOnceRef = React.useRef(false)

  React.useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return undefined

    let disposed = false
    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    const normalizedPrefix = prefix.replace(/\/+$/, '')

    const connect = (): void => {
      if (disposed) return
      const es = new EventSource(`${baseUrl}${normalizedPrefix}/events`)
      source = es

      es.addEventListener('ready', () => {
        attempt = 0
        if (hasConnectedOnceRef.current) {
          dispatchFolioInvalidate({ scope: '*', ts: Date.now() })
        } else {
          hasConnectedOnceRef.current = true
        }
      })

      es.addEventListener('invalidate', (ev: Event) => {
        const messageEvent = ev as MessageEvent<string>
        try {
          const parsed = JSON.parse(messageEvent.data) as InvalidateEvent
          if (!parsed || typeof parsed.scope !== 'string') return
          dispatchFolioInvalidate(parsed)
          onInvalidateRef.current?.(parsed)
        } catch {
          // ignore malformed event payload
        }
      })

      es.onerror = () => {
        if (disposed) return
        if (es.readyState === EventSource.CLOSED || es.readyState === 2) {
          es.close()
          source = null
          const delay = Math.min(reconnectBaseMs * Math.pow(2, attempt), 15_000)
          attempt += 1
          reconnectTimer = setTimeout(connect, delay)
        }
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer !== null) clearTimeout(reconnectTimer)
      source?.close()
      source = null
    }
  }, [enabled, baseUrl, prefix, reconnectBaseMs])
}

export interface FolioQueryProviderProps {
  readonly enableEvents?: boolean
  readonly baseUrl?: string
  readonly prefix?: string
  readonly onInvalidate?: (event: InvalidateEvent) => void
  readonly children: React.ReactNode
}

export function FolioQueryProvider({
  enableEvents = true,
  baseUrl,
  prefix,
  onInvalidate,
  children,
}: FolioQueryProviderProps): React.ReactElement {
  useFolioEvents({ enabled: enableEvents, baseUrl, prefix, onInvalidate })
  return React.createElement(React.Fragment, null, children)
}
