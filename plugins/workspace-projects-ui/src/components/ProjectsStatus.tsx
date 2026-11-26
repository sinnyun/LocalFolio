import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import { Pause, Play, Square, X } from 'lucide-react'
import { useProjects } from '../context.js'
import { formatBytes } from '../format.js'

export function ProjectsStatus(_props: FrameViewProps): React.ReactElement {
  const {
    libraries,
    projects,
    selectedProject,
    activeTask,
    pauseTask,
    resumeTask,
    cancelTask,
    clearFinishedTasks,
  } = useProjects()

  const isRunningTask =
    activeTask &&
    (activeTask.status === 'queued' ||
      activeTask.status === 'running' ||
      activeTask.status === 'paused')

  if (activeTask && isRunningTask) {
    const { current, total, message } = activeTask.progress
    const pct = total && total > 0 ? Math.min(100, Math.round((current / total) * 100)) : null

    return (
      <div
        data-lf-projects-status=""
        className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden whitespace-nowrap"
      >
        <span className="truncate font-medium text-foreground">{activeTask.title}</span>
        {pct !== null ? (
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
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
                onClick={() => void resumeTask(activeTask.id)}
              >
                <Play size={11} />
                恢复
              </button>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-muted hover:text-foreground"
                onClick={() => void pauseTask(activeTask.id)}
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
              onClick={() => void cancelTask(activeTask.id)}
            >
              <Square size={11} />
              取消
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      data-lf-projects-status=""
      className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap"
    >
      <span className="font-medium text-foreground">项目库</span>
      <span className="opacity-40">·</span>
      <span className="tabular-nums">{libraries.length} 个库</span>
      <span className="opacity-40">·</span>
      <span className="tabular-nums">{projects.length} 个项目</span>
      {selectedProject ? (
        <>
          <span className="opacity-40">·</span>
          <span className="truncate text-foreground">
            {selectedProject.name}（{selectedProject.fileCount} 项 ·{' '}
            {formatBytes(selectedProject.totalBytes)}）
          </span>
        </>
      ) : null}
      {activeTask ? (
        <div className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px]">
          <span className="truncate text-muted-foreground">
            最近任务：{activeTask.title}（
            {activeTask.status === 'completed'
              ? '已完成'
              : activeTask.status === 'cancelled'
                ? '已取消'
                : '失败'}
            ）
          </span>
          <button
            type="button"
            className="rounded p-0.5 hover:bg-muted hover:text-foreground"
            title="清除已完成任务提示"
            onClick={() => void clearFinishedTasks()}
          >
            <X size={11} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
