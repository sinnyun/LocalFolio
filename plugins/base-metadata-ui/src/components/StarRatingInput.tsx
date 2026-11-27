import * as React from 'react'
import { Star } from 'lucide-react'
import { cn } from '@folio/base-ui-kit/client'

export interface StarRatingInputProps {
  readonly value: number
  readonly onChange: (next: number) => void
  readonly size?: number
  readonly className?: string
  readonly clearLabel?: string
  readonly disabled?: boolean
}

const STARS = [1, 2, 3, 4, 5] as const

export function StarRatingInput({
  value,
  onChange,
  size = 15,
  className,
  clearLabel = '清除',
  disabled = false,
}: StarRatingInputProps): React.ReactElement {
  const [hoverStar, setHoverStar] = React.useState<number>(0)

  const activeRating = hoverStar || value

  const handleStarClick = (star: number): void => {
    if (disabled) return
    onChange(value === star ? 0 : star)
  }

  const handleClear = (): void => {
    if (disabled) return
    setHoverStar(0)
    onChange(0)
  }

  return (
    <div
      data-lf-star-rating=""
      className={cn('inline-flex items-center gap-1', className)}
      onMouseLeave={() => setHoverStar(0)}
    >
      {STARS.map(star => {
        const filled = star <= activeRating
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            data-lf-inspector-star={String(star)}
            data-lf-star={String(star)}
            aria-label={`评分 ${star} 星`}
            aria-pressed={value === star}
            onMouseEnter={() => {
              if (!disabled) setHoverStar(star)
            }}
            onClick={() => handleStarClick(star)}
            className={cn(
              'rounded p-0.5 transition-transform',
              !disabled && 'hover:scale-110',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <Star
              size={size}
              className={cn(
                filled
                  ? 'fill-amber-400 text-amber-500'
                  : 'text-muted-foreground/50 hover:text-amber-400',
              )}
            />
          </button>
        )
      })}
      {value > 0 ? (
        <button
          type="button"
          disabled={disabled}
          data-lf-star-clear=""
          aria-label="清除星级"
          onClick={handleClear}
          className={cn(
            'ml-1 text-[10px] text-muted-foreground hover:text-foreground',
            disabled && 'cursor-not-allowed opacity-60',
          )}
        >
          {clearLabel}
        </button>
      ) : null}
    </div>
  )
}
