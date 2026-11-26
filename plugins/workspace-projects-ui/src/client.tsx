import type { Context } from '@deepseek-ai/cordis'
import type {
  FolioFrameService,
  FolioInteractionsService,
  FolioProjectsUiService,
  FrameAppDefinition,
  FrameProviderProps,
  WorkspaceUiContribution,
} from '@folio/base-contract'
import { FolderKanban } from 'lucide-react'
import { ProjectsInspector } from './components/ProjectsInspector.js'
import { ProjectsMain } from './components/ProjectsMain.js'
import { ProjectsSidebar } from './components/ProjectsSidebar.js'
import { ProjectsStatus } from './components/ProjectsStatus.js'
import { ProjectsProvider } from './context.js'
import { createFolioProjectsUiService } from './extension-registry.js'

export const PROJECTS_WORKSPACE_ID = 'projects'
export const PROJECTS_APP_ID = 'projects.library'

function ProjectsWorkspaceIcon({ size = 14 }: { readonly size?: number }): React.ReactElement {
  return <FolderKanban size={size} strokeWidth={1.75} aria-hidden="true" />
}

export function createProjectsApp(
  getInteractions?: () => FolioInteractionsService | undefined,
  projectsUiService?: FolioProjectsUiService,
): FrameAppDefinition {
  function BoundProjectsProvider(props: FrameProviderProps): React.ReactElement {
    return (
      <ProjectsProvider
        {...props}
        getInteractions={getInteractions}
        projectsUiService={projectsUiService}
      />
    )
  }

  return {
    id: PROJECTS_APP_ID,
    workspaceId: PROJECTS_WORKSPACE_ID,
    title: '项目库',
    subtitle: '归档项目索引与分组卡片视图',
    pluginId: '@folio/workspace-projects-ui',
    icon: ProjectsWorkspaceIcon,
    order: 1,
    rightTitle: '项目详情与元数据',
    leftCollapse: 'icon',
    defaultLayout: {
      leftWidth: 280,
      rightWidth: 320,
      leftCollapsed: false,
      rightCollapsed: false,
    },
    Provider: BoundProjectsProvider,
    Left: ProjectsSidebar,
    Main: ProjectsMain,
    Right: ProjectsInspector,
    Status: ProjectsStatus,
  }
}

export function createProjectsWorkspace(frame: FolioFrameService): WorkspaceUiContribution {
  return {
    id: PROJECTS_WORKSPACE_ID,
    title: '项目库',
    order: 5,
    pluginId: '@folio/workspace-projects-ui',
    icon: ProjectsWorkspaceIcon,
    MainView: frame.WorkspaceHost,
  }
}

export const name = 'workspace-projects-ui'
export const inject = ['folioFrame', 'folioShell'] as const

export function apply(ctx: Context): void {
  const projectsUiService = createFolioProjectsUiService()

  ctx.effect(() => {
    const disposeService = ctx.provide('folioProjects', projectsUiService)
    const frame: FolioFrameService = ctx.folioFrame
    const disposeApp = frame.registerApp(
      createProjectsApp(() => ctx.get('folioInteractions'), projectsUiService),
    )
    const disposeWorkspace = ctx.folioShell.registerWorkspace(createProjectsWorkspace(frame))
    return () => {
      disposeWorkspace()
      disposeApp()
      disposeService()
    }
  }, 'workspace-projects-ui: register projects workspace, frame app and folioProjects service')
}

export { createFolioProjectsUiService } from './extension-registry.js'
export default { name, inject, apply }
