import type { BoundedQueue } from '@folio/base-contract'

function makeAbortError(message = '任务已取消'): Error {
  const err = new Error(message)
  err.name = 'AbortError'
  return err
}

interface QueueItem<T> {
  readonly fn: (signal: AbortSignal) => Promise<T>
  readonly signal?: AbortSignal
  readonly onAbort?: () => void
  readonly resolve: (value: T) => void
  readonly reject: (reason: unknown) => void
  settled: boolean
}

export interface CreateBoundedQueueOptions {
  readonly name?: string
  readonly concurrency?: number
}

export function createBoundedQueue(options: CreateBoundedQueueOptions = {}): BoundedQueue {
  const name = options.name?.trim() || 'default'
  const rawConcurrency = options.concurrency ?? 4
  const concurrency = Math.max(1, Math.min(16, Math.round(rawConcurrency)))

  const pending: QueueItem<unknown>[] = []
  const activeSignals = new Set<AbortController>()
  let active = 0
  let disposed = false

  const settleItem = <T>(item: QueueItem<T>, ok: boolean, value: unknown): void => {
    if (item.settled) return
    item.settled = true
    if (item.signal && item.onAbort) {
      item.signal.removeEventListener('abort', item.onAbort)
    }
    if (ok) item.resolve(value as T)
    else item.reject(value)
  }

  const pump = (): void => {
    if (disposed) return
    while (active < concurrency && pending.length > 0) {
      const item = pending.shift()!
      if (item.settled || item.signal?.aborted) {
        settleItem(item, false, makeAbortError())
        continue
      }

      active += 1
      const runController = new AbortController()
      activeSignals.add(runController)

      const forwardAbort = (): void => {
        runController.abort()
      }
      if (item.signal) {
        item.signal.addEventListener('abort', forwardAbort, { once: true })
      }

      Promise.resolve()
        .then(() => item.fn(runController.signal))
        .then(
          res => settleItem(item, true, res),
          err => settleItem(item, false, err),
        )
        .finally(() => {
          if (item.signal) {
            item.signal.removeEventListener('abort', forwardAbort)
          }
          activeSignals.delete(runController)
          active -= 1
          pump()
        })
    }
  }

  return {
    name,
    concurrency,
    enqueue<T>(fn: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
      if (disposed) {
        return Promise.reject(makeAbortError('队列已释放'))
      }
      if (signal?.aborted) {
        return Promise.reject(makeAbortError())
      }

      return new Promise<T>((resolve, reject) => {
        const item: QueueItem<T> = {
          fn,
          signal,
          resolve,
          reject,
          settled: false,
          onAbort: () => {
            const idx = pending.indexOf(item as QueueItem<unknown>)
            if (idx >= 0) pending.splice(idx, 1)
            settleItem(item, false, makeAbortError())
          },
        }
        if (signal && item.onAbort) {
          signal.addEventListener('abort', item.onAbort, { once: true })
        }
        pending.push(item as QueueItem<unknown>)
        pump()
      })
    },
    pendingCount: () => pending.length,
    activeCount: () => active,
    dispose(): void {
      if (disposed) return
      disposed = true
      while (pending.length > 0) {
        const item = pending.shift()!
        settleItem(item, false, makeAbortError('队列已释放'))
      }
      for (const controller of activeSignals) {
        controller.abort()
      }
      activeSignals.clear()
    },
  }
}
