import crypto from 'node:crypto'
import {
  emptyTaskItemSummary,
  FolioError,
  type BoundedQueue,
  type FolioRuntimeService,
  type FolioTasksService,
  type TaskActivityOptions,
  type TaskEnqueueOptions,
  type TaskHandle,
  type TaskItem,
  type TaskItemInput,
  type TaskItemPage,
  type TaskItemQuery,
  type TaskItemReporter,
  type TaskItemStatus,
  type TaskItemSummary,
  type TaskProgress,
  type TaskRetryDescriptor,
  type TaskRetryHandler,
  type TaskRetryResult,
  type TaskRunHelpers,
  type TaskSnapshot,
  type TaskStatus,
  type WorkerRunOptions,
} from '@folio/base-contract'
import { createBoundedQueue } from './queue.js'
import { runNodeWorker } from './worker-runner.js'
import type { PersistedTaskRecord, TaskLedger } from './task-ledger.js'

const TERMINAL_STATUSES = new Set<TaskStatus>([
  'completed',
  'failed',
  'cancelled',
  'stopped',
  'interrupted',
])
const ACTIVE_STATUSES = new Set<TaskStatus>(['queued', 'running', 'paused'])
const RETRYABLE_ITEM_STATUSES = new Set<TaskItemStatus>([
  'pending',
  'failed',
  'cancelled',
])
const ACTIVITY_IDLE_MS = 300
const DEFAULT_MAX_ITEMS = 5000
const DEFAULT_HISTORY = 300

function makeAbortError(message = '任务已取消'): Error {
  const err = new Error(message)
  err.name = 'AbortError'
  return err
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function isTerminal(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.has(status)
}

const ITEM_STATUSES = new Set<TaskItemStatus>([
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'skipped',
])

function readItemStatus(value: unknown): TaskItemStatus {
  return typeof value === 'string' && ITEM_STATUSES.has(value as TaskItemStatus)
    ? (value as TaskItemStatus)
    : 'pending'
}

function readItemSummary(value: unknown): TaskItemSummary | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const fields = ['total', 'pending', 'running', 'succeeded', 'failed', 'cancelled', 'skipped'] as const
  if (fields.some(field => typeof candidate[field] !== 'number')) return null
  return {
    total: candidate.total as number,
    pending: candidate.pending as number,
    running: candidate.running as number,
    succeeded: candidate.succeeded as number,
    failed: candidate.failed as number,
    cancelled: candidate.cancelled as number,
    skipped: candidate.skipped as number,
  }
}

interface InternalItem {
  key: string
  label: string
  status: TaskItemStatus
  error: string | null
  attempts: number
  updatedAt: number
  retriedBy?: string
  data?: Record<string, unknown>
}

interface InternalTaskRecord {
  readonly id: string
  readonly scope: string
  readonly queue: string
  readonly title: string
  readonly pausable: boolean
  readonly cancellable: boolean
  readonly createdAt: number
  readonly controller: AbortController
  readonly meta?: Record<string, unknown>
  readonly retry?: TaskRetryDescriptor
  readonly retryOf?: string
  status: TaskStatus
  progress: TaskProgress
  startedAt: number | null
  updatedAt: number
  finishedAt: number | null
  error: string | null
  pauseWaiters: Array<() => void>
  throttleTimer: ReturnType<typeof setTimeout> | null
  lastEmitAt: number
  readonly items: Map<string, InternalItem>
  readonly itemOrder: string[]
  itemSummary: TaskItemSummary | null
  itemsTruncated: boolean
  stopRequested: boolean
}

interface ActivityGroup {
  readonly record: InternalTaskRecord
  total: number
  succeeded: number
  failed: number
  cancelled: number
  lastError: string | null
  timer: ReturnType<typeof setTimeout> | null
}

export interface CreateFolioTasksServiceOptions {
  readonly runtime: FolioRuntimeService
  readonly throttleMs?: number
  readonly maxHistory?: number
  readonly maxItemsPerTask?: number
  readonly ledger?: TaskLedger
  readonly persistDebounceMs?: number
}

export interface ManagedFolioTasksService extends FolioTasksService {
  /** Restores the persisted ledger. Resolves immediately when no ledger exists. */
  hydrate(): Promise<void>
  /** Writes the current ledger synchronously; used before plugin teardown. */
  flush(): Promise<void>
  dispose(): void
}

