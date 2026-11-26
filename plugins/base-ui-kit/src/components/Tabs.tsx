import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ')
}

export const FolioTabs = TabsPrimitive.Root

export const FolioTabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function FolioTabsList({ className, ...rest }, ref) {
  return <TabsPrimitive.List ref={ref} className={cx('lf-tabs-list', className)} {...rest} />
})

export const FolioTabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function FolioTabsTrigger({ className, ...rest }, ref) {
  return <TabsPrimitive.Trigger ref={ref} className={cx('lf-tabs-trigger', className)} {...rest} />
})

export const FolioTabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function FolioTabsContent({ className, ...rest }, ref) {
  return <TabsPrimitive.Content ref={ref} className={cx('lf-tabs-content', className)} {...rest} />
})
