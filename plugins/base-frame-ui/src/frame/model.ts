import type {
  FrameAppDefinition,
  FrameAppSummary,
  FrameLayoutSnapshot,
} from '@folio/base-contract'

export const FRAME_STORAGE_KEY = 'folio.frame.v1'

export const DEFAULT_LEFT_WIDTH = 272
export const DEFAULT_RIGHT_WIDTH = 320
export const MIN_LEFT_WIDTH = 200
export const MAX_LEFT_WIDTH = 460
export const MIN_RIGHT_WIDTH = 220
export const MAX_RIGHT_WIDTH = 620
/** The center column never gets narrower than this while dragging a divider. */
export const MIN_CENTER_WIDTH = 360
export const ICON_RAIL_WIDTH = 48
export const DEFAULT_APP_ORDER = 100

/**
 * User-adjusted geometry persisted per app. Every field is optional so a plugin
 * can supply only the defaults it cares about.
 */
export interface FrameAppLayoutState {
  readonly leftCollapsed?: boolean
  readonly leftWidth?: number
  readonly rightCollapsed?: boolean
  readonly rightWidth?: number
}

export interface FrameState {
  readonly apps: readonly FrameAppDefinition[]
  readonly activeAppId: string
  readonly layouts: Readonly<Record<string, FrameAppLayoutState>>
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function clampLeftWidth(value: number, fallback = DEFAULT_LEFT_WIDTH): number {
  return clamp(value, MIN_LEFT_WIDTH, MAX_LEFT_WIDTH, fallback)
}

export function clampRightWidth(value: number, fallback = DEFAULT_RIGHT_WIDTH): number {
  return clamp(value, MIN_RIGHT_WIDTH, MAX_RIGHT_WIDTH, fallback)
}

export function appOrder(app: FrameAppDefinition): number {
  return Number.isFinite(app.order) ? (app.order as number) : DEFAULT_APP_ORDER
}

export function summarizeApp(app: FrameAppDefinition): FrameAppSummary {
  return {
    id: app.id,
    title: app.title,
    subtitle: app.subtitle,
    pluginId: app.pluginId,
    icon: app.icon,
    order: appOrder(app),
  }
}

export function sortApps(apps: readonly FrameAppDefinition[]): FrameAppDefinition[] {
  return [...apps].sort((a, b) => appOrder(a) - appOrder(b) || a.title.localeCompare(b.title))
}

/** Resolve stored/user geometry against the app's declared defaults. */
export function resolveLayout(
  app: FrameAppDefinition | undefined,
  stored: FrameAppLayoutState | undefined,
): FrameLayoutSnapshot {
  const defaults = app?.defaultLayout
  return {
    leftCollapsed: stored?.leftCollapsed ?? defaults?.leftCollapsed ?? false,
    leftWidth: clampLeftWidth(stored?.leftWidth ?? defaults?.leftWidth ?? DEFAULT_LEFT_WIDTH),
    rightCollapsed: stored?.rightCollapsed ?? defaults?.rightCollapsed ?? false,
    rightWidth: clampRightWidth(stored?.rightWidth ?? defaults?.rightWidth ?? DEFAULT_RIGHT_WIDTH),
  }
}

/** The persisted id wins while it exists; otherwise the first registered app. */
export function resolveActiveApp(state: FrameState): FrameAppDefinition | undefined {
  return state.apps.find(app => app.id === state.activeAppId) ?? state.apps[0]
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Defensive read of the persisted layout map (localStorage may hold anything). */
export function sanitizeLayouts(input: unknown): Record<string, FrameAppLayoutState> {
  if (!input || typeof input !== 'object') return {}
  const result: Record<string, FrameAppLayoutState> = {}
  for (const [appId, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!appId || !raw || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    const entry: {
      leftCollapsed?: boolean
      leftWidth?: number
      rightCollapsed?: boolean
      rightWidth?: number
    } = {}
    if (typeof record.leftCollapsed === 'boolean') entry.leftCollapsed = record.leftCollapsed
    if (typeof record.rightCollapsed === 'boolean') entry.rightCollapsed = record.rightCollapsed
    const leftWidth = toFiniteNumber(record.leftWidth)
    if (leftWidth !== undefined) entry.leftWidth = clampLeftWidth(leftWidth)
    const rightWidth = toFiniteNumber(record.rightWidth)
    if (rightWidth !== undefined) entry.rightWidth = clampRightWidth(rightWidth)
    if (Object.keys(entry).length > 0) result[appId] = entry
  }
  return result
}
