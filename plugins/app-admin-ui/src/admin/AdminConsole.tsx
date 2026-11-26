import * as React from 'react'
import { SidebarInset, SidebarProvider, TooltipProvider, cn } from '@folio/core-ui-kit/client'
import { AdminHeader, TopNav } from './AdminHeader'
import { AppSidebar } from './AppSidebar'
import { AdminThemeProvider, adminThemeStyle, useAdminTheme } from './theme'
import type { AdminRoute } from './routes'
import { DashboardPage } from './pages/Dashboard'
import { TasksPage } from './pages/Tasks'
import { UsersPage } from './pages/Users'
import { AppsPage } from './pages/Apps'
import { ChatsPage } from './pages/Chats'
import { SettingsPage } from './pages/Settings'
import { AuthPage, ErrorPage, HelpCenterPage } from './pages/Pages'

const AUTH_ROUTES = ['sign-in', 'sign-in-2', 'sign-up', 'forgot-password', 'otp'] as const
const ERROR_ROUTES = ['error-401', 'error-403', 'error-404', 'error-500', 'error-503'] as const

function isAuthRoute(route: AdminRoute): route is (typeof AUTH_ROUTES)[number] {
  return (AUTH_ROUTES as readonly string[]).includes(route)
}

function isErrorRoute(route: AdminRoute): route is (typeof ERROR_ROUTES)[number] {
  return (ERROR_ROUTES as readonly string[]).includes(route)
}

function AdminConsoleInner(): React.ReactElement {
  const { theme } = useAdminTheme()
  const [route, setRoute] = React.useState<AdminRoute>('dashboard')
  const navigate = React.useCallback((next: AdminRoute) => setRoute(next), [])

  const page = isAuthRoute(route) ? (
    <AuthPage route={route} onNavigate={navigate} />
  ) : isErrorRoute(route) ? (
    <ErrorPage route={route} onNavigate={navigate} />
  ) : route === 'help-center' ? (
    <HelpCenterPage />
  ) : route.startsWith('settings-') ? (
    <SettingsPage route={route} onNavigate={navigate} />
  ) : route === 'tasks' ? (
    <TasksPage />
  ) : route === 'users' ? (
    <UsersPage />
  ) : route === 'apps' ? (
    <AppsPage />
  ) : route === 'chats' ? (
    <ChatsPage />
  ) : (
    <DashboardPage />
  )

  const fillsHeight = route === 'chats' || isAuthRoute(route) || isErrorRoute(route) || route === 'help-center'

  return (
    <div
      data-lf-admin=""
      data-lf-admin-route={route}
      className={cn(
        'relative flex h-full w-full overflow-hidden bg-background text-foreground',
        theme === 'dark' && 'dark',
      )}
      style={adminThemeStyle(theme)}
    >
      <TooltipProvider>
        <SidebarProvider className="h-full min-h-0">
          <AppSidebar route={route} onNavigate={navigate} />
          <SidebarInset className="flex min-h-0 min-w-0 flex-col overflow-hidden">
            <AdminHeader route={route} onNavigate={navigate}>
              {route === 'dashboard' ? <TopNav onNavigate={navigate} /> : null}
            </AdminHeader>
            <div
              className={cn(
                'min-h-0 flex-1',
                fillsHeight ? 'flex flex-col overflow-hidden' : 'overflow-y-auto',
              )}
            >
              {page}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  )
}

export function AdminConsole(): React.ReactElement {
  return (
    <AdminThemeProvider>
      <AdminConsoleInner />
    </AdminThemeProvider>
  )
}
