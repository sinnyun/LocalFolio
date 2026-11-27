import * as React from 'react'
import { FileCategoryIcon, LazyThumbImage } from '@folio/base-ui-kit/client'
import { buildThumbUrl, snapThumbBucket } from '../format.js'
import type { FileCategory, FileEntry } from '../types.js'

export { FileCategoryIcon }

export interface FileCategoryIconProps {
  readonly category: FileCategory
  readonly size?: number
  readonly className?: string
}

export interface FileThumbnailProps {
  readonly entry: FileEntry
  readonly sizePx: number
  readonly compact?: boolean
  readonly className?: string
}

export function FileThumbnail({
  entry,
  sizePx,
  compact = false,
  className,
}: FileThumbnailProps): React.ReactElement {
  const bucket = snapThumbBucket(sizePx)
  const thumbUrl = entry.thumbSupported ? buildThumbUrl(entry, bucket) : null
  const iconSize = compact ? 18 : Math.max(28, Math.min(56, Math.round(sizePx * 0.36)))

  return (
    <LazyThumbImage
      src={thumbUrl}
      alt={entry.name}
      category={entry.category}
      ext={entry.ext}
      compact={compact}
      fallbackIconSize={iconSize}
      objectFit="contain"
      observeViewport={false}
      dataAttr={entry.path}
      className={className}
    />
  )
}
