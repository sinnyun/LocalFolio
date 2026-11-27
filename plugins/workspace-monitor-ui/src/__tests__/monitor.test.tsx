// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react'
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
