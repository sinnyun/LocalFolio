import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ')
}

export type FolioSwitchProps = React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>

export const FolioSwitch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  FolioSwitchProps
>(function FolioSwitch({ className, ...rest }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      data-folio-switch=""
      className={cx('lf-switch', className)}
      {...rest}
    >
      <SwitchPrimitive.Thumb className="lf-switch-thumb" />
    </SwitchPrimitive.Root>
  )
})
