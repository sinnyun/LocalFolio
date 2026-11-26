import type { Context } from '@deepseek-ai/cordis'
import type { FolioFrameService, WorkspaceUiContribution } from '@folio/base-contract'
import { FolioIconPanelLeft } from '@folio/base-ui-kit/client'
import { demoFrameApp } from './demo/DemoApp.js'

/** Workspace id shown in the workbench workspace bar while the frame is under test. */
export const FRAME_TEST_WORKSPACE_ID = 'frame-test'
export const FRAME_TEST_WORKSPACE_TITLE = '测试框架工作区'

/**
 * Form A in its smallest possible shape: the workspace names itself, and the
 * frame's `WorkspaceHost` renders the four regions and attaches the host.
 */
export function createFrameTestWorkspace(frame: FolioFrameService): WorkspaceUiContribution {
  return {
    id: FRAME_TEST_WORKSPACE_ID,
    title: FRAME_TEST_WORKSPACE_TITLE,
    order: 6,
    pluginId: '@folio/bridge-frame-test-ui',
    icon: FolioIconPanelLeft,
    MainView: frame.WorkspaceHost,
  }
}

export const name = 'bridge-frame-test-ui'
export const inject = ['folioFrame', 'folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const frame: FolioFrameService = ctx.folioFrame
    const workspace = createFrameTestWorkspace(frame)
    const disposeWorkspace = ctx.folioShell.registerWorkspace(workspace)
    const disposeDemo = frame.registerApp(demoFrameApp)
    return () => {
      disposeDemo()
      disposeWorkspace()
    }
  }, 'bridge-frame-test-ui: frame test workspace + demo app')
}

export default { name, inject, apply }
