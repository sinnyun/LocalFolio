import * as React from 'react'
import { ArrowUpRight, Construction } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@folio/base-ui-kit/client'
import { ROUTE_META, type StudioRoute } from '../routes'

/**
 * Honest placeholder for screens that are not ported yet: it names the screen,
 * its template intent, and links to the exact upstream file instead of faking a
 * half-rendered dashboard.
 */
export function PortingStub({ route }: { route: StudioRoute }): React.ReactElement {
  const meta = ROUTE_META[route]

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 py-10">
      <Card>
        <CardHeader>
          <div className="flex size-9 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
            <Construction className="size-4" />
          </div>
          <CardTitle className="text-lg">{meta.title}</CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            This screen is queued for the port. The shell, theme presets and shared primitives are already wired —
            pages are being ported one at a time so each one lands with real data instead of a stub dashboard.
          </p>
          <Button asChild variant="outline" size="sm" className="w-fit">
            <a
              href="https://github.com/arhamkhnz/next-shadcn-admin-dashboard"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5"
            >
              Upstream template
              <ArrowUpRight className="size-3.5" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
