import * as React from 'react'

/**
 * Studio Admin theme + layout preferences.
 *
 * Everything is scoped to this plugin's container: presets are inline CSS
 * variables, the `dark` class only lands on the plugin subtree, and nothing is
 * written to `document.documentElement`. DSH owns the host theme; the plugin
 * only re-paints its own surface.
 */

export type StudioThemeMode = 'light' | 'dark' | 'system'
export type StudioPreset = 'default' | 'tangerine' | 'brutalist' | 'soft-pop'
export type StudioSidebarVariant = 'sidebar' | 'floating' | 'inset'
export type StudioSidebarCollapsible = 'offcanvas' | 'icon' | 'none'
export type StudioContentLayout = 'centered' | 'full'
export type StudioNavbarStyle = 'sticky' | 'static'

export interface StudioSettings {
  readonly mode: StudioThemeMode
  readonly preset: StudioPreset
  readonly sidebarVariant: StudioSidebarVariant
  readonly sidebarCollapsible: StudioSidebarCollapsible
  readonly contentLayout: StudioContentLayout
  readonly navbarStyle: StudioNavbarStyle
}

export const PRESET_LABELS: Record<StudioPreset, string> = {
  default: 'Default',
  tangerine: 'Tangerine',
  brutalist: 'Neo Brutalism',
  'soft-pop': 'Soft Pop',
}

export const PRESET_ORDER: readonly StudioPreset[] = ['default', 'tangerine', 'brutalist', 'soft-pop']

type Palette = Record<string, string>

/** shadcn neutral — the template's fallback theme (`:root` in globals.css). */
const DEFAULT_LIGHT: Palette = {
  '--radius': '0.625rem',
  '--background': 'oklch(1 0 0)',
  '--foreground': 'oklch(0.145 0 0)',
  '--card': 'oklch(1 0 0)',
  '--card-foreground': 'oklch(0.145 0 0)',
  '--popover': 'oklch(1 0 0)',
  '--popover-foreground': 'oklch(0.145 0 0)',
  '--primary': 'oklch(0.205 0 0)',
  '--primary-foreground': 'oklch(0.985 0 0)',
  '--secondary': 'oklch(0.97 0 0)',
  '--secondary-foreground': 'oklch(0.205 0 0)',
  '--muted': 'oklch(0.97 0 0)',
  '--muted-foreground': 'oklch(0.556 0 0)',
  '--accent': 'oklch(0.97 0 0)',
  '--accent-foreground': 'oklch(0.205 0 0)',
  '--destructive': 'oklch(0.577 0.245 27.325)',
  '--destructive-foreground': 'oklch(0.985 0 0)',
  '--border': 'oklch(0.922 0 0)',
  '--input': 'oklch(0.922 0 0)',
  '--ring': 'oklch(0.708 0 0)',
  '--chart-1': 'oklch(0.87 0 0)',
  '--chart-2': 'oklch(0.556 0 0)',
  '--chart-3': 'oklch(0.439 0 0)',
  '--chart-4': 'oklch(0.371 0 0)',
  '--chart-5': 'oklch(0.269 0 0)',
  '--sidebar': 'oklch(0.985 0 0)',
  '--sidebar-foreground': 'oklch(0.145 0 0)',
  '--sidebar-primary': 'oklch(0.205 0 0)',
  '--sidebar-primary-foreground': 'oklch(0.985 0 0)',
  '--sidebar-accent': 'oklch(0.97 0 0)',
  '--sidebar-accent-foreground': 'oklch(0.205 0 0)',
  '--sidebar-border': 'oklch(0.922 0 0)',
  '--sidebar-ring': 'oklch(0.708 0 0)',
}

