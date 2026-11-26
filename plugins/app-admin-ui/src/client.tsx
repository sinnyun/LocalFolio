import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceUiContribution } from '@folio/lib-shared-contract'
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
  title: 'Shadcn Admin',
  order: 4,
  pluginId: '@folio/app-admin-ui',
  icon: AdminWorkspaceIcon,
  MainView: AdminConsole,
}

export const name = 'app-admin-ui'
export const inject = ['folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const dispose = ctx.folioShell.registerWorkspace(adminWorkspace)
    return () => {
      dispose()
    }
  }, 'app-admin-ui: register workspace')
}
