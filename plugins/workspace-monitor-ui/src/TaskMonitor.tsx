import * as React from 'react'
import type { TaskSnapshot, TaskStatus } from '@folio/base-contract'
import { Badge, Button, Input, cn, formatDateTime } from '@folio/base-ui-kit/client'
import { useFolioTasks } from '@folio/base-tasks-ui/client'
import { Activity, ChevronRight, CircleAlert, Search } from 'lucide-react'

const workspaceNames: Record<string, string> = {
  projects: '项目库',
  files: '文件浏览器',
  canvas: '画板',
  materials: '物料',
  thumbs: '共享缩略图',
}

const statusLabels: Record<TaskStatus, string> = {
  queued: '排队中',
  running: '进行中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

interface ProjectResult {
  readonly projectId: string
  readonly projectName: string
  readonly status?: TaskStatus
  readonly error?: string
}

function getWorkspace(task: TaskSnapshot): string {
  if (typeof task.meta?.workspaceId === 'string') return task.meta.workspaceId
  if (task.scope === 'thumbs-eagle') return task.meta?.projectId ? 'projects' : 'thumbs'
  return task.scope
}

function readProjectResults(task: TaskSnapshot): readonly ProjectResult[] {
  const items = task.progress.detail?.projects
  return Array.isArray(items) ? items as readonly ProjectResult[] : []
}

function getProjectResults(task: TaskSnapshot): readonly ProjectResult[] {
  const items = readProjectResults(task)
  if (items.length > 0) return items
  const { projectId, projectName } = task.meta ?? {}
  if (typeof projectId !== 'string') return []
  return [{ projectId, projectName: typeof projectName === 'string' ? projectName : projectId }]
}

function failedItems(task: TaskSnapshot): number {
  const count = task.progress.detail?.failed
  return typeof count === 'number' ? count : 0
}

function isActive(task: TaskSnapshot): boolean {
  return task.status === 'queued' || task.status === 'running' || task.status === 'paused'
}

const filterClass = 'h-9 min-w-28 rounded-md border bg-background px-2.5 text-sm'

export function TaskMonitor({ compact = false }: { readonly compact?: boolean }): React.ReactElement {
  const { tasks, loading, error, pauseTask, resumeTask, cancelTask } = useFolioTasks({ scopes: 'all' })
  const [workspace, setWorkspace] = React.useState('')
  const [projectId, setProjectId] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [actionError, setActionError] = React.useState<string | null>(null)

  const workspaces = new Map(Object.entries(workspaceNames).map(([id, label]) => [
    id, { label, active: 0, issues: 0 },
  ]))
  const projectOptions = new Map<string, string>()
  let activeCount = 0
  let completedCount = 0
  let issueCount = 0
  for (const task of tasks) {
    const id = getWorkspace(task)
    const row = workspaces.get(id) ?? { label: id, active: 0, issues: 0 }
    if (isActive(task)) {
      activeCount += 1
      row.active += 1
    }
    if (task.status === 'completed' && failedItems(task) === 0) completedCount += 1
    if (task.status === 'failed' || failedItems(task) > 0) {
      issueCount += 1
      row.issues += 1
    }
    workspaces.set(id, row)
    if (workspace && id !== workspace) continue
    for (const project of getProjectResults(task)) {
      if (!projectOptions.has(project.projectId) || project.projectName !== project.projectId) {
        projectOptions.set(project.projectId, project.projectName)
      }
    }
  }
  const needle = query.trim().toLowerCase()
  const activeProjectId = projectOptions.has(projectId) ? projectId : ''
  const visible = tasks.filter(task => {
    if (workspace && getWorkspace(task) !== workspace) return false
    const projects = getProjectResults(task)
    if (activeProjectId && !projects.some(project => project.projectId === activeProjectId)) return false
    if (statusFilter === 'issues' && task.status !== 'failed' && failedItems(task) === 0) return false
    if (statusFilter && statusFilter !== 'issues' && task.status !== statusFilter) return false
    return !needle || [
      task.title, task.queue, task.error, task.progress.message,
      ...projects.map(project => project.projectName),
    ].some(value => value?.toLowerCase().includes(needle))
  }).sort((a, b) => Number(isActive(b)) - Number(isActive(a)))

  const runAction = async (action: (id: string) => Promise<void>, id: string): Promise<void> => {
    setActionError(null)
    try {
      await action(id)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '任务操作失败')
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
          <div className="flex flex-wrap gap-2 text-xs" aria-label="任务总览">
            <Badge variant="outline">活跃 {activeCount}</Badge>
            <Badge variant="outline">已完成 {completedCount}</Badge>
            <Badge variant="outline">有失败 {issueCount}</Badge>
          </div>
        </header>

        <nav aria-label="按工作区筛选" className={cn('grid grid-cols-2 gap-2', compact ? 'min-[640px]:grid-cols-3' : 'sm:grid-cols-3 xl:grid-cols-6')}>
          {[['', { label: '全部工作区', active: activeCount, issues: issueCount }] as const, ...workspaces].map(
            ([id, row]) => (
              <button
                key={id}
                type="button"
                aria-pressed={workspace === id}
                onClick={() => {
                  setWorkspace(id)
                  setProjectId('')
                }}
                className={cn(
                  'flex min-w-0 flex-col gap-1 rounded-lg border px-3 py-2 text-left hover:bg-muted',
                  workspace === id && 'border-primary/60 bg-primary/5',
                )}
              >
                <span className="truncate text-sm font-medium">{row.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {row.active} 活跃 · {row.issues} 有失败
                </span>
              </button>
            ),
          )}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative grow sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 text-muted-foreground" size={15} />
            <Input aria-label="搜索任务" placeholder="搜索任务或项目" className="pl-8" value={query} onChange={e => setQuery(e.target.value)} />
          </label>
          <select aria-label="项目" className={filterClass} value={activeProjectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">全部项目</option>
            {[...projectOptions].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select aria-label="任务状态" className={filterClass} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            <option value="issues">有失败</option>
            {Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <span className="ml-auto text-xs text-muted-foreground">{visible.length} 项任务</span>
        </div>
        {error || actionError ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <CircleAlert size={15} /> {actionError ?? error}
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
              projectId={activeProjectId}
              onPause={() => void runAction(pauseTask, task.id)}
              onResume={() => void runAction(resumeTask, task.id)}
              onCancel={() => void runAction(cancelTask, task.id)}
            />
          ))}
        </section>
      </div>
    </main>
  )
}

function TaskRow({ task, projectId, onPause, onResume, onCancel }: {
  readonly task: TaskSnapshot
  readonly projectId: string
  readonly onPause: () => void
  readonly onResume: () => void
  readonly onCancel: () => void
}): React.ReactElement {
  const { current, total, message, detail } = task.progress
  const progress = total && total > 0 ? Math.max(0, Math.min(100, Math.round(current / total * 100))) : null
  const partial = task.status === 'completed' && failedItems(task) > 0
  const label = partial ? (detail?.succeeded === 0 ? '子项失败' : '部分失败') : statusLabels[task.status]
  const failure = task.error ?? (typeof detail?.lastError === 'string' ? detail.lastError : null)
  const projects = readProjectResults(task).filter(project => !projectId || project.projectId === projectId)
  return (
    <details className="group px-3 py-2.5 sm:px-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 sm:gap-3">
        <ChevronRight size={15} className="shrink-0 group-open:rotate-90" aria-hidden="true" />
        <div className="min-w-36 flex-1">
          <div className="break-words text-sm font-medium">{task.title}</div>
          {message ? <div className="break-words text-xs text-muted-foreground">{message}</div> : null}
        </div>
        {progress !== null ? (
          <div className="flex w-32 items-center gap-2">
            <progress aria-label={`${task.title}进度`} value={progress} max={100} className="h-1.5 min-w-0 flex-1 accent-primary" />
            <span className="text-xs tabular-nums">{progress}%</span>
          </div>
        ) : null}
        <Badge variant={partial || task.status === 'failed' ? 'destructive' : 'outline'}>
          {label}
        </Badge>
        {failure ? <p className="basis-full break-words pl-7 text-xs text-destructive">{failure}</p> : null}
      </summary>
      <div className="space-y-3 py-3 pl-6">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{workspaceNames[getWorkspace(task)] ?? getWorkspace(task)}</span>
          <span>更新于 {formatDateTime(task.updatedAt)}</span>
          {total !== null ? <span>进度 {current}/{total}</span> : null}
          {typeof detail?.succeeded === 'number' ? <span>成功 {detail.succeeded}</span> : null}
          {typeof detail?.failed === 'number' ? <span>失败 {detail.failed}</span> : null}
          {typeof detail?.cancelled === 'number' ? <span>取消 {detail.cancelled}</span> : null}
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
        {isActive(task) ? (
          <div className="flex gap-2">
            {task.pausable && task.status !== 'paused' ? <Button size="sm" variant="outline" onClick={onPause}>暂停</Button> : null}
            {task.status === 'paused' ? <Button size="sm" variant="outline" onClick={onResume}>恢复</Button> : null}
            {task.cancellable ? <Button size="sm" variant="outline" onClick={onCancel}>取消任务</Button> : null}
          </div>
        ) : null}
      </div>
    </details>
  )
}
