import * as React from 'react'
import type { TaskSnapshot } from '@folio/base-contract'
import { cn } from '@folio/base-ui-kit/client'
import { Pause, Play, Square, X } from 'lucide-react'

export interface TaskStatusBarProps {
  readonly tasks: readonly TaskSnapshot[]
  readonly activeTask: TaskSnapshot | null
  readonly recentFinishedTask?: TaskSnapshot | null
  readonly onPause: (taskId: string) => void | Promise<unknown>
  readonly onResume: (taskId: string) => void | Promise<unknown>
  readonly onCancel: (taskId: string) => void | Promise<unknown>
  readonly onClearFinished: () => void | Promise<unknown>
  readonly idleContent?: React.ReactNode
  readonly className?: string
}

function isRunningTask(task: TaskSnapshot | null | undefined): task is TaskSnapshot {
  return (
    task !== null &&
    task !== undefined &&
    (task.status === 'queued' || task.status === 'running' || task.status === 'paused')
  )
}

function isTerminalTask(task: TaskSnapshot | null | undefined): task is TaskSnapshot {
  return (
    task !== null &&
    task !== undefined &&
    (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')
  )
}

export function TaskStatusBar({
  tasks,
  activeTask,
  recentFinishedTask,
  onPause,
  onResume,
  onCancel,
  onClearFinished,
  idleContent,
  className,
}: TaskStatusBarProps): React.ReactElement {
  if (isRunningTask(activeTask)) {
    const { current, total, message } = activeTask.progress
    const pct =
      total !== null && total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null

    return (
      <div
        data-lf-task-status-bar=""
        data-state="active"
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden whitespace-nowrap',
          className,
        )}
      >
        <span className="truncate font-medium text-foreground">{activeTask.title}</span>
        {pct !== null ? (
          <div className="flex items-center gap-1.5">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="tabular-nums text-[11px]">{pct}%</span>
          </div>
        ) : null}
        {message ? <span className="truncate text-muted-foreground">{message}</span> : null}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {activeTask.pausable ? (
            activeTask.status === 'paused' ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-muted hover:text-foreground"
                onClick={() => void onResume(activeTask.id)}
              >
                <Play size={11} />
                恢复
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-muted hover:text-foreground"
                onClick={() => void onPause(activeTask.id)}
              >
                <Pause size={11} />
                暂停
              </button>
            )
          ) : null}
          {activeTask.cancellable ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-destructive hover:bg-muted"
              onClick={() => void onCancel(activeTask.id)}
            >
              <Square size={11} />
              取消
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  const finishedTask =
    recentFinishedTask !== undefined
      ? recentFinishedTask
      : (tasks.find(isTerminalTask) ?? (isTerminalTask(activeTask) ? activeTask : null))

  return (
    <div
      data-lf-task-status-bar=""
      data-state="idle"
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap',
        className,
      )}
    >
      {idleContent}
      {finishedTask ? (
        <div className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px]">
          <span className="truncate text-muted-foreground">
            最近任务：{finishedTask.title}（
            {finishedTask.status === 'completed'
              ? '已完成'
              : finishedTask.status === 'cancelled'
                ? '已取消'
                : '失败'}
            ）
          </span>
          <button
            type="button"
            className="rounded p-0.5 hover:bg-muted hover:text-foreground"
            title="清除已完成任务提示"
            aria-label="清除已完成任务提示"
            onClick={() => void onClearFinished()}
          >
            <X size={11} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
