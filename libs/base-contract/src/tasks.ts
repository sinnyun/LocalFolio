export type TaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export type TaskItemStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'skipped'

export interface TaskProgress {
  readonly current: number
  readonly total: number | null
  readonly message?: string
  readonly detail?: Record<string, unknown>
}

/** Aggregate counters for an itemised task (a batch of files, projects, entries…). */
export interface TaskItemSummary {
  readonly total: number
  readonly pending: number
  readonly running: number
  readonly succeeded: number
  readonly failed: number
  readonly cancelled: number
  readonly skipped: number
}

export interface TaskItemInput {
  /** Stable identity inside one task; also what a retry hands back to the producer. */
  readonly key: string
  readonly label?: string
  readonly data?: Record<string, unknown>
}

export interface TaskItem {
  readonly key: string
  readonly label: string
  readonly status: TaskItemStatus
  readonly error: string | null
  readonly attempts: number
  readonly updatedAt: number
  /** Set after a retry task was created for this item. */
  readonly retriedBy?: string
  readonly data?: Record<string, unknown>
}

export interface TaskSnapshot {
  readonly id: string
  readonly scope: string
  readonly queue: string
  readonly title: string
  readonly status: TaskStatus
  readonly progress: TaskProgress
  readonly pausable: boolean
  readonly cancellable: boolean
  readonly createdAt: number
  readonly startedAt: number | null
  readonly updatedAt: number
  readonly finishedAt: number | null
  readonly error: string | null
  readonly meta?: Record<string, unknown>
  /** Describes how this task's failed items can be retried. */
  readonly retry?: TaskRetryDescriptor
  /** Present when the producer reported item-level work for this task. */
  readonly items?: TaskItemSummary
  /** True when a retry handler is registered for this task and it has retryable items. */
  readonly retryable?: boolean
  /** True when the task can be continued (paused, or stopped/interrupted with a retry handler). */
  readonly resumable?: boolean
  /** Set on tasks created by a retry, pointing at the source task. */
  readonly retryOf?: string
  /** True when the in-memory item ledger was capped and the list is incomplete. */
  readonly itemsTruncated?: boolean
}

export interface TaskRetryDescriptor {
  /** Matches a handler registered through `FolioTasksService.registerRetryHandler`. */
  readonly kind: string
  readonly params?: Record<string, unknown>
}

export interface TaskRetryRequest {
  readonly task: TaskSnapshot
  readonly items: readonly TaskItem[]
  /**
   * True when the task only has aggregate failure counts (older tasks or
   * activities without an item ledger) and the handler should retry the whole
   * scope instead of a concrete item list.
   */
  readonly wholeTask?: boolean
}

export interface TaskRetryHandler {
  readonly kind: string
  retry(
    request: TaskRetryRequest,
  ): Promise<TaskSnapshot | null | void> | TaskSnapshot | null | void
}

export interface TaskItemQuery {
  readonly status?: TaskItemStatus | 'unfinished' | 'all'
  readonly offset?: number
  readonly limit?: number
}

export interface TaskItemPage {
  readonly taskId: string
  readonly items: readonly TaskItem[]
  readonly total: number
  readonly summary: TaskItemSummary
  readonly truncated: boolean
}

export interface TaskRetryResult {
  /** The freshly enqueued retry task, when the handler created one. */
  readonly task: TaskSnapshot | null
  /** The source task after its items were marked as retried. */
  readonly source?: TaskSnapshot
  readonly retried: number
}

/**
 * Producer-facing handle for itemised work inside one task. `define` publishes
 * the complete item list up front; `begin` / `succeed` / `fail` report progress
 * per item. `checkpoint` cooperatively waits while paused and throws when the
 * task was stopped or cancelled.
 */
export interface TaskItemReporter {
  define(items: readonly TaskItemInput[]): void
  begin(key: string): void
  succeed(key: string, data?: Record<string, unknown>): void
  fail(key: string, error: unknown, data?: Record<string, unknown>): void
  cancel(key: string, reason?: string): void
  skip(key: string, reason?: string): void
  update(
    key: string,
    patch: {
      readonly label?: string
      readonly error?: string | null
      readonly data?: Record<string, unknown>
    },
  ): void
  summary(): TaskItemSummary
  checkpoint(): Promise<void>
}

export interface TaskRunHelpers {
  readonly taskId: string
  readonly signal: AbortSignal
  reportProgress(progress: TaskProgress): void
  waitIfPaused(): Promise<void>
  isPaused(): boolean
  throwIfAborted(): void
  readonly items: TaskItemReporter
}

export interface TaskEnqueueOptions<T = unknown> {
  readonly scope: string
  readonly title: string
  readonly queue?: string
  readonly concurrency?: number
  readonly pausable?: boolean
  readonly cancellable?: boolean
  readonly meta?: Record<string, unknown>
  /** Describes how selected items can be retried later; stored with the task. */
  readonly retry?: TaskRetryDescriptor
  /** Marks this task as a retry of another task. */
  readonly retryOf?: string
  readonly run: (helpers: TaskRunHelpers) => Promise<T>
}

export interface TaskHandle<T = unknown> {
  readonly id: string
  readonly done: Promise<T>
  snapshot(): TaskSnapshot
}

export interface TaskActivityOptions<T> {
  readonly scope: string
  readonly key: string
  readonly title: string
  readonly item?: string
  readonly meta?: Record<string, unknown>
  readonly signal?: AbortSignal
  readonly isSuccessful?: (result: T) => boolean
  readonly retry?: TaskRetryDescriptor
  readonly retryOf?: string
}

export interface BoundedQueue {
  readonly name: string
  readonly concurrency: number
  enqueue<T>(fn: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T>
  pendingCount(): number
  activeCount(): number
  dispose(): void
}

export interface WorkerRunOptions<TInput = unknown> {
  readonly workerPath: string
  readonly input: TInput
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
  readonly onProgress?: (payload: unknown) => void
}

/**
 * Host Cordis service (`ctx.folioTasks`) provided by `@folio/base-tasks-host`.
 * Manages bounded concurrency queues, Node worker_threads execution,
 * cooperative pause/resume/stop/cancel, item-level retry and throttled SSE
 * progress broadcasting.
 */
export interface FolioTasksService {
  createQueue(options?: { readonly name?: string; readonly concurrency?: number }): BoundedQueue
  runWorker<TOutput = unknown, TInput = unknown>(
    options: WorkerRunOptions<TInput>,
  ): Promise<TOutput>
  enqueue<T = unknown>(options: TaskEnqueueOptions<T>): TaskHandle<T>
  observe<T>(options: TaskActivityOptions<T>, operation: () => Promise<T>): Promise<T>
  listTasks(scope?: string): readonly TaskSnapshot[]
  getTask(id: string): TaskSnapshot | undefined
  listTaskItems(taskId: string, query?: TaskItemQuery): TaskItemPage
  pauseTask(id: string): TaskSnapshot
  resumeTask(id: string): Promise<TaskSnapshot>
  stopTask(id: string): TaskSnapshot
  cancelTask(id: string): TaskSnapshot
  retryTaskItems(taskId: string, itemKeys?: readonly string[]): Promise<TaskRetryResult>
  registerRetryHandler(handler: TaskRetryHandler): () => void
  clearFinished(scope?: string): number
}

export function observeTask<T>(
  tasks: FolioTasksService | undefined,
  options: TaskActivityOptions<T>,
  operation: () => Promise<T>,
): Promise<T> {
  return tasks ? tasks.observe(options, operation) : operation()
}

export function emptyTaskItemSummary(): TaskItemSummary {
  return {
    total: 0,
    pending: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
  }
}
