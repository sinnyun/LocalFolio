import * as React from 'react'

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ')
}

export interface FolioTagProps extends React.HTMLAttributes<HTMLSpanElement> {
  readonly tone?: 'neutral' | 'info' | 'success' | 'danger'
}

export const FolioTag = React.forwardRef<HTMLSpanElement, FolioTagProps>(function FolioTag(
  { tone = 'neutral', className, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      data-folio-tag=""
      data-tone={tone}
      className={cx('lf-tag', className)}
      {...rest}
    >
      {children}
    </span>
  )
})

export const FolioBadge = FolioTag
export type FolioBadgeProps = FolioTagProps
