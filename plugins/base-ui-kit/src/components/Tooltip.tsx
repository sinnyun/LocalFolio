import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { usePortalContainer } from '../portal.js'

export const FolioTooltipProvider = TooltipPrimitive.Provider

export interface FolioTooltipProps {
  readonly content: React.ReactNode
  readonly children: React.ReactElement
  readonly side?: 'top' | 'right' | 'bottom' | 'left'
  readonly delayDuration?: number
}

export function FolioTooltip({
  content,
  children,
  side = 'top',
  delayDuration = 300,
}: FolioTooltipProps): React.ReactElement {
  const container = usePortalContainer()
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal container={container ?? undefined}>
          <TooltipPrimitive.Content side={side} sideOffset={6} className="lf-tooltip-content">
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
