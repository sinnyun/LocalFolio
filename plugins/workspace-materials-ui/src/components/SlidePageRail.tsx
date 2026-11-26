import * as React from 'react'
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { Badge, Button, cn } from '@folio/base-ui-kit/client'
import { useMaterials } from '../context.js'
import { buildPreviewUrl, type MaterialFileState, type MaterialPageSummary } from '../types.js'

export interface SlidePageRailProps {
  readonly file: MaterialFileState
  readonly activeIndex: number
  readonly onSelectIndex: (index: number) => void
}

export function SlidePageRail({
  file,
  activeIndex,
  onSelectIndex,
}: SlidePageRailProps): React.ReactElement {
  const { mutating, previewRev, addPage, duplicatePage, deletePage, reorderPage } = useMaterials()
  const [dragIndex, setDragIndex] = React.useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = React.useState<number | null>(null)

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null)
      setDropTargetIndex(null)
      return
    }
    const from = dragIndex
    setDragIndex(null)
    setDropTargetIndex(null)
    void reorderPage(file.fileId, from, targetIndex)
  }

  return (
    <div
      data-lf-slide-rail=""
      className="flex h-full w-56 shrink-0 flex-col border-r bg-muted/20"
    >
      <div className="flex items-center justify-between border-b px-2.5 py-2">
        <span className="text-xs font-semibold">页面顺序 ({file.pages.length})</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={mutating}
          data-lf-slide-add-page=""
          className="h-6 px-2 text-[11px]"
          onClick={() => void addPage(file.fileId)}
        >
          <Plus size={12} className="mr-1" />
          加一页
        </Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {file.pages.map((page: MaterialPageSummary, idx: number) => {
          const isActive = page.artboardIndex === activeIndex
          const isDropTarget = dropTargetIndex === idx && dragIndex !== null && dragIndex !== idx

          return (
            <div
              key={`${page.fileId}-${page.artboardKey}-${idx}`}
              draggable={!mutating}
              data-lf-slide-item={idx}
              onDragStart={e => {
                setDragIndex(idx)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', String(idx))
              }}
              onDragOver={e => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dropTargetIndex !== idx) setDropTargetIndex(idx)
              }}
              onDragLeave={() => {
                if (dropTargetIndex === idx) setDropTargetIndex(null)
              }}
              onDrop={e => {
                e.preventDefault()
                handleDrop(idx)
              }}
              onDragEnd={() => {
                setDragIndex(null)
                setDropTargetIndex(null)
              }}
              onClick={() => onSelectIndex(page.artboardIndex)}
              className={cn(
                'group relative cursor-pointer rounded-md border bg-card p-1.5 transition-all',
                isActive
                  ? 'border-primary ring-2 ring-primary/25'
                  : 'border-border hover:border-primary/40',
                dragIndex === idx && 'opacity-50',
                isDropTarget && 'border-t-2 border-t-sky-500 bg-sky-500/5',
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <div className="flex min-w-0 items-center gap-1">
                  <GripVertical
                    size={12}
                    className="shrink-0 cursor-grab text-muted-foreground"
                  />
                  <Badge
                    variant={isActive ? 'default' : 'secondary'}
                    className="h-4 px-1 font-mono text-[10px]"
                  >
                    {page.pageNumber}
                  </Badge>
                  <span className="truncate text-[11px] font-medium">
                    {page.fields.title || page.artboardName}
                  </span>
                </div>
              </div>

              <div className="relative aspect-[420/297] w-full overflow-hidden rounded border bg-white">
                <img
                  src={buildPreviewUrl(page.filePath, page.artboardIndex, 72, previewRev)}
                  alt={`${page.pageNumber} ${page.fields.title}`}
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              </div>

              <div className="mt-1 flex items-center justify-between gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={mutating || idx === 0}
                    data-lf-slide-move-up={idx}
                    className="h-5 w-5"
                    title="上移一页"
                    aria-label={`上移第 ${page.pageNumber} 页`}
                    onClick={e => {
                      e.stopPropagation()
                      void reorderPage(file.fileId, idx, idx - 1)
                    }}
                  >
                    <ArrowUp size={11} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={mutating || idx === file.pages.length - 1}
                    data-lf-slide-move-down={idx}
                    className="h-5 w-5"
                    title="下移一页"
                    aria-label={`下移第 ${page.pageNumber} 页`}
                    onClick={e => {
                      e.stopPropagation()
                      void reorderPage(file.fileId, idx, idx + 1)
                    }}
                  >
                    <ArrowDown size={11} />
                  </Button>
                </div>

                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={mutating}
                    className="h-5 w-5"
                    title="复制此页"
                    aria-label={`复制第 ${page.pageNumber} 页`}
                    onClick={e => {
                      e.stopPropagation()
                      void duplicatePage(file.fileId, page.artboardIndex)
                    }}
                  >
                    <Copy size={11} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={mutating || file.pages.length <= 1}
                    className="h-5 w-5 text-destructive hover:text-destructive"
                    title="删除此页"
                    aria-label={`删除第 ${page.pageNumber} 页`}
                    onClick={e => {
                      e.stopPropagation()
                      void deletePage(file.fileId, page.artboardIndex)
                    }}
                  >
                    <Trash2 size={11} />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
