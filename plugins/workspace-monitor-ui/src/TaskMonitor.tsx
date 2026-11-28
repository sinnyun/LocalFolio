import * as React from 'react'
import type {
  TaskItemSummary,
  TaskSnapshot,
  TaskStatus,
} from '@folio/base-contract'
import { Badge, Button, Input, cn, formatDateTime } from '@folio/base-ui-kit/client'
import { useFolioTasks } from '@folio/base-tasks-ui/client'
import {
  Activity,
  ChevronRight,
  CircleAlert,
  Clock3,
  Pause,
  Play,
  Search,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { TaskItemList } from './components/TaskItemList.js'
import { useMonitorPreferences } from './monitor-state.js'

const workspaceNames: Record<string, string> = {
  projects: '项目库',
  files: '文件浏览器',
  canvas: '画板',
  materials: '物料',
  thumbs: '共享缩略图',
  'thumbs-eagle': 'Eagle 缩略图',
}

const statusLabels: Record<TaskStatus, string> = {
  queued: '排队中',
  running: '进行中',
  paused: '已暂停',
  stopped: '已停止',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
}

const statusTone: Record<TaskStatus, string> = {
  queued: 'text-muted-foreground',
  running: 'text-primary',
  paused: 'text-amber-600 dark:text-amber-400',
  stopped: 'text-amber-600 dark:text-amber-400',
  completed: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-destructive',
  cancelled: 'text-muted-foreground',
  interrupted: 'text-amber-600 dark:text-amber-400',
}

interface ProjectResult {
  readonly projectId: string
  readonly projectName: string
  readonly status?: TaskStatus
  readonly error?: string
}

const filterClass = 'h-9 min-w-28 rounded-md border bg-background px-2.5 text-sm'

function isActive(task: TaskSnapshot): boolean {
  return task.status === 'queued' || task.status === 'running' || task.status === 'paused'
}

function isResumable(task: TaskSnapshot): boolean {
  return Boolean(task.resumable) && (task.status === 'stopped' || task.status === 'interrupted' || task.status === 'paused')
}

function getWorkspace(task: TaskSnapshot): string {
  if (typeof task.meta?.workspaceId === 'string') return task.meta.workspaceId
  if (task.scope === 'thumbs-eagle') return task.meta?.projectId ? 'projects' : 'thumbs-eagle'
  return task.scope
}

function getProjectResults(task: TaskSnapshot): readonly ProjectResult[] {
  const items = task.progress.detail?.projects
  if (Array.isArray(items)) return items as readonly ProjectResult[]
  const { projectId, projectName } = task.meta ?? {}
  if (typeof projectId !== 'string') return []
  return [{ projectId, projectName: typeof projectName === 'string' ? projectName : projectId }]
}

function fallbackSummary(task: TaskSnapshot): TaskItemSummary {
  const { current, total, detail } = task.progress
  const succeeded = typeof detail?.succeeded === 'number' ? detail.succeeded : 0
  const failed = typeof detail?.failed === 'number' ? detail.failed : 0
  const cancelled = typeof detail?.cancelled === 'number' ? detail.cancelled : 0
  const skipped = typeof detail?.skipped === 'number' ? detail.skipped : 0
  const resolvedTotal = total ?? Math.max(current, succeeded + failed + cancelled + skipped)
  const pending = Math.max(0, resolvedTotal - succeeded - failed - cancelled - skipped)
  return {
    total: resolvedTotal,
    pending,
    running: 0,
    succeeded,
    failed,
    cancelled,
    skipped,
  }
}

function summaryOf(task: TaskSnapshot): TaskItemSummary {
  return task.items ?? fallbackSummary(task)
}

function failedItems(task: TaskSnapshot): number {
  return summaryOf(task).failed
}

function processedCount(summary: TaskItemSummary): number {
  return summary.succeeded + summary.failed + summary.cancelled + summary.skipped
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 秒'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest > 0 ? `${minutes} 分 ${rest} 秒` : `${minutes} 分`
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  return remainMinutes > 0 ? `${hours} 小时 ${remainMinutes} 分` : `${hours} 小时`
}

function taskEta(task: TaskSnapshot, summary: TaskItemSummary, now: number): number | null {
  if (task.status !== 'running' || task.startedAt === null) return null
  const processed = processedCount(summary)
  if (processed <= 0 || summary.total <= processed) return null
  const elapsed = Math.max(1, now - task.startedAt)
  const rate = processed / elapsed
  if (rate <= 0) return null
  return (summary.total - processed) / rate
}

function statusBadge(task: TaskSnapshot): React.ReactElement {
  const summary = summaryOf(task)
  const partial = task.status === 'completed' && summary.failed > 0
  const variant =
    task.status === 'failed' || partial
      ? 'destructive'
      : task.status === 'completed'
        ? 'outline'
        : 'outline'
  return (
    <Badge variant={variant} className={cn('shrink-0', statusTone[task.status])}>
      {partial ? (summary.succeeded === 0 ? '子项失败' : '部分失败') : statusLabels[task.status]}
    </Badge>
  )
}

function SegmentedProgress({ summary }: { readonly summary: TaskItemSummary }): React.ReactElement {
  const total = Math.max(1, summary.total)
  const segments = [
    { key: 'succeeded', value: summary.succeeded, className: 'bg-emerald-500' },
    { key: 'failed', value: summary.failed, className: 'bg-destructive' },
    { key: 'skipped', value: summary.skipped, className: 'bg-muted-foreground/50' },
    { key: 'cancelled', value: summary.cancelled, className: 'bg-amber-500' },
    { key: 'running', value: summary.running, className: 'bg-primary/60' },
  ] as const
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="flex h-full w-full">
        {segments.map(segment =>
          segment.value > 0 ? (
            <span
              key={segment.key}
              className={segment.className}
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
    </div>
  )
}

export function TaskMonitor({ compact = false }: { readonly compact?: boolean }): React.ReactElement {
  const {
    tasks,
    loading,
    error,
    pauseTask,
    resumeTask,
    stopTask,
    cancelTask,
    retryTaskItems,
    clearFinishedTasks,
  } = useFolioTasks({ scopes: 'all' })
  const { preferences, update, toggleExpanded } = useMonitorPreferences()
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [busyTaskId, setBusyTaskId] = React.useState<string | null>(null)
  const [now, setNow] = React.useState(() => Date.now())

  const anyActive = React.useMemo(() => tasks.some(isActive), [tasks])
  React.useEffect(() => {
    if (!anyActive) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [anyActive])

  const workspaces = new Map<string, { label: string; active: number; issues: number; resumable: number }>()
  const projectOptions = new Map<string, string>()
  let activeCount = 0
  let completedCount = 0
  let issueCount = 0
  let resumableCount = 0

  for (const task of tasks) {
    const id = getWorkspace(task)
    const row = workspaces.get(id) ?? { label: workspaceNames[id] ?? id, active: 0, issues: 0, resumable: 0 }
    if (isActive(task)) {
      activeCount += 1
      row.active += 1
    }
    if (task.status === 'completed' && failedItems(task) === 0) completedCount += 1
    if (task.status === 'failed' || failedItems(task) > 0) {
      issueCount += 1
      row.issues += 1
    }
    if (isResumable(task)) {
      resumableCount += 1
      row.resumable += 1
    }
    workspaces.set(id, row)
    if (preferences.workspace && id !== preferences.workspace) continue
    for (const project of getProjectResults(task)) {
      if (!projectOptions.has(project.projectId) || project.projectName !== project.projectId) {
        projectOptions.set(project.projectId, project.projectName)
      }
    }
  }

  const activeProjectId = projectOptions.has(preferences.projectId) ? preferences.projectId : ''
  const needle = preferences.query.trim().toLowerCase()
  const visible = tasks
    .filter(task => {
      if (preferences.workspace && getWorkspace(task) !== preferences.workspace) return false
      const projects = getProjectResults(task)
      if (activeProjectId && !projects.some(project => project.projectId === activeProjectId)) return false
      if (preferences.statusFilter === 'issues') {
        if (task.status !== 'failed' && failedItems(task) === 0) return false
      } else if (preferences.statusFilter === 'active') {
        if (!isActive(task)) return false
      } else if (preferences.statusFilter === 'resumable') {
        if (!isResumable(task)) return false
      } else if (preferences.statusFilter && task.status !== preferences.statusFilter) {
        return false
      }
      return (
        !needle ||
        [
          task.title,
          task.queue,
          task.error,
          task.progress.message,
          ...projects.map(project => project.projectName),
        ].some(value => value?.toLowerCase().includes(needle))
      )
    })
    .sort((a, b) => {
      const rank = (task: TaskSnapshot): number =>
        isActive(task) ? 0 : task.status === 'stopped' || task.status === 'interrupted' ? 1 : 2
      const diff = rank(a) - rank(b)
      if (diff !== 0) return diff
      return b.updatedAt - a.updatedAt
    })

  const runAction = async (
    taskId: string,
    action: (id: string) => Promise<unknown>,
    label: string,
  ): Promise<void> => {
    setActionError(null)
    setNotice(null)
    setBusyTaskId(taskId)
    try {
      await action(taskId)
      setNotice(`${label}已提交`)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `${label}失败`)
    } finally {
      setBusyTaskId(null)
    }
  }

  const runRetry = async (task: TaskSnapshot, itemKeys?: readonly string[]): Promise<void> => {
    setActionError(null)
    setNotice(null)
    setBusyTaskId(task.id)
    try {
      const result = await retryTaskItems(task.id, itemKeys)
      if (result.retried === 0) {
        setNotice('没有可重试的子项')
      } else if (result.task) {
        setNotice(`已提交 ${result.retried} 个重试项，新任务：${result.task.title}`)
      } else {
        setNotice(`已提交 ${result.retried} 个重试项`)
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '重试子项失败')
      throw err
    } finally {
      setBusyTaskId(null)
    }
  }

  return (
    <main className="h-full min-h-0 overflow-auto bg-background text-foreground">
      <div className={cn('mx-auto flex max-w-7xl flex-col', compact ? 'gap-3 p-3' : 'gap-5 p-4 sm:p-6')}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          {compact ? null : (
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Activity size={20} aria-hidden="true" /> 任务监控
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="任务总览">
            <Badge variant="outline">活跃 {activeCount}</Badge>
            <Badge variant="outline">待继续 {resumableCount}</Badge>
            <Badge variant="outline">有失败 {issueCount}</Badge>
            <Badge variant="outline">已完成 {completedCount}</Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={
                !tasks.some(
                  task =>
                    task.status === 'completed' ||
                    task.status === 'failed' ||
                    task.status === 'cancelled',
                )
              }
              onClick={() => {
                setActionError(null)
                void clearFinishedTasks()
                  .then(() => setNotice('已清理历史任务'))
                  .catch(err => setActionError(err instanceof Error ? err.message : '清理失败'))
              }}
            >
              <Trash2 size={12} /> 清理历史
            </Button>
          </div>
        </header>

        <nav
          aria-label="按工作区筛选"
          className={cn(
            'grid grid-cols-2 gap-2',
            compact ? 'min-[640px]:grid-cols-3' : 'sm:grid-cols-3 xl:grid-cols-6',
          )}
        >
          {[
            ['', { label: '全部工作区', active: activeCount, issues: issueCount, resumable: resumableCount }] as const,
            ...workspaces,
          ].map(([id, row]) => (
            <button
              key={id}
              type="button"
              aria-pressed={preferences.workspace === id}
              onClick={() => update({ workspace: id, projectId: '' })}
              className={cn(
                'flex min-w-0 flex-col gap-1 rounded-lg border px-3 py-2 text-left hover:bg-muted',
                preferences.workspace === id && 'border-primary/60 bg-primary/5',
              )}
            >
              <span className="truncate text-sm font-medium">{row.label}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {row.active} 活跃 · {row.issues} 有失败
                {row.resumable > 0 ? ` · ${row.resumable} 待继续` : ''}
              </span>
            </button>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative grow sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 text-muted-foreground" size={15} />
            <Input
              aria-label="搜索任务"
              placeholder="搜索任务或项目"
              className="pl-8"
              value={preferences.query}
              onChange={event => update({ query: event.target.value })}
            />
          </label>
          <select
            aria-label="项目"
            className={filterClass}
            value={activeProjectId}
            onChange={event => update({ projectId: event.target.value })}
          >
            <option value="">全部项目</option>
            {[...projectOptions].map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="任务状态"
            className={filterClass}
            value={preferences.statusFilter}
            onChange={event => update({ statusFilter: event.target.value })}
          >
            <option value="">全部状态</option>
            <option value="active">进行中</option>
            <option value="issues">有失败</option>
            <option value="resumable">待继续</option>
            {Object.entries(statusLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-muted-foreground">{visible.length} 项任务</span>
        </div>

        {error || actionError ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <CircleAlert size={15} /> {actionError ?? error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            {notice}
          </p>
        ) : null}

        <section aria-label="任务列表" className="divide-y rounded-lg border">
          {visible.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {loading ? '正在读取后台任务…' : '没有符合筛选条件的后台任务。'}
            </p>
          ) : null}
          {visible.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              now={now}
              projectId={activeProjectId}
              expanded={preferences.expanded.includes(task.id)}
              busy={busyTaskId === task.id}
              retries={tasks.filter(candidate => candidate.retryOf === task.id)}
              parentTitle={
                task.retryOf
                  ? tasks.find(candidate => candidate.id === task.retryOf)?.title ?? task.retryOf
                  : null
              }
              onToggle={() => toggleExpanded(task.id)}
              onPause={() => void runAction(task.id, pauseTask, '暂停')}
              onResume={() => void runAction(task.id, resumeTask, '继续')}
              onStop={() => void runAction(task.id, stopTask, '停止')}
              onCancel={() => void runAction(task.id, cancelTask, '取消')}
              onRetry={keys => runRetry(task, keys)}
            />
          ))}
        </section>
      </div>
    </main>
  )
}

interface TaskRowProps {
  readonly task: TaskSnapshot
  readonly now: number
  readonly projectId: string
  readonly expanded: boolean
  readonly busy: boolean
  readonly retries: readonly TaskSnapshot[]
  readonly parentTitle: string | null
  readonly onToggle: () => void
  readonly onPause: () => void
  readonly onResume: () => void
  readonly onStop: () => void
  readonly onCancel: () => void
  readonly onRetry: (itemKeys?: readonly string[]) => Promise<void>
}

function TaskRow({
  task,
  now,
  projectId,
  expanded,
  busy,
  retries,
  parentTitle,
  onToggle,
  onPause,
  onResume,
  onStop,
  onCancel,
  onRetry,
}: TaskRowProps): React.ReactElement {
  const summary = summaryOf(task)
  const processed = processedCount(summary)
  const percent = summary.total > 0 ? Math.min(100, Math.round((processed / summary.total) * 100)) : null
  const partial = task.status === 'completed' && summary.failed > 0
  const failure = task.error ?? (typeof task.progress.detail?.lastError === 'string' ? task.progress.detail.lastError : null)
  const projects = getProjectResults(task).filter(project => !projectId || project.projectId === projectId)
  const elapsedBase = task.finishedAt ?? now
  const elapsed = task.startedAt !== null ? elapsedBase - task.startedAt : now - task.createdAt
  const eta = taskEta(task, summary, now)
  const retryAllCount =
    summary.failed +
    summary.cancelled +
    (task.status === 'failed' ? summary.pending : 0)
  const active = isActive(task)

  return (
    <article className="px-3 py-2.5 sm:px-4">
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-2 text-left sm:gap-3"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <ChevronRight
          size={15}
          className={cn('shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
          aria-hidden="true"
        />
        <div className="min-w-36 flex-1">
          <div className="break-words text-sm font-medium">{task.title}</div>
          {task.progress.message ? (
            <div className="break-words text-xs text-muted-foreground">{task.progress.message}</div>
          ) : null}
        </div>
        <div className="w-36 shrink-0 space-y-1">
          <SegmentedProgress summary={summary} />
          <div className="flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
            <span>{percent !== null ? `${percent}%` : '—'}</span>
            <span>
              {processed}/{summary.total || '?'}
            </span>
          </div>
        </div>
        {statusBadge(task)}
      </button>
      {failure ? (
        <p
          className={cn(
            'mt-1 break-words pl-7 text-xs',
            task.status === 'failed' ? 'text-destructive' : 'text-amber-600 dark:text-amber-400',
          )}
        >
          {failure}
        </p>
      ) : null}

      {expanded ? (
        <div className="space-y-3 py-3 pl-6">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{workspaceNames[getWorkspace(task)] ?? getWorkspace(task)}</span>
            <span className="tabular-nums">队列 {task.queue}</span>
            <span>创建于 {formatDateTime(task.createdAt)}</span>
            <span>更新于 {formatDateTime(task.updatedAt)}</span>
            {task.startedAt !== null ? (
              <span className="inline-flex items-center gap-1">
                <Clock3 size={11} /> 耗时 {formatDuration(elapsed)}
              </span>
            ) : null}
            {eta !== null ? <span>预计剩余 {formatDuration(eta)}</span> : null}
            {summary.succeeded > 0 ? <span>成功 {summary.succeeded}</span> : null}
            {summary.failed > 0 ? <span className="text-destructive">失败 {summary.failed}</span> : null}
            {summary.pending > 0 ? <span>待处理 {summary.pending}</span> : null}
            {summary.running > 0 ? <span>处理中 {summary.running}</span> : null}
            {summary.cancelled > 0 ? <span>取消 {summary.cancelled}</span> : null}
            {summary.skipped > 0 ? <span>跳过 {summary.skipped}</span> : null}
          </div>

          {parentTitle || retries.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {parentTitle ? `由任务「${parentTitle}」重试产生` : null}
              {parentTitle && retries.length > 0 ? ' · ' : null}
              {retries.length > 0 ? `已产生 ${retries.length} 个重试任务` : null}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {active && task.pausable && task.status !== 'paused' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                title="暂停后不再启动新子项，可继续"
                onClick={onPause}
              >
                <Pause size={13} /> 暂停
              </Button>
            ) : null}
            {task.status === 'paused' || (isResumable(task) && !active) ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                title="继续处理未完成项"
                onClick={onResume}
              >
                <Play size={13} /> 继续
              </Button>
            ) : null}
            {active && task.cancellable ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                title="停止当前子项并保留未完成项，可稍后继续"
                onClick={onStop}
              >
                <Square size={13} /> 停止
              </Button>
            ) : null}
            {active && task.cancellable ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                title="取消任务并丢弃未完成项，不可继续"
                onClick={onCancel}
              >
                <X size={13} /> 取消任务
              </Button>
            ) : null}
            {!active && task.retryable && retryAllCount > 0 ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void onRetry().catch(() => {})}
              >
                重试全部失败（{retryAllCount}）
              </Button>
            ) : null}
            {partial ? (
              <span className="self-center text-xs text-destructive">
                {summary.failed} 个子项失败
                {task.items
                  ? '，可展开单独或批量重试'
                  : '；该任务只有聚合计数（通常来自旧版本宿主），重启应用后新任务会记录每个失败子项'}
              </span>
            ) : null}
          </div>

          {projects.length > 0 ? (
            <ul className="max-h-60 divide-y overflow-auto rounded-md border text-xs">
              {projects.map(project => (
                <li key={project.projectId} className="flex flex-wrap gap-x-3 px-2 py-1.5">
                  <span className="font-medium">{project.projectName}</span>
                  {project.status ? <span>{statusLabels[project.status]}</span> : null}
                  {project.error ? <span className="break-words text-destructive">{project.error}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {task.items ? (
            <TaskItemList task={task} retrying={busy} onRetry={onRetry} />
          ) : (
            <p className="text-xs text-muted-foreground">
              {summary.failed > 0
                ? '该任务没有子项明细，无法按文件重试；重启应用后新任务会记录每个失败子项。'
                : '该任务没有子项明细；失败原因见上方错误信息。'}
            </p>
          )}
        </div>
      ) : null}
    </article>
  )
}
