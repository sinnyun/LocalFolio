// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { WorkspaceMainViewComponent, WorkspaceViewProps } from '@folio/base-contract'
import {
  FRAME_TEST_WORKSPACE_ID,
  FRAME_TEST_WORKSPACE_TITLE,
  createFrameTestWorkspace,
} from '../client.js'

afterEach(() => {
  cleanup()
})

const viewProps = {} as WorkspaceViewProps

describe('@folio/bridge-frame-test-ui', () => {
  it('contributes one hideStatusBar workspace for the frame', () => {
    const workspace = createFrameTestWorkspace(() => () => <div>框架</div>)

    expect(workspace.id).toBe(FRAME_TEST_WORKSPACE_ID)
    expect(workspace.title).toBe(FRAME_TEST_WORKSPACE_TITLE)
    expect(workspace.pluginId).toBe('@folio/bridge-frame-test-ui')
    expect(workspace.hideStatusBar).toBe(true)
  })

  it('renders whatever view folioFrame exposes, without importing the frame itself', () => {
    const view = (): React.ReactElement => <div data-testid="frame-view">folioFrame.View</div>
    const workspace = createFrameTestWorkspace(() => view)
    const MainView = workspace.MainView as WorkspaceMainViewComponent

    render(<MainView {...viewProps} />)

    expect(screen.getByTestId('frame-view').textContent).toBe('folioFrame.View')
  })
})
