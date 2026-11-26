import * as React from 'react'

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ')
}

export interface FolioButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'outline' | 'ghost' | 'danger'
  readonly size?: 'sm' | 'md' | 'icon'
  readonly icon?: React.ReactNode
}

export const FolioButton = React.forwardRef<HTMLButtonElement, FolioButtonProps>(
  function FolioButton(
    {
      variant = 'outline',
      size = 'md',
      icon,
      children,
      className,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        data-folio-button=""
        data-variant={variant}
        data-size={size}
        className={cx('lf-btn', className)}
        {...rest}
      >
        {icon === undefined ? null : (
          <span aria-hidden="true" className="lf-btn-icon">
            {icon}
          </span>
        )}
        {children}
      </button>
    )
  },
)
