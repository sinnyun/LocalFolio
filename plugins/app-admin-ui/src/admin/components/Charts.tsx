import * as React from 'react'
import { cn } from '@folio/core-ui-kit/client'

interface Point {
  readonly name: string
  readonly value: number
}

function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  return Math.ceil(value / magnitude) * magnitude
}

/** shadcn-admin's recharts bar chart, re-drawn with plain DOM so the plugin ships no chart runtime. */
export function RevenueBarChart({ data }: { data: readonly Point[] }): React.ReactElement {
  const max = niceMax(Math.max(...data.map(item => item.value)))
  const ticks = [0, 1, 2, 3, 4].map(step => Math.round((max / 4) * step))

  return (
    <div className="flex h-[350px] w-full gap-3" role="img" aria-label="Monthly revenue bar chart">
      <div className="flex w-12 shrink-0 flex-col justify-between pb-6 text-end text-[11px] text-muted-foreground tabular-nums">
        {[...ticks].reverse().map(tick => (
          <span key={tick}>${tick}</span>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex flex-1 items-end gap-1.5 border-b border-border sm:gap-2.5">
          {ticks.map(tick => (
            <div
              key={tick}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 border-t border-border/50"
              style={{ bottom: `${(tick / max) * 100}%` }}
            />
          ))}
          {data.map(item => (
            <div key={item.name} className="group relative flex h-full flex-1 items-end">
              <div
                title={`${item.name}: $${item.value}`}
                className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
                style={{ height: `${Math.max(2, (item.value / max) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 pt-2 text-[11px] text-muted-foreground sm:gap-2.5">
          {data.map(item => (
            <span key={item.name} className="flex-1 text-center">
              {item.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

interface SeriesPoint {
  readonly name: string
  readonly clicks: number
  readonly uniques: number
}

function smoothPath(values: readonly number[], width: number, height: number, max: number): string {
  const stepX = values.length > 1 ? width / (values.length - 1) : width
  const points = values.map((value, index) => ({
    x: index * stepX,
    y: height - (value / max) * height,
  }))
  if (points.length === 0) return ''
  let path = `M ${points[0]?.x ?? 0} ${points[0]?.y ?? 0}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    if (!current || !next) continue
    const midX = (current.x + next.x) / 2
    path += ` C ${midX} ${current.y}, ${midX} ${next.y}, ${next.x} ${next.y}`
  }
  return path
}

/** shadcn-admin's analytics area chart, drawn as a dependency-free SVG. */
export function TrafficAreaChart({ data }: { data: readonly SeriesPoint[] }): React.ReactElement {
  const max = niceMax(Math.max(...data.flatMap(item => [item.clicks, item.uniques])))
  const width = 640
  const height = 260
  const clicks = smoothPath(data.map(item => item.clicks), width, height, max)
  const uniques = smoothPath(data.map(item => item.uniques), width, height, max)
  const area = `${clicks} L ${width} ${height} L 0 ${height} Z`
  const areaUniques = `${uniques} L ${width} ${height} L 0 ${height} Z`
  const ticks = [0, 1, 2, 3, 4].map(step => Math.round((max / 4) * step))

  return (
    <div className="w-full">
      <div className="flex gap-2">
        <div className="flex w-8 shrink-0 flex-col justify-between text-end text-[11px] text-muted-foreground tabular-nums">
          {[...ticks].reverse().map(tick => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="h-[260px] w-full overflow-visible"
            role="img"
            aria-label="Weekly clicks and unique visitors area chart"
          >
            {ticks.map(tick => (
              <line
                key={tick}
                x1={0}
                x2={width}
                y1={height - (tick / max) * height}
                y2={height - (tick / max) * height}
                className="stroke-border/60"
                strokeWidth={1}
              />
            ))}
            <path d={areaUniques} className="fill-muted-foreground" fillOpacity={0.1} />
            <path
              d={uniques}
              className="text-muted-foreground"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            />
            <path d={area} className="fill-primary" fillOpacity={0.15} />
            <path d={clicks} className="text-primary" fill="none" stroke="currentColor" strokeWidth={2} />
          </svg>
          <div className="mt-2 flex text-[11px] text-muted-foreground">
            {data.map(item => (
              <span key={item.name} className="flex-1 text-center">
                {item.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function BarList({
  items,
  valueFormatter,
  barClassName,
}: {
  items: readonly Point[]
  valueFormatter: (value: number) => string
  barClassName?: string
}): React.ReactElement {
  const max = Math.max(...items.map(item => item.value), 1)
  return (
    <ul className="space-y-3">
      {items.map(item => (
        <li key={item.name} className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 truncate text-xs text-muted-foreground">{item.name}</div>
            <div className="h-2.5 w-full rounded-full bg-muted">
              <div
                className={cn('h-2.5 rounded-full bg-primary', barClassName)}
                style={{ width: `${Math.round((item.value / max) * 100)}%` }}
              />
            </div>
          </div>
          <div className="ps-2 text-xs font-medium tabular-nums">{valueFormatter(item.value)}</div>
        </li>
      ))}
    </ul>
  )
}
