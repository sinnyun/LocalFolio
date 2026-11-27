import type { Context } from '@deepseek-ai/cordis'
import { Button } from '@folio/base-ui-kit/client'
import { Activity } from 'lucide-react'
import { TaskMonitor } from './TaskMonitor.js'

function MonitorIcon({ size = 14 }: { readonly size?: number }): React.ReactElement {
  return <Activity size={size} aria-hidden="true" />
}

export const name = 'workspace-monitor-ui'
export const inject = ['folioFrame', 'folioShell'] as const
const MONITOR_PANEL_ID = 'monitor.tasks.floating'

function FloatingMonitor(): React.ReactElement {
  return <TaskMonitor compact />
}

function MonitorWorkspace(): React.ReactElement {
  return <TaskMonitor />
}

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const shell = ctx.folioShell
    const disposeApp = ctx.folioFrame.registerApp({
      id: 'monitor.tasks',
      workspaceId: 'monitor',
      title: '任务监控',
      pluginId: '@folio/workspace-monitor-ui',
      icon: MonitorIcon,
      Main: MonitorWorkspace,
    })
    const disposeWorkspace = shell.registerWorkspace({
      id: 'monitor',
      title: '任务监控',
      order: 6,
      pluginId: '@folio/workspace-monitor-ui',
      icon: MonitorIcon,
      MainView: ctx.folioFrame.WorkspaceHost,
    })
    const disposePanel = shell.registerFloatingPanel({
      id: MONITOR_PANEL_ID,
      title: '任务监控',
      pluginId: '@folio/workspace-monitor-ui',
      defaultWidth: 640,
      defaultHeight: 560,
      minWidth: 370,
      minHeight: 280,
      Component: FloatingMonitor,
    })
    const disposeCaption = shell.registerCaptionAction({
      id: 'monitor.tasks.toggle',
      order: 20,
      Component: () => (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          title="任务监控浮窗"
          aria-label="任务监控浮窗"
          onClick={() => shell.toggleFloatingPanel(MONITOR_PANEL_ID)}
        >
          <MonitorIcon />
        </Button>
      ),
    })
    return () => {
      disposeCaption()
      disposePanel()
      disposeWorkspace()
      disposeApp()
    }
  }, 'workspace-monitor-ui: register task monitor')
}

export default { name, inject, apply }
