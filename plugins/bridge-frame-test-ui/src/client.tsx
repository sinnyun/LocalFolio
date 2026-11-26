import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { FolioFrameService, WorkspaceUiContribution } from '@folio/base-contract'
import { FolioIconPanelLeft } from '@folio/base-ui-kit/client'
import { demoFrameApp } from './demo/DemoApp.js'

/** Workspace id shown in the workbench workspace bar while the frame is under test. */
export const FRAME_TEST_WORKSPACE_ID = 'frame-test'
export const FRAME_TEST_WORKSPACE_TITLE = '测试框架工作区'

/**
 * The bridge only wires the frame into the workspace bar: the frame itself stays
 * a base capability with no UI, and this workspace renders `folioFrame.View`.
 */
export function createFrameTestWorkspace(
  getView: () => React.ComponentType,
): WorkspaceUiContribution {
  function FrameTestMain(): React.ReactElement {
    const View = getView()
    return <View />
  }

  return {
    id: FRAME_TEST_WORKSPACE_ID,
    title: FRAME_TEST_WORKSPACE_TITLE,
    order: 6,
    pluginId: '@folio/bridge-frame-test-ui',
    icon: FolioIconPanelLeft,
    MainView: FrameTestMain,
    // The frame renders one shared Provider around all four regions, so it owns
    // the bottom edge instead of letting the shell draw a second status bar.
    hideStatusBar: true,
  }
}

export const name = 'bridge-frame-test-ui'
export const inject = ['folioFrame', 'folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const frame: FolioFrameService = ctx.folioFrame
    const workspace = createFrameTestWorkspace(() => frame.View)
    const disposeWorkspace = ctx.folioShell.registerWorkspace(workspace)
    const detachHost = frame.attachHostWorkspace(FRAME_TEST_WORKSPACE_ID)
    const disposeDemo = frame.registerApp(demoFrameApp)
    return () => {
      disposeDemo()
      detachHost()
      disposeWorkspace()
    }
  }, 'bridge-frame-test-ui: frame test workspace + demo app')
}

export default { name, inject, apply }
