import * as React from 'react'
import type { RuntimeTopicEvent, TaskSnapshot, TaskStatus } from '@folio/base-contract'
import { rpcCall } from '@folio/base-contract/rpc'

const TOPIC_EVENT_NAME = 'folio:topic'
const ACTIVE_STATUSES = new Set<TaskStatus>(['queued', 'running', 'paused'])
const TERMINAL_STATUSES = new Set<TaskStatus>(['completed', 'failed', 'cancelled'])

function sortTasksDesc(list: readonly TaskSnapshot[]): TaskSnapshot[] {
  return [...list].sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
    return b.createdAt - a.createdAt
  })
}

function upsertTask(list: readonly TaskSnapshot[], snap: TaskSnapshot): TaskSnapshot[] {
  const map = new Map<string, TaskSnapshot>()
  for (const item of list) {
    map.set(item.id, item)
  }
  map.set(snap.id, snap)
  return sortTasksDesc(Array.from(map.values()))
}

function mergeFetchedTasks(
  prev: readonly TaskSnapshot[],
  fetched: readonly TaskSnapshot[],
  scopeSet: ReadonlySet<string>,
): TaskSnapshot[] {
  const byId = new Map<string, TaskSnapshot>()
  for (const task of fetched) {
    const existing = byId.get(task.id)
    if (!existing || task.updatedAt >= existing.updatedAt) {
      byId.set(task.id, task)
    }
  }
  for (const task of prev) {
    if (!scopeSet.has(task.scope)) continue
    const fromFetch = byId.get(task.id)
    if (!fromFetch || task.updatedAt >= fromFetch.updatedAt) {
      byId.set(task.id, task)
    }
  }
  return sortTasksDesc(Array.from(byId.values()))
}

export interface UseFolioTasksOptions {
  readonly scopes: readonly string[]
  readonly enabled?: boolean
  readonly onTaskUpdated?: (task: TaskSnapshot) => void
  readonly onTaskCompleted?: (task: TaskSnapshot) => void
}

export interface UseFolioTasksResult {
  readonly tasks: readonly TaskSnapshot[]
  readonly activeTask: TaskSnapshot | null
  readonly recentFinishedTask: TaskSnapshot | null
  trackTask(snapshot: TaskSnapshot): void
  pauseTask(taskId: string): Promise<void>
  resumeTask(taskId: string): Promise<void>
  cancelTask(taskId: string): Promise<void>
  clearFinishedTasks(scope?: string): Promise<void>
}

