import * as React from 'react'
import type { CanvasLinkedItemInfo } from '@folio/base-contract'
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  FolderOpen,
  FolderSearch,
  ImageOff,
  Link2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import { Badge, Button, cn, formatBytes } from '@folio/base-ui-kit/client'
import { useCanvas } from '../context.js'
import { buildProxyUrl } from '../lod.js'

export function LinkedImagesPanel(): React.ReactElement | null {
  const {
    relinkPanelOpen,
    setRelinkPanelOpen,
    relinkFilter,
    setRelinkFilter,
    linkedImages,
    linkSources,
    brokenCount,
    cacheStats,
    checkAllLinks,
    pickAndRelinkImage,
    pickAndBatchRelocate,
    pickAndInsertImages,
    focusLinkedImage,
    revealLinkedImage,
    clearLodCache,
  } = useCanvas()

  if (!relinkPanelOpen) return null

  const visibleItems =
    relinkFilter === 'missing'
      ? linkedImages.filter(item => item.status === 'missing')
      : linkedImages

  const toItemInfo = (item: (typeof linkedImages)[number]): CanvasLinkedItemInfo => ({
    assetId: item.assetId,
    shapeIds: item.shapeIds,
    linkId: item.meta.linkId,
    localPath: item.meta.localPath,
    fileName: item.meta.fileName,
    fileSize: item.meta.fileSize,
    mtimeMs: item.meta.mtimeMs,
    naturalWidth: item.meta.naturalWidth,
    naturalHeight: item.meta.naturalHeight,
    mime: item.meta.mime,
    relinkRev: item.meta.relinkRev,
    status: item.status,
    rawMeta: item.rawMeta,
  })
  const allItemInfos = linkedImages.map(toItemInfo)

  return (
    <aside
      data-lf-canvas-relink-panel=""
      aria-label="图片链接管理与重选面板"
      onPointerDown={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      className="absolute right-3 top-14 z-[600] flex max-h-[calc(100%-76px)] w-[368px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-xl border border-border bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Link2 size={15} className="shrink-0 text-primary" />
          <span className="truncate text-xs font-semibold">图片链接管理</span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
            共 {linkedImages.length}
          </Badge>
          {brokenCount > 0 ? (
            <Badge
              variant="outline"
              data-lf-relink-broken-count=""
              className="gap-1 border-amber-500/50 bg-amber-500/10 px-1.5 py-0 text-[10px] tabular-nums text-amber-600 dark:text-amber-400"
            >
              <AlertTriangle size={10} />
              {brokenCount} 失效
            </Badge>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-lf-relink-close=""
          aria-label="关闭链接面板"
          onClick={() => setRelinkPanelOpen(false)}
        >
          <X size={14} />
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/80 bg-muted/30 px-3 py-2">
        <div className="inline-flex rounded-md border border-border bg-background p-0.5">
          <button
            type="button"
            data-lf-relink-filter="all"
            onClick={() => setRelinkFilter('all')}
            className={cn(
              'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              relinkFilter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            全部 ({linkedImages.length})
          </button>
          <button
            type="button"
            data-lf-relink-filter="missing"
            onClick={() => setRelinkFilter('missing')}
            className={cn(
              'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
              relinkFilter === 'missing'
                ? 'bg-amber-600 text-white'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            已失效 ({brokenCount})
          </button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="xs"
            data-lf-relink-check=""
            title="重新检测本地链接有效性"
            onClick={() => void checkAllLinks()}
          >
            <RefreshCw size={12} className="mr-1" />
            检测
          </Button>
          {brokenCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="xs"
              data-lf-relink-batch=""
              title="选择新文件夹，按文件名自动重定位失效图片"
              onClick={() => void pickAndBatchRelocate()}
              className="border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
            >
              <FolderSearch size={12} className="mr-1" />
              批量重定位
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="xs"
            data-lf-relink-insert=""
            onClick={() => void pickAndInsertImages()}
          >
            <Plus size={12} className="mr-1" />
            链接
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-8 text-center">
            <Link2 size={20} className="text-muted-foreground" />
            <p className="text-xs font-medium text-foreground">
              {relinkFilter === 'missing' ? '没有失效的图片链接' : '当前画板还没有链接图片'}
            </p>
            <p className="max-w-[260px] text-[11px] text-muted-foreground">
              {relinkFilter === 'missing'
                ? '所有本地图片路径均可正常访问。'
                : '画板不会复制原图，所有图片均以文件链接与 LOD 代理渲染。'}
            </p>
          </div>
        ) : (
          visibleItems.map(item => {
            const isMissing = item.status === 'missing'
            const thumbUrl = isMissing
              ? null
              : buildProxyUrl(item.meta.localPath, 256, item.meta.mtimeMs, item.meta.relinkRev)
            const dimsLabel =
              item.meta.naturalWidth && item.meta.naturalHeight
                ? `${item.meta.naturalWidth}×${item.meta.naturalHeight}`
                : '未知尺寸'
            const itemInfo: CanvasLinkedItemInfo = {
              assetId: item.assetId,
              shapeIds: item.shapeIds,
              linkId: item.meta.linkId,
              localPath: item.meta.localPath,
              fileName: item.meta.fileName,
              fileSize: item.meta.fileSize,
              mtimeMs: item.meta.mtimeMs,
              naturalWidth: item.meta.naturalWidth,
              naturalHeight: item.meta.naturalHeight,
              mime: item.meta.mime,
              relinkRev: item.meta.relinkRev,
              status: item.status,
              rawMeta: item.rawMeta,
            }

            return (
              <div
                key={item.assetId}
                data-lf-linked-item={item.assetId}
                data-link-status={item.status}
                className={cn(
                  'flex gap-2.5 rounded-lg border p-2 transition-colors',
                  isMissing
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-border bg-card/70',
                )}
              >
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={item.meta.fileName}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImageOff size={20} className="text-amber-600 dark:text-amber-400" />
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between gap-1">
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-foreground">
                        {item.meta.fileName}
                      </div>
                      <div className="truncate text-[10px] tabular-nums text-muted-foreground">
                        {dimsLabel} · {formatBytes(item.meta.fileSize)}
                      </div>
                    </div>
                    {isMissing ? (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-amber-500/60 bg-amber-500/15 px-1.5 py-0 text-[10px] text-amber-700 dark:text-amber-300"
                      >
                        已移动/缺失
                      </Badge>
                    ) : (
                      <Badge
                        variant="secondary"
                        className="shrink-0 gap-0.5 px-1.5 py-0 text-[10px] text-emerald-600 dark:text-emerald-400"
                      >
                        <CheckCircle2 size={10} />
                        正常
                      </Badge>
                    )}
                  </div>

                  <div
                    title={item.meta.localPath}
                    className="truncate font-mono text-[10px] text-muted-foreground"
                  >
                    {item.meta.localPath}
                  </div>

                  {linkSources.map(provider =>
                    provider.renderLinkedItemDetails ? (
                      <React.Fragment key={provider.id}>
                        {provider.renderLinkedItemDetails(itemInfo)}
                      </React.Fragment>
                    ) : null,
                  )}

                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    <Button
                      type="button"
                      size="xs"
                      variant={isMissing ? 'default' : 'outline'}
                      data-lf-relink-btn={item.assetId}
                      onClick={() => void pickAndRelinkImage(item.assetId)}
                      className="h-6 px-2 text-[11px]"
                    >
                      重新选择
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      title="定位到画布上的图片"
                      data-lf-focus-btn={item.assetId}
                      onClick={() => focusLinkedImage(item.assetId)}
                    >
                      <Crosshair size={12} />
                    </Button>
                    {!isMissing ? (
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        title="在资源管理器中显示"
                        data-lf-reveal-btn={item.assetId}
                        onClick={() => void revealLinkedImage(item.meta.localPath)}
                      >
                        <FolderOpen size={12} />
                      </Button>
                    ) : null}
                    {linkSources.map(provider =>
                      provider.renderLinkedItemActions ? (
                        <React.Fragment key={provider.id}>
                          {provider.renderLinkedItemActions(itemInfo)}
                        </React.Fragment>
                      ) : null,
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {linkSources.map(provider =>
        provider.renderPanelExtra ? (
          <React.Fragment key={provider.id}>{provider.renderPanelExtra(allItemInfos)}</React.Fragment>
        ) : null,
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="truncate tabular-nums">
          LOD 缓存：{cacheStats?.fileCount ?? 0} 个 · {formatBytes(cacheStats?.totalBytes ?? 0)}
          （上限 2048px）
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          data-lf-clear-lod-cache=""
          onClick={() => void clearLodCache()}
          className="h-5 px-1.5 text-[10px]"
        >
          <Trash2 size={10} className="mr-1" />
          清理缓存
        </Button>
      </div>
    </aside>
  )
}