const DEFAULT_DARK: Palette = {
  ...DEFAULT_LIGHT,
  '--background': 'oklch(0.145 0 0)',
  '--foreground': 'oklch(0.985 0 0)',
  '--card': 'oklch(0.205 0 0)',
  '--card-foreground': 'oklch(0.985 0 0)',
  '--popover': 'oklch(0.205 0 0)',
  '--popover-foreground': 'oklch(0.985 0 0)',
  '--primary': 'oklch(0.922 0 0)',
  '--primary-foreground': 'oklch(0.205 0 0)',
  '--secondary': 'oklch(0.269 0 0)',
  '--secondary-foreground': 'oklch(0.985 0 0)',
  '--muted': 'oklch(0.269 0 0)',
  '--muted-foreground': 'oklch(0.708 0 0)',
  '--accent': 'oklch(0.269 0 0)',
  '--accent-foreground': 'oklch(0.985 0 0)',
  '--destructive': 'oklch(0.704 0.191 22.216)',
  '--border': 'oklch(1 0 0 / 10%)',
  '--input': 'oklch(1 0 0 / 15%)',
  '--ring': 'oklch(0.556 0 0)',
  '--sidebar': 'oklch(0.205 0 0)',
  '--sidebar-primary': 'oklch(0.488 0.243 264.376)',
  '--sidebar-accent': 'oklch(0.269 0 0)',
  '--sidebar-accent-foreground': 'oklch(0.985 0 0)',
  '--sidebar-border': 'oklch(1 0 0 / 10%)',
  '--sidebar-ring': 'oklch(0.556 0 0)',
}

const TANGERINE_LIGHT: Palette = {
  '--radius': '0.625rem',
  '--card': 'oklch(1 0 0)',
  '--card-foreground': 'oklch(0.32 0 0)',
  '--popover': 'oklch(1 0 0)',
  '--popover-foreground': 'oklch(0.32 0 0)',
  '--primary': 'oklch(0.64 0.17 36.44)',
  '--primary-foreground': 'oklch(1 0 0)',
  '--secondary': 'oklch(0.97 0 264.54)',
  '--secondary-foreground': 'oklch(0.45 0.03 256.8)',
  '--muted': 'oklch(0.98 0 247.84)',
  '--muted-foreground': 'oklch(0.55 0.02 264.36)',
  '--accent': 'oklch(0.91 0.02 243.82)',
  '--accent-foreground': 'oklch(0.38 0.14 265.52)',
  '--destructive': 'oklch(0.64 0.21 25.33)',
  '--destructive-foreground': 'oklch(1 0 0)',
  '--border': 'oklch(0.9 0.01 247.88)',
  '--input': 'oklch(0.97 0 264.54)',
  '--ring': 'oklch(0.64 0.17 36.44)',
  '--chart-1': 'oklch(0.72 0.06 248.68)',
  '--chart-2': 'oklch(0.79 0.09 35.96)',
  '--chart-3': 'oklch(0.58 0.08 254.16)',
  '--chart-4': 'oklch(0.5 0.08 259.49)',
  '--chart-5': 'oklch(0.42 0.1 264.03)',
  '--sidebar': 'oklch(0.9 0 258.33)',
  '--sidebar-foreground': 'oklch(0.32 0 0)',
  '--sidebar-primary': 'oklch(0.64 0.17 36.44)',
  '--sidebar-primary-foreground': 'oklch(1 0 0)',
  '--sidebar-accent': 'oklch(0.91 0.02 243.82)',
  '--sidebar-accent-foreground': 'oklch(0.38 0.14 265.52)',
  '--sidebar-border': 'oklch(0.93 0.01 264.53)',
  '--sidebar-ring': 'oklch(0.64 0.17 36.44)',
  '--background': 'oklch(0.94 0 236.5)',
  '--foreground': 'oklch(0.32 0 0)',
  '--shadow-2xs': '0px 1px 3px 0px hsl(0 0% 0% / 0.05)',
  '--shadow-xs': '0px 1px 3px 0px hsl(0 0% 0% / 0.05)',
  '--shadow-sm': '0px 1px 3px 0px hsl(0 0% 0% / 0.1), 0px 1px 2px -1px hsl(0 0% 0% / 0.1)',
  '--shadow': '0px 1px 3px 0px hsl(0 0% 0% / 0.1), 0px 1px 2px -1px hsl(0 0% 0% / 0.1)',
  '--shadow-md': '0px 1px 3px 0px hsl(0 0% 0% / 0.1), 0px 2px 4px -1px hsl(0 0% 0% / 0.1)',
  '--shadow-lg': '0px 1px 3px 0px hsl(0 0% 0% / 0.1), 0px 4px 6px -1px hsl(0 0% 0% / 0.1)',
  '--shadow-xl': '0px 1px 3px 0px hsl(0 0% 0% / 0.1), 0px 8px 10px -1px hsl(0 0% 0% / 0.1)',
  '--shadow-2xl': '0px 1px 3px 0px hsl(0 0% 0% / 0.25)',
}

