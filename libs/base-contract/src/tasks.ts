export type TaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface TaskProgress {
  readonly current: number
  readonly total: number | null
  readonly message?: string
  readonly detail?: Record<string, unknown>
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
}

export interface TaskRunHelpers {
  readonly taskId: string
  readonly signal: AbortSignal
  reportProgress(progress: TaskProgress): void
  waitIfPaused(): Promise<void>
  isPaused(): boolean
  throwIfAborted(): void
}

export interface TaskEnqueueOptions<T = unknown> {
  readonly scope: string
  readonly title: string
  readonly queue?: string
  readonly concurrency?: number
  readonly pausable?: boolean
  readonly cancellable?: boolean
  readonly meta?: Record<string, unknown>
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
 * cooperative pause/resume/cancel, and throttled SSE progress broadcasting.
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
  pauseTask(id: string): TaskSnapshot
  resumeTask(id: string): TaskSnapshot
  cancelTask(id: string): TaskSnapshot
  clearFinished(scope?: string): number
}

export function observeTask<T>(
  tasks: FolioTasksService | undefined,
  options: TaskActivityOptions<T>,
  operation: () => Promise<T>,
): Promise<T> {
  return tasks ? tasks.observe(options, operation) : operation()
}
