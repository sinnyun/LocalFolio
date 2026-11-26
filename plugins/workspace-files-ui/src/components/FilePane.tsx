import * as React from 'react'
import {
  AlertTriangle,
  ArrowDownNarrowWide,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpNarrowWide,
  ChevronDown,
  ChevronRight,
  Columns2,
  Eye,
  EyeOff,
  FolderOpen,
  LayoutGrid,
  List,
  Pencil,
  RefreshCw,
  Search,
  Star,
  StickyNote,
  X,
} from 'lucide-react'
import {
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  cn,
} from '@folio/base-ui-kit/client'
import { useFiles } from '../context.js'
import {
  buildDownloadUrl,
  categoryLabel,
  formatBytes,
  formatDateTime,
  getParentDirLabel,
  groupEntries,
  toPathKey,
} from '../format.js'
import type { FolioFileDragSession } from '@folio/base-contract'
import type {
  CategoryFilter,
  FileEntry,
  GroupBy,
  PaneId,
  SortBy,
  TagDef,
} from '../types.js'
import { FileThumbnail } from './FileIcon.js'

export interface FilePaneProps {
  readonly paneId: PaneId
}

export function FilePane({ paneId }: FilePaneProps): React.ReactElement {
  const {
    interactions,
    metadata,
    panes,
    activePaneId,
    dualPane,
    setActivePane,
    toggleDualPane,
    closeSecondaryPane,
    navigatePane,
    goBack,
    goForward,
    goUp,
    refreshPane,
    updatePane,
    setGroupBy,
    setShowHidden,
    selectEntry,
    openLightboxForEntry,
    isFavoritePath,
    addFavorite,
    removeFavorite,
    setTagManagerOpen,
    pruneMissingTaggedFiles,
  } = useFiles()

  const pane = panes[paneId]
  const isActive = activePaneId === paneId
  const activeTag =
    pane.mode === 'tag' && pane.activeTagId
      ? metadata.tags.find(t => t.id === pane.activeTagId) ?? null
      : null

  const tagById = React.useMemo(() => {
    const map = new Map<string, TagDef>()
    for (const t of metadata.tags) map.set(t.id, t)
    return map
  }, [metadata.tags])

  const [editingPath, setEditingPath] = React.useState(false)
  const [pathDraft, setPathDraft] = React.useState(pane.path)
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(() => new Set())
  const pathContainerRef = React.useRef<HTMLFormElement | null>(null)
  const filterContainerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!editingPath) {
      setPathDraft(pane.path)
    }
  }, [pane.path, editingPath])

  React.useEffect(() => {
    if (editingPath) {
      const input = pathContainerRef.current?.querySelector('input')
      input?.focus()
      input?.select()
    }
  }, [editingPath])

  const groups = React.useMemo(
    () =>
      groupEntries(
        pane.entries,
        pane.groupBy,
        pane.childGroups,
        pane.sortBy,
        pane.sortDir,
        pane.filterQuery,
        pane.categoryFilter,
        new Date(),
        metadata.files,
        pane.minRating,
        pane.mode,
      ),
    [
      pane.entries,
      pane.groupBy,
      pane.childGroups,
      pane.sortBy,
      pane.sortDir,
      pane.filterQuery,
      pane.categoryFilter,
      metadata.files,
      pane.minRating,
      pane.mode,
    ],
  )

  const canGoBack = pane.historyIndex > 0
  const canGoForward = pane.historyIndex < pane.history.length - 1
  const canGoUp = pane.mode === 'tag' || Boolean(pane.parentPath)
  const hasFilter =
    Boolean(pane.filterQuery.trim()) || pane.categoryFilter !== 'all' || pane.minRating > 0
  const isCurrentFav = pane.mode === 'directory' && Boolean(pane.path) && isFavoritePath(pane.path)

  const startPathEdit = (): void => {
    setPathDraft(pane.path)
    setEditingPath(true)
  }

  const submitPathEdit = (): void => {
    const trimmed = pathDraft.trim()
    setEditingPath(false)
    if (trimmed && (pane.mode === 'tag' || trimmed !== pane.path)) {
      void navigatePane(paneId, trimmed)
    }
  }

  const toggleGroupCollapsed = (key: string): void => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleEntryOpen = (entry: FileEntry): void => {
    if (entry.isDir) {
      void navigatePane(paneId, entry.path)
    } else if (entry.category === 'image') {
      openLightboxForEntry(paneId, entry)
    }
  }

  const dragSessionsRef = React.useRef<Map<string, FolioFileDragSession>>(new Map())

  React.useEffect(() => {
    return () => {
      for (const session of dragSessionsRef.current.values()) {
        session.dispose()
      }
      dragSessionsRef.current.clear()
    }
  }, [])

  const handleEntryPointerDown = (
    entry: FileEntry,
    event: React.PointerEvent<HTMLButtonElement>,
  ): void => {
    if (event.button !== 0 || entry.isDir || !interactions) return
    const prev = dragSessionsRef.current.get(entry.path)
    if (prev) prev.dispose()
    const session = interactions.createFileDragSession(
      {
        kind: 'url',
        url: buildDownloadUrl(entry),
        name: entry.name,
        mediaType: entry.mime,
      },
      { paths: [entry.path], sourceWorkspace: 'files' },
    )
    dragSessionsRef.current.set(entry.path, session)
    session.prepare()
  }

  const handleEntryDragStart = (
    entry: FileEntry,
    event: React.DragEvent<HTMLButtonElement>,
  ): void => {
    if (entry.isDir || !interactions || !event.dataTransfer) return
    let session = dragSessionsRef.current.get(entry.path)
    if (!session) {
      session = interactions.createFileDragSession(
        {
          kind: 'url',
          url: buildDownloadUrl(entry),
          name: entry.name,
          mediaType: entry.mime,
        },
        { paths: [entry.path], sourceWorkspace: 'files' },
      )
      dragSessionsRef.current.set(entry.path, session)
    }
    const continueBrowserDrag = session.start(event.dataTransfer, event.currentTarget)
    if (!continueBrowserDrag) {
      // Electron Desktop native drag took over; cancel browser drag so OS drag proceeds.
      event.preventDefault()
    }
  }

  const handleEntryDragEnd = (entry: FileEntry): void => {
    const session = dragSessionsRef.current.get(entry.path)
    if (session) {
      session.release()
      dragSessionsRef.current.delete(entry.path)
    }
  }

  const handleEntryContextMenu = (
    entry: FileEntry,
    event: React.MouseEvent<HTMLButtonElement>,
  ): void => {
    if (!interactions) return
    event.preventDefault()
    event.stopPropagation()
    selectEntry(paneId, entry)
    interactions.openContextMenu(
      { kind: 'folio.files.entry', value: { paneId, path: entry.path } },
      { x: event.clientX, y: event.clientY },
    )
  }

  const handlePaneKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
      event.preventDefault()
      startPathEdit()
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      filterContainerRef.current?.querySelector('input')?.focus()
      return
    }
    if (
      event.target instanceof HTMLElement &&
      event.target.closest('input, textarea, select, [contenteditable]')
    ) {
      return
    }
    if (event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault()
      void goBack(paneId)
    } else if (event.altKey && event.key === 'ArrowRight') {
      event.preventDefault()
      void goForward(paneId)
    } else if ((event.altKey && event.key === 'ArrowUp') || event.key === 'Backspace') {
      event.preventDefault()
      void goUp(paneId)
    }
  }

  const visibleBreadcrumbs = React.useMemo(() => {
    if (pane.breadcrumbs.length <= 5) return pane.breadcrumbs
    return [pane.breadcrumbs[0], ...pane.breadcrumbs.slice(-4)]
  }, [pane.breadcrumbs])

  const breadcrumbsCollapsed = pane.breadcrumbs.length > 5

  const renderEntryMetaBadges = (entry: FileEntry, compact = false) => {
    const meta = metadata.files[toPathKey(entry.path)]
    if (!meta) return null
    const entryTags = meta.tagIds
      .map(id => tagById.get(id))
      .filter((t): t is TagDef => Boolean(t))

    if (meta.rating === 0 && entryTags.length === 0 && !meta.note.trim()) {
      return null
    }

    return (
      <div className="flex flex-wrap items-center gap-1">
        {meta.rating > 0 ? (
          <span
            data-lf-entry-rating={String(meta.rating)}
            className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
          >
            <Star size={9} className="fill-current" />
            <span>{meta.rating}</span>
          </span>
        ) : null}
        {entryTags.slice(0, compact ? 2 : 3).map(tag => (
          <span
            key={tag.id}
            data-lf-entry-tag={tag.id}
            title={tag.name}
            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/60 px-1.5 py-0.5 text-[10px] text-foreground"
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
            <span className="max-w-16 truncate">{tag.name}</span>
          </span>
        ))}
        {entryTags.length > (compact ? 2 : 3) ? (
          <span className="text-[10px] text-muted-foreground">
            +{entryTags.length - (compact ? 2 : 3)}
          </span>
        ) : null}
        {meta.note.trim() ? (
          <span title={meta.note} className="inline-flex text-muted-foreground">
            <StickyNote size={10} />
          </span>
        ) : null}
      </div>
    )
  }

  return (
    <section
      data-lf-files-pane={paneId}
      data-active={isActive ? 'true' : undefined}
      tabIndex={-1}
      onMouseDown={() => {
        if (!isActive) setActivePane(paneId)
      }}
      onKeyDown={handlePaneKeyDown}
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none',
        dualPane && isActive && 'ring-1 ring-inset ring-primary/35',
      )}
    >
      {/* Row 1: 导航按钮 + 面包屑 / 标签聚合头 + 双栏切换 */}
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border bg-background px-2">
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            data-lf-files-back={paneId}
            aria-label="后退"
            title="后退 (Alt+←)"
            disabled={!canGoBack}
            onClick={() => void goBack(paneId)}
          >
            <ArrowLeft size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            data-lf-files-forward={paneId}
            aria-label="前进"
            title="前进 (Alt+→)"
            disabled={!canGoForward}
            onClick={() => void goForward(paneId)}
          >
            <ArrowRight size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            data-lf-files-up={paneId}
            aria-label={pane.mode === 'tag' ? '返回目录' : '上一级'}
            title={pane.mode === 'tag' ? '返回目录' : '上一级 (Alt+↑)'}
            disabled={!canGoUp}
            onClick={() => void goUp(paneId)}
          >
            <ArrowUp size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            data-lf-files-refresh={paneId}
            aria-label="刷新"
            title="刷新"
            onClick={() => void refreshPane(paneId)}
          >
            <RefreshCw size={13} className={cn(pane.loading && 'animate-spin')} />
          </Button>
        </div>

        {/* 面包屑导航 / 标签聚合头 / 可编辑输入 */}
        <div className="flex min-w-0 flex-1 items-center">
          {editingPath ? (
            <form
              ref={pathContainerRef}
              className="flex w-full items-center gap-1"
              onSubmit={ev => {
                ev.preventDefault()
                submitPathEdit()
              }}
            >
              <Input
                data-lf-files-path-input={paneId}
                aria-label="输入文件夹路径"
                value={pathDraft}
                onChange={ev => setPathDraft(ev.target.value)}
                onBlur={() => setEditingPath(false)}
                onKeyDown={ev => {
                  if (ev.key === 'Escape') {
                    ev.stopPropagation()
                    setPathDraft(pane.path)
                    setEditingPath(false)
                  }
                }}
                className="h-7 font-mono text-xs"
              />
            </form>
          ) : pane.mode === 'tag' ? (
            <div
              data-lf-pane-tag-header={paneId}
              className="flex h-7 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-2 text-xs"
            >
              <div className="flex min-w-0 items-center gap-2">
                {activeTag ? (
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: activeTag.color }}
                  />
                ) : null}
                <span className="truncate font-semibold">
                  标签聚合：{activeTag?.name ?? pane.activeTagId}
                </span>
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                  {pane.totalEntries}
                </Badge>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setTagManagerOpen(true)}
                  className="h-6 px-1.5 text-[11px]"
                >
                  管理标签
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  data-lf-files-edit-path={paneId}
                  aria-label="输入目录路径"
                  title="输入目录路径 (Ctrl+L)"
                  onClick={startPathEdit}
                >
                  <Pencil size={12} />
                </Button>
              </div>
            </div>
          ) : (
            <div
              data-lf-files-breadcrumbs={paneId}
              onClick={ev => {
                if ((ev.target as HTMLElement).closest('button, a')) return
                startPathEdit()
              }}
              className="flex h-7 min-w-0 flex-1 cursor-text items-center justify-between gap-1 rounded-md border border-border bg-muted/30 px-2 hover:border-ring/50"
            >
              <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
                <Breadcrumb>
                  <BreadcrumbList className="flex-nowrap gap-1 text-xs sm:gap-1">
                    {visibleBreadcrumbs.map((crumb, idx) => {
                      const isLast = idx === visibleBreadcrumbs.length - 1
                      return (
                        <React.Fragment key={crumb.path}>
                          {idx === 1 && breadcrumbsCollapsed ? (
                            <>
                              <BreadcrumbSeparator />
                              <BreadcrumbItem>
                                <span className="px-1 text-muted-foreground">…</span>
                              </BreadcrumbItem>
                            </>
                          ) : null}
                          {idx > 0 ? <BreadcrumbSeparator /> : null}
                          <BreadcrumbItem className="shrink-0">
                            {isLast ? (
                              <BreadcrumbPage className="max-w-44 truncate font-medium">
                                {crumb.name}
                              </BreadcrumbPage>
                            ) : (
                              <BreadcrumbLink asChild>
                                <button
                                  type="button"
                                  data-lf-breadcrumb-item={crumb.path}
                                  onClick={ev => {
                                    ev.stopPropagation()
                                    void navigatePane(paneId, crumb.path)
                                  }}
                                  className="max-w-36 truncate rounded px-1 py-0.5 hover:bg-muted hover:text-foreground"
                                >
                                  {crumb.name}
                                </button>
                              </BreadcrumbLink>
                            )}
                          </BreadcrumbItem>
                        </React.Fragment>
                      )
                    })}
                  </BreadcrumbList>
                </Breadcrumb>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                {pane.path ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    data-lf-pane-fav-toggle={paneId}
                    aria-label={isCurrentFav ? '取消收藏当前目录' : '收藏当前目录'}
                    title={isCurrentFav ? '已收藏，点击取消收藏' : '收藏当前目录'}
                    onClick={ev => {
                      ev.stopPropagation()
                      void (isCurrentFav
                        ? removeFavorite({ path: pane.path })
                        : addFavorite(pane.path))
                    }}
                  >
                    <Star
                      size={12}
                      className={cn(isCurrentFav && 'fill-amber-400 text-amber-500')}
                    />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  data-lf-files-edit-path={paneId}
                  aria-label="编辑路径"
                  title="编辑路径 (Ctrl+L)"
                  onClick={ev => {
                    ev.stopPropagation()
                    startPathEdit()
                  }}
                >
                  <Pencil size={12} />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 双栏控制 */}
        {paneId === 'left' ? (
          <Button
            variant={dualPane ? 'secondary' : 'ghost'}
            size="sm"
            data-lf-files-dual-toggle=""
            aria-pressed={dualPane}
            title={dualPane ? '关闭双栏视图' : '开启双栏视图'}
            onClick={toggleDualPane}
            className="h-7 shrink-0 gap-1 px-2 text-xs"
          >
            <Columns2 size={13} />
            <span className="hidden xl:inline">{dualPane ? '双栏' : '分栏'}</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-xs"
            data-lf-files-close-right=""
            aria-label="关闭右栏"
            title="关闭右栏"
            onClick={closeSecondaryPane}
          >
            <X size={13} />
          </Button>
        )}
      </div>

      {/* Row 2: 筛选 + 星级筛选 + 视图切换 + 网格大小 + 分组 + 排序 */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-2 py-1.5">
        <div
          ref={filterContainerRef}
          className="relative flex min-w-32 flex-1 items-center sm:max-w-52"
        >
          <Search
            size={13}
            className="pointer-events-none absolute left-2 text-muted-foreground"
          />
          <Input
            data-lf-files-filter={paneId}
            aria-label="筛选文件名"
            placeholder="筛选文件名… (Ctrl+F)"
            value={pane.filterQuery}
            onChange={ev => updatePane(paneId, { filterQuery: ev.target.value })}
            className="h-7 pl-7 pr-6 text-xs"
          />
          {pane.filterQuery ? (
            <button
              type="button"
              aria-label="清除筛选"
              onClick={() => updatePane(paneId, { filterQuery: '' })}
              className="absolute right-1.5 flex size-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>

        <Select
          value={pane.categoryFilter}
          onValueChange={val => updatePane(paneId, { categoryFilter: val as CategoryFilter })}
        >
          <SelectTrigger
            size="sm"
            data-lf-files-category={paneId}
            aria-label="按类型筛选"
            className="h-7 w-24 px-2 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="pointer-events-auto">
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="folder">文件夹</SelectItem>
            <SelectItem value="image">图片</SelectItem>
            <SelectItem value="video">视频</SelectItem>
            <SelectItem value="audio">音频</SelectItem>
            <SelectItem value="document">文档</SelectItem>
            <SelectItem value="code">代码</SelectItem>
            <SelectItem value="archive">压缩包</SelectItem>
            <SelectItem value="other">其他</SelectItem>
          </SelectContent>
        </Select>

        {/* 星级筛选 */}
        <Select
          value={String(pane.minRating)}
          onValueChange={val => updatePane(paneId, { minRating: Number(val) })}
        >
          <SelectTrigger
            size="sm"
            data-lf-files-rating-filter={paneId}
            aria-label="按星级筛选"
            className="h-7 w-24 px-2 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="pointer-events-auto">
            <SelectItem value="0">全部星级</SelectItem>
            <SelectItem value="1">≥ 1 ★</SelectItem>
            <SelectItem value="3">≥ 3 ★</SelectItem>
            <SelectItem value="4">≥ 4 ★</SelectItem>
            <SelectItem value="5">仅 5 ★</SelectItem>
          </SelectContent>
        </Select>

        <Select value={pane.groupBy} onValueChange={val => void setGroupBy(paneId, val as GroupBy)}>
          <SelectTrigger
            size="sm"
            data-lf-files-groupby={paneId}
            aria-label="分组方式"
            className="h-7 w-28 px-2 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="pointer-events-auto">
            <SelectItem value="none">不分组</SelectItem>
            <SelectItem value="time">按时间分组</SelectItem>
            <SelectItem value="type">按类型分组</SelectItem>
            <SelectItem value="name">按名称分组</SelectItem>
            <SelectItem value="parent">父子文件夹</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-0.5">
          <Select
            value={pane.sortBy}
            onValueChange={val => updatePane(paneId, { sortBy: val as SortBy })}
          >
            <SelectTrigger
              size="sm"
              data-lf-files-sortby={paneId}
              aria-label="排序依据"
              className="h-7 w-24 px-2 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="pointer-events-auto">
              <SelectItem value="name">按名称</SelectItem>
              <SelectItem value="mtime">修改时间</SelectItem>
              <SelectItem value="size">文件大小</SelectItem>
              <SelectItem value="type">文件类型</SelectItem>
              <SelectItem value="rating">按星级</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-xs"
            data-lf-files-sortdir={paneId}
            aria-label={pane.sortDir === 'asc' ? '切换为降序' : '切换为升序'}
            title={pane.sortDir === 'asc' ? '当前升序，点击降序' : '当前降序，点击升序'}
            onClick={() =>
              updatePane(paneId, { sortDir: pane.sortDir === 'asc' ? 'desc' : 'asc' })
            }
          >
            {pane.sortDir === 'asc' ? (
              <ArrowUpNarrowWide size={13} />
            ) : (
              <ArrowDownNarrowWide size={13} />
            )}
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {pane.viewMode === 'grid' ? (
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5">
              <span className="text-[10px] text-muted-foreground">缩略图</span>
              <input
                type="range"
                min={96}
                max={240}
                step={16}
                aria-label="调整网格大小"
                data-lf-files-grid-size={paneId}
                value={pane.gridSize}
                onChange={ev => updatePane(paneId, { gridSize: Number(ev.target.value) })}
                className="h-1.5 w-20 cursor-pointer accent-primary"
              />
              <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {pane.gridSize}
              </span>
            </div>
          ) : null}

          <div className="flex items-center rounded-md border border-border bg-background p-0.5">
            <button
              type="button"
              data-lf-files-view-grid={paneId}
              aria-label="网格视图"
              aria-pressed={pane.viewMode === 'grid'}
              title="网格视图"
              onClick={() => updatePane(paneId, { viewMode: 'grid' })}
              className={cn(
                'flex size-6 items-center justify-center rounded-sm transition-colors',
                pane.viewMode === 'grid'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              type="button"
              data-lf-files-view-list={paneId}
              aria-label="列表视图"
              aria-pressed={pane.viewMode === 'list'}
              title="列表视图"
              onClick={() => updatePane(paneId, { viewMode: 'list' })}
              className={cn(
                'flex size-6 items-center justify-center rounded-sm transition-colors',
                pane.viewMode === 'list'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <List size={13} />
            </button>
          </div>

          {pane.mode === 'directory' ? (
            <Button
              variant={pane.showHidden ? 'secondary' : 'ghost'}
              size="icon-xs"
              data-lf-files-hidden-toggle={paneId}
              aria-label={pane.showHidden ? '隐藏点文件' : '显示隐藏文件'}
              aria-pressed={pane.showHidden}
              title={pane.showHidden ? '已显示隐藏文件' : '已隐藏点文件'}
              onClick={() => void setShowHidden(paneId, !pane.showHidden)}
            >
              {pane.showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Viewport */}
      <div
        data-lf-files-viewport={paneId}
        className="flex min-h-0 flex-1 flex-col overflow-auto p-3"
      >
        {pane.error ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span className="truncate">{pane.error}</span>
            <Button variant="outline" size="xs" onClick={() => void refreshPane(paneId)}>
              重试
            </Button>
          </div>
        ) : null}

        {pane.mode === 'tag' && pane.missingPaths.length > 0 ? (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span>有 {pane.missingPaths.length} 个带该标签的文件在磁盘上已移动或删除</span>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => void pruneMissingTaggedFiles(paneId)}
            >
              清理失效记录
            </Button>
          </div>
        ) : null}

        {pane.loading && pane.entries.length === 0 ? (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${pane.gridSize}px, 1fr))`,
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <Empty className="my-auto border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpen size={22} />
              </EmptyMedia>
              <EmptyTitle className="text-base">
                {hasFilter
                  ? '没有匹配的文件'
                  : pane.mode === 'tag'
                    ? '该标签下暂无文件'
                    : '此文件夹为空'}
              </EmptyTitle>
              <EmptyDescription className="text-xs">
                {hasFilter
                  ? '尝试修改筛选关键词、星级或类型条件。'
                  : pane.mode === 'tag'
                    ? '选中任意文件并在右侧检查器中添加该标签后，文件会聚合显示在这里。'
                    : '当前目录下没有任何文件或子文件夹。'}
              </EmptyDescription>
            </EmptyHeader>
            {hasFilter ? (
              <EmptyContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updatePane(paneId, { filterQuery: '', categoryFilter: 'all', minRating: 0 })
                  }
                >
                  清除筛选条件
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        ) : (
          <div className="space-y-4">
            {groups.map(group => {
              const collapsed = collapsedGroups.has(group.key)
              return (
                <div key={group.key} data-lf-files-group={group.key} className="space-y-2">
                  {group.title ? (
                    <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-1">
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapsed(group.key)}
                        className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary"
                      >
                        {collapsed ? (
                          <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
                        )}
                        {group.isSubfolder ? (
                          <FolderOpen size={14} className="shrink-0 text-sky-500" />
                        ) : null}
                        <span className="truncate">{group.title}</span>
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                          {group.totalCount}
                          {group.truncated ? '+' : ''}
                        </Badge>
                      </button>

                      {group.isSubfolder && group.folderPath ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => void navigatePane(paneId, group.folderPath!)}
                          className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          进入目录
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {collapsed ? null : group.entries.length === 0 ? (
                    <div className="px-2 py-2 text-[11px] text-muted-foreground">
                      空子文件夹
                    </div>
                  ) : pane.viewMode === 'grid' ? (
                    <div
                      data-lf-files-grid={paneId}
                      className="grid gap-2.5"
                      style={{
                        gridTemplateColumns: `repeat(auto-fill, minmax(${pane.gridSize}px, 1fr))`,
                      }}
                    >
                      {group.entries.map(entry => {
                        const selected = pane.selectedPath === entry.path
                        const thumbHeight = Math.max(72, Math.round(pane.gridSize * 0.72))
                        const parentInfo =
                          pane.mode === 'tag' ? getParentDirLabel(entry.path) : null
                        return (
                          <button
                            key={entry.path}
                            type="button"
                            draggable={!entry.isDir}
                            data-lf-file-item={entry.path}
                            data-selected={selected ? 'true' : undefined}
                            onClick={() => selectEntry(paneId, entry)}
                            onDoubleClick={() => handleEntryOpen(entry)}
                            onPointerDown={ev => handleEntryPointerDown(entry, ev)}
                            onDragStart={ev => handleEntryDragStart(entry, ev)}
                            onDragEnd={() => handleEntryDragEnd(entry)}
                            onContextMenu={ev => handleEntryContextMenu(entry, ev)}
                            className={cn(
                              'group flex flex-col gap-1.5 rounded-lg border border-transparent bg-card/50 p-2 text-left transition-colors hover:border-border hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              selected && 'border-primary/60 bg-accent ring-1 ring-primary/40',
                            )}
                          >
                            <div style={{ height: thumbHeight }} className="w-full">
                              <FileThumbnail
                                entry={entry}
                                sizePx={pane.gridSize}
                                className="h-full w-full"
                              />
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="line-clamp-2 break-all text-xs font-medium leading-snug text-foreground">
                                {entry.name}
                              </div>
                              <div className="truncate text-[10px] tabular-nums text-muted-foreground">
                                {parentInfo
                                  ? `${parentInfo.parentName} · ${entry.isDir ? '文件夹' : formatBytes(entry.size)}`
                                  : entry.isDir
                                    ? '文件夹'
                                    : `${formatBytes(entry.size)} · ${categoryLabel(entry.category)}`}
                              </div>
                              {renderEntryMetaBadges(entry)}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div
                      data-lf-files-list={paneId}
                      className="overflow-hidden rounded-lg border border-border"
                    >
                      <div className="grid grid-cols-[1fr_140px_76px_88px_132px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                        <span>名称</span>
                        <span>标记</span>
                        <span>类型</span>
                        <span className="text-right">大小</span>
                        <span className="text-right">修改时间</span>
                      </div>
                      <div className="divide-y divide-border/60">
                        {group.entries.map(entry => {
                          const selected = pane.selectedPath === entry.path
                          return (
                            <button
                              key={entry.path}
                              type="button"
                              draggable={!entry.isDir}
                              data-lf-file-item={entry.path}
                              data-selected={selected ? 'true' : undefined}
                              onClick={() => selectEntry(paneId, entry)}
                              onDoubleClick={() => handleEntryOpen(entry)}
                              onPointerDown={ev => handleEntryPointerDown(entry, ev)}
                              onDragStart={ev => handleEntryDragStart(entry, ev)}
                              onDragEnd={() => handleEntryDragEnd(entry)}
                              onContextMenu={ev => handleEntryContextMenu(entry, ev)}
                              className={cn(
                                'grid w-full grid-cols-[1fr_140px_76px_88px_132px] items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent/50 focus-visible:outline-none',
                                selected && 'bg-accent text-accent-foreground',
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <FileThumbnail
                                  entry={entry}
                                  sizePx={48}
                                  compact
                                  className="size-7 shrink-0"
                                />
                                <span className="truncate font-medium">{entry.name}</span>
                              </div>
                              <div className="min-w-0">{renderEntryMetaBadges(entry, true)}</div>
                              <span className="truncate text-[11px] text-muted-foreground">
                                {categoryLabel(entry.category)}
                              </span>
                              <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                                {entry.isDir ? '—' : formatBytes(entry.size)}
                              </span>
                              <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                                {formatDateTime(entry.mtimeMs)}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
