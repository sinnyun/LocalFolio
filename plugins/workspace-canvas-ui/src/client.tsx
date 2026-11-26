import type { Context } from '@deepseek-ai/cordis'
import type {
  FolioCanvasService,
  FolioFrameService,
  FrameAppDefinition,
  FrameProviderProps,
  WorkspaceUiContribution,
} from '@folio/base-contract'
import { PenTool } from 'lucide-react'
import { createFolioCanvasService } from './canvas-service.js'
import { CanvasStage } from './components/CanvasStage.js'
import { CanvasSidebar } from './components/CanvasSidebar.js'
import { CanvasStatus } from './components/CanvasStatus.js'
import { CanvasProvider, useCanvas } from './context.js'

export const CANVAS_WORKSPACE_ID = 'canvas'
export const CANVAS_APP_ID = 'canvas.boards'

function CanvasWorkspaceIcon({ size = 14 }: { readonly size?: number }): React.ReactElement {
  return <PenTool size={size} strokeWidth={1.75} aria-hidden="true" />
}

function CanvasMainSlot(): React.ReactElement {
  const { CanvasStageComponent } = useCanvas()
  const Stage = CanvasStageComponent ?? CanvasStage
  return <Stage />
}

export interface CreateCanvasAppOptions {
  readonly CanvasStageComponent?: React.ComponentType
  readonly canvasService?: FolioCanvasService
}

export function createCanvasApp(options: CreateCanvasAppOptions = {}): FrameAppDefinition {
  const Provider = ({ children }: FrameProviderProps) => (
    <CanvasProvider
      CanvasStageComponent={options.CanvasStageComponent}
      canvasService={options.canvasService}
    >
      {children}
    </CanvasProvider>
  )

  return {
    id: CANVAS_APP_ID,
    workspaceId: CANVAS_WORKSPACE_ID,
    title: '画板',
    subtitle: 'tldraw 链接画板',
    pluginId: '@folio/workspace-canvas-ui',
    icon: CanvasWorkspaceIcon,
    order: 1,
    leftCollapse: 'icon',
    defaultLayout: {
      leftWidth: 248,
      leftCollapsed: false,
    },
    Provider,
    Left: CanvasSidebar,
    Main: CanvasMainSlot,
    Status: CanvasStatus,
  }
}

export function createCanvasWorkspace(frame: FolioFrameService): WorkspaceUiContribution {
  return {
    id: CANVAS_WORKSPACE_ID,
    title: '画板',
    order: 3,
    pluginId: '@folio/workspace-canvas-ui',
    icon: CanvasWorkspaceIcon,
    MainView: frame.WorkspaceHost,
  }
}

export const name = 'workspace-canvas-ui'
export const inject = ['folioFrame', 'folioShell'] as const

export function apply(ctx: Context): void {
  const canvasService = createFolioCanvasService()

  ctx.effect(() => {
    const frame: FolioFrameService = ctx.folioFrame
    const disposeService = ctx.provide('folioCanvas', canvasService)
    const disposeApp = frame.registerApp(createCanvasApp({ canvasService }))
    const disposeWorkspace = ctx.folioShell.registerWorkspace(createCanvasWorkspace(frame))
    return () => {
      disposeWorkspace()
      disposeApp()
      disposeService()
    }
  }, 'workspace-canvas-ui: register canvas workspace, frame app, and folioCanvas service')
}

export default { name, inject, apply }
export { createFolioCanvasService } from './canvas-service.js'
export { useCanvas, CanvasProvider } from './context.js'
export { LinkedImagesPanel } from './components/LinkedImagesPanel.js'
export { LocalImagePickerDialog } from './components/LocalImagePickerDialog.js'
export { CanvasStage } from './components/CanvasStage.js'
export { CanvasSidebar } from './components/CanvasSidebar.js'
export { CanvasStatus } from './components/CanvasStatus.js'
export * from './lod.js'
export * from './browser-import.js'
export * from './types.js'
