import * as React from 'react'

export interface MonitorPreferences {
  readonly workspace: string
  readonly projectId: string
  readonly statusFilter: string
  readonly query: string
  readonly expanded: readonly string[]
}

export const MONITOR_PREFERENCES_KEY = 'folio.monitor.v1'

const EMPTY: MonitorPreferences = {
  workspace: '',
  projectId: '',
  statusFilter: '',
  query: '',
  expanded: [],
}

function readStored(): MonitorPreferences {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(MONITOR_PREFERENCES_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<MonitorPreferences>
    return {
      workspace: typeof parsed.workspace === 'string' ? parsed.workspace : '',
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : '',
      statusFilter: typeof parsed.statusFilter === 'string' ? parsed.statusFilter : '',
      query: typeof parsed.query === 'string' ? parsed.query : '',
      expanded: Array.isArray(parsed.expanded)
        ? parsed.expanded.filter((id): id is string => typeof id === 'string').slice(0, 200)
        : [],
    }
  } catch {
    return EMPTY
  }
}

function writeStored(prefs: MonitorPreferences): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MONITOR_PREFERENCES_KEY, JSON.stringify(prefs))
  } catch {
    // Storage is a convenience; a full quota must not break monitoring.
  }
}

/**
 * Persists the monitor's own view state (selected workspace, filters, expanded
 * rows). Task data itself lives on the Host side; this is UI preference only.
 */
export function useMonitorPreferences(): {
  readonly preferences: MonitorPreferences
  update(patch: Partial<MonitorPreferences>): void
  toggleExpanded(taskId: string): void
} {
  const [preferences, setPreferences] = React.useState<MonitorPreferences>(readStored)

  React.useEffect(() => {
    const timer = setTimeout(() => writeStored(preferences), 250)
    return () => clearTimeout(timer)
  }, [preferences])

  const update = React.useCallback((patch: Partial<MonitorPreferences>) => {
    setPreferences(prev => {
      const next = { ...prev, ...patch }
      if (
        next.workspace === prev.workspace &&
        next.projectId === prev.projectId &&
        next.statusFilter === prev.statusFilter &&
        next.query === prev.query &&
        next.expanded === prev.expanded
      ) {
        return prev
      }
      return next
    })
  }, [])

  const toggleExpanded = React.useCallback((taskId: string) => {
    setPreferences(prev => {
      const expanded = prev.expanded.includes(taskId)
        ? prev.expanded.filter(id => id !== taskId)
        : [...prev.expanded, taskId]
      return { ...prev, expanded }
    })
  }, [])

  return { preferences, update, toggleExpanded }
}
