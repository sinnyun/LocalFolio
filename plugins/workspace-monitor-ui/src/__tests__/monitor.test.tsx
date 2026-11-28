// @vitest-environment happy-dom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it, vi } from 'vitest'
import type { CaptionActionContribution, FloatingPanelContribution, TaskSnapshot } from '@folio/base-contract'
import { dispatchFolioTopic } from '@folio/base-contract/rpc'
import { TaskMonitor } from '../TaskMonitor.js'
import { apply } from '../client.js'

afterEach(() => vi.unstubAllGlobals())

it('registers a global caption action that opens the shell floating panel', () => {
  const open = vi.fn()
  const registerFloatingPanel = vi.fn((_panel: FloatingPanelContribution) => vi.fn())
  const registerCaptionAction = vi.fn((_action: CaptionActionContribution) => vi.fn())
  const registerWorkspace = vi.fn(() => vi.fn())
  apply({
    effect: (setup: () => void) => setup(),
    folioFrame: { registerApp: () => vi.fn() },
    folioShell: { registerWorkspace, registerFloatingPanel, registerCaptionAction, toggleFloatingPanel: open },
  } as unknown as Context)
  expect(registerWorkspace).toHaveBeenCalled()
  const panel = registerFloatingPanel.mock.calls[0]?.[0]
  const action = registerCaptionAction.mock.calls[0]?.[0]
  expect(panel?.title).toBe('任务监控')
  expect(action).toBeTruthy()
  const Action = action!.Component
  render(<Action isOpen={false} />)
  fireEvent.click(screen.getByRole('button', { name: '任务监控浮窗' }))
  expect(open).toHaveBeenCalledWith(panel?.id)
})

it('loads all scopes and shows live partial failures for the selected project', async () => {
  const archive: TaskSnapshot = {
    id: 'archive', scope: 'projects', queue: 'archive-ops', title: '分卷归档打包：项目甲',
    status: 'running', progress: { current: 75, total: 100, message: '正在校验' },
    pausable: false, cancellable: true, createdAt: 1, startedAt: 1,
    updatedAt: 1, finishedAt: null, error: null,
    meta: { projectId: 'alpha', projectName: '项目甲' },
  }
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ ok: true, data: { tasks: [archive] } })),
  )
  vi.stubGlobal('fetch', fetch)
  render(<TaskMonitor />)
  await screen.findByText('分卷归档打包：项目甲')
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({})
  act(() => dispatchFolioTopic({
    topic: 'tasks',
    ts: 2,
    payload: {
      ...archive, id: 'thumbs', title: '缩略图：项目乙', status: 'completed', updatedAt: 2,
      progress: { current: 4, total: 4, detail: { succeeded: 3, failed: 1, lastError: '未生成缩略图' } },
      meta: { projectId: 'beta', projectName: '项目乙' },
    },
  }))
  fireEvent.change(screen.getByLabelText('项目'), { target: { value: 'beta' } })
  expect(screen.queryByText('分卷归档打包：项目甲')).toBeNull()
  expect(screen.getByText('缩略图：项目乙')).toBeTruthy()
  expect(screen.getByText('部分失败')).toBeTruthy()
  expect(screen.getByText('未生成缩略图')).toBeTruthy()
})

it('lists failed items and retries only the selected rows', async () => {
  window.localStorage.clear()
  const task: TaskSnapshot = {
    id: 'batch',
    scope: 'projects',
    queue: 'archive-ops',
    title: '批量补图',
    status: 'completed',
    progress: { current: 3, total: 3, message: '结束', detail: { succeeded: 1, failed: 2 } },
    pausable: true,
    cancellable: true,
    createdAt: 1,
    startedAt: 1,
    updatedAt: 3,
    finishedAt: 3,
    error: null,
    items: { total: 3, pending: 0, running: 0, succeeded: 1, failed: 2, cancelled: 0, skipped: 0 },
    retryable: true,
    retry: { kind: 'archive-thumbs', params: { projectId: 'alpha' } },
    meta: { projectId: 'alpha', projectName: '项目甲' },
  }
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const reply = (data: unknown) => new Response(JSON.stringify({ ok: true, data }))
    if (url.endsWith('tasks.list')) return reply({ tasks: [task] })
    if (url.endsWith('tasks.items')) {
      return reply({
        taskId: task.id,
        items: [
          {
            key: 'renders/a.jpg',
            label: 'a.jpg',
            status: 'failed',
            error: '未生成缩略图',
            attempts: 2,
            updatedAt: 2,
          },
        ],
        total: 1,
        summary: task.items,
        truncated: false,
        requestedStatus: body.status,
      })
    }
    if (url.endsWith('tasks.retry')) return reply({ task: null, source: task, retried: 1 })
    return reply({})
  })
  vi.stubGlobal('fetch', fetch)

  render(<TaskMonitor />)
  await screen.findByText('批量补图')
  fireEvent.click(screen.getByText('批量补图'))
  await screen.findByText('a.jpg')

  fireEvent.click(screen.getByLabelText('选择 a.jpg'))
  fireEvent.click(screen.getByRole('button', { name: /重试选中/ }))

  await waitFor(() => {
    const retryCall = fetch.mock.calls.find(([url]) => String(url).endsWith('tasks.retry'))
    expect(retryCall).toBeTruthy()
    expect(JSON.parse(String(retryCall?.[1]?.body))).toEqual({
      id: 'batch',
      itemKeys: ['renders/a.jpg'],
    })
  })
})
