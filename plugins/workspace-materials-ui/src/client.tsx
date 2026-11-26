import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {
  FolioFrameService,
  FrameAppDefinition,
  FrameProviderProps,
  WorkspaceUiContribution,
} from '@folio/base-contract'
import { LayoutGrid } from 'lucide-react'
import { MaterialsMain } from './components/MaterialsMain.js'
import { MaterialsSidebar } from './components/MaterialsSidebar.js'
import { MaterialsStatus } from './components/MaterialsStatus.js'
import { MaterialsProvider } from './context.js'

export const MATERIALS_WORKSPACE_ID = 'materials'
export const MATERIALS_APP_ID = 'materials.workbench'

function MaterialsWorkspaceIcon({ size = 14 }: { readonly size?: number }): React.ReactElement {
  return <LayoutGrid size={size} strokeWidth={1.75} aria-hidden="true" />
}

export function createMaterialsApp(): FrameAppDefinition {
  const Provider = ({ children }: FrameProviderProps) => (
    <MaterialsProvider>{children}</MaterialsProvider>
  )

  return {
    id: MATERIALS_APP_ID,
    workspaceId: MATERIALS_WORKSPACE_ID,
    title: '物料',
    subtitle: 'VectorCraft A3 物料整理与导出',
    pluginId: '@folio/workspace-materials-ui',
    icon: MaterialsWorkspaceIcon,
    order: 1,
    leftCollapse: 'icon',
    defaultLayout: {
      leftWidth: 264,
      leftCollapsed: false,
    },
    Provider,
    Left: MaterialsSidebar,
    Main: MaterialsMain,
    Status: MaterialsStatus,
  }
}

export function createMaterialsWorkspace(frame: FolioFrameService): WorkspaceUiContribution {
  return {
    id: MATERIALS_WORKSPACE_ID,
    title: '物料',
    order: 4,
    pluginId: '@folio/workspace-materials-ui',
    icon: MaterialsWorkspaceIcon,
    fileExtensions: ['.vectorcraft'],
    MainView: frame.WorkspaceHost,
  }
}

export const name = 'workspace-materials-ui'
export const inject = ['folioFrame', 'folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const frame: FolioFrameService = ctx.folioFrame
    const disposeApp = frame.registerApp(createMaterialsApp())
    const disposeWorkspace = ctx.folioShell.registerWorkspace(createMaterialsWorkspace(frame))
    return () => {
      disposeWorkspace()
      disposeApp()
    }
  }, 'workspace-materials-ui: register materials workspace and frame app')
}

export default { name, inject, apply }
export { useMaterials, MaterialsProvider } from './context.js'
export { MaterialsSidebar } from './components/MaterialsSidebar.js'
export { MaterialsMain } from './components/MaterialsMain.js'
export { MaterialsStatus } from './components/MaterialsStatus.js'
export { PagesOverviewView } from './components/PagesOverviewView.js'
export { PageEditorView } from './components/PageEditorView.js'
export { MaterialDataManagerView } from './components/MaterialDataManagerView.js'
export { SlidePageRail } from './components/SlidePageRail.js'
export { PagePreviewStage } from './components/PagePreviewStage.js'
export { MaterialInfoPanel } from './components/MaterialInfoPanel.js'
export { QuickPickComboBox } from './components/QuickPickComboBox.js'
export { ExportDialog } from './components/ExportDialog.js'
export { ProjectDialogs } from './components/ProjectDialogs.js'
export * from './types.js'