const TANGERINE_DARK: Palette = {
  ...TANGERINE_LIGHT,
  '--background': 'oklch(0.26 0.03 262.67)',
  '--foreground': 'oklch(0.92 0 0)',
  '--card': 'oklch(0.31 0.03 268.64)',
  '--card-foreground': 'oklch(0.92 0 0)',
  '--popover': 'oklch(0.29 0.02 268.4)',
  '--popover-foreground': 'oklch(0.92 0 0)',
  '--secondary': 'oklch(0.31 0.03 266.71)',
  '--secondary-foreground': 'oklch(0.92 0 0)',
  '--muted': 'oklch(0.31 0.03 266.71)',
  '--muted-foreground': 'oklch(0.72 0 0)',
  '--accent': 'oklch(0.34 0.06 267.59)',
  '--accent-foreground': 'oklch(0.88 0.06 254.13)',
  '--border': 'oklch(0.38 0.03 269.73)',
  '--input': 'oklch(0.38 0.03 269.73)',
  '--chart-2': 'oklch(0.77 0.09 34.19)',
  '--sidebar': 'oklch(0.31 0.03 267.74)',
  '--sidebar-foreground': 'oklch(0.92 0 0)',
  '--sidebar-accent': 'oklch(0.34 0.06 267.59)',
  '--sidebar-accent-foreground': 'oklch(0.88 0.06 254.13)',
  '--sidebar-border': 'oklch(0.38 0.03 269.73)',
}

const BRUTALIST_LIGHT: Palette = {
  '--radius': '0px',
  '--card': 'oklch(1 0 0)',
  '--card-foreground': 'oklch(0 0 0)',
  '--popover': 'oklch(1 0 0)',
  '--popover-foreground': 'oklch(0 0 0)',
  '--primary': 'oklch(0.6489 0.237 26.9728)',
  '--primary-foreground': 'oklch(1 0 0)',
  '--secondary': 'oklch(0.968 0.211 109.7692)',
  '--secondary-foreground': 'oklch(0 0 0)',
  '--muted': 'oklch(0.9551 0 0)',
  '--muted-foreground': 'oklch(0.3211 0 0)',
  '--accent': 'oklch(0.5635 0.2408 260.8178)',
  '--accent-foreground': 'oklch(1 0 0)',
  '--destructive': 'oklch(0 0 0)',
  '--destructive-foreground': 'oklch(1 0 0)',
  '--border': 'oklch(0 0 0)',
  '--input': 'oklch(0 0 0)',
  '--ring': 'oklch(0.6489 0.237 26.9728)',
  '--chart-1': 'oklch(0.6489 0.237 26.9728)',
  '--chart-2': 'oklch(0.968 0.211 109.7692)',
  '--chart-3': 'oklch(0.5635 0.2408 260.8178)',
  '--chart-4': 'oklch(0.7323 0.2492 142.4953)',
  '--chart-5': 'oklch(0.5931 0.2726 328.3634)',
  '--sidebar': 'oklch(0.9551 0 0)',
  '--sidebar-foreground': 'oklch(0 0 0)',
  '--sidebar-primary': 'oklch(0.6489 0.237 26.9728)',
  '--sidebar-primary-foreground': 'oklch(1 0 0)',
  '--sidebar-accent': 'oklch(0.5635 0.2408 260.8178)',
  '--sidebar-accent-foreground': 'oklch(1 0 0)',
  '--sidebar-border': 'oklch(0 0 0)',
  '--sidebar-ring': 'oklch(0.6489 0.237 26.9728)',
  '--background': 'oklch(1 0 0)',
  '--foreground': 'oklch(0 0 0)',
  '--shadow-2xs': '4px 4px 0px 0px hsl(0 0% 0% / 0.5)',
  '--shadow-xs': '4px 4px 0px 0px hsl(0 0% 0% / 0.5)',
  '--shadow-sm': '4px 4px 0px 0px hsl(0 0% 0% / 1), 4px 1px 2px -1px hsl(0 0% 0% / 1)',
  '--shadow': '4px 4px 0px 0px hsl(0 0% 0% / 1), 4px 1px 2px -1px hsl(0 0% 0% / 1)',
  '--shadow-md': '4px 4px 0px 0px hsl(0 0% 0% / 1), 4px 2px 4px -1px hsl(0 0% 0% / 1)',
  '--shadow-lg': '4px 4px 0px 0px hsl(0 0% 0% / 1), 4px 4px 6px -1px hsl(0 0% 0% / 1)',
  '--shadow-xl': '4px 4px 0px 0px hsl(0 0% 0% / 1), 4px 8px 10px -1px hsl(0 0% 0% / 1)',
  '--shadow-2xl': '4px 4px 0px 0px hsl(0 0% 0% / 2.5)',
}

