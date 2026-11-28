import type {
  FolioStorageService,
  TaskItem,
  TaskItemSummary,
  TaskRetryDescriptor,
} from '@folio/base-contract'

/** One task as written to `plugins/base-tasks-host/data/tasks.json`. */
export interface PersistedTaskRecord {
  readonly id: string
  readonly scope: string
  readonly queue: string
  readonly title: string
  readonly status: string
  readonly progress: {
    readonly current: number
    readonly total: number | null
    readonly message?: string
    readonly detail?: Record<string, unknown>
  }
  readonly pausable: boolean
  readonly cancellable: boolean
  readonly createdAt: number
  readonly startedAt: number | null
  readonly updatedAt: number
  readonly finishedAt: number | null
  readonly error: string | null
  readonly meta?: Record<string, unknown>
  readonly retry?: TaskRetryDescriptor
  readonly retryOf?: string
  readonly items?: readonly TaskItem[]
  readonly itemSummary?: TaskItemSummary
  readonly itemsTruncated?: boolean
}

export interface PersistedTasksFile {
  readonly version: 1
  readonly savedAt: number
  readonly tasks: readonly PersistedTaskRecord[]
}

export interface TaskLedger {
  load(): Promise<readonly PersistedTaskRecord[]>
  save(records: readonly PersistedTaskRecord[]): Promise<void>
}

const FILE_NAME = 'tasks.json'
const MAX_BYTES = 6 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readTasks(parsed: unknown): readonly PersistedTaskRecord[] {
  if (!isRecord(parsed)) return []
  const tasks = parsed.tasks
  if (!Array.isArray(tasks)) return []
  return tasks.filter(
    (task): task is PersistedTaskRecord =>
      isRecord(task) &&
      typeof task.id === 'string' &&
      typeof task.scope === 'string' &&
      typeof task.title === 'string' &&
      typeof task.status === 'string',
  )
}

/**
 * Persists the task ledger next to the plugin's own data directory. Writes are
 * plain JSON so a partially written file can never corrupt the store beyond
 * being ignored on the next start; `@folio/base-storage-host` writes atomically.
 */
export function createTaskLedger(storage: FolioStorageService): TaskLedger {
  const namespace = storage.forPlugin('base-tasks-host')
  const filePath = namespace.dataPath(FILE_NAME)

  return {
    async load() {
      let raw: string | null = null
      try {
        raw = await namespace.fs.readText(filePath)
      } catch {
        return []
      }
      if (!raw || !raw.trim()) return []
      try {
        return readTasks(JSON.parse(raw) as unknown)
      } catch {
        return []
      }
    },
    async save(records) {
      const payload: PersistedTasksFile = {
        version: 1,
        savedAt: Date.now(),
        tasks: records,
      }
      let text = `${JSON.stringify(payload)}\n`
      if (text.length > MAX_BYTES) {
        // Shrink history rather than fail: keep the newest tasks that fit.
        const kept = [...records]
        while (text.length > MAX_BYTES && kept.length > 1) {
          kept.shift()
          text = `${JSON.stringify({ ...payload, tasks: kept })}\n`
        }
      }
      await namespace.fs.writeText(filePath, text)
    },
  }
}
