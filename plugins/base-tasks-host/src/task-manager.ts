import crypto from 'node:crypto'
import {
  FolioError,
  type BoundedQueue,
  type FolioRuntimeService,
  type FolioTasksService,
  type TaskActivityOptions,
  type TaskEnqueueOptions,
  type TaskHandle,
  type TaskProgress,
  type TaskSnapshot,
  type TaskStatus,
  type WorkerRunOptions,
} from '@folio/base-contract'
import { createBoundedQueue } from './queue.js'
import { runNodeWorker } from './worker-runner.js'

const TERMINAL_STATUSES = new Set<TaskStatus>(['completed', 'failed', 'cancelled'])
const ACTIVITY_IDLE_MS = 300

function makeAbortError(message = '任务已取消'): Error {
  const err = new Error(message)
  err.name = 'AbortError'
  return err
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
  status: TaskStatus
  progress: TaskProgress
  startedAt: number | null
  updatedAt: number
  finishedAt: number | null
  error: string | null
  pauseWaiters: Array<() => void>
  throttleTimer: ReturnType<typeof setTimeout> | null
  lastEmitAt: number
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
}

export interface ManagedFolioTasksService extends FolioTasksService {
  dispose(): void
}

export function createFolioTasksService(
  options: CreateFolioTasksServiceOptions,
): ManagedFolioTasksService {
  const { runtime } = options
  const throttleMs = Math.max(20, options.throttleMs ?? 200)
  const maxHistory = Math.max(10, options.maxHistory ?? 200)

  const tasks = new Map<string, InternalTaskRecord>()
  const queues = new Map<string, BoundedQueue>()
  const activities = new Map<string, ActivityGroup>()
  let disposed = false

  const getOrCreateQueue = (name: string, concurrency?: number): BoundedQueue => {
    const existing = queues.get(name)
    if (existing) return existing
    const created = createBoundedQueue({ name, concurrency })
    queues.set(name, created)
    return created
  }

  const toSnapshot = (record: InternalTaskRecord): TaskSnapshot => ({
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
  })

  const emitNow = (record: InternalTaskRecord): void => {
    if (record.throttleTimer !== null) {
      clearTimeout(record.throttleTimer)
      record.throttleTimer = null
    }
    record.lastEmitAt = Date.now()
    const snap = toSnapshot(record)
    runtime.events.emitEvent('tasks', snap)
    runtime.events.emitEvent(`tasks:${record.scope}`, snap)
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
      .filter(t => TERMINAL_STATUSES.has(t.status))
      .sort((a, b) => (a.finishedAt ?? a.updatedAt) - (b.finishedAt ?? b.updatedAt))
    while (finished.length > maxHistory) {
      const oldest = finished.shift()
      if (!oldest) break
      if (oldest.throttleTimer !== null) clearTimeout(oldest.throttleTimer)
      tasks.delete(oldest.id)
    }
  }

  const createRecord = (
    opts: Pick<TaskEnqueueOptions, 'scope' | 'title' | 'meta' | 'pausable' | 'cancellable'>,
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
      status: 'queued',
      progress: { current: 0, total: null, message: '排队中…' },
      startedAt: null,
      updatedAt: now,
      finishedAt: null,
      error: null,
      pauseWaiters: [],
      throttleTimer: null,
      lastEmitAt: 0,
    }
    tasks.set(record.id, record)
    return record
  }

  const observe = async <T>(
    opts: TaskActivityOptions<T>,
    operation: () => Promise<T>,
  ): Promise<T> => {
    if (disposed) return operation()
    const key = JSON.stringify([opts.scope, opts.key])
    let group = activities.get(key)
    const isNew = !group
    if (!group) {
      const record = createRecord({ ...opts, pausable: false, cancellable: false }, `activity:${opts.key}`)
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
      return result
    } catch (err) {
      if (opts.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        activity.cancelled += 1
      } else {
        activity.failed += 1
        activity.lastError = err instanceof Error ? err.message : String(err)
      }
      throw err
    } finally {
      if (!disposed) {
        updateProgress(opts.item)
        scheduleThrottledEmit(record)
        if (record.progress.current === activity.total) {
          activity.timer = setTimeout(() => {
            activities.delete(key)
            record.status = activity.succeeded > 0 ? 'completed' : activity.failed > 0 ? 'failed' : 'cancelled'
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

  const enqueue = <T = unknown>(opts: TaskEnqueueOptions<T>): TaskHandle<T> => {
    if (disposed) {
      throw new FolioError('tasks_disposed', '任务调度器已停止', 503)
    }
    const queueName = opts.queue?.trim() || `${opts.scope}:default`
    const queue = getOrCreateQueue(queueName, opts.concurrency ?? 4)
    const record = createRecord(opts, queueName)
    emitNow(record)

    const waitIfPaused = async (): Promise<void> => {
      while (record.status === 'paused' && !record.controller.signal.aborted && !disposed) {
        await new Promise<void>(resolve => {
          record.pauseWaiters.push(resolve)
        })
      }
      if (record.controller.signal.aborted || disposed) {
        throw makeAbortError()
      }
    }

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
            await waitIfPaused()
          }

          record.startedAt = Date.now()
          record.updatedAt = record.startedAt
          record.status = 'running'
          emitNow(record)

          const result = await opts.run({
            taskId: record.id,
            signal: record.controller.signal,
            isPaused: () => record.status === 'paused',
            throwIfAborted: () => {
              if (record.controller.signal.aborted || disposed) {
                throw makeAbortError()
              }
            },
            waitIfPaused,
            reportProgress: progress => {
              if (TERMINAL_STATUSES.has(record.status)) return
              record.progress = progress
              record.updatedAt = Date.now()
              scheduleThrottledEmit(record)
            },
          })

          if (record.controller.signal.aborted) {
            throw makeAbortError()
          }

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
          const isAbort =
            record.controller.signal.aborted ||
            (err instanceof Error && err.name === 'AbortError')
          record.updatedAt = Date.now()
          record.finishedAt = record.updatedAt
          if (isAbort) {
            record.status = 'cancelled'
            record.error = null
          } else {
            record.status = 'failed'
            record.error = err instanceof Error ? err.message : String(err)
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

  const requireTask = (id: string): InternalTaskRecord => {
    const record = tasks.get(id)
    if (!record) {
      throw new FolioError('task_not_found', `任务不存在: ${id}`, 404)
    }
    return record
  }

  return {
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
    pauseTask(id: string): TaskSnapshot {
      const record = requireTask(id)
      if (!record.pausable) {
        throw new FolioError('task_not_pausable', '该任务不支持暂停', 400)
      }
      if (TERMINAL_STATUSES.has(record.status)) {
        return toSnapshot(record)
      }
      record.status = 'paused'
      record.updatedAt = Date.now()
      emitNow(record)
      return toSnapshot(record)
    },
    resumeTask(id: string): TaskSnapshot {
      const record = requireTask(id)
      if (record.status !== 'paused') {
        return toSnapshot(record)
      }
      record.status = record.startedAt === null ? 'queued' : 'running'
      record.updatedAt = Date.now()
      wakePauseWaiters(record)
      emitNow(record)
      return toSnapshot(record)
    },
    cancelTask(id: string): TaskSnapshot {
      const record = requireTask(id)
      if (!record.cancellable) {
        throw new FolioError('task_not_cancellable', '该任务不支持取消', 400)
      }
      if (TERMINAL_STATUSES.has(record.status)) {
        return toSnapshot(record)
      }
      record.status = 'cancelled'
      record.updatedAt = Date.now()
      record.finishedAt = record.updatedAt
      record.controller.abort()
      wakePauseWaiters(record)
      emitNow(record)
      trimHistory()
      return toSnapshot(record)
    },
    clearFinished(scope?: string): number {
      let cleared = 0
      for (const [id, record] of tasks.entries()) {
        if (scope && record.scope !== scope) continue
        if (!TERMINAL_STATUSES.has(record.status)) continue
        if (record.throttleTimer !== null) clearTimeout(record.throttleTimer)
        tasks.delete(id)
        cleared += 1
      }
      if (cleared > 0) {
        runtime.events.emitEvent('tasks:cleared', { scope: scope ?? '*' })
      }
      return cleared
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      for (const activity of activities.values()) {
        if (activity.timer) clearTimeout(activity.timer)
      }
      activities.clear()
      for (const record of tasks.values()) {
        if (record.throttleTimer !== null) {
          clearTimeout(record.throttleTimer)
          record.throttleTimer = null
        }
        if (!TERMINAL_STATUSES.has(record.status)) {
          record.status = 'cancelled'
          record.controller.abort()
          wakePauseWaiters(record)
        }
      }
      for (const queue of queues.values()) {
        queue.dispose()
      }
      queues.clear()
      tasks.clear()
    },
  }
}
