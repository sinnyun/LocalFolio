import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceUiContribution } from '@folio/base-contract'
import { LayoutDashboard } from 'lucide-react'
import { AdminConsole } from './admin/AdminConsole'

function AdminWorkspaceIcon({ size }: { size?: number }): React.ReactElement {
  return <LayoutDashboard size={size} />
}

/**
 * shadcn-admin, ported into a LocalFolio workspace.
 * Registration is a plain workspace contribution so the shell keeps ownership of
 * overlay visibility, Esc handling and floating panels.
 */
export const adminWorkspace: WorkspaceUiContribution = {
  id: 'shadcn-admin',
  title: '测试 Shadcn Admin',
  order: 4,
  pluginId: '@folio/test-shadcn-admin-ui',
  icon: AdminWorkspaceIcon,
  MainView: AdminConsole,
}

export const name = 'test-shadcn-admin-ui'
export const inject = ['folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const dispose = ctx.folioShell.registerWorkspace(adminWorkspace)
    return () => {
      dispose()
    }
  }, 'test-shadcn-admin-ui: register workspace')
}