const BRUTALIST_DARK: Palette = {
  ...BRUTALIST_LIGHT,
  '--background': 'oklch(0 0 0)',
  '--foreground': 'oklch(1 0 0)',
  '--card': 'oklch(0.3211 0 0)',
  '--card-foreground': 'oklch(1 0 0)',
  '--popover': 'oklch(0.3211 0 0)',
  '--popover-foreground': 'oklch(1 0 0)',
  '--primary': 'oklch(0.7044 0.1872 23.1858)',
  '--primary-foreground': 'oklch(0 0 0)',
  '--secondary': 'oklch(0.9691 0.2005 109.6228)',
  '--secondary-foreground': 'oklch(0 0 0)',
  '--muted': 'oklch(0.3211 0 0)',
  '--muted-foreground': 'oklch(0.8452 0 0)',
  '--accent': 'oklch(0.6755 0.1765 252.2592)',
  '--accent-foreground': 'oklch(0 0 0)',
  '--destructive': 'oklch(1 0 0)',
  '--border': 'oklch(1 0 0)',
  '--input': 'oklch(1 0 0)',
  '--ring': 'oklch(0.7044 0.1872 23.1858)',
  '--chart-1': 'oklch(0.7044 0.1872 23.1858)',
  '--chart-2': 'oklch(0.9691 0.2005 109.6228)',
  '--chart-3': 'oklch(0.6755 0.1765 252.2592)',
  '--chart-4': 'oklch(0.7395 0.2268 142.8504)',
  '--chart-5': 'oklch(0.6131 0.2458 328.0714)',
  '--sidebar': 'oklch(0 0 0)',
  '--sidebar-foreground': 'oklch(1 0 0)',
  '--sidebar-primary': 'oklch(0.7044 0.1872 23.1858)',
  '--sidebar-primary-foreground': 'oklch(0 0 0)',
  '--sidebar-accent': 'oklch(0.6755 0.1765 252.2592)',
  '--sidebar-accent-foreground': 'oklch(0 0 0)',
  '--sidebar-border': 'oklch(1 0 0)',
  '--sidebar-ring': 'oklch(0.7044 0.1872 23.1858)',
}

