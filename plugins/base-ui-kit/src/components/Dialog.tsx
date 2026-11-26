import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { FolioIconClose } from '../icons.js'
import { usePortalContainer } from '../portal.js'
import { FolioButton } from './Button.js'

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ')
}

export const FolioDialog = DialogPrimitive.Root
export const FolioDialogTrigger = DialogPrimitive.Trigger
export const FolioDialogClose = DialogPrimitive.Close

export interface FolioDialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  readonly showClose?: boolean
}

export const FolioDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  FolioDialogContentProps
>(function FolioDialogContent({ className, children, showClose = true, ...rest }, ref) {
  const container = usePortalContainer()
  return (
    <DialogPrimitive.Portal container={container ?? undefined}>
      <DialogPrimitive.Overlay className="lf-dialog-overlay" />
      <DialogPrimitive.Content
        ref={ref}
        data-folio-dialog=""
        className={cx('lf-dialog-content', className)}
        {...rest}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close asChild>
            <FolioButton
              variant="ghost"
              size="icon"
              aria-label="关闭"
              className="lf-dialog-close-btn"
              icon={<FolioIconClose size={14} />}
            />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})

export function FolioDialogHeader({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cx('lf-dialog-header', className)} {...rest} />
}

export const FolioDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function FolioDialogTitle({ className, ...rest }, ref) {
  return <DialogPrimitive.Title ref={ref} className={cx('lf-dialog-title', className)} {...rest} />
})

export const FolioDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function FolioDialogDescription({ className, ...rest }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cx('lf-dialog-description', className)}
      {...rest}
    />
  )
})

export function FolioDialogFooter({
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cx('lf-dialog-footer', className)} {...rest} />
}
