import * as React from 'react'
import { Activity, CreditCard, DollarSign, Download, Users } from 'lucide-react'
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@folio/base-ui-kit/client'
import {
  ANALYTICS_DATA,
  DEVICES,
  RECENT_SALES,
  REFERRERS,
  REVENUE_DATA,
} from '../data'
import type { AdminIcon } from '../routes'
import { BarList, RevenueBarChart, TrafficAreaChart } from '../components/Charts'

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string
  value: string
  hint: string
  icon: AdminIcon
}): React.ReactElement {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon size={16} className="text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}

function OverviewTab(): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Revenue" value="$45,231.89" hint="+20.1% from last month" icon={DollarSign} />
        <StatCard title="Subscriptions" value="+2350" hint="+180.1% from last month" icon={Users} />
        <StatCard title="Sales" value="+12,234" hint="+19% from last month" icon={CreditCard} />
        <StatCard title="Active Now" value="+573" hint="+201 since last hour" icon={Activity} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="col-span-1 lg:col-span-4">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="ps-2">
            <RevenueBarChart data={REVENUE_DATA} />
          </CardContent>
        </Card>
        <Card className="col-span-1 lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
            <CardDescription>You made 265 sales this month.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {RECENT_SALES.map(sale => (
                <div key={sale.email} className="flex items-center gap-4">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{sale.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm leading-none font-medium">{sale.name}</p>
                      <p className="text-sm text-muted-foreground">{sale.email}</p>
                    </div>
                    <div className="font-medium">{sale.amount}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AnalyticsTab(): React.ReactElement {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Traffic Overview</CardTitle>
          <CardDescription>Weekly clicks and unique visitors</CardDescription>
        </CardHeader>
        <CardContent className="px-6">
          <TrafficAreaChart data={ANALYTICS_DATA} />
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Clicks" value="1,248" hint="+12.4% vs last week" icon={Activity} />
        <StatCard title="Unique Visitors" value="832" hint="+5.8% vs last week" icon={Users} />
        <StatCard title="Bounce Rate" value="42%" hint="-3.2% vs last week" icon={Activity} />
        <StatCard title="Avg. Session" value="3m 24s" hint="+18s vs last week" icon={Activity} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <Card className="col-span-1 lg:col-span-4">
          <CardHeader>
            <CardTitle>Referrers</CardTitle>
            <CardDescription>Top sources driving traffic</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList items={REFERRERS} valueFormatter={value => `${value}`} />
          </CardContent>
        </Card>
        <Card className="col-span-1 lg:col-span-3">
          <CardHeader>
            <CardTitle>Devices</CardTitle>
            <CardDescription>How users access your app</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              items={DEVICES}
              valueFormatter={value => `${value}%`}
              barClassName="bg-muted-foreground"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function DashboardPage(): React.ReactElement {
  const [tab, setTab] = React.useState('overview')

  return (
    <div className="px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <Button
          onClick={() =>
            toast({ title: 'Report queued', description: 'The demo data export is not wired to a backend.' })
          }
        >
          <Download size={16} />
          Download
        </Button>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="w-full overflow-x-auto pb-2">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="reports" disabled>
              Reports
            </TabsTrigger>
            <TabsTrigger value="notifications" disabled>
              Notifications
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" className="space-y-4">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="analytics" className="space-y-4">
          <AnalyticsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
