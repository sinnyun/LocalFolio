import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceUiContribution } from '@folio/base-contract'
import { LayoutPanelTop } from 'lucide-react'
import { StudioConsole } from './studio/StudioConsole'

function StudioWorkspaceIcon({ size }: { size?: number }): React.ReactElement {
  return <LayoutPanelTop size={size} />
}

/**
 * Studio Admin (arhamkhnz/next-shadcn-admin-dashboard), ported into a LocalFolio
 * workspace. Registration is a plain workspace contribution so the shell keeps
 * ownership of overlay visibility, Esc handling and floating panels.
 */
export const studioWorkspace: WorkspaceUiContribution = {
  id: 'studio-admin',
  title: '测试 Studio Admin',
  order: 5,
  pluginId: '@folio/test-studio-admin-ui',
  icon: StudioWorkspaceIcon,
  MainView: StudioConsole,
}

export const name = 'test-studio-admin-ui'
export const inject = ['folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const dispose = ctx.folioShell.registerWorkspace(studioWorkspace)
    return () => {
      dispose()
    }
  }, 'test-studio-admin-ui: register workspace')
}
