import * as React from 'react'
import { DollarSign, TrendingDown, TrendingUp, UserPlus, Users, Waves } from 'lucide-react'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@folio/core-ui-kit/client'
import { METRIC_CARDS } from '../data'

const ICONS = {
  revenue: DollarSign,
  customers: UserPlus,
  accounts: Users,
  growth: Waves,
} as const

export function MetricCards(): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {METRIC_CARDS.map(metric => {
        const Icon = ICONS[metric.icon]
        return (
          <Card key={metric.label}>
            <CardHeader>
              <CardTitle>
                <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </div>
              </CardTitle>
              <CardDescription>{metric.label}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-3xl leading-none font-medium tracking-tight tabular-nums">
                  {metric.value}
                </div>
                <Badge variant={metric.tone === 'down' ? 'destructive' : 'default'}>
                  {metric.tone === 'down' ? <TrendingDown className="size-3" /> : <TrendingUp className="size-3" />}
                  {metric.delta}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{metric.caption}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