const SOFT_POP_LIGHT: Palette = {
  '--radius': '1rem',
  '--card': 'oklch(1 0 0)',
  '--card-foreground': 'oklch(0 0 0)',
  '--popover': 'oklch(1 0 0)',
  '--popover-foreground': 'oklch(0 0 0)',
  '--primary': 'oklch(0.5106 0.2301 276.9656)',
  '--primary-foreground': 'oklch(1 0 0)',
  '--secondary': 'oklch(0.7038 0.123 182.5025)',
  '--secondary-foreground': 'oklch(1 0 0)',
  '--muted': 'oklch(0.9551 0 0)',
  '--muted-foreground': 'oklch(0.3211 0 0)',
  '--accent': 'oklch(0.7686 0.1647 70.0804)',
  '--accent-foreground': 'oklch(0 0 0)',
  '--destructive': 'oklch(0.6368 0.2078 25.3313)',
  '--destructive-foreground': 'oklch(1 0 0)',
  '--border': 'oklch(0 0 0)',
  '--input': 'oklch(0.5555 0 0)',
  '--ring': 'oklch(0.7853 0.1041 274.7134)',
  '--chart-1': 'oklch(0.5106 0.2301 276.9656)',
  '--chart-2': 'oklch(0.7038 0.123 182.5025)',
  '--chart-3': 'oklch(0.7686 0.1647 70.0804)',
  '--chart-4': 'oklch(0.6559 0.2118 354.3084)',
  '--chart-5': 'oklch(0.7227 0.192 149.5793)',
  '--sidebar': 'oklch(0.9789 0.0082 121.6272)',
  '--sidebar-foreground': 'oklch(0 0 0)',
  '--sidebar-primary': 'oklch(0.5106 0.2301 276.9656)',
  '--sidebar-primary-foreground': 'oklch(1 0 0)',
  '--sidebar-accent': 'oklch(0.7686 0.1647 70.0804)',
  '--sidebar-accent-foreground': 'oklch(0 0 0)',
  '--sidebar-border': 'oklch(0 0 0)',
  '--sidebar-ring': 'oklch(0.7853 0.1041 274.7134)',
  '--background': 'oklch(0.9789 0.0082 121.6272)',
  '--foreground': 'oklch(0 0 0)',
  '--shadow-2xs': '0px 0px 0px 0px hsl(0 0% 10.1961% / 0.03)',
  '--shadow-xs': '0px 0px 0px 0px hsl(0 0% 10.1961% / 0.03)',
  '--shadow-sm': '0px 0px 0px 0px hsl(0 0% 10.1961% / 0.05), 0px 1px 2px -1px hsl(0 0% 10.1961% / 0.05)',
  '--shadow': '0px 0px 0px 0px hsl(0 0% 10.1961% / 0.05), 0px 1px 2px -1px hsl(0 0% 10.1961% / 0.05)',
  '--shadow-md': '0px 0px 0px 0px hsl(0 0% 10.1961% / 0.05), 0px 2px 4px -1px hsl(0 0% 10.1961% / 0.05)',
  '--shadow-lg': '0px 0px 0px 0px hsl(0 0% 10.1961% / 0.05), 0px 4px 6px -1px hsl(0 0% 10.1961% / 0.05)',
  '--shadow-xl': '0px 0px 0px 0px hsl(0 0% 10.1961% / 0.05), 0px 8px 10px -1px hsl(0 0% 10.1961% / 0.05)',
  '--shadow-2xl': '0px 0px 0px 0px hsl(0 0% 10.1961% / 0.13)',
}

