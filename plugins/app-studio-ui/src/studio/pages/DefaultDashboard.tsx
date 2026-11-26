import * as React from 'react'
import { Download } from 'lucide-react'
import { Button, Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@folio/core-ui-kit/client'
import { CUSTOMERS } from '../data'
import { MetricCards } from '../components/MetricCards'
import { PerformanceOverview } from '../components/PerformanceOverview'
import { RecentCustomersTable } from '../components/RecentCustomersTable'

export function DefaultDashboard(): React.ReactElement {
  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <MetricCards />
      <PerformanceOverview />
      <Card>
        <CardHeader>
          <CardTitle className="leading-none">18,426 Customers</CardTitle>
          <CardDescription>
            Recent customer records with plan, billing, status, and signup activity.
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm">
              <Download />
              Export
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="pt-0">
          <RecentCustomersTable data={CUSTOMERS} />
        </CardContent>
      </Card>
    </div>
  )
}
