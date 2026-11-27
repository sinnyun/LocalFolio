// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { TaskSnapshot } from '@folio/base-contract'
import { dispatchFolioTopic } from '@folio/base-contract/rpc'
import { TaskStatusBar, apply, name, useFolioTasks } from '../client.js'

function makeTask(overrides: Partial<TaskSnapshot> = {}): TaskSnapshot {
  const now = overrides.updatedAt ?? 1000
  return {
    id: 'task_1',
    scope: 'projects',
    queue: 'projects-scan',
    title: '扫描项目库',
    status: 'running',
    progress: { current: 2, total: 10, message: '扫描中 2/10' },
    pausable: true,
    cancellable: true,
    createdAt: 900,
    startedAt: 950,
    updatedAt: now,
    finishedAt: null,
    error: null,
    ...overrides,
  }
}

interface JsonResponse {
  ok: boolean
  data?: unknown
}

function mockFetchRpc(
  handler: (actionId: string, input: Record<string, unknown>) => JsonResponse | Promise<JsonResponse>,
) {
  return vi.fn(async (inputUrl: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl = typeof inputUrl === 'string' ? inputUrl : inputUrl.toString()
    const match = /\/rpc\/([^/?#]+)/.exec(rawUrl)
    const actionId = match ? decodeURIComponent(match[1]) : ''
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const result = await handler(actionId, body)
    return {
      ok: true,
      status: 200,
      json: async () => result,
    } as Response
  })
}

function TasksHarness({
  scopes,
  onTaskUpdated,
  onTaskCompleted,
}: {
  scopes: readonly string[]
  onTaskUpdated?: (task: TaskSnapshot) => void
  onTaskCompleted?: (task: TaskSnapshot) => void
}) {
  const {
    tasks,
    activeTask,
    recentFinishedTask,
    trackTask,
    pauseTask,
    resumeTask,
    cancelTask,
    clearFinishedTasks,
  } = useFolioTasks({
    scopes,
    onTaskUpdated,
    onTaskCompleted,
  })

  return (
    <div>
      <div data-testid="task-ids">{tasks.map(t => `${t.id}:${t.status}`).join(',')}</div>
      <div data-testid="active-id">{activeTask?.id ?? 'none'}</div>
      <div data-testid="finished-id">{recentFinishedTask?.id ?? 'none'}</div>
      <button
        type="button"
        onClick={() =>
          trackTask(
            makeTask({
              id: 'task_manual',
              scope: 'thumbs-eagle',
              title: 'Eagle 手动补全',
              status: 'queued',
              updatedAt: 3000,
            }),
          )
        }
      >
        手动追踪
      </button>
      <TaskStatusBar
        tasks={tasks}
        activeTask={activeTask}
        recentFinishedTask={recentFinishedTask}
        onPause={pauseTask}
        onResume={resumeTask}
        onCancel={cancelTask}
        onClearFinished={() => clearFinishedTasks()}
        idleContent={<span>工作区就绪</span>}
      />
    </div>
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('@folio/base-tasks-ui', () => {
  it('exports plugin metadata and no-op apply', () => {
    expect(name).toBe('base-tasks-ui')
    expect(() => apply({} as never)).not.toThrow()
  })

  it('fetches initial tasks for multiple scopes sorted by updatedAt desc and handles multi-scope SSE updates', async () => {
    const projectTask = makeTask({
      id: 'task_proj',
      scope: 'projects',
      title: '扫描项目',
      status: 'completed',
      updatedAt: 1000,
      finishedAt: 1000,
    })
    const eagleTask = makeTask({
      id: 'task_eagle',
      scope: 'thumbs-eagle',
      queue: 'thumbs-eagle',
      title: 'Eagle 补全缩略图',
      status: 'running',
      progress: { current: 1, total: 4, message: '处理 1/4' },
      updatedAt: 2000,
    })

    const fetchMock = mockFetchRpc((actionId, input) => {
      if (actionId === 'tasks.list') {
        if (input.scope === 'projects') return { ok: true, data: { tasks: [projectTask] } }
        if (input.scope === 'thumbs-eagle') return { ok: true, data: { tasks: [eagleTask] } }
      }
      return { ok: true, data: {} }
    })
    vi.stubGlobal('fetch', fetchMock)

    const onTaskUpdated = vi.fn()
    const onTaskCompleted = vi.fn()

    render(
      <TasksHarness
        scopes={['projects', 'thumbs-eagle']}
        onTaskUpdated={onTaskUpdated}
        onTaskCompleted={onTaskCompleted}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('task-ids').textContent).toBe('task_eagle:running,task_proj:completed')
    })

    expect(screen.getByTestId('active-id').textContent).toBe('task_eagle')
    expect(screen.getByTestId('finished-id').textContent).toBe('task_proj')
    expect(screen.getByText('Eagle 补全缩略图')).toBeTruthy()
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByText('处理 1/4')).toBeTruthy()

    // Unrelated scope event should be ignored
    act(() => {
      dispatchFolioTopic({
        topic: 'tasks:other-scope',
        payload: makeTask({ id: 'task_other', scope: 'other-scope', updatedAt: 5000 }),
        ts: 5000,
      })
    })
    expect(screen.getByTestId('task-ids').textContent).toBe('task_eagle:running,task_proj:completed')
    expect(onTaskUpdated).not.toHaveBeenCalled()

    // Update Eagle task via SSE to completed
    const eagleDone = makeTask({
      ...eagleTask,
      status: 'completed',
      progress: { current: 4, total: 4, message: '已完成' },
      updatedAt: 2500,
      finishedAt: 2500,
    })
    act(() => {
      dispatchFolioTopic({
        topic: 'tasks:thumbs-eagle',
        payload: eagleDone,
        ts: 2500,
      })
    })

    expect(onTaskUpdated).toHaveBeenCalledWith(eagleDone)
    expect(onTaskCompleted).toHaveBeenCalledWith(eagleDone)
    expect(screen.getByTestId('active-id').textContent).toBe('none')
    expect(screen.getByTestId('finished-id').textContent).toBe('task_eagle')
    expect(screen.getByText('工作区就绪')).toBeTruthy()
    expect(screen.getByText('最近任务：Eagle 补全缩略图（已完成）')).toBeTruthy()
  })

  it('calls pause, resume, cancel, clear RPCs and handles tasks:cleared SSE events', async () => {
    const runningTask = makeTask({
      id: 'task_1',
      scope: 'projects',
      title: '同步索引',
      status: 'running',
      progress: { current: 3, total: 6, message: '同步中' },
      updatedAt: 1500,
    })

    const rpcCalls: Array<{ actionId: string; input: Record<string, unknown> }> = []
    const fetchMock = mockFetchRpc((actionId, input) => {
      rpcCalls.push({ actionId, input })
      if (actionId === 'tasks.list') {
        return { ok: true, data: { tasks: [runningTask] } }
      }
      if (actionId === 'tasks.pause') {
        return {
          ok: true,
          data: { ...runningTask, status: 'paused', updatedAt: 1600 },
        }
      }
      if (actionId === 'tasks.resume') {
        return {
          ok: true,
          data: { ...runningTask, status: 'running', updatedAt: 1700 },
        }
      }
      if (actionId === 'tasks.cancel') {
        return {
          ok: true,
          data: { ...runningTask, status: 'cancelled', updatedAt: 1800, finishedAt: 1800 },
        }
      }
      if (actionId === 'tasks.clear') {
        return { ok: true, data: { cleared: 1 } }
      }
      return { ok: true, data: {} }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<TasksHarness scopes={['projects']} />)

    await waitFor(() => {
      expect(screen.getByText('同步索引')).toBeTruthy()
    })

    expect(screen.getByText('50%')).toBeTruthy()

    // Pause
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '暂停' }))
    })
    expect(rpcCalls.some(c => c.actionId === 'tasks.pause' && c.input.id === 'task_1')).toBe(true)
    expect(screen.getByRole('button', { name: '恢复' })).toBeTruthy()

    // Resume
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '恢复' }))
    })
    expect(rpcCalls.some(c => c.actionId === 'tasks.resume' && c.input.id === 'task_1')).toBe(true)
    expect(screen.getByRole('button', { name: '暂停' })).toBeTruthy()

    // Cancel
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '取消' }))
    })
    expect(rpcCalls.some(c => c.actionId === 'tasks.cancel' && c.input.id === 'task_1')).toBe(true)
    expect(screen.getByText('工作区就绪')).toBeTruthy()
    expect(screen.getByText('最近任务：同步索引（已取消）')).toBeTruthy()

    // Clear finished via button
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '清除已完成任务提示' }))
    })
    expect(rpcCalls.some(c => c.actionId === 'tasks.clear' && c.input.scope === 'projects')).toBe(true)
    expect(screen.queryByText(/最近任务：/)).toBeNull()

    // Track manual task then simulate failed task cleared by SSE 'tasks:cleared'
    fireEvent.click(screen.getByRole('button', { name: '手动追踪' }))
    expect(screen.getByTestId('active-id').textContent).toBe('task_manual')

    act(() => {
      dispatchFolioTopic({
        topic: 'tasks:projects',
        payload: makeTask({
          id: 'task_failed',
          scope: 'projects',
          title: '失败任务',
          status: 'failed',
          updatedAt: 4000,
          finishedAt: 4000,
        }),
        ts: 4000,
      })
    })
    expect(screen.getByTestId('finished-id').textContent).toBe('task_failed')

    act(() => {
      dispatchFolioTopic({
        topic: 'tasks:cleared',
        payload: { scope: 'projects' },
        ts: 4100,
      })
    })
    expect(screen.getByTestId('finished-id').textContent).toBe('none')
    expect(screen.getByTestId('active-id').textContent).toBe('task_manual')
  })

  it('renders TaskStatusBar standalone in active, paused, and idle states', () => {
    const onPause = vi.fn()
    const onResume = vi.fn()
    const onCancel = vi.fn()
    const onClearFinished = vi.fn()

    const { rerender } = render(
      <TaskStatusBar
        tasks={[]}
        activeTask={makeTask({
          id: 't1',
          title: '打包归档',
          status: 'running',
          progress: { current: 3, total: 4, message: '压缩中' },
        })}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
        onClearFinished={onClearFinished}
      />,
    )

    expect(screen.getByText('打包归档')).toBeTruthy()
    expect(screen.getByText('75%')).toBeTruthy()
    expect(screen.getByText('压缩中')).toBeTruthy()
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('75')

    rerender(
      <TaskStatusBar
        tasks={[]}
        activeTask={null}
        recentFinishedTask={makeTask({
          id: 't2',
          title: '导入素材',
          status: 'failed',
        })}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
        onClearFinished={onClearFinished}
        idleContent={<span>空闲摘要</span>}
        className="custom-bar"
      />,
    )

    expect(screen.getByText('空闲摘要')).toBeTruthy()
    expect(screen.getByText('最近任务：导入素材（失败）')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清除已完成任务提示' }))
    expect(onClearFinished).toHaveBeenCalledTimes(1)
  })
})
