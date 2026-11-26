import * as React from 'react'

export type AdminTheme = 'light' | 'dark' | 'system'

interface AdminThemeContextValue {
  readonly theme: AdminTheme
  readonly isDark: boolean
  readonly setTheme: (theme: AdminTheme) => void
}

const AdminThemeContext = React.createContext<AdminThemeContextValue | null>(null)

/**
 * Local admin palette. Light/system intentionally inherit the DSH host tokens that
 * `@folio/base-ui-kit` maps; only "dark" forces an explicit shadcn dark palette so the
 * demo can show both appearances without touching the host document.
 */
const DARK_VARS = {
  '--background': '#020817',
  '--foreground': '#f8fafc',
  '--card': '#0b1220',
  '--card-foreground': '#f8fafc',
  '--popover': '#0b1220',
  '--popover-foreground': '#f8fafc',
  '--primary': '#e2e8f0',
  '--primary-foreground': '#0f172a',
  '--secondary': '#1e293b',
  '--secondary-foreground': '#f8fafc',
  '--muted': '#1e293b',
  '--muted-foreground': '#94a3b8',
  '--accent': '#1e293b',
  '--accent-foreground': '#f8fafc',
  '--destructive': '#ef4444',
  '--destructive-foreground': '#f8fafc',
  '--border': 'rgba(148, 163, 184, 0.24)',
  '--input': 'rgba(148, 163, 184, 0.24)',
  '--ring': '#cbd5e1',
  '--sidebar': '#0b1220',
  '--sidebar-foreground': '#f8fafc',
  '--sidebar-primary': '#e2e8f0',
  '--sidebar-primary-foreground': '#0f172a',
  '--sidebar-accent': '#1e293b',
  '--sidebar-accent-foreground': '#f8fafc',
  '--sidebar-border': 'rgba(148, 163, 184, 0.24)',
  '--sidebar-ring': '#cbd5e1',
} as const

export function adminThemeStyle(theme: AdminTheme): React.CSSProperties {
  return theme === 'dark' ? (DARK_VARS as unknown as React.CSSProperties) : {}
}

export function AdminThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [theme, setTheme] = React.useState<AdminTheme>('system')
  const value = React.useMemo<AdminThemeContextValue>(
    () => ({ theme, isDark: theme === 'dark', setTheme }),
    [theme],
  )
  return <AdminThemeContext.Provider value={value}>{children}</AdminThemeContext.Provider>
}

export function useAdminTheme(): AdminThemeContextValue {
  const value = React.useContext(AdminThemeContext)
  if (!value) throw new Error('useAdminTheme must be used inside AdminThemeProvider')
  return value
}
