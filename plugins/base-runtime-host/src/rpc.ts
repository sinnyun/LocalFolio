import type { IncomingMessage, ServerResponse } from 'node:http'
import { Hono } from 'hono'
import {
  normalizeError,
  type ActionSource,
  type EventBus,
  type InvalidateEvent,
} from '@folio/base-contract'

const MAX_RPC_BODY_BYTES = 2 * 1024 * 1024 // 2 MB
const SSE_HEARTBEAT_MS = 25_000

const rawNodeRequests = new WeakMap<Request, IncomingMessage>()

export interface AdmissionRequestLike {
  readonly method?: string
  readonly headers: Record<string, string | string[] | undefined>
  readonly rawNodeRequest?: IncomingMessage
}

export type AdmissionCheck = (req: AdmissionRequestLike) => boolean | number

export interface ManagedEventBus extends EventBus {
  subscribe(send: (chunk: string) => void): () => void
  dispose(): void
}

export function createEventBus(): ManagedEventBus {
  const subscribers = new Set<(chunk: string) => void>()

  const broadcast = (event: string, data: unknown): void => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const send of subscribers) {
      try {
        send(frame)
      } catch {
        subscribers.delete(send)
      }
    }
  }

  return {
    subscribe(send) {
      subscribers.add(send)
      return () => {
        subscribers.delete(send)
      }
    },
    subscriberCount: () => subscribers.size,
    emitInvalidate(scope: string, target?: string): void {
      const payload: InvalidateEvent =
        target === undefined ? { scope, ts: Date.now() } : { scope, target, ts: Date.now() }
      broadcast('invalidate', payload)
    },
    dispose(): void {
      subscribers.clear()
    },
  }
}

function authorityUrl(value: string, scheme: string): URL | undefined {
  try {
    return new URL(`${scheme}//${value}`)
  } catch {
    return undefined
  }
}

function ownUrl(
  value: string,
  host: string | undefined,
  trustedOrigins: readonly string[],
): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (trustedOrigins.includes(url.origin)) return true
  if (!host) return false
  const hostUrl = authorityUrl(host, url.protocol)
  return hostUrl !== undefined && hostUrl.host === url.host
}

export function hasSameOrigin(
  headers: Headers,
  trustedOrigins: readonly string[] = [],
): boolean {
  if (headers.get('sec-fetch-site') === 'cross-site') return false
  const host = headers.get('host') ?? undefined
  const origin = headers.get('origin')
  if (origin) return ownUrl(origin, host, trustedOrigins)
  const referer = headers.get('referer')
  if (referer) return ownUrl(referer, host, trustedOrigins)
  return true
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value
  })
  return record
}

export interface CreateRpcOptions {
  readonly routePrefix?: string
  readonly executeAction: (
    id: string,
    rawInput: unknown,
    options?: { source?: ActionSource; signal?: AbortSignal },
  ) => Promise<unknown>
  readonly hasAction: (id: string) => boolean
  readonly events: ManagedEventBus
  readonly admit?: AdmissionCheck
  readonly trustedOrigins?: readonly string[] | (() => readonly string[])
}

export interface FolioRpc {
  readonly app: Hono
  readonly prefix: string
  readonly fetch: (request: Request) => Response | Promise<Response>
  readonly nodeHandler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  dispose(): void
}

