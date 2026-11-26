import * as React from 'react'
import { FrameErrorBoundary } from './FrameErrorBoundary.js'

export interface FrameRegionProps {
  readonly scope: string
  readonly resetKey: string
  readonly fallback?: React.ReactNode
  readonly children: React.ReactNode
}

function RegionLoading(): React.ReactElement {
  return (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
      正在加载…
    </div>
  )
}

/** Suspense + error isolation for one frame region. */
export function FrameRegion({
  scope,
  resetKey,
  fallback,
  children,
}: FrameRegionProps): React.ReactElement {
  return (
    <FrameErrorBoundary scopeName={scope} resetKey={resetKey}>
      <React.Suspense fallback={fallback ?? <RegionLoading />}>{children}</React.Suspense>
    </FrameErrorBoundary>
  )
}
