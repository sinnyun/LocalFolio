import * as React from 'react'
import { SidebarInset, SidebarProvider, TooltipProvider, cn } from '@folio/base-ui-kit/client'
import { AppSidebar } from './AppSidebar'
import { StudioHeader } from './StudioHeader'
import { DefaultDashboard } from './pages/DefaultDashboard'
import { PortingStub } from './pages/PortingStub'
import { PORTED_ROUTES, type StudioRoute } from './routes'
import { STUDIO_THEME_CSS, StudioSettingsProvider, studioThemeStyle, useStudioSettings } from './settings'

function StudioSurface(): React.ReactElement {
  const { isDark, preset, contentLayout } = useStudioSettings()
  const [route, setRoute] = React.useState<StudioRoute>('default')

  const navigate = React.useCallback((next: StudioRoute) => {
    setRoute(next)
  }, [])

  const page = PORTED_ROUTES.has(route) && route === 'default' ? (
    <DefaultDashboard />
  ) : (
    <PortingStub route={route} />
  )

  return (
    <div
      data-lf-studio=""
      data-preset={preset}
      data-content-layout={contentLayout}
      className={cn(
        'relative flex h-full w-full overflow-hidden bg-background text-foreground',
        isDark && 'dark',
      )}
      style={studioThemeStyle(preset, isDark)}
    >
      <style data-lf-studio-theme="">{STUDIO_THEME_CSS}</style>
      <TooltipProvider>
        <SidebarProvider
          className="h-full min-h-0"
          style={{ '--sidebar-width': 'calc(var(--spacing) * 68)' } as React.CSSProperties}
        >
          <AppSidebar route={route} onNavigate={navigate} />
          <SidebarInset className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <StudioHeader onNavigate={navigate} />
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
              <div
                className={cn(
                  'p-4 md:p-6',
                  contentLayout === 'centered' && 'mx-auto w-full max-w-screen-2xl',
                )}
              >
                {page}
              </div>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  )
}

export function StudioConsole(): React.ReactElement {
  return (
    <StudioSettingsProvider>
      <StudioSurface />
    </StudioSettingsProvider>
  )
}