export function useFolioTasks(options: UseFolioTasksOptions): UseFolioTasksResult {
  const { scopes, enabled = true, onTaskUpdated, onTaskCompleted } = options
  const [tasks, setTasks] = React.useState<TaskSnapshot[]>([])

  const onTaskUpdatedRef = React.useRef(onTaskUpdated)
  onTaskUpdatedRef.current = onTaskUpdated
  const onTaskCompletedRef = React.useRef(onTaskCompleted)
  onTaskCompletedRef.current = onTaskCompleted

  const scopesKey = scopes.map(s => s.trim()).filter(Boolean).join('\0')
  const normalizedScopes = React.useMemo(
    () => (scopesKey ? Array.from(new Set(scopesKey.split('\0'))) : []),
    [scopesKey],
  )
  const normalizedScopesRef = React.useRef(normalizedScopes)
  normalizedScopesRef.current = normalizedScopes

  // Initial load for all declared scopes
  React.useEffect(() => {
    if (!enabled) return undefined
    if (normalizedScopes.length === 0) {
      setTasks([])
      return undefined
    }

    let active = true
    const scopeSet = new Set(normalizedScopes)

    void Promise.all(
      normalizedScopes.map(scope =>
        rpcCall<{ tasks: TaskSnapshot[] }>('tasks.list', { scope }).catch(() => ({
          tasks: [] as TaskSnapshot[],
        })),
      ),
    ).then(results => {
      if (!active) return
      const fetched = results.flatMap(r => (Array.isArray(r.tasks) ? r.tasks : []))
      setTasks(prev => mergeFetchedTasks(prev, fetched, scopeSet))
    })

    return () => {
      active = false
    }
  }, [enabled, normalizedScopes])

  // Subscribe to tasks:<scope> and tasks:cleared via window 'folio:topic'
  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined' || normalizedScopes.length === 0) {
      return undefined
    }
    const scopeSet = new Set(normalizedScopes)

    const onTopic = (ev: Event): void => {
      const detail = (ev as CustomEvent<RuntimeTopicEvent>).detail
      if (!detail || typeof detail.topic !== 'string') return

      if (detail.topic === 'tasks:cleared') {
        const payload = detail.payload as { readonly scope?: string } | undefined
        const clearedScope = payload?.scope
        if (!clearedScope) return
        if (clearedScope === '*' || clearedScope === 'all') {
          setTasks(prev => prev.filter(t => !TERMINAL_STATUSES.has(t.status)))
          return
        }
        if (scopeSet.has(clearedScope)) {
          setTasks(prev =>
            prev.filter(t => !(t.scope === clearedScope && TERMINAL_STATUSES.has(t.status))),
          )
        }
        return
      }

      if (detail.topic.startsWith('tasks:')) {
        const topicScope = detail.topic.slice('tasks:'.length)
        if (!scopeSet.has(topicScope)) return
        const snap = detail.payload as TaskSnapshot | undefined
        if (!snap || typeof snap.id !== 'string') return
        setTasks(prev => upsertTask(prev, snap))
        onTaskUpdatedRef.current?.(snap)
        if (snap.status === 'completed') {
          onTaskCompletedRef.current?.(snap)
        }
      }
    }

    window.addEventListener(TOPIC_EVENT_NAME, onTopic)
    return () => {
      window.removeEventListener(TOPIC_EVENT_NAME, onTopic)
    }
  }, [enabled, normalizedScopes])

  const activeTask = React.useMemo(
    () =>
      tasks.find(t => t.status === 'running') ??
      tasks.find(t => t.status === 'paused' || t.status === 'queued') ??
      null,
    [tasks],
  )

  const recentFinishedTask = React.useMemo(
    () => tasks.find(t => TERMINAL_STATUSES.has(t.status)) ?? null,
    [tasks],
  )

  const trackTask = React.useCallback((snapshot: TaskSnapshot) => {
    setTasks(prev => upsertTask(prev, snapshot))
  }, [])

  const pauseTask = React.useCallback(async (taskId: string) => {
    const snap = await rpcCall<TaskSnapshot>('tasks.pause', { id: taskId })
    setTasks(prev => upsertTask(prev, snap))
  }, [])

  const resumeTask = React.useCallback(async (taskId: string) => {
    const snap = await rpcCall<TaskSnapshot>('tasks.resume', { id: taskId })
    setTasks(prev => upsertTask(prev, snap))
  }, [])

  const cancelTask = React.useCallback(async (taskId: string) => {
    const snap = await rpcCall<TaskSnapshot>('tasks.cancel', { id: taskId })
    setTasks(prev => upsertTask(prev, snap))
  }, [])

  const clearFinishedTasks = React.useCallback(async (scope?: string) => {
    const targetScopes = scope ? [scope] : normalizedScopesRef.current
    if (targetScopes.length === 0) return
    await Promise.all(targetScopes.map(s => rpcCall('tasks.clear', { scope: s })))
    const clearedSet = new Set(targetScopes)
    setTasks(prev =>
      prev.filter(t => !(TERMINAL_STATUSES.has(t.status) && clearedSet.has(t.scope))),
    )
  }, [])

  return {
    tasks,
    activeTask,
    recentFinishedTask,
    trackTask,
    pauseTask,
    resumeTask,
    cancelTask,
    clearFinishedTasks,
  }
}

export { ACTIVE_STATUSES, TERMINAL_STATUSES }