const SOFT_POP_DARK: Palette = {
  ...SOFT_POP_LIGHT,
  '--background': 'oklch(0 0 0)',
  '--foreground': 'oklch(1 0 0)',
  '--card': 'oklch(0.2455 0.0217 257.2823)',
  '--card-foreground': 'oklch(1 0 0)',
  '--popover': 'oklch(0.2455 0.0217 257.2823)',
  '--popover-foreground': 'oklch(1 0 0)',
  '--primary': 'oklch(0.6801 0.1583 276.9349)',
  '--primary-foreground': 'oklch(0 0 0)',
  '--secondary': 'oklch(0.7845 0.1325 181.912)',
  '--secondary-foreground': 'oklch(0 0 0)',
  '--muted': 'oklch(0.3211 0 0)',
  '--muted-foreground': 'oklch(0.8452 0 0)',
  '--accent': 'oklch(0.879 0.1534 91.6054)',
  '--accent-foreground': 'oklch(0 0 0)',
  '--destructive': 'oklch(0.7106 0.1661 22.2162)',
  '--border': 'oklch(0.4459 0 0)',
  '--input': 'oklch(1 0 0)',
  '--ring': 'oklch(0.6801 0.1583 276.9349)',
  '--chart-1': 'oklch(0.6801 0.1583 276.9349)',
  '--chart-2': 'oklch(0.7845 0.1325 181.912)',
  '--chart-3': 'oklch(0.879 0.1534 91.6054)',
  '--chart-4': 'oklch(0.7253 0.1752 349.7607)',
  '--chart-5': 'oklch(0.8003 0.1821 151.711)',
  '--sidebar': 'oklch(0 0 0)',
  '--sidebar-foreground': 'oklch(1 0 0)',
  '--sidebar-primary': 'oklch(0.6801 0.1583 276.9349)',
  '--sidebar-primary-foreground': 'oklch(0 0 0)',
  '--sidebar-accent': 'oklch(0.879 0.1534 91.6054)',
  '--sidebar-accent-foreground': 'oklch(0 0 0)',
  '--sidebar-border': 'oklch(1 0 0)',
  '--sidebar-ring': 'oklch(0.6801 0.1583 276.9349)',
}

const PALETTES: Record<StudioPreset, { light: Palette; dark: Palette }> = {
  default: { light: DEFAULT_LIGHT, dark: DEFAULT_DARK },
  tangerine: { light: TANGERINE_LIGHT, dark: TANGERINE_DARK },
  brutalist: { light: BRUTALIST_LIGHT, dark: BRUTALIST_DARK },
  'soft-pop': { light: SOFT_POP_LIGHT, dark: SOFT_POP_DARK },
}

export function studioThemeStyle(preset: StudioPreset, isDark: boolean): React.CSSProperties {
  const palette = PALETTES[preset][isDark ? 'dark' : 'light']
  return {
    ...(palette as unknown as React.CSSProperties),
    fontFamily: 'var(--dsw-font-family, inherit)',
  }
}

/**
 * Preset shadow scales replace Tailwind's defaults, exactly like the template's
 * `[data-theme-preset] .shadow-*` overrides. Scoped under the plugin container.
 */
export const STUDIO_THEME_CSS = `
/*
 * The shadcn sidebar shell pins its desktop container with \`position: fixed\`
 * (inset-y-0, h-svh). Inside DSH's \`shell.overlay\` that would anchor to the
 * browser viewport and slide under the overlay's own tab strip, so re-anchor it
 * to this plugin's positioned surface instead.
 */
[data-lf-studio] [data-slot="sidebar-container"] {
  position: absolute;
  inset-block: 0;
  height: 100%;
}
[data-lf-studio][data-preset]:not([data-preset="default"]) .shadow-2xs { box-shadow: var(--shadow-2xs); }
[data-lf-studio][data-preset]:not([data-preset="default"]) .shadow-xs { box-shadow: var(--shadow-xs); }
[data-lf-studio][data-preset]:not([data-preset="default"]) .shadow-sm { box-shadow: var(--shadow-sm); }
[data-lf-studio][data-preset]:not([data-preset="default"]) .shadow { box-shadow: var(--shadow); }
[data-lf-studio][data-preset]:not([data-preset="default"]) .shadow-md { box-shadow: var(--shadow-md); }
[data-lf-studio][data-preset]:not([data-preset="default"]) .shadow-lg { box-shadow: var(--shadow-lg); }
[data-lf-studio][data-preset]:not([data-preset="default"]) .shadow-xl { box-shadow: var(--shadow-xl); }
[data-lf-studio][data-preset]:not([data-preset="default"]) .shadow-2xl { box-shadow: var(--shadow-2xl); }
`