export function createRpcApp(options: CreateRpcOptions): FolioRpc {
  const prefix = (options.routePrefix ?? '/lf').replace(/\/+$/, '')
  const app = new Hono()
  const activeStreams = new Set<() => void>()

  const resolveOrigins = (): readonly string[] => {
    if (typeof options.trustedOrigins === 'function') {
      try {
        return options.trustedOrigins()
      } catch {
        return []
      }
    }
    return options.trustedOrigins ?? []
  }

  app.use(`${prefix}/*`, async (c, next) => {
    if (!hasSameOrigin(c.req.raw.headers, resolveOrigins())) {
      return c.json(
        { ok: false, error: { code: 'untrusted_origin', message: '拒绝跨站请求' } },
        403,
      )
    }

    if (typeof options.admit !== 'function') {
      return c.json(
        { ok: false, error: { code: 'unauthorized', message: '未通过准入校验' } },
        403,
      )
    }

    let verdict: boolean | number = false
    try {
      const rawNodeRequest = rawNodeRequests.get(c.req.raw)
      verdict = options.admit({
        method: c.req.method,
        headers: rawNodeRequest ? rawNodeRequest.headers : headersToRecord(c.req.raw.headers),
        rawNodeRequest,
      })
    } catch {
      verdict = false
    }

    if (verdict !== true) {
      const status = typeof verdict === 'number' && verdict >= 400 && verdict < 600 ? verdict : 403
      return c.json(
        {
          ok: false,
          error: {
            code: status === 401 ? 'unauthorized' : 'forbidden',
            message: '未授权的请求',
          },
        },
        status as 401 | 403,
      )
    }

    await next()
  })

  app.get(`${prefix}/health`, c =>
    c.json({ ok: true, data: { status: 'ok', ts: Date.now() } }, 200),
  )

  app.post(`${prefix}/rpc/:actionId`, async c => {
    const actionId = c.req.param('actionId')
    if (!options.hasAction(actionId)) {
      return c.json(
        { ok: false, error: { code: 'action_not_found', message: `未知动作: ${actionId}` } },
        404,
      )
    }

    const contentLength = Number(c.req.header('content-length') ?? '0')
    if (Number.isFinite(contentLength) && contentLength > MAX_RPC_BODY_BYTES) {
      return c.json(
        { ok: false, error: { code: 'payload_too_large', message: '请求体超出大小限制' } },
        413,
      )
    }

    let rawBody: unknown = {}
    const text = await c.req.text()
    if (text.length > MAX_RPC_BODY_BYTES) {
      return c.json(
        { ok: false, error: { code: 'payload_too_large', message: '请求体超出大小限制' } },
        413,
      )
    }
    if (text.trim().length > 0) {
      try {
        rawBody = JSON.parse(text)
      } catch {
        return c.json(
          { ok: false, error: { code: 'invalid_json', message: '请求体不是合法 JSON' } },
          400,
        )
      }
    }

    try {
      const data = await options.executeAction(actionId, rawBody, {
        source: 'rpc',
        signal: c.req.raw.signal,
      })
      return c.json({ ok: true, data }, 200)
    } catch (error) {
      const { status, payload } = normalizeError(error)
      return c.json({ ok: false, error: payload }, status as 400 | 403 | 404 | 500)
    }
  })

  app.get(`${prefix}/events`, c => {
    const encoder = new TextEncoder()
    let cleanup = (): void => {}

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false
        const close = (): void => {
          if (closed) return
          closed = true
          clearInterval(heartbeat)
          unsubscribe()
          activeStreams.delete(close)
          try {
            controller.close()
          } catch {
            // already closed
          }
        }
        cleanup = close

        const push = (chunk: string): void => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(chunk))
          } catch {
            close()
          }
        }

        const unsubscribe = options.events.subscribe(push)
        const heartbeat = setInterval(() => push(': ping\n\n'), SSE_HEARTBEAT_MS)
        heartbeat.unref?.()
        activeStreams.add(close)

        c.req.raw.signal?.addEventListener('abort', close, { once: true })
        push(`event: ready\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`)
      },
      cancel() {
        cleanup()
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      },
    })
  })

  const nodeHandler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const host = req.headers.host || '127.0.0.1'
    const url = `http://${host}${req.url || '/'}`
    const headers = new Headers()
    for (const [key, val] of Object.entries(req.headers)) {
      if (val === undefined) continue
      if (Array.isArray(val)) {
        for (const v of val) headers.append(key, v)
      } else {
        headers.set(key, val)
      }
    }

    const abortController = new AbortController()
    req.on('close', () => {
      if (!res.writableEnded) abortController.abort()
    })

    const method = (req.method || 'GET').toUpperCase()
    const hasBody = method !== 'GET' && method !== 'HEAD'
    const init: RequestInit & { duplex?: 'half' } = {
      method,
      headers,
      signal: abortController.signal,
    }
    if (hasBody) {
      init.body = req as unknown as BodyInit
      init.duplex = 'half'
    }

    const webReq = new Request(url, init)
    rawNodeRequests.set(webReq, req)

    const webRes = await app.fetch(webReq)

    const outHeaders: Record<string, string | string[]> = {}
    webRes.headers.forEach((value, key) => {
      const existing = outHeaders[key]
      if (existing === undefined) outHeaders[key] = value
      else if (Array.isArray(existing)) existing.push(value)
      else outHeaders[key] = [existing, value]
    })

    res.writeHead(webRes.status, outHeaders)
    if (!webRes.body) {
      res.end()
      return
    }

    const reader = webRes.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (res.writableEnded) break
        res.write(value)
      }
    } catch {
      // client disconnected
    } finally {
      reader.releaseLock()
      if (!res.writableEnded) res.end()
    }
  }

  return {
    app,
    prefix,
    fetch: request => app.fetch(request),
    nodeHandler,
    dispose() {
      for (const close of Array.from(activeStreams)) close()
      activeStreams.clear()
    },
  }
}
