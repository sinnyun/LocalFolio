// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { WorkspaceViewProps } from '@folio/base-contract'
import { createFolioFrameService } from '../frame/service.js'
import { FrameWorkbench } from '../frame/FrameWorkbench.js'
import { frameStore } from '../frame/store.js'

function FrameWorkbenchWrapper(props: { workspaceId?: string }): React.ReactElement {
  return <FrameWorkbench workspaceId={props.workspaceId} />
}

afterEach(() => {
  cleanup()
  frameStore.reset()
})

const viewProps = { workspaceId: 'notes' } as WorkspaceViewProps

describe('folioFrame.WorkspaceHost', () => {
  it('renders the frame view and attaches itself as the host while mounted', () => {
    const View = (): React.ReactElement => <div data-testid="frame-view">四区</div>
    const opened: string[] = []
    const service = createFolioFrameService({
      View,
      openWorkspace: workspaceId => opened.push(workspaceId),
    })

    service.registerApp({ id: 'notes.workbench', title: '笔记', Main: View })

    const { unmount } = render(<service.WorkspaceHost {...viewProps} />)
    expect(screen.getByTestId('frame-view').textContent).toBe('四区')

    // Only an attached host may navigate; before mount nothing had claimed it.
    service.openApp('notes.workbench')
    expect(opened).toEqual(['notes'])

    unmount()
    service.openApp('notes.workbench')
    expect(opened).toEqual(['notes'])
  })

  it('scopes apps by workspaceId across multiple Form-A workspaces', () => {
    const opened: string[] = []
    const service = createFolioFrameService({
      View: FrameWorkbenchWrapper,
      openWorkspace: workspaceId => opened.push(workspaceId),
    })

    service.registerApp({
      id: 'frame.demo',
      title: '演示应用',
      Main: () => <div data-testid="demo-main">Demo</div>,
    })
    service.registerApp({
      id: 'files.browser',
      workspaceId: 'files',
      title: '文件浏览器',
      Main: () => <div data-testid="files-main">Files</div>,
    })

    const { rerender } = render(
      <service.WorkspaceHost {...({ workspaceId: 'files' } as WorkspaceViewProps)} />,
    )
    expect(screen.getByTestId('files-main').textContent).toBe('Files')
    expect(screen.queryByTestId('demo-main')).toBeNull()

    rerender(<service.WorkspaceHost {...({ workspaceId: 'frame-test' } as WorkspaceViewProps)} />)
    expect(screen.getByTestId('demo-main').textContent).toBe('Demo')
    expect(screen.queryByTestId('files-main')).toBeNull()

    service.openApp('files.browser')
    expect(opened).toEqual(['files'])
  })
})
