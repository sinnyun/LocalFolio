import * as React from 'react'

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ')
}

export interface FolioInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  readonly size?: 'sm' | 'md'
}

export const FolioInput = React.forwardRef<HTMLInputElement, FolioInputProps>(function FolioInput(
  { size = 'md', className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      data-folio-input=""
      data-size={size}
      className={cx('lf-input', className)}
      {...rest}
    />
  )
})

export type FolioTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const FolioTextarea = React.forwardRef<HTMLTextAreaElement, FolioTextareaProps>(
  function FolioTextarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        data-folio-textarea=""
        className={cx('lf-textarea', className)}
        {...rest}
      />
    )
  },
)
