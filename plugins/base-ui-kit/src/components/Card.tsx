import * as React from 'react'

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ')
}

export type FolioCardProps = React.HTMLAttributes<HTMLDivElement>

export const FolioCard = React.forwardRef<HTMLDivElement, FolioCardProps>(function FolioCard(
  { className, ...rest },
  ref,
) {
  return <div ref={ref} data-folio-card="" className={cx('lf-card', className)} {...rest} />
})

export interface FolioSeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly orientation?: 'horizontal' | 'vertical'
}

export function FolioSeparator({
  orientation = 'horizontal',
  className,
  ...rest
}: FolioSeparatorProps): React.ReactElement {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      data-orientation={orientation}
      className={cx('lf-separator', className)}
      {...rest}
    />
  )
}

export interface FolioEmptyStateProps {
  readonly icon?: React.ReactNode
  readonly title: string
  readonly description?: string
  readonly action?: React.ReactNode
  readonly className?: string
}

export function FolioEmptyState({
  icon,
  title,
  description,
  action,
  className,
}: FolioEmptyStateProps): React.ReactElement {
  return (
    <div data-folio-empty="" className={cx('lf-empty', className)}>
      {icon ? <div aria-hidden="true">{icon}</div> : null}
      <div className="lf-empty-title">{title}</div>
      {description ? <div>{description}</div> : null}
      {action ? <div style={{ marginTop: 6 }}>{action}</div> : null}
    </div>
  )
}
