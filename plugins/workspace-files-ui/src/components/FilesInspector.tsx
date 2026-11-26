import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import { rpcCall } from '@folio/base-contract/rpc'
import {
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  Maximize2,
  Plus,
  Star,
  Tag,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  FolioInput,
  FolioTextarea,
  Separator,
  Skeleton,
  cn,
  toast,
} from '@folio/base-ui-kit/client'
import { useFiles } from '../context.js'
import {
  TAG_COLOR_PALETTE,
  categoryLabel,
  formatBytes,
  formatDateTime,
} from '../format.js'
import type { FileInspectResult } from '../types.js'
import { FileCategoryIcon } from './FileIcon.js'

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall back to execCommand below
    }
  }
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try {
      return document.execCommand('copy')
    } finally {
      textarea.remove()
    }
  }
  return false
}

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

  const [hoverStar, setHoverStar] = React.useState<number>(0)
  const [tagQuery, setTagQuery] = React.useState('')
  const [noteDraft, setNoteDraft] = React.useState('')
  const [noteDirty, setNoteDirty] = React.useState(false)

  const targetPath = selectedEntry?.path ?? null
  const currentMeta = targetPath ? getFileMeta(targetPath) : null
  const currentRating = currentMeta?.rating ?? 0
  const currentTagIds = currentMeta?.tagIds ?? []
  const savedNote = currentMeta?.note ?? ''

  const pendingNoteRef = React.useRef<{ path: string; note: string; dirty: boolean } | null>(null)
  pendingNoteRef.current = targetPath
    ? { path: targetPath, note: noteDraft, dirty: noteDirty }
    : null

  React.useEffect(() => {
    setCopied(false)
    setThumbFailed(false)
    setTagQuery('')
    setHoverStar(0)
    if (!targetPath) {
      setInspect(null)
      setError(null)
      setLoading(false)
      setNoteDraft('')
      setNoteDirty(false)
      return
    }
    setNoteDraft(getFileMeta(targetPath)?.note ?? '')
    setNoteDirty(false)

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
      // Flush dirty note before switching away
      const pending = pendingNoteRef.current
      if (pending && pending.dirty && pending.path === targetPath) {
        void setFileMeta(pending.path, { note: pending.note })
      }
    }
  }, [targetPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external note changes when not actively dirty
  React.useEffect(() => {
    if (!noteDirty && targetPath) {
      setNoteDraft(savedNote)
    }
  }, [savedNote, noteDirty, targetPath])

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

  const flushNote = (): void => {
    if (!targetPath || !noteDirty) return
    setNoteDirty(false)
    void setFileMeta(targetPath, { note: noteDraft })
  }

  const handleSetRating = (star: number): void => {
    if (!targetPath) return
    const nextRating = currentRating === star ? 0 : star
    void setFileMeta(targetPath, { rating: nextRating })
  }

  const handleToggleTag = (tagId: string): void => {
    if (!targetPath) return
    const exists = currentTagIds.includes(tagId)
    const nextTagIds = exists
      ? currentTagIds.filter(id => id !== tagId)
      : [...currentTagIds, tagId]
    void setFileMeta(targetPath, { tagIds: nextTagIds })
  }

  const handleQuickCreateTag = async (): Promise<void> => {
    if (!targetPath) return
    const trimmed = tagQuery.trim()
    if (!trimmed) return
    const color = TAG_COLOR_PALETTE[metadata.tags.length % TAG_COLOR_PALETTE.length]
    const created = await createTag(trimmed, color)
    if (created) {
      setTagQuery('')
      if (!currentTagIds.includes(created.id)) {
        await setFileMeta(targetPath, { tagIds: [...currentTagIds, created.id] })
      }
    }
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
  const assignedTags = metadata.tags.filter(t => currentTagIds.includes(t.id))
  const qLower = tagQuery.trim().toLowerCase()
  const unassignedTags = metadata.tags.filter(
    t => !currentTagIds.includes(t.id) && (!qLower || t.name.toLowerCase().includes(qLower)),
  )
  const hasExactTagMatch = metadata.tags.some(t => t.name.toLowerCase() === qLower)

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
          <div className="flex items-center gap-1" onMouseLeave={() => setHoverStar(0)}>
            {[1, 2, 3, 4, 5].map(star => {
              const filled = star <= (hoverStar || currentRating)
              return (
                <button
                  key={star}
                  type="button"
                  data-lf-inspector-star={String(star)}
                  aria-label={`评分 ${star} 星`}
                  aria-pressed={currentRating === star}
                  onMouseEnter={() => setHoverStar(star)}
                  onClick={() => handleSetRating(star)}
                  className="rounded p-0.5 transition-transform hover:scale-110"
                >
                  <Star
                    size={15}
                    className={cn(
                      filled
                        ? 'fill-amber-400 text-amber-500'
                        : 'text-muted-foreground/50 hover:text-amber-400',
                    )}
                  />
                </button>
              )
            })}
            {currentRating > 0 ? (
              <button
                type="button"
                aria-label="清除星级"
                onClick={() => void setFileMeta(entry.path, { rating: 0 })}
                className="ml-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                清除
              </button>
            ) : null}
          </div>
        </div>

        {/* 标签选择与快速添加 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-muted-foreground">标签</span>
            <button
              type="button"
              onClick={() => setTagManagerOpen(true)}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Tag size={11} />
              <span>管理标签</span>
            </button>
          </div>

          {assignedTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {assignedTags.map(tag => (
                <span
                  key={tag.id}
                  data-lf-inspector-assigned-tag={tag.id}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span>{tag.name}</span>
                  <button
                    type="button"
                    data-lf-inspector-tag-remove={tag.id}
                    aria-label={`移除标签 ${tag.name}`}
                    onClick={() => handleToggleTag(tag.id)}
                    className="ml-0.5 rounded-full text-muted-foreground hover:text-destructive"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-1.5">
            <FolioInput
              size="sm"
              data-lf-inspector-tag-input=""
              placeholder="搜索或输入新标签…"
              value={tagQuery}
              onChange={ev => setTagQuery(ev.target.value)}
              onKeyDown={ev => {
                if (ev.key === 'Enter' && tagQuery.trim()) {
                  ev.preventDefault()
                  if (unassignedTags.length > 0 && hasExactTagMatch) {
                    const exact = unassignedTags.find(t => t.name.toLowerCase() === qLower)
                    if (exact) {
                      handleToggleTag(exact.id)
                      setTagQuery('')
                    }
                  } else if (!hasExactTagMatch) {
                    void handleQuickCreateTag()
                  }
                }
              }}
              className="min-w-0 flex-1"
            />
          </div>

          {tagQuery.trim() && !hasExactTagMatch ? (
            <button
              type="button"
              data-lf-inspector-tag-quick-create=""
              onClick={() => void handleQuickCreateTag()}
              className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-primary/50 bg-primary/5 px-2 py-1 text-[11px] text-primary hover:bg-primary/10"
            >
              <Plus size={12} />
              <span>创建并添加标签「{tagQuery.trim()}」</span>
            </button>
          ) : null}

          {unassignedTags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {unassignedTags.slice(0, 8).map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  data-lf-inspector-tag-pick={tag.id}
                  onClick={() => handleToggleTag(tag.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Plus size={10} />
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span>{tag.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* 文件备注 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-muted-foreground">文件备注</span>
            <span className="text-[10px] text-muted-foreground">
              {noteDirty ? '未保存（失焦或 Ctrl+Enter 保存）' : savedNote ? '已保存' : ''}
            </span>
          </div>
          <FolioTextarea
            data-lf-inspector-note=""
            rows={3}
            placeholder="输入文件备注说明…"
            value={noteDraft}
            onChange={ev => {
              setNoteDraft(ev.target.value)
              setNoteDirty(true)
            }}
            onBlur={flushNote}
            onKeyDown={ev => {
              if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
                ev.preventDefault()
                flushNote()
              }
            }}
            className="w-full resize-y text-xs"
          />
        </div>
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
