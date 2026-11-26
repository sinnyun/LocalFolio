import * as React from 'react'
import {
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileText,
  FileVideo,
  Folder,
} from 'lucide-react'
import { cn } from '@folio/base-ui-kit/client'
import { buildThumbUrl, snapThumbBucket } from '../format.js'
import type { FileCategory, FileEntry } from '../types.js'

export interface FileCategoryIconProps {
  readonly category: FileCategory
  readonly size?: number
  readonly className?: string
}

export function FileCategoryIcon({
  category,
  size = 24,
  className,
}: FileCategoryIconProps): React.ReactElement {
  const props = { size, strokeWidth: 1.75, 'aria-hidden': true as const }
  switch (category) {
    case 'folder':
      return <Folder {...props} className={cn('text-sky-500', className)} />
    case 'image':
      return <FileImage {...props} className={cn('text-emerald-500', className)} />
    case 'video':
      return <FileVideo {...props} className={cn('text-purple-500', className)} />
    case 'audio':
      return <FileAudio {...props} className={cn('text-amber-500', className)} />
    case 'document':
      return <FileText {...props} className={cn('text-blue-500', className)} />
    case 'code':
      return <FileCode2 {...props} className={cn('text-cyan-500', className)} />
    case 'archive':
      return <FileArchive {...props} className={cn('text-orange-500', className)} />
    default:
      return <File {...props} className={cn('text-muted-foreground', className)} />
  }
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
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null)
  const [loadedUrl, setLoadedUrl] = React.useState<string | null>(null)

  const canShowImg = Boolean(thumbUrl && failedUrl !== thumbUrl)
  const isLoaded = Boolean(thumbUrl && loadedUrl === thumbUrl)
  const iconSize = compact ? 18 : Math.max(28, Math.min(56, Math.round(sizePx * 0.36)))
  const extBadge = entry.ext ? entry.ext.slice(1).toUpperCase() : ''

  return (
    <div
      data-lf-file-thumb={entry.path}
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-md bg-muted/40 select-none',
        className,
      )}
    >
      {!isLoaded ? (
        <div className="flex flex-col items-center justify-center gap-1">
          <FileCategoryIcon category={entry.category} size={iconSize} />
          {!compact && extBadge ? (
            <span className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              {extBadge}
            </span>
          ) : null}
        </div>
      ) : null}

      {canShowImg && thumbUrl ? (
        <img
          src={thumbUrl}
          alt={entry.name}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoadedUrl(thumbUrl)}
          onError={() => setFailedUrl(thumbUrl)}
          className={cn(
            'h-full w-full object-contain transition-opacity duration-150',
            isLoaded ? 'opacity-100' : 'absolute inset-0 opacity-0',
          )}
        />
      ) : null}
    </div>
  )
}
