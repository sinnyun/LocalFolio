import * as React from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  Eye,
  EyeOff,
  FolderOpen,
  Pencil,
  RefreshCw,
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
  cn,
} from '@folio/base-ui-kit/client'
import {
  CollectionBrowser,
  type CollectionItemRenderLayout,
} from '@folio/base-collection-ui/client'
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
  FileGroup,
  GroupBy,
  PaneId,
  SortBy,
  TagDef,
} from '../types.js'
import { FileThumbnail } from './FileIcon.js'

export interface FilePaneProps {
  readonly paneId: PaneId
}

const CATEGORY_FILTER_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'folder', label: '文件夹' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
  { value: 'document', label: '文档' },
  { value: 'code', label: '代码' },
  { value: 'archive', label: '压缩包' },
  { value: 'other', label: '其他' },
] as const

const SORT_OPTIONS = [
  { value: 'name', label: '按名称' },
  { value: 'mtime', label: '修改时间' },
  { value: 'size', label: '文件大小' },
  { value: 'type', label: '文件类型' },
  { value: 'rating', label: '按星级' },
] as const

const RATING_FILTER_OPTIONS = [
  { value: '0', label: '全部星级' },
  { value: '1', label: '≥ 1 ★' },
  { value: '3', label: '≥ 3 ★' },
  { value: '4', label: '≥ 4 ★' },
  { value: '5', label: '仅 5 ★' },
] as const

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
  const paneSectionRef = React.useRef<HTMLElement | null>(null)

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
  const allCollapsed = groups.length > 0 && groups.every(group => collapsedGroups.has(group.key))

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

  const toggleAllGroups = (collapse: boolean): void => {
    setCollapsedGroups(collapse ? new Set(groups.map(group => group.key)) : new Set())
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
      paneSectionRef.current
        ?.querySelector<HTMLInputElement>(`[data-lf-files-filter="${paneId}"]`)
        ?.focus()
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

  const renderEntry = (
    entry: FileEntry,
    layout: CollectionItemRenderLayout,
  ): React.ReactElement => {
    const selected = pane.selectedPath === entry.path
    const interactionProps = {
      type: 'button' as const,
      draggable: !entry.isDir,
      'data-lf-file-item': entry.path,
      'data-selected': selected ? 'true' : undefined,
      onClick: () => selectEntry(paneId, entry),
      onDoubleClick: () => handleEntryOpen(entry),
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) =>
        handleEntryPointerDown(entry, event),
      onDragStart: (event: React.DragEvent<HTMLButtonElement>) =>
        handleEntryDragStart(entry, event),
      onDragEnd: () => handleEntryDragEnd(entry),
      onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) =>
        handleEntryContextMenu(entry, event),
    }

    if (layout.mode === 'list') {
      return (
        <button
          {...interactionProps}
          className={cn(
            'grid h-full w-full grid-cols-[1fr_140px_76px_76px_120px] items-center gap-2 rounded px-3 text-left text-xs transition-colors hover:bg-accent/50 focus-visible:outline-none',
            selected && 'bg-accent text-accent-foreground',
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileThumbnail entry={entry} sizePx={48} compact className="size-7 shrink-0" />
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
    }

    const parentInfo = pane.mode === 'tag' ? getParentDirLabel(entry.path) : null

    return (
      <button
        {...interactionProps}
        className={cn(
          'group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border border-transparent bg-card/50 p-2 text-left transition-colors hover:border-border hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected && 'border-primary/60 bg-accent ring-1 ring-primary/40',
        )}
      >
        <div className="relative min-h-0 w-full flex-1">
          <FileThumbnail
            entry={entry}
            sizePx={Math.max(96, Math.round(layout.width))}
            objectFit={layout.mode === 'grid' ? 'contain' : 'cover'}
            onAspectRatio={layout.reportAspectRatio}
            className="h-full w-full"
          />
        </div>
        <div className="mt-1.5 min-w-0 space-y-0.5">
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
  }

  const emptyTitle = hasFilter
    ? '没有匹配的文件'
    : pane.mode === 'tag'
      ? '该标签下暂无文件'
      : '此文件夹为空'
  const emptyDescription = hasFilter
    ? '尝试修改筛选关键词、星级或类型条件。'
    : pane.mode === 'tag'
      ? '选中任意文件并在右侧检查器中添加该标签后，文件会聚合显示在这里。'
      : '当前目录下没有任何文件或子文件夹。'

  return (
    <section
      ref={paneSectionRef}
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

      {/* Row 2+: 统一集合视图（筛选 / 分类 / 星级 / 分组 / 排序 / 四视图） */}
      <CollectionBrowser<FileGroup, FileEntry>
        groups={groups}
        getGroupKey={group => group.key}
        getGroupItems={group => group.entries}
        getGroupTitle={group => group.title}
        getGroupMeta={group => `${group.totalCount}${group.truncated ? '+' : ''} 项`}
        hasHeader={group => Boolean(group.title)}
        getItemKey={entry => entry.path}
        getItemAspectKey={entry => `files:${entry.path}`}
        getItemAspect={entry => (entry.category === 'image' ? 1 : 1.25)}
        renderItem={(entry, _group, layout) => renderEntry(entry, layout)}
        renderGroupActions={group =>
          group.isSubfolder && group.folderPath ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void navigatePane(paneId, group.folderPath!)}
              className="h-6 text-[11px] text-muted-foreground hover:text-foreground"
            >
              进入目录
            </Button>
          ) : null
        }
        collapsedKeys={collapsedGroups}
        onToggleGroupCollapsed={toggleGroupCollapsed}
        viewMode={pane.viewMode}
        onViewModeChange={mode => updatePane(paneId, { viewMode: mode })}
        viewDataAttrPrefix="data-lf-files"
        viewDataAttrValue={paneId}
        cardSize={pane.cardSize}
        onCardSizeChange={size => updatePane(paneId, { cardSize: size })}
        cardSizeRange={{ min: 96, max: 256, step: 16 }}
        cardSizeDataAttr={{ 'data-lf-files-grid-size': paneId }}
        filter={{
          value: pane.filterQuery,
          onChange: value => updatePane(paneId, { filterQuery: value }),
          placeholder: '筛选文件名… (Ctrl+F)',
          ariaLabel: '筛选文件名',
          dataAttr: { 'data-lf-files-filter': paneId },
        }}
        category={{
          value: pane.categoryFilter,
          onChange: value =>
            updatePane(paneId, { categoryFilter: value as CategoryFilter }),
          options: CATEGORY_FILTER_OPTIONS,
          dataAttr: { 'data-lf-files-category': paneId },
        }}
        extraFilters={
          <>
            <Select
              value={String(pane.minRating)}
              onValueChange={value => updatePane(paneId, { minRating: Number(value) })}
            >
              <SelectTrigger
                size="sm"
                aria-label="按星级筛选"
                className="h-7 w-24 px-2 text-xs"
                data-lf-files-rating-filter={paneId}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="pointer-events-auto">
                {RATING_FILTER_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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
          </>
        }
        groupBy={{
          value: pane.groupBy,
          onChange: value => void setGroupBy(paneId, value as GroupBy),
          dataAttr: { 'data-lf-files-groupby': paneId },
        }}
        sort={{
          value: pane.sortBy,
          onChange: value => updatePane(paneId, { sortBy: value as SortBy }),
          options: SORT_OPTIONS,
          dir: pane.sortDir,
          onDirChange: dir => updatePane(paneId, { sortDir: dir }),
          dataAttr: { 'data-lf-files-sortby': paneId },
          dirDataAttr: { 'data-lf-files-sortdir': paneId },
        }}
        actions={
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            title={allCollapsed ? '展开全部分组' : '折叠全部分组'}
            aria-label={allCollapsed ? '展开全部分组' : '折叠全部分组'}
            onClick={() => toggleAllGroups(!allCollapsed)}
          >
            {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
          </Button>
        }
        banner={
          pane.error || (pane.mode === 'tag' && pane.missingPaths.length > 0) ? (
            <div className="space-y-1 border-b border-border px-3 py-2">
              {pane.error ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <span className="truncate">{pane.error}</span>
                  <Button variant="outline" size="xs" onClick={() => void refreshPane(paneId)}>
                    重试
                  </Button>
                </div>
              ) : null}
              {pane.mode === 'tag' && pane.missingPaths.length > 0 ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
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
            </div>
          ) : null
        }
        loading={pane.loading && pane.entries.length === 0}
        skeletonCount={8}
        listRowHeight={34}
        listHeader={
          pane.viewMode === 'list' ? (
            <div
              data-lf-files-list-header={paneId}
              className="grid grid-cols-[1fr_140px_76px_76px_120px] items-center gap-2 rounded-t-lg border border-border border-b-0 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
            >
              <span>名称</span>
              <span>标记</span>
              <span>类型</span>
              <span className="text-right">大小</span>
              <span className="text-right">修改时间</span>
            </div>
          ) : null
        }
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyState={
          <Empty className="my-auto border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderOpen size={22} />
              </EmptyMedia>
              <EmptyTitle className="text-base">{emptyTitle}</EmptyTitle>
              <EmptyDescription className="text-xs">{emptyDescription}</EmptyDescription>
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
        }
        scrollDataAttr={{ 'data-lf-files-viewport': paneId }}
        metaHeight={56}
        resetKey={`${pane.path}:${pane.mode}:${pane.groupBy}:${pane.viewMode}`}
      />
    </section>
  )
}
