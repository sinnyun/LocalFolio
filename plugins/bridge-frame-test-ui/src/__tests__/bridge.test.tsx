// @vitest-environment happy-dom
import * as React from 'react'
import { describe, expect, it } from 'vitest'
import type { FolioFrameService } from '@folio/base-contract'
import {
  FRAME_TEST_WORKSPACE_ID,
  FRAME_TEST_WORKSPACE_TITLE,
  createFrameTestWorkspace,
} from '../client.js'

function fakeFrame(): FolioFrameService {
  const Host = (): React.ReactElement => <div data-testid="frame-host">host</div>
  return { WorkspaceHost: Host } as unknown as FolioFrameService
}

describe('@folio/bridge-frame-test-ui', () => {
  it('contributes one form-A workspace whose MainView is the frame host', () => {
    const frame = fakeFrame()
    const workspace = createFrameTestWorkspace(frame)

    expect(workspace.id).toBe(FRAME_TEST_WORKSPACE_ID)
    expect(workspace.title).toBe(FRAME_TEST_WORKSPACE_TITLE)
    expect(workspace.pluginId).toBe('@folio/bridge-frame-test-ui')
    expect(workspace.MainView).toBe(frame.WorkspaceHost)
    // The shell owns no bottom edge any more, so there is nothing to opt out of.
    expect('hideStatusBar' in workspace).toBe(false)
  })
})