interface StudioSettingsContextValue extends StudioSettings {
  readonly isDark: boolean
  readonly setMode: (mode: StudioThemeMode) => void
  readonly setPreset: (preset: StudioPreset) => void
  readonly setSidebarVariant: (variant: StudioSidebarVariant) => void
  readonly setSidebarCollapsible: (collapsible: StudioSidebarCollapsible) => void
  readonly setContentLayout: (layout: StudioContentLayout) => void
  readonly setNavbarStyle: (style: StudioNavbarStyle) => void
}

const StudioSettingsContext = React.createContext<StudioSettingsContextValue | null>(null)

const DEFAULT_SETTINGS: StudioSettings = {
  mode: 'system',
  preset: 'default',
  sidebarVariant: 'inset',
  sidebarCollapsible: 'icon',
  contentLayout: 'full',
  navbarStyle: 'static',
}

const SETTINGS_STORAGE_KEY = 'lf.studio.settings.v1'

/**
 * UI-only preference cache. Business data still belongs in
 * `%LOCALAPPDATA%\LocalFolio\plugins\<id>\`; this only remembers how the
 * workspace looks so closing the overlay does not reset the theme.
 */
function readStoredSettings(): Partial<StudioSettings> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const value = parsed as Record<string, unknown>
    const next: { -readonly [K in keyof StudioSettings]?: StudioSettings[K] } = {}
    if (value.mode === 'light' || value.mode === 'dark' || value.mode === 'system') next.mode = value.mode
    if (typeof value.preset === 'string' && value.preset in PRESET_LABELS) {
      next.preset = value.preset as StudioPreset
    }
    if (value.sidebarVariant === 'sidebar' || value.sidebarVariant === 'floating' || value.sidebarVariant === 'inset') {
      next.sidebarVariant = value.sidebarVariant
    }
    if (
      value.sidebarCollapsible === 'offcanvas' ||
      value.sidebarCollapsible === 'icon' ||
      value.sidebarCollapsible === 'none'
    ) {
      next.sidebarCollapsible = value.sidebarCollapsible
    }
    if (value.contentLayout === 'centered' || value.contentLayout === 'full') {
      next.contentLayout = value.contentLayout
    }
    if (value.navbarStyle === 'sticky' || value.navbarStyle === 'static') {
      next.navbarStyle = value.navbarStyle
    }
    return next
  } catch {
    return {}
  }
}

function writeStoredSettings(settings: StudioSettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* storage disabled — preferences stay session-only */
  }
}

function useSystemPrefersDark(): boolean {
  const [dark, setDark] = React.useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent): void => setDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return dark
}

export function StudioSettingsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [settings, setSettings] = React.useState<StudioSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...readStoredSettings(),
  }))
  const systemDark = useSystemPrefersDark()

  React.useEffect(() => {
    writeStoredSettings(settings)
  }, [settings])

  const update = React.useCallback((patch: Partial<StudioSettings>) => {
    setSettings(previous => ({ ...previous, ...patch }))
  }, [])

  const isDark = settings.mode === 'dark' || (settings.mode === 'system' && systemDark)

  const value = React.useMemo<StudioSettingsContextValue>(
    () => ({
      ...settings,
      isDark,
      setMode: mode => update({ mode }),
      setPreset: preset => update({ preset }),
      setSidebarVariant: sidebarVariant => update({ sidebarVariant }),
      setSidebarCollapsible: sidebarCollapsible => update({ sidebarCollapsible }),
      setContentLayout: contentLayout => update({ contentLayout }),
      setNavbarStyle: navbarStyle => update({ navbarStyle }),
    }),
    [settings, isDark, update],
  )

  return <StudioSettingsContext.Provider value={value}>{children}</StudioSettingsContext.Provider>
}

export function useStudioSettings(): StudioSettingsContextValue {
  const value = React.useContext(StudioSettingsContext)
  if (!value) throw new Error('useStudioSettings must be used inside StudioSettingsProvider')
  return value
}
