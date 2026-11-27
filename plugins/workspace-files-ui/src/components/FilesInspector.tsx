import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import { rpcCall } from '@folio/base-contract/rpc'
import {
  AutoSaveNoteField,
  ColoredTagChipsEditor,
  StarRatingInput,
  copyTextToClipboard,
} from '@folio/base-metadata-ui/client'
import {
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Maximize2,
  Star,
} from 'lucide-react'
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Separator,
  Skeleton,
  cn,
  toast,
} from '@folio/base-ui-kit/client'
import { useFiles } from '../context.js'
import {
  categoryLabel,
  formatBytes,
  formatDateTime,
} from '../format.js'
import type { FileInspectResult } from '../types.js'
import { FileCategoryIcon } from './FileIcon.js'

export function FilesInspector(_props: FrameViewProps): React.ReactElement {
  const {
    metadata,
    panes,
    activePaneId,
    selectedEntry,
    selectedPaneId,
    navigatePane,
    revealInExplorer,
    openLightboxForEntry,
    isFavoritePath,
    addFavorite,
    removeFavorite,
    getFileMeta,
    setFileMeta,
    createTag,
    setTagManagerOpen,
  } = useFiles()

  const activePane = panes[activePaneId]
  const [inspect, setInspect] = React.useState<FileInspectResult | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [thumbFailed, setThumbFailed] = React.useState(false)

  const targetPath = selectedEntry?.path ?? null
  const currentMeta = targetPath ? getFileMeta(targetPath) : null
  const currentRating = currentMeta?.rating ?? 0
  const currentTagIds = currentMeta?.tagIds ?? []
  const savedNote = currentMeta?.note ?? ''

  React.useEffect(() => {
    setCopied(false)
    setThumbFailed(false)
    if (!targetPath) {
      setInspect(null)
      setError(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    void rpcCall<FileInspectResult>('files.inspect', { path: targetPath }, { signal: controller.signal })
      .then(res => {
        if (!controller.signal.aborted) {
          setInspect(res)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [targetPath])

  const handleCopyPath = async (value: string): Promise<void> => {
    const ok = await copyTextToClipboard(value)
    if (ok) {
      setCopied(true)
      toast({ title: '已复制文件路径', description: value, tone: 'success' })
      setTimeout(() => setCopied(false), 1800)
    } else {
      toast({ title: '复制失败', description: '当前环境不支持剪贴板写入', tone: 'danger' })
    }
  }

  const handleToggleTag = (tagId: string): void => {
    if (!targetPath) return
    const exists = currentTagIds.includes(tagId)
    const nextTagIds = exists
      ? currentTagIds.filter(id => id !== tagId)
      : [...currentTagIds, tagId]
    void setFileMeta(targetPath, { tagIds: nextTagIds })
  }

  const handleQuickCreateTag = async (name: string, color: string) => {
    if (!targetPath) return null
    const created = await createTag(name, color)
    if (created && !currentTagIds.includes(created.id)) {
      await setFileMeta(targetPath, { tagIds: [...currentTagIds, created.id] })
    }
    return null
  }

  if (!selectedEntry) {
    return (
      <div data-lf-files-inspector="" className="flex flex-1 flex-col gap-4 p-4 text-xs">
        <Empty className="border border-dashed p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen size={20} />
            </EmptyMedia>
            <EmptyTitle className="text-sm">未选中文件</EmptyTitle>
            <EmptyDescription className="text-xs">
              点击文件或文件夹即可在此查看预览图、星级评分、标签与备注，并支持复制路径或在系统资源管理器中打开。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>

        {activePane.mode === 'directory' && activePane.path ? (
          <div className="space-y-2 rounded-lg border border-border bg-background p-3">
            <div className="font-medium text-muted-foreground">当前浏览目录</div>
            <div className="break-all font-mono text-[11px] text-foreground">
              {activePane.path}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                data-lf-inspector-copy-path=""
                onClick={() => void handleCopyPath(activePane.path)}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                <span>{copied ? '已复制' : '复制目录地址'}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-lf-inspector-reveal=""
                onClick={() => void revealInExplorer(activePane.path)}
              >
                <ExternalLink size={13} />
                <span>在资源管理器中打开</span>
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const entry = inspect?.entry ?? selectedEntry
  const fullPath = inspect?.resolvedPath ?? entry.path
  const isFav = entry.isDir && isFavoritePath(entry.path)

  return (
    <div data-lf-files-inspector="" className="flex flex-col gap-3 p-3 text-xs">
      {/* 1. 预览区 */}
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        {loading && !inspect ? (
          <div className="p-3">
            <Skeleton className="h-44 w-full" />
          </div>
        ) : entry.category === 'image' && inspect?.mediaUrl ? (
          <div className="relative flex min-h-44 max-h-72 items-center justify-center bg-muted/40 p-2">
            <img
              src={inspect.mediaUrl}
              alt={entry.name}
              className="max-h-68 max-w-full rounded object-contain"
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
              {inspect.imageDimensions ? (
                <Badge variant="secondary" className="bg-background/90 font-mono text-[10px]">
                  {inspect.imageDimensions.width} × {inspect.imageDimensions.height}
                </Badge>
              ) : null}
              <Button
                variant="secondary"
                size="icon-xs"
                aria-label="查看大图"
                title="查看大图"
                onClick={() => openLightboxForEntry(selectedPaneId, entry)}
              >
                <Maximize2 size={12} />
              </Button>
            </div>
          </div>
        ) : entry.category === 'video' && inspect?.mediaUrl ? (
          <div className="bg-black/90">
            <video
              controls
              preload="metadata"
              src={inspect.mediaUrl}
              className="max-h-60 w-full"
            />
          </div>
        ) : entry.category === 'audio' && inspect?.mediaUrl ? (
          <div className="flex flex-col items-center gap-3 p-4">
            <FileCategoryIcon category="audio" size={40} />
            <audio controls preload="metadata" src={inspect.mediaUrl} className="w-full" />
          </div>
        ) : inspect?.textPreview !== null && inspect?.textPreview !== undefined ? (
          <div className="flex flex-col">
            <pre className="max-h-60 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-foreground">
              {inspect.textPreview || '（空文件）'}
            </pre>
            {inspect.textTruncated ? (
              <div className="border-t border-border bg-muted/40 px-3 py-1 text-[10px] text-muted-foreground">
                仅预览前 8 KB 内容
              </div>
            ) : null}
          </div>
        ) : inspect?.thumbUrl && !thumbFailed ? (
          <div className="flex h-44 items-center justify-center bg-muted/40 p-2">
            <img
              src={inspect.thumbUrl}
              alt={entry.name}
              onError={() => setThumbFailed(true)}
              className="max-h-40 max-w-full rounded object-contain"
            />
          </div>
        ) : (
          <div className="flex h-36 flex-col items-center justify-center gap-2 bg-muted/30 p-4">
            <FileCategoryIcon category={entry.category} size={44} />
            {entry.ext ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                {entry.ext.slice(1).toUpperCase()}
              </Badge>
            ) : null}
            {entry.isDir && inspect?.childCount !== null && inspect?.childCount !== undefined ? (
              <span className="text-[11px] text-muted-foreground">
                {inspect.folderChildCount ?? 0} 个文件夹 · {inspect.fileChildCount ?? 0} 个文件
              </span>
            ) : null}
          </div>
        )}
      </div>

      {/* 2. 标题与快捷操作 */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="break-all text-sm font-semibold leading-snug text-foreground">
              {entry.name}
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {categoryLabel(entry.category)}
              {!entry.isDir ? ` · ${formatBytes(entry.size)}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="outline"
            size="sm"
            data-lf-inspector-copy-path=""
            onClick={() => void handleCopyPath(fullPath)}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? '已复制路径' : '复制地址'}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            data-lf-inspector-reveal=""
            onClick={() => void revealInExplorer(fullPath)}
          >
            <ExternalLink size={13} />
            <span>在资源管理器中打开</span>
          </Button>

          {entry.isDir ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void navigatePane(selectedPaneId, entry.path)}
              >
                <FolderOpen size={13} />
                <span>进入文件夹</span>
              </Button>
              <Button
                variant={isFav ? 'secondary' : 'outline'}
                size="sm"
                data-lf-inspector-fav-toggle=""
                onClick={() =>
                  void (isFav ? removeFavorite({ path: entry.path }) : addFavorite(entry.path))
                }
              >
                <Star size={13} className={cn(isFav && 'fill-amber-400 text-amber-500')} />
                <span>{isFav ? '已收藏' : '收藏文件夹'}</span>
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* 3. 星级、标签与备注 */}
      <div
        data-lf-inspector-meta=""
        className="space-y-3 rounded-lg border border-border bg-background p-3"
      >
        {/* 星级评分 */}
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-muted-foreground">星级评分</span>
          <StarRatingInput
            value={currentRating}
            onChange={nextRating => void setFileMeta(entry.path, { rating: nextRating })}
          />
        </div>

        {/* 标签选择与快速添加 */}
        <ColoredTagChipsEditor
          allTags={metadata.tags}
          selectedTagIds={currentTagIds}
          onToggleTag={handleToggleTag}
          onQuickCreate={handleQuickCreateTag}
          onManageClick={() => setTagManagerOpen(true)}
        />

        {/* 文件备注 */}
        <AutoSaveNoteField
          key={entry.path}
          label="文件备注"
          placeholder="输入文件备注说明…"
          value={savedNote}
          onSave={nextNote => setFileMeta(entry.path, { note: nextNote })}
          data-lf-inspector-note=""
        />
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          读取文件详情失败：{error}
        </div>
      ) : null}

      <Separator />

      {/* 4. 文件信息元数据 */}
      <dl className="grid grid-cols-[76px_1fr] gap-x-2 gap-y-2 text-xs">
        <dt className="text-muted-foreground">类型</dt>
        <dd className="min-w-0 break-all font-medium text-foreground">
          {categoryLabel(entry.category)}
          <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
            {entry.mime}
          </span>
        </dd>

        {!entry.isDir ? (
          <>
            <dt className="text-muted-foreground">大小</dt>
            <dd className="tabular-nums text-foreground">
              {formatBytes(entry.size)}
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                ({entry.size.toLocaleString()} 字节)
              </span>
            </dd>
          </>
        ) : inspect?.childCount !== null && inspect?.childCount !== undefined ? (
          <>
            <dt className="text-muted-foreground">包含内容</dt>
            <dd className="tabular-nums text-foreground">
              {inspect.childCount} 项（{inspect.folderChildCount ?? 0} 文件夹，
              {inspect.fileChildCount ?? 0} 文件）
            </dd>
          </>
        ) : null}

        {inspect?.imageDimensions ? (
          <>
            <dt className="text-muted-foreground">分辨率</dt>
            <dd className="font-mono tabular-nums text-foreground">
              {inspect.imageDimensions.width} × {inspect.imageDimensions.height} px
            </dd>
          </>
        ) : null}

        <dt className="text-muted-foreground">修改时间</dt>
        <dd className="tabular-nums text-foreground">{formatDateTime(entry.mtimeMs)}</dd>

        <dt className="text-muted-foreground">创建时间</dt>
        <dd className="tabular-nums text-foreground">{formatDateTime(entry.ctimeMs)}</dd>

        {inspect?.parentPath ? (
          <>
            <dt className="text-muted-foreground">所在目录</dt>
            <dd className="min-w-0">
              <button
                type="button"
                onClick={() => void navigatePane(selectedPaneId, inspect.parentPath!)}
                className="break-all text-left font-mono text-[11px] text-primary hover:underline"
              >
                {inspect.parentPath}
              </button>
            </dd>
          </>
        ) : null}

        <dt className="text-muted-foreground">完整路径</dt>
        <dd className="min-w-0 select-all break-all font-mono text-[11px] text-foreground">
          {fullPath}
        </dd>

        <dt className="text-muted-foreground">属性</dt>
        <dd className="flex flex-wrap gap-1">
          {inspect?.readonly ? <Badge variant="secondary">只读</Badge> : <Badge variant="outline">可写</Badge>}
          {entry.isHidden ? <Badge variant="secondary">隐藏</Badge> : null}
          {entry.isSymlink ? <Badge variant="secondary">符号链接</Badge> : null}
        </dd>
      </dl>
    </div>
  )
}
