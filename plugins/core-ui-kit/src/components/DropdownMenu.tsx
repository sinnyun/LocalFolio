import * as React from 'react'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import { usePortalContainer } from '../portal.js'

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ')
}

export const FolioDropdownMenu = DropdownPrimitive.Root
export const FolioDropdownMenuTrigger = DropdownPrimitive.Trigger

export const FolioDropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(function FolioDropdownMenuContent({ className, sideOffset = 4, ...rest }, ref) {
  const container = usePortalContainer()
  return (
    <DropdownPrimitive.Portal container={container ?? undefined}>
      <DropdownPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cx('lf-menu-content', className)}
        {...rest}
      />
    </DropdownPrimitive.Portal>
  )
})

export interface FolioDropdownMenuItemProps
  extends React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> {
  readonly destructive?: boolean
}

export const FolioDropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Item>,
  FolioDropdownMenuItemProps
>(function FolioDropdownMenuItem({ className, destructive = false, ...rest }, ref) {
  return (
    <DropdownPrimitive.Item
      ref={ref}
      data-destructive={destructive ? 'true' : undefined}
      className={cx('lf-menu-item', className)}
      {...rest}
    />
  )
})

export const FolioDropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>
>(function FolioDropdownMenuLabel({ className, ...rest }, ref) {
  return <DropdownPrimitive.Label ref={ref} className={cx('lf-menu-label', className)} {...rest} />
})

export const FolioDropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
>(function FolioDropdownMenuSeparator({ className, ...rest }, ref) {
  return (
    <DropdownPrimitive.Separator
      ref={ref}
      className={cx('lf-menu-separator', className)}
      {...rest}
    />
  )
})
