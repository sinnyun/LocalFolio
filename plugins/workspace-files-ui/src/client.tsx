import type { Context } from '@deepseek-ai/cordis'
import type {
  FolioFrameService,
  FolioInteractionsService,
  FrameAppDefinition,
  FrameProviderProps,
  WorkspaceUiContribution,
} from '@folio/base-contract'
import { FolderOpen } from 'lucide-react'
import { FilesInspector } from './components/FilesInspector.js'
import { FilesMain } from './components/FilesMain.js'
import { FilesSidebar } from './components/FilesSidebar.js'
import { FilesStatus } from './components/FilesStatus.js'
import { FilesProvider } from './context.js'

export const FILES_WORKSPACE_ID = 'files'
export const FILES_APP_ID = 'files.browser'

function FilesWorkspaceIcon({ size = 14 }: { readonly size?: number }): React.ReactElement {
  return <FolderOpen size={size} strokeWidth={1.75} aria-hidden="true" />
}

export function createFilesApp(
  getInteractions?: () => FolioInteractionsService | undefined,
): FrameAppDefinition {
  function BoundFilesProvider(props: FrameProviderProps): React.ReactElement {
    return <FilesProvider {...props} getInteractions={getInteractions} />
  }

  return {
    id: FILES_APP_ID,
    workspaceId: FILES_WORKSPACE_ID,
    title: '文件浏览器',
    subtitle: '本地文件与缩略图',
    pluginId: '@folio/workspace-files-ui',
    icon: FilesWorkspaceIcon,
    order: 1,
    rightTitle: '文件检查器',
    leftCollapse: 'icon',
    defaultLayout: {
      leftWidth: 264,
      rightWidth: 320,
      leftCollapsed: false,
      rightCollapsed: false,
    },
    Provider: BoundFilesProvider,
    Left: FilesSidebar,
    Main: FilesMain,
    Right: FilesInspector,
    Status: FilesStatus,
  }
}

export function createFilesWorkspace(frame: FolioFrameService): WorkspaceUiContribution {
  return {
    id: FILES_WORKSPACE_ID,
    title: '文件浏览器',
    order: 2,
    pluginId: '@folio/workspace-files-ui',
    icon: FilesWorkspaceIcon,
    MainView: frame.WorkspaceHost,
  }
}

export const name = 'workspace-files-ui'
export const inject = ['folioFrame', 'folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const frame: FolioFrameService = ctx.folioFrame
    const disposeApp = frame.registerApp(createFilesApp(() => ctx.get('folioInteractions')))
    const disposeWorkspace = ctx.folioShell.registerWorkspace(createFilesWorkspace(frame))
    return () => {
      disposeWorkspace()
      disposeApp()
    }
  }, 'workspace-files-ui: register files workspace and frame app')
}

export default { name, inject, apply }
