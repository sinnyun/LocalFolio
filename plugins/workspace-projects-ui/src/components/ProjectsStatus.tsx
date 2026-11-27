import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import { TaskStatusBar } from '@folio/base-tasks-ui/client'
import { useProjects } from '../context.js'
import { formatBytes } from '../format.js'

export function ProjectsStatus(_props: FrameViewProps): React.ReactElement {
  const {
    libraries,
    allProjects,
    selectedProject,
    overviewActive,
    tasks,
    activeTask,
    recentFinishedTask,
    pauseTask,
    resumeTask,
    cancelTask,
    clearFinishedTasks,
  } = useProjects()

  const idleContent = (
    <>
      <span className="font-medium text-foreground">项目库</span>
      <span className="opacity-40">·</span>
      <span className="tabular-nums">{libraries.length} 个库</span>
      <span className="opacity-40">·</span>
      <span className="tabular-nums">{allProjects.length} 个项目</span>
      {selectedProject ? (
        <>
          <span className="opacity-40">·</span>
          <span className="truncate text-foreground">
            {selectedProject.name}（{selectedProject.fileCount} 项 ·{' '}
            {formatBytes(selectedProject.totalBytes)}）
          </span>
        </>
      ) : overviewActive ? (
        <>
          <span className="opacity-40">·</span>
          <span className="text-muted-foreground">项目卡片视图</span>
        </>
      ) : null}
    </>
  )

  return (
    <div
      data-lf-projects-status=""
      className="flex min-w-0 flex-1 items-center overflow-hidden"
    >
      <TaskStatusBar
        tasks={tasks}
        activeTask={activeTask}
        recentFinishedTask={recentFinishedTask}
        onPause={pauseTask}
        onResume={resumeTask}
        onCancel={cancelTask}
        onClearFinished={clearFinishedTasks}
        idleContent={idleContent}
      />
    </div>
  )
}