export function createFolioTasksService(
  options: CreateFolioTasksServiceOptions,
): ManagedFolioTasksService {
  const { runtime } = options
  const throttleMs = Math.max(20, options.throttleMs ?? 200)
  const maxHistory = Math.max(10, options.maxHistory ?? DEFAULT_HISTORY)
  const maxItemsPerTask = Math.max(50, options.maxItemsPerTask ?? DEFAULT_MAX_ITEMS)
  const persistDebounceMs = Math.max(100, options.persistDebounceMs ?? 600)
  const ledger = options.ledger

  const tasks = new Map<string, InternalTaskRecord>()
  const queues = new Map<string, BoundedQueue>()
  const activities = new Map<string, ActivityGroup>()
  const retryHandlers = new Map<string, TaskRetryHandler>()
  let disposed = false
  let hydrated = ledger === undefined
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let persistChain: Promise<void> = Promise.resolve()
  let persistDirty = false

  const getOrCreateQueue = (name: string, concurrency?: number): BoundedQueue => {
    const existing = queues.get(name)
    if (existing) return existing
    const created = createBoundedQueue({ name, concurrency })
    queues.set(name, created)
    return created
  }

  const summarize = (record: InternalTaskRecord): TaskItemSummary => {
    if (record.itemSummary) return record.itemSummary
    const summary = emptyTaskItemSummary()
    let total = 0
    let pending = 0
    let running = 0
    let succeeded = 0
    let failed = 0
    let cancelled = 0
    let skipped = 0
    for (const key of record.itemOrder) {
      const item = record.items.get(key)
      if (!item) continue
      total += 1
      if (item.status === 'pending') pending += 1
      else if (item.status === 'running') running += 1
      else if (item.status === 'succeeded') succeeded += 1
      else if (item.status === 'failed') failed += 1
      else if (item.status === 'cancelled') cancelled += 1
      else skipped += 1
    }
    return { total, pending, running, succeeded, failed, cancelled, skipped }
  }

  const hasRetryableItems = (record: InternalTaskRecord): boolean => {
    const summary = summarize(record)
    return summary.pending + summary.running + summary.failed + summary.cancelled > 0
  }

  const aggregateFailureCount = (record: InternalTaskRecord): number => {
    const failed = record.progress.detail?.failed
    return typeof failed === 'number' && Number.isFinite(failed) ? Math.max(0, failed) : 0
  }

  const hasRepairableWork = (record: InternalTaskRecord): boolean =>
    hasRetryableItems(record) || aggregateFailureCount(record) > 0

  const toSnapshot = (record: InternalTaskRecord): TaskSnapshot => {
    const summary = summarize(record)
    const itemised = record.itemOrder.length > 0 || summary.total > 0
    const canRetry =
      Boolean(record.retry) &&
      hasRepairableWork(record) &&
      retryHandlers.has(record.retry?.kind ?? '')
    const resumable =
      record.status === 'paused' ||
      ((record.status === 'stopped' || record.status === 'interrupted') && canRetry)
    return {
      id: record.id,
      scope: record.scope,
      queue: record.queue,
      title: record.title,
      status: record.status,
      progress: record.progress,
      pausable: record.pausable,
      cancellable: record.cancellable,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
      finishedAt: record.finishedAt,
      error: record.error,
      ...(record.meta ? { meta: record.meta } : {}),
      ...(record.retry ? { retry: record.retry } : {}),
      ...(itemised ? { items: summary } : {}),
      ...(canRetry ? { retryable: true } : {}),
      ...(resumable ? { resumable: true } : {}),
      ...(record.retryOf ? { retryOf: record.retryOf } : {}),
      ...(record.itemsTruncated ? { itemsTruncated: true } : {}),
    }
  }

  const schedulePersist = (): void => {
    if (!ledger || !hydrated || disposed) return
    persistDirty = true
    if (persistTimer !== null) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      void flushPersist()
    }, persistDebounceMs)
    persistTimer.unref?.()
  }

  const serializeRecord = (record: InternalTaskRecord): PersistedTaskRecord => {
    const summary = summarize(record)
    const active = ACTIVE_STATUSES.has(record.status)
    const items: TaskItem[] = []
    for (const key of record.itemOrder) {
      const item = record.items.get(key)
      if (!item) continue
      // Finished history only keeps items that still matter for a retry or a
      // diagnosis; a long successful batch would otherwise bloat the file.
      if (!active && item.status === 'succeeded' && record.itemOrder.length > 300) continue
      items.push({
        key: item.key,
        label: item.label,
        status: item.status,
        error: item.error,
        attempts: item.attempts,
        updatedAt: item.updatedAt,
        ...(item.retriedBy ? { retriedBy: item.retriedBy } : {}),
        ...(item.data ? { data: item.data } : {}),
      })
    }
    return {
      id: record.id,
      scope: record.scope,
      queue: record.queue,
      title: record.title,
      status: record.status,
      progress: record.progress,
      pausable: record.pausable,
      cancellable: record.cancellable,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
      finishedAt: record.finishedAt,
      error: record.error,
      ...(record.meta ? { meta: record.meta } : {}),
      ...(record.retry ? { retry: record.retry } : {}),
      ...(record.retryOf ? { retryOf: record.retryOf } : {}),
      ...(items.length > 0 ? { items } : {}),
      ...(summary.total > 0 ? { itemSummary: summary } : {}),
      ...(record.itemsTruncated ? { itemsTruncated: true } : {}),
    }
  }

  const serialize = (): PersistedTaskRecord[] =>
    Array.from(tasks.values()).map(serializeRecord)

  const flushPersist = (): Promise<void> => {
    if (!ledger) return Promise.resolve()
    const snapshot = serialize()
    persistChain = persistChain
      .catch(() => {})
      .then(async () => {
        await ledger.save(snapshot)
        persistDirty = false
      })
      .catch(() => {})
    return persistChain
  }

  const emitNow = (record: InternalTaskRecord): void => {
    if (record.throttleTimer !== null) {
      clearTimeout(record.throttleTimer)
      record.throttleTimer = null
    }
    record.lastEmitAt = Date.now()
    const snap = toSnapshot(record)
    runtime.events.emitEvent('tasks', snap)
    runtime.events.emitEvent(`tasks:${record.scope}`, snap)
    schedulePersist()
  }

  const scheduleThrottledEmit = (record: InternalTaskRecord): void => {
    const now = Date.now()
    const elapsed = now - record.lastEmitAt
    if (elapsed >= throttleMs) {
      emitNow(record)
      return
    }
    if (record.throttleTimer !== null) return
    const waitMs = Math.max(10, throttleMs - elapsed)
    record.throttleTimer = setTimeout(() => {
      record.throttleTimer = null
      if (!disposed && tasks.has(record.id)) {
        emitNow(record)
      }
    }, waitMs)
    record.throttleTimer.unref?.()
  }

  const wakePauseWaiters = (record: InternalTaskRecord): void => {
    const waiters = record.pauseWaiters.splice(0, record.pauseWaiters.length)
    for (const wake of waiters) wake()
  }

  const trimHistory = (): void => {
    const finished = Array.from(tasks.values())
      .filter(t => {
        if (!isTerminal(t.status)) return false
        // Resumable stopped/interrupted work is not history yet.
        if (
          (t.status === 'stopped' || t.status === 'interrupted') &&
          hasRetryableItems(t) &&
          Boolean(t.retry) &&
          retryHandlers.has(t.retry?.kind ?? '')
        ) {
          return false
        }
        return true
      })
      .sort((a, b) => (a.finishedAt ?? a.updatedAt) - (b.finishedAt ?? b.updatedAt))
    while (finished.length > maxHistory) {
      const oldest = finished.shift()
      if (!oldest) break
      if (oldest.throttleTimer !== null) clearTimeout(oldest.throttleTimer)
      tasks.delete(oldest.id)
    }
  }

  const createRecord = (
    opts: Pick<
      TaskEnqueueOptions,
      'scope' | 'title' | 'meta' | 'pausable' | 'cancellable' | 'retry' | 'retryOf'
    >,
    queueName: string,
  ): InternalTaskRecord => {
    const now = Date.now()
    const record: InternalTaskRecord = {
      id: `task_${crypto.randomUUID().slice(0, 12)}`,
      scope: opts.scope,
      queue: queueName,
      title: opts.title,
      pausable: opts.pausable ?? true,
      cancellable: opts.cancellable ?? true,
      createdAt: now,
      controller: new AbortController(),
      meta: opts.meta,
      retry: opts.retry,
      retryOf: opts.retryOf,
      status: 'queued',
      progress: { current: 0, total: null, message: '排队中…' },
      startedAt: null,
      updatedAt: now,
      finishedAt: null,
      error: null,
      pauseWaiters: [],
      throttleTimer: null,
      lastEmitAt: 0,
      items: new Map(),
      itemOrder: [],
      itemSummary: null,
      itemsTruncated: false,
      stopRequested: false,
    }
    tasks.set(record.id, record)
    return record
  }

  // ---------------------------------------------------------------- item sync

  const syncProgressFromItems = (record: InternalTaskRecord): void => {
    const summary = summarize(record)
    record.itemSummary = summary
    const previous = record.progress
    record.progress = {
      current: summary.succeeded + summary.failed + summary.cancelled + summary.skipped,
      total: summary.total,
      message: previous.message,
      detail: {
        ...previous.detail,
        succeeded: summary.succeeded,
        failed: summary.failed,
        cancelled: summary.cancelled,
        skipped: summary.skipped,
        pending: summary.pending,
        running: summary.running,
      },
    }
  }

  const touchItem = (
    record: InternalTaskRecord,
    key: string,
    update: Partial<Omit<InternalItem, 'key'>>,
  ): InternalItem | null => {
    if (isTerminal(record.status)) {
      return null
    }
    let item = record.items.get(key)
    if (!item) {
      if (record.itemOrder.length >= maxItemsPerTask) {
        record.itemsTruncated = true
        return null
      }
      item = {
        key,
        label: update.label ?? key,
        status: 'pending',
        error: null,
        attempts: 0,
        updatedAt: Date.now(),
      }
      record.items.set(key, item)
      record.itemOrder.push(key)
    }
    if (update.label !== undefined) item.label = update.label
    if (update.status !== undefined) item.status = update.status
    if (update.error !== undefined) item.error = update.error
    if (update.attempts !== undefined) item.attempts = update.attempts
    if (update.retriedBy !== undefined) item.retriedBy = update.retriedBy
    if (update.data !== undefined) item.data = { ...item.data, ...update.data }
    item.updatedAt = Date.now()
    record.updatedAt = item.updatedAt
    // Item counts just changed; a hydrated summary can no longer be trusted.
    record.itemSummary = null
    syncProgressFromItems(record)
    return item
  }

  const markRunningItem = (record: InternalTaskRecord, key: string, label?: string): void => {
    const item = record.items.get(key) ?? touchItem(record, key, { label })
    if (!item) return
    touchItem(record, key, { status: 'running', error: null, attempts: item.attempts + 1 })
  }

  const markFinishedItem = (
    record: InternalTaskRecord,
    key: string,
    status: TaskItemStatus,
    error: string | null,
    data?: Record<string, unknown>,
  ): void => {
    const existing = record.items.get(key)
    const attempts = existing && existing.attempts > 0 ? existing.attempts : 1
    touchItem(record, key, { status, error, attempts, ...(data ? { data } : {}) })
  }

  const defineItems = (record: InternalTaskRecord, inputs: readonly TaskItemInput[]): void => {
    if (isTerminal(record.status)) return
    const capped = inputs.slice(0, maxItemsPerTask)
    record.items.clear()
    record.itemOrder.length = 0
    record.itemsTruncated = inputs.length > capped.length
    for (const input of capped) {
      const key = input.key
      if (!key || record.items.has(key)) continue
      record.items.set(key, {
        key,
        label: input.label ?? key,
        status: 'pending',
        error: null,
        attempts: 0,
        updatedAt: Date.now(),
        ...(input.data ? { data: input.data } : {}),
      })
      record.itemOrder.push(key)
    }
    record.itemSummary = null
    record.itemSummary = summarize(record)
    record.progress = {
      current: 0,
      total: record.itemOrder.length,      message: record.progress.message ?? '等待处理…',
      detail: {
        ...record.progress.detail,
        succeeded: 0,
        failed: 0,
        cancelled: 0,
        skipped: 0,
        pending: record.itemOrder.length,
        running: 0,
      },
    }
    record.updatedAt = Date.now()
    emitNow(record)
  }

  const finalizeUnreportedItems = (record: InternalTaskRecord): void => {
    for (const key of record.itemOrder) {
      const item = record.items.get(key)
      if (!item) continue
      if (item.status === 'pending' || item.status === 'running') {
        touchItem(record, key, { status: 'skipped', error: '未执行' })
      }
    }
  }

  const stopUnfinishedItems = (record: InternalTaskRecord): void => {
    for (const key of record.itemOrder) {
      const item = record.items.get(key)
      if (!item) continue
      if (item.status === 'running' || item.status === 'pending') {
        touchItem(record, key, { status: 'pending', error: '任务已停止，等待继续' })
      }
    }
  }

  const cancelUnfinishedItems = (record: InternalTaskRecord): void => {
    for (const key of record.itemOrder) {
      const item = record.items.get(key)
      if (!item) continue
      if (item.status === 'running' || item.status === 'pending') {
        touchItem(record, key, { status: 'cancelled', error: '任务已取消' })
      }
    }
  }

  const createItemReporter = (record: InternalTaskRecord): TaskItemReporter => ({
    define: inputs => defineItems(record, inputs),
    begin: key => {
      markRunningItem(record, key)
      scheduleThrottledEmit(record)
    },
    succeed: (key, data) => {
      markFinishedItem(record, key, 'succeeded', null, data)
      scheduleThrottledEmit(record)
    },
    fail: (key, error, data) => {
      markFinishedItem(record, key, 'failed', toErrorMessage(error), data)
      scheduleThrottledEmit(record)
    },
    cancel: (key, reason) => {
      markFinishedItem(record, key, 'cancelled', reason ?? '已取消')
      scheduleThrottledEmit(record)
    },
    skip: (key, reason) => {
      markFinishedItem(record, key, 'skipped', reason ?? '已跳过')
      scheduleThrottledEmit(record)
    },
    update: (key, patch) => {
      const existing = record.items.get(key)
      if (!existing) return
      touchItem(record, key, {
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.data !== undefined ? { data: patch.data } : {}),
      })
      scheduleThrottledEmit(record)
    },
    summary: () => summarize(record),
    checkpoint: async () => {
      throwIfAborted(record)
      await waitIfPaused(record)
      throwIfAborted(record)
    },
  })

  // ------------------------------------------------------------- pause/abort

  const waitIfPaused = async (record: InternalTaskRecord): Promise<void> => {
    while (
      record.status === 'paused' &&
      !record.controller.signal.aborted &&
      !disposed
    ) {
      await new Promise<void>(resolve => {
        record.pauseWaiters.push(resolve)
      })
    }
    if (record.controller.signal.aborted || disposed) {
      throw makeAbortError(record.stopRequested ? '任务已停止' : '任务已取消')
    }
  }

  const throwIfAborted = (record: InternalTaskRecord): void => {
    if (record.controller.signal.aborted || disposed) {
      throw makeAbortError(record.stopRequested ? '任务已停止' : '任务已取消')
    }
  }

  // ------------------------------------------------------------------ observe

  const observe = async <T>(
    opts: TaskActivityOptions<T>,
    operation: () => Promise<T>,
  ): Promise<T> => {
    if (disposed) return operation()
    const key = JSON.stringify([opts.scope, opts.key])
    let group = activities.get(key)
    const isNew = !group
    if (!group) {
      const record = createRecord(
        { ...opts, pausable: false, cancellable: false },
        `activity:${opts.key}`,
      )
      record.status = 'running'
      record.startedAt = record.createdAt
      group = { record, total: 0, succeeded: 0, failed: 0, cancelled: 0, lastError: null, timer: null }
      activities.set(key, group)
    }
    const activity = group
    const { record } = activity
    if (activity.timer) clearTimeout(activity.timer)
    activity.timer = null
    activity.total += 1

    const itemKey = opts.item?.trim()
    if (itemKey) markRunningItem(record, itemKey, itemKey)

    const updateProgress = (message?: string): void => {
      const { total, succeeded, failed, cancelled } = activity
      record.updatedAt = Date.now()
      record.progress = {
        current: succeeded + failed + cancelled,
        total,
        message,
        detail: { succeeded, failed, cancelled, lastError: activity.lastError },
      }
    }
    updateProgress(opts.item)
    if (isNew) emitNow(record)
    else scheduleThrottledEmit(record)

    try {
      const result = await operation()
      if (opts.signal?.aborted) activity.cancelled += 1
      else if (!opts.isSuccessful || opts.isSuccessful(result)) activity.succeeded += 1
      else {
        activity.failed += 1
        activity.lastError = opts.item ? `${opts.item}：未生成结果` : '未生成结果'
      }
      if (itemKey) {
        if (opts.signal?.aborted) markFinishedItem(record, itemKey, 'cancelled', '已取消')
        else if (!opts.isSuccessful || opts.isSuccessful(result)) {
          markFinishedItem(record, itemKey, 'succeeded', null)
        } else {
          markFinishedItem(record, itemKey, 'failed', '未生成结果')
        }
      }
      return result
    } catch (err) {
      if (opts.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        activity.cancelled += 1
        if (itemKey) markFinishedItem(record, itemKey, 'cancelled', '已取消')
      } else {
        activity.failed += 1
        activity.lastError = toErrorMessage(err)
        if (itemKey) markFinishedItem(record, itemKey, 'failed', activity.lastError)
      }
      throw err
    } finally {
      if (!disposed) {
        updateProgress(opts.item)
        scheduleThrottledEmit(record)
        if (record.progress.current === activity.total) {
          activity.timer = setTimeout(() => {
            activities.delete(key)
            record.status =
              activity.succeeded > 0 ? 'completed' : activity.failed > 0 ? 'failed' : 'cancelled'
            record.error = record.status === 'failed' ? activity.lastError : null
            record.updatedAt = Date.now()
            record.finishedAt = record.updatedAt
            emitNow(record)
            trimHistory()
          }, ACTIVITY_IDLE_MS)
          activity.timer.unref?.()
        }
      }
    }
  }

  // ------------------------------------------------------------------ enqueue

  const enqueue = <T = unknown>(opts: TaskEnqueueOptions<T>): TaskHandle<T> => {
    if (disposed) {
      throw new FolioError('tasks_disposed', '任务调度器已停止', 503)
    }
    const queueName = opts.queue?.trim() || `${opts.scope}:default`
    const queue = getOrCreateQueue(queueName, opts.concurrency ?? 4)
    const record = createRecord(opts, queueName)
    emitNow(record)

    const done = queue
      .enqueue<T>(async queueSignal => {
        const onQueueAbort = (): void => {
          record.controller.abort()
          wakePauseWaiters(record)
        }
        queueSignal.addEventListener('abort', onQueueAbort, { once: true })

        try {
          if (record.controller.signal.aborted) {
            throw makeAbortError()
          }
          if (record.status === 'paused') {
            await waitIfPaused(record)
          }

          record.startedAt = Date.now()
          record.updatedAt = record.startedAt
          record.status = 'running'
          emitNow(record)

          const helpers: TaskRunHelpers = {
            taskId: record.id,
            signal: record.controller.signal,
            isPaused: () => record.status === 'paused',
            throwIfAborted: () => throwIfAborted(record),
            waitIfPaused: () => waitIfPaused(record),
            items: createItemReporter(record),
            reportProgress: progress => {
              if (isTerminal(record.status)) return
              record.progress = progress
              record.updatedAt = Date.now()
              if (record.items.size > 0 && progress.total !== null) {
                const summary = summarize(record)
                record.itemSummary = summary
                record.progress = {
                  ...progress,
                  detail: {
                    ...progress.detail,
                    succeeded: summary.succeeded,
                    failed: summary.failed,
                    cancelled: summary.cancelled,
                    skipped: summary.skipped,
                    pending: summary.pending,
                    running: summary.running,
                  },
                }
              }
              scheduleThrottledEmit(record)
            },
          }

          const result = await opts.run(helpers)
          if (record.stopRequested || record.controller.signal.aborted) {
            throw makeAbortError('任务已停止')
          }

          finalizeUnreportedItems(record)
          record.status = 'completed'
          record.updatedAt = Date.now()
          record.finishedAt = record.updatedAt
          if (record.progress.total !== null) {
            record.progress = {
              ...record.progress,
              current: record.progress.total,
            }
          }
          emitNow(record)
          trimHistory()
          return result
        } catch (err) {
          if (isTerminal(record.status)) {
            throw err
          }
          const isAbort =
            record.controller.signal.aborted ||
            (err instanceof Error && err.name === 'AbortError')
          record.updatedAt = Date.now()
          record.finishedAt = record.updatedAt
          if (record.stopRequested) {
            stopUnfinishedItems(record)
            record.status = 'stopped'
            record.error = null
          } else if (isAbort) {
            record.status = 'cancelled'
            record.error = null
          } else {
            const message = toErrorMessage(err)
            // The run body is gone; anything still marked running failed with it.
            for (const key of record.itemOrder) {
              const item = record.items.get(key)
              if (item?.status === 'running') {
                markFinishedItem(record, key, 'failed', `任务失败：${message}`)
              }
            }
            record.status = 'failed'
            record.error = message
          }
          emitNow(record)
          trimHistory()
          throw err
        } finally {
          queueSignal.removeEventListener('abort', onQueueAbort)
        }
      }, record.controller.signal)

    // Ensure unhandled rejection doesn't crash Node when callers fire-and-forget enqueue()
    done.catch(() => {})

    return {
      id: record.id,
      done,
      snapshot: () => toSnapshot(record),
    }
  }

  // ------------------------------------------------------------------- retry

  const requireTask = (id: string): InternalTaskRecord => {
    const record = tasks.get(id)
    if (!record) {
      throw new FolioError('task_not_found', `任务不存在: ${id}`, 404)
    }
    return record
  }

  const selectRetryItems = (
    record: InternalTaskRecord,
    itemKeys?: readonly string[],
    includePending = false,
  ): InternalItem[] => {
    const wanted = itemKeys ? new Set(itemKeys) : null
    const selected: InternalItem[] = []
    for (const key of record.itemOrder) {
      const item = record.items.get(key)
      if (!item) continue
      if (!RETRYABLE_ITEM_STATUSES.has(item.status)) continue
      if (!wanted && !includePending && item.status === 'pending') continue
      if (wanted && !wanted.has(key)) continue
      selected.push(item)
    }
    return selected
  }

  const retryItems = async (
    taskId: string,
    itemKeys: readonly string[] | undefined,
    includePending: boolean,
  ): Promise<TaskRetryResult> => {
    const record = requireTask(taskId)
    if (!record.retry) {
      throw new FolioError('task_not_retryable', '该任务未登记可重试项', 400)
    }
    const handler = retryHandlers.get(record.retry.kind)
    if (!handler) {
      throw new FolioError(
        'task_retry_unavailable',
        `重试处理器未注册: ${record.retry.kind}`,
        503,
      )
    }
    const selected = selectRetryItems(
      record,
      itemKeys,
      includePending || isTerminal(record.status),
    )
    if (selected.length === 0) {
      const failedCount = aggregateFailureCount(record)
      // Older activities persisted only aggregate counters. When the producer
      // registered a retry handler, let it retry its whole scope instead of
      // pretending there is nothing to do.
      if (!itemKeys && failedCount > 0) {
        const retried = await handler.retry({
          task: toSnapshot(record),
          items: [],
          wholeTask: true,
        })
        const wholeTask =
          retried && typeof retried === 'object' && typeof (retried as TaskSnapshot).id === 'string'
            ? (retried as TaskSnapshot)
            : null
        return {
          task: wholeTask,
          source: toSnapshot(record),
          retried: wholeTask ? failedCount : 0,
        }
      }
      return { task: null, retried: 0 }
    }
    const result = await handler.retry({
      task: toSnapshot(record),
      items: selected.map(item => ({
        key: item.key,
        label: item.label,
        status: item.status,
        error: item.error,
        attempts: item.attempts,
        updatedAt: item.updatedAt,
        ...(item.retriedBy ? { retriedBy: item.retriedBy } : {}),
        ...(item.data ? { data: item.data } : {}),
      })),
    })
    const nextTask =
      result && typeof result === 'object' && typeof (result as TaskSnapshot).id === 'string'
        ? (result as TaskSnapshot)
        : null
    if (nextTask) {
      for (const item of selected) {
        item.retriedBy = nextTask.id
        item.updatedAt = Date.now()
      }
      record.updatedAt = Date.now()
      emitNow(record)
    }
    return { task: nextTask, source: toSnapshot(record), retried: selected.length }
  }

  return {
    hydrate: async () => {
      if (!ledger || hydrated || disposed) return
      const rows = await ledger.load().catch(() => [])
      if (disposed) return
      for (const row of rows) {
        if (tasks.has(row.id)) continue
        const status = row.status as TaskStatus
        const terminal = isTerminal(status)
        const now = Date.now()
        const items = new Map<string, InternalItem>()
        const order: string[] = []
        const persistedItems = Array.isArray(row.items) ? row.items : []
        for (const item of persistedItems) {
          if (!item || typeof item.key !== 'string') continue
          items.set(item.key, {
            key: item.key,
            label: typeof item.label === 'string' ? item.label : item.key,
            status: readItemStatus(item.status),
            error: typeof item.error === 'string' ? item.error : null,
            attempts: Number.isFinite(item.attempts) ? item.attempts : 0,
            updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : now,
            ...(item.retriedBy ? { retriedBy: item.retriedBy } : {}),
            ...(item.data ? { data: item.data } : {}),
          })
          order.push(item.key)
        }
        if (!terminal) {
          for (const item of items.values()) {
            if (item.status === 'running') {
              item.status = 'pending'
              item.error = '应用退出时执行中断'
            }
          }
        }
        const record: InternalTaskRecord = {
          id: row.id,
          scope: row.scope,
          queue: typeof row.queue === 'string' ? row.queue : `${row.scope}:default`,
          title: row.title,
          pausable: Boolean(row.pausable),
          cancellable: Boolean(row.cancellable),
          createdAt: Number.isFinite(row.createdAt) ? row.createdAt : now,
          controller: new AbortController(),
          ...(row.meta ? { meta: row.meta } : {}),
          ...(row.retry ? { retry: row.retry } : {}),
          ...(row.retryOf ? { retryOf: row.retryOf } : {}),
          status: terminal ? status : 'interrupted',
          progress:
            row.progress && typeof row.progress.current === 'number'
              ? row.progress
              : { current: 0, total: null, message: '已恢复' },
          startedAt: row.startedAt ?? null,
          updatedAt: row.updatedAt ?? now,
          finishedAt: terminal ? row.finishedAt ?? row.updatedAt ?? now : now,
          error: terminal ? row.error ?? null : '应用退出时任务未完成，可继续未完成项',
          pauseWaiters: [],
          throttleTimer: null,
          lastEmitAt: 0,
          items,
          itemOrder: order,
          itemSummary: readItemSummary(row.itemSummary),
          itemsTruncated: Boolean(row.itemsTruncated),
          stopRequested: false,
        }
        tasks.set(record.id, record)
        if (!terminal && record.status === 'interrupted') {
          record.progress = { ...record.progress, message: '应用退出时任务中断，可继续未完成项' }
        }
      }
      hydrated = true
      trimHistory()
      // Publish restored rows so an already-open monitor does not wait for its
      // next poll interval to show the previous session's history.
      for (const record of tasks.values()) {
        if (isTerminal(record.status) || record.status === 'interrupted') {
          runtime.events.emitEvent('tasks', toSnapshot(record))
          runtime.events.emitEvent(`tasks:${record.scope}`, toSnapshot(record))
        }
      }
      if (tasks.size > 0) schedulePersist()
    },

    flush: async () => {
      if (persistTimer !== null) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      if (!hydrated || !ledger) return
      await flushPersist()
    },

    createQueue(opts) {
      return createBoundedQueue(opts)
    },
    runWorker<TOutput = unknown, TInput = unknown>(
      workerOpts: WorkerRunOptions<TInput>,
    ): Promise<TOutput> {
      return runNodeWorker<TOutput, TInput>(workerOpts)
    },
    enqueue,
    observe,
    listTasks(scope?: string): readonly TaskSnapshot[] {
      const list = Array.from(tasks.values())
        .filter(t => !scope || t.scope === scope)
        .sort((a, b) => b.createdAt - a.createdAt)
      return list.map(toSnapshot)
    },
    getTask(id: string): TaskSnapshot | undefined {
      const record = tasks.get(id)
      return record ? toSnapshot(record) : undefined
    },
    listTaskItems(taskId: string, query: TaskItemQuery = {}): TaskItemPage {
      const record = requireTask(taskId)
      const status = query.status ?? 'all'
      const filtered: TaskItem[] = []
      for (const key of record.itemOrder) {
        const item = record.items.get(key)
        if (!item) continue
        if (status === 'unfinished') {
          if (!RETRYABLE_ITEM_STATUSES.has(item.status)) continue
        } else if (status !== 'all' && item.status !== status) {
          continue
        }
        filtered.push({
          key: item.key,
          label: item.label,
          status: item.status,
          error: item.error,
          attempts: item.attempts,
          updatedAt: item.updatedAt,
          ...(item.retriedBy ? { retriedBy: item.retriedBy } : {}),
          ...(item.data ? { data: item.data } : {}),
        })
      }
      const offset = Math.max(0, Math.round(query.offset ?? 0))
      const limit = Math.max(1, Math.min(1000, Math.round(query.limit ?? 200)))
      return {
        taskId,
        items: filtered.slice(offset, offset + limit),
        total: filtered.length,
        summary: summarize(record),
        truncated: record.itemsTruncated,
      }
    },
    pauseTask(id: string): TaskSnapshot {
      const record = requireTask(id)
      if (!record.pausable) {
        throw new FolioError('task_not_pausable', '该任务不支持暂停', 400)
      }
      if (isTerminal(record.status)) {
        return toSnapshot(record)
      }
      record.status = 'paused'
      record.updatedAt = Date.now()
      emitNow(record)
      return toSnapshot(record)
    },
    async resumeTask(id: string): Promise<TaskSnapshot> {
      const record = requireTask(id)
      if (record.status === 'paused') {
        record.status = record.startedAt === null ? 'queued' : 'running'
        record.updatedAt = Date.now()
        wakePauseWaiters(record)
        emitNow(record)
        return toSnapshot(record)
      }
      if (record.status === 'stopped' || record.status === 'interrupted') {
        const result = await retryItems(id, undefined, true)
        if (result.retried === 0) {
          throw new FolioError(
            'task_not_resumable',
            '该任务没有可继续的未完成项，或重试处理器未注册',
            400,
          )
        }
        return toSnapshot(record)
      }
      return toSnapshot(record)
    },
    stopTask(id: string): TaskSnapshot {
      const record = requireTask(id)
      if (!record.cancellable) {
        throw new FolioError('task_not_stoppable', '该任务不支持停止', 400)
      }
      if (isTerminal(record.status)) {
        return toSnapshot(record)
      }
      record.stopRequested = true
      record.controller.abort()
      wakePauseWaiters(record)
      stopUnfinishedItems(record)
      record.status = 'stopped'
      record.updatedAt = Date.now()
      record.finishedAt = record.updatedAt
      record.error = null
      emitNow(record)
      trimHistory()
      return toSnapshot(record)
    },
    cancelTask(id: string): TaskSnapshot {
      const record = requireTask(id)
      if (!record.cancellable) {
        throw new FolioError('task_not_cancellable', '该任务不支持取消', 400)
      }
      if (isTerminal(record.status)) {
        return toSnapshot(record)
      }
      record.stopRequested = false
      record.controller.abort()
      wakePauseWaiters(record)
      cancelUnfinishedItems(record)
      record.status = 'cancelled'
      record.updatedAt = Date.now()
      record.finishedAt = record.updatedAt
      emitNow(record)
      trimHistory()
      return toSnapshot(record)
    },
    retryTaskItems(taskId: string, itemKeys?: readonly string[]): Promise<TaskRetryResult> {
      return retryItems(taskId, itemKeys, false)
    },
    registerRetryHandler(handler: TaskRetryHandler): () => void {
      retryHandlers.set(handler.kind, handler)
      return () => {
        if (retryHandlers.get(handler.kind) === handler) {
          retryHandlers.delete(handler.kind)
        }
      }
    },
    clearFinished(scope?: string): number {
      let cleared = 0
      for (const [id, record] of tasks.entries()) {
        if (scope && record.scope !== scope) continue
        if (!isTerminal(record.status)) continue
        // Stopped / interrupted tasks still carry unfinished items that the
        // monitor can continue; never let a history cleanup discard that work.
        if (
          (record.status === 'stopped' || record.status === 'interrupted') &&
          hasRetryableItems(record) &&
          Boolean(record.retry) &&
          retryHandlers.has(record.retry?.kind ?? '')
        ) {
          continue
        }
        if (record.throttleTimer !== null) clearTimeout(record.throttleTimer)
        tasks.delete(id)
        cleared += 1
      }
      if (cleared > 0) {
        runtime.events.emitEvent('tasks:cleared', { scope: scope ?? '*' })
        schedulePersist()
      }
      return cleared
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      if (persistTimer !== null) {
        clearTimeout(persistTimer)
        persistTimer = null
      }
      if (ledger && hydrated) {
        const snapshot = serialize()
        persistChain = persistChain
          .catch(() => {})
          .then(() => ledger.save(snapshot))
          .catch(() => {})
      }
      for (const activity of activities.values()) {
        if (activity.timer) clearTimeout(activity.timer)
      }
      activities.clear()
      for (const record of tasks.values()) {
        if (record.throttleTimer !== null) {
          clearTimeout(record.throttleTimer)
          record.throttleTimer = null
        }
        if (!isTerminal(record.status)) {
          record.status = 'cancelled'
          record.controller.abort()
          wakePauseWaiters(record)
        }
      }
      for (const queue of queues.values()) {
        queue.dispose()
      }
      queues.clear()
      retryHandlers.clear()
      tasks.clear()
    },
  }
}
