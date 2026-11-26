import * as React from 'react'
import { ResponsiveContainer, Tooltip } from 'recharts'
import { cn } from '@folio/base-ui-kit/client'

/**
 * Minimal, typed port of the template's shadcn `chart.tsx`.
 *
 * The template's version ships a full `ChartTooltipContent` / legend built on
 * recharts' internal tooltip types; this port keeps the same DOM structure and
 * Tailwind classes but narrows the payload contract to what the plugin renders,
 * so no `any` leaks into dashboard pages.
 */

export interface ChartConfigEntry {
  readonly label?: React.ReactNode
  readonly color?: string
}

export type ChartConfig = Record<string, ChartConfigEntry>

interface ChartContextValue {
  readonly config: ChartConfig
}

const ChartContext = React.createContext<ChartContextValue | null>(null)

export function useChart(): ChartContextValue {
  const context = React.useContext(ChartContext)
  if (!context) throw new Error('useChart must be used within <ChartContainer />')
  return context
}

const THEMES = { light: '', dark: '.dark' } as const

export function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig
  children: React.ComponentProps<typeof ResponsiveContainer>['children']
}): React.ReactElement {
  const uniqueId = React.useId()
  const chartId = `chart-${id ?? uniqueId.replace(/:/g, '')}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          'flex justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke="#ccc"]]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-layer]:outline-hidden [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-surface]:outline-hidden',
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }): React.ReactElement | null {
  const entries = Object.entries(config).filter(([, entry]) => entry.color)
  if (entries.length === 0) return null

  const css = Object.entries(THEMES)
    .map(
      ([theme, prefix]) =>
        `${prefix} [data-chart=${id}] {\n${entries
          .map(([key, entry]) => `  --color-${key}: ${entry.color};`)
          .join('\n')}\n}`,
    )
    .join('\n')

  return <style dangerouslySetInnerHTML={{ __html: css }} />
}

export interface ChartTooltipPayloadItem {
  readonly dataKey?: string | number
  readonly name?: string | number
  readonly value?: string | number
  readonly color?: string
  readonly payload?: Record<string, unknown>
  readonly type?: string
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  indicator = 'dot',
  labelFormatter,
  hideLabel = false,
}: {
  active?: boolean
  payload?: readonly ChartTooltipPayloadItem[]
  label?: string | number
  className?: string
  indicator?: 'line' | 'dot' | 'dashed'
  labelFormatter?: (value: string | number | undefined) => React.ReactNode
  hideLabel?: boolean
}): React.ReactElement | null {
  const { config } = useChart()
  if (!active || !payload?.length) return null

  const items = payload.filter(item => item.type !== 'none')
  const heading = hideLabel ? null : labelFormatter ? labelFormatter(label) : label

  return (
    <div
      className={cn(
        'grid min-w-32 items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl',
        className,
      )}
    >
      {heading ? <div className="font-medium">{heading}</div> : null}
      <div className="grid gap-1.5">
        {items.map((item, index) => {
          const key = `${item.dataKey ?? item.name ?? 'value'}`
          const entry = config[key]
          const color = item.color ?? (item.payload?.fill as string | undefined)
          return (
            <div key={`${key}-${index}`} className="flex w-full items-center gap-2">
              <div
                className={cn('shrink-0 rounded-[2px]', {
                  'size-2.5': indicator === 'dot',
                  'w-1 self-stretch': indicator === 'line',
                  'w-0 border-[1.5px] border-dashed bg-transparent': indicator === 'dashed',
                })}
                style={{ background: color, borderColor: color }}
              />
              <span className="flex-1 text-muted-foreground">{entry?.label ?? item.name}</span>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {typeof item.value === 'number' ? item.value.toLocaleString() : String(item.value ?? '')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const ChartTooltip = Tooltip

export function ChartLegendDots({
  config,
  className,
}: {
  config: ChartConfig
  className?: string
}): React.ReactElement {
  return (
    <div className={cn('flex items-center justify-end gap-4', className)}>
      {Object.entries(config).map(([key, entry]) => (
        <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 rounded-[2px]" style={{ backgroundColor: entry.color }} />
          {entry.label}
        </span>
      ))}
    </div>
  )
}
