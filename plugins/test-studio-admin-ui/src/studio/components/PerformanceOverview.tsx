import * as React from 'react'
import { Area, CartesianGrid, ComposedChart, Line, XAxis } from 'recharts'
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@folio/base-ui-kit/client'
import { ACTIVITY_SERIES } from '../data'
import { ChartContainer, ChartLegendDots, ChartTooltip, ChartTooltipContent, type ChartConfig } from './chart'

const chartConfig = {
  newCustomers: { label: 'New Customers', color: 'var(--chart-1)' },
  activeAccounts: { label: 'Active Accounts', color: 'var(--chart-2)' },
  returningUsers: { label: 'Returning Users', color: 'var(--chart-3)' },
} satisfies ChartConfig

function formatAxisDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function formatTooltipDate(value: string | number | undefined): React.ReactNode {
  if (typeof value !== 'string') return null
  const date = new Date(`${value}T00:00:00Z`)
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function PerformanceOverview(): React.ReactElement {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="leading-none">Customer Activity</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">Customer activity for the last 3 months</span>
          <span className="@[540px]/card:hidden">Last 3 months</span>
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Select defaultValue="quarter">
            <SelectTrigger size="sm" className="w-28">
              <SelectValue placeholder="3 months" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Period</SelectLabel>
                <SelectItem value="quarter">3 months</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select defaultValue="all">
            <SelectTrigger size="sm" className="w-32">
              <SelectValue placeholder="All segments" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Segments</SelectLabel>
                <SelectItem value="all">All segments</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="organic">Organic</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm">
            View report
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        <ChartLegendDots config={chartConfig} className="mb-5" />
        <ChartContainer config={chartConfig} className="h-80 w-full">
          <ComposedChart data={[...ACTIVITY_SERIES]} margin={{ top: 0 }}>
            <defs>
              <linearGradient id="fillNewCustomers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-newCustomers)" stopOpacity={0.36} />
                <stop offset="95%" stopColor="var(--color-newCustomers)" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeOpacity={0.5} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={48}
              tickFormatter={formatAxisDate}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent className="w-50" indicator="line" labelFormatter={formatTooltipDate} />}
            />
            <Area
              dataKey="newCustomers"
              type="natural"
              fill="url(#fillNewCustomers)"
              stroke="var(--color-newCustomers)"
              strokeWidth={1.25}
              dot={false}
              fillOpacity={1}
            />
            <Line
              dataKey="activeAccounts"
              type="natural"
              stroke="var(--color-activeAccounts)"
              strokeWidth={1.4}
              dot={false}
            />
            <Line
              dataKey="returningUsers"
              type="natural"
              stroke="var(--color-returningUsers)"
              strokeWidth={1.2}
              dot={false}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
