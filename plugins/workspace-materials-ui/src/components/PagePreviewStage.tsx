import * as React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Badge, Button } from '@folio/base-ui-kit/client'
import { useMaterials } from '../context.js'
import { buildPreviewUrl, type MaterialPageSummary } from '../types.js'

export interface PagePreviewStageProps {
  readonly page: MaterialPageSummary
  readonly totalPages: number
  readonly onSelectIndex: (index: number) => void
}

export function PagePreviewStage({
  page,
  totalPages,
  onSelectIndex,
}: PagePreviewStageProps): React.ReactElement {
  const { mutating, previewRev, normalizeFileToA3 } = useMaterials()
  const [zoom, setZoom] = React.useState<number>(100)
  const [fitMode, setFitMode] = React.useState<boolean>(true)
  const [imgError, setImgError] = React.useState(false)

  const previewUrl = buildPreviewUrl(page.filePath, page.artboardIndex, 144, previewRev)

  React.useEffect(() => {
    setImgError(false)
  }, [previewUrl])

  return (
    <div
      data-lf-page-stage=""
      className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/30"
    >
      <div className="flex-1 overflow-auto p-6">
        <div className="flex min-h-full min-w-full items-center justify-center">
          <div
            className="relative overflow-hidden rounded-lg border bg-white shadow-lg transition-all"
            style={
              fitMode
                ? { width: 'min(100%, 960px)', aspectRatio: '420 / 297' }
                : { width: `${Math.round(920 * (zoom / 100))}px`, aspectRatio: '420 / 297' }
            }
          >
            {imgError ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
                <p>暂未获取到 VectorCraft 渲染画面，请确认本地 VectorCraft CLI 配置正确</p>
              </div>
            ) : (
              <img
                src={previewUrl}
                alt={`第 ${page.pageNumber} 页 ${page.fields.title}`}
                onError={() => setImgError(true)}
                className="h-full w-full object-contain"
              />
            )}

            {mutating ? (
              <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-[11px] font-medium shadow">
                <RefreshCw size={12} className="animate-spin text-primary" />
                <span>正在同步画板...</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* 底部画布控制条 */}
      <div className="flex items-center justify-between border-t bg-background px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={page.artboardIndex <= 0}
            aria-label="上一页"
            onClick={() => onSelectIndex(page.artboardIndex - 1)}
          >
            <ChevronLeft size={14} />
          </Button>
          <span className="font-mono text-xs tabular-nums">
            {page.artboardIndex + 1} / {totalPages}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={page.artboardIndex >= totalPages - 1}
            aria-label="下一页"
            onClick={() => onSelectIndex(page.artboardIndex + 1)}
          >
            <ChevronRight size={14} />
          </Button>
          <Badge variant={page.isA3Landscape ? 'secondary' : 'outline'} className="text-[10px]">
            {page.widthMm} × {page.heightMm} mm {page.isA3Landscape ? '(A3横版)' : ''}
          </Badge>
          {!page.isA3Landscape ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => void normalizeFileToA3(page.fileId, page.artboardIndex)}
            >
              转为 A3 横版
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="缩小预览"
            onClick={() => {
              setFitMode(false)
              setZoom(z => Math.max(50, z - 15))
            }}
          >
            <ZoomOut size={13} />
          </Button>
          <span className="w-11 text-center font-mono text-[11px] tabular-nums">
            {fitMode ? '适应' : `${zoom}%`}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="放大预览"
            onClick={() => {
              setFitMode(false)
              setZoom(z => Math.min(200, z + 15))
            }}
          >
            <ZoomIn size={13} />
          </Button>
          <Button
            type="button"
            variant={fitMode ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => {
              setFitMode(true)
              setZoom(100)
            }}
          >
            <Maximize2 size={11} className="mr-1" />
            适应画布
          </Button>
        </div>
      </div>
    </div>
  )
}
