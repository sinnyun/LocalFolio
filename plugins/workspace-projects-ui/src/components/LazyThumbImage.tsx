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
  Layers,
} from 'lucide-react'
import { cn } from '@folio/base-ui-kit/client'
import type { FileCategory } from '../types.js'

export interface CategoryIconProps {
  readonly category: FileCategory | 'folder'
  readonly size?: number
  readonly className?: string
}

export function ProjectCategoryIcon({
  category,
  size = 24,
  className,
}: CategoryIconProps): React.ReactElement {
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
    case 'design':
      return <Layers {...props} className={cn('text-pink-500', className)} />
    case 'code':
      return <FileCode2 {...props} className={cn('text-cyan-500', className)} />
    case 'archive':
      return <FileArchive {...props} className={cn('text-orange-500', className)} />
    default:
      return <File {...props} className={cn('text-muted-foreground', className)} />
  }
}

export interface LazyThumbImageProps {
  readonly src: string | null
  readonly alt: string
  readonly category: FileCategory | 'folder'
  readonly ext?: string
  readonly compact?: boolean
  readonly className?: string
}

export function LazyThumbImage({
  src,
  alt,
  category,
  ext = '',
  compact = false,
  className,
}: LazyThumbImageProps): React.ReactElement {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = React.useState(() => typeof IntersectionObserver === 'undefined')
  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null)
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null)

  React.useEffect(() => {
    const el = hostRef.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return undefined
    }
    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0]
        if (entry) {
          setInView(entry.isIntersecting)
        }
      },
      { rootMargin: '160px' },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [src])

  const isLoaded = Boolean(src && loadedSrc === src)
  const isFailed = Boolean(src && failedSrc === src)
  // Cancel pending image fetches when scrolled out of viewport before completion
  const activeSrc = src && !isFailed && (inView || isLoaded) ? src : null
  const extBadge = ext ? ext.slice(1).toUpperCase() : ''

  return (
    <div
      ref={hostRef}
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-md bg-muted/40 select-none',
        className,
      )}
    >
      {!isLoaded ? (
        <div className="flex flex-col items-center justify-center gap-1">
          <ProjectCategoryIcon category={category} size={compact ? 18 : 28} />
          {!compact && extBadge ? (
            <span className="rounded bg-background/80 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              {extBadge}
            </span>
          ) : null}
        </div>
      ) : null}

      {activeSrc ? (
        <img
          src={activeSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoadedSrc(activeSrc)}
          onError={() => setFailedSrc(activeSrc)}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-150',
            isLoaded ? 'opacity-100' : 'absolute inset-0 opacity-0',
          )}
        />
      ) : null}
    </div>
  )
}
