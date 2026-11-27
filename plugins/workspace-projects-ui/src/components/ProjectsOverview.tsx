import * as React from 'react'
import { useVirtualGroupedGrid } from '@folio/base-collection-ui/client'
import type { FrameViewProps } from '@folio/base-contract'
import {
  Check,
  CheckSquare,
  FolderOpen,
  FolderPlus,
  Layers,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import {
  Badge,
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
import { useProjects } from '../context.js'
import { buildProjectCoverUrl, formatBytes } from '../format.js'
import type { CardZoom, ProjectSummary, SortMode } from '../types.js'
import { LazyThumbImage } from './LazyThumbImage.js'
import { ProjectsBatchBar } from './ProjectsBatchBar.js'

const CARD_DIMENSIONS: Record<
  CardZoom,
  { readonly minWidth: number; readonly rowHeight: number; readonly thumbClass: string }
> = {
  sm: { minWidth: 160, rowHeight: 180, thumbClass: 'h-24' },
  md: { minWidth: 204, rowHeight: 264, thumbClass: 'h-32' },
  lg: { minWidth: 252, rowHeight: 312, thumbClass: 'h-44' },
}

interface OverviewGroup {
  readonly id: string
  readonly projects: readonly ProjectSummary[]
}

const OVERVIEW_GROUP: readonly OverviewGroup[] = []
const NO_COLLAPSED: ReadonlySet<string> = new Set()
const noHeader = (): boolean => false

/**
 * Library overview: every project in the current scope rendered as a card.
 * Clicking a card opens the project (the frame then swaps the left sidebar to
 * that library's project list and the center to the grouped file grid).
 */
export function ProjectsOverview(_props: FrameViewProps): React.ReactElement {
  const {
    indexLoading,
    libraries,
    allProjects,
    activeLibraryId,
    activeLibrary,
    overviewShowAll,
    overviewScopeProjects,
    overviewProjects,
    overviewAvailableTags,
    overviewSearchQuery,
    overviewTagFilter,
    overviewOnlyChanged,
    overviewCardZoom,
    overviewSortMode,
    batchMode,
    selectedProjectIds,
    aiStatus,
    extensions,
    setOverviewSearchQuery,
    setOverviewTagFilter,
    setOverviewOnlyChanged,
    setOverviewCardZoom,
    setOverviewSortMode,
    showAllProjects,
    openProject,
    openProjectContextMenu,
    pickAndAddLibrary,
    setAddDialogOpen,
    toggleBatchMode,
    toggleProjectChecked,
    selectAllOverviewProjects,
    extractBatchWithAi,
  } = useProjects()

  const zoomCfg = CARD_DIMENSIONS[overviewCardZoom]
  const groups = React.useMemo<readonly OverviewGroup[]>(
    () =>
      overviewProjects.length > 0
        ? [{ id: 'overview', projects: overviewProjects }]
        : OVERVIEW_GROUP,
    [overviewProjects],
  )
  const resetKey = `${overviewShowAll}:${activeLibraryId}:${overviewSearchQuery}:${overviewTagFilter}:${overviewOnlyChanged}:${overviewSortMode}:${overviewCardZoom}`
  const { containerRef, columnCount, totalHeight, visibleRows } = useVirtualGroupedGrid<
    OverviewGroup,
    ProjectSummary,
    HTMLDivElement
  >({
    groups,
    getGroupKey: group => group.id,
    getGroupItems: group => group.projects,
    collapsedKeys: NO_COLLAPSED,
    minCardWidth: zoomCfg.minWidth,
    rowHeight: zoomCfg.rowHeight,
    gapPx: 12,
    hasHeader: noHeader,
    resetKey,
  })

  const libraryNames = React.useMemo(
    () => new Map(libraries.map(library => [library.id, library.name])),
    [libraries],
  )
  const changedCount = React.useMemo(
    () => overviewScopeProjects.filter(project => project.hasChanges).length,
    [overviewScopeProjects],
  )
  const selectedOverviewProjects = React.useMemo(
    () => allProjects.filter(project => selectedProjectIds.has(project.id)),
    [allProjects, selectedProjectIds],
  )
  const hasFilters = Boolean(overviewSearchQuery.trim() || overviewTagFilter || overviewOnlyChanged)
  const scopeTitle = overviewShowAll ? '全部项目' : activeLibrary?.name ?? '项目库'
  const scopeSubtitle = overviewShowAll
    ? `${libraries.length} 个项目库 · 点击卡片进入项目`
    : activeLibrary?.rootPath ?? ''

  const handleCardClick = (project: ProjectSummary): void => {
    if (batchMode) {
      toggleProjectChecked(project.id)
      return
    }
    openProject(project.id)
  }

  if (libraries.length === 0) {
    return (
      <div data-lf-projects-overview="" className="flex h-full items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen size={24} />
            </EmptyMedia>
            <EmptyTitle>尚未导入项目库</EmptyTitle>
            <EmptyDescription>
              添加本地归档根目录后，工作台会在后台扫描项目并生成就地缓存与缩略图。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex items-center gap-2">
              <Button onClick={() => void pickAndAddLibrary()}>
                <FolderPlus size={15} className="mr-1.5" />
                选择文件夹添加库
              </Button>
              <Button variant="outline" onClick={() => setAddDialogOpen(true)}>
                输入路径
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return (
    <div
      data-lf-projects-overview=""
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{scopeTitle}</h2>
            <Badge variant="secondary" className="text-[11px]">
              {overviewProjects.length} 个项目
            </Badge>
            {changedCount > 0 ? (
              <button
                type="button"
                title="只看有文件变更的项目"
                onClick={() => setOverviewOnlyChanged(!overviewOnlyChanged)}
                className={cn(
                  'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors',
                  overviewOnlyChanged
                    ? 'bg-amber-500/20 font-medium text-amber-500'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                有变更 ({changedCount})
              </button>
            ) : null}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">{scopeSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <div className="relative w-52">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={overviewSearchQuery}
              onChange={e => setOverviewSearchQuery(e.target.value)}
              placeholder="搜索项目名 / 类型 / 标签…"
              className="h-7 pl-7 pr-6 text-xs"
            />
            {overviewSearchQuery ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setOverviewSearchQuery('')}
                aria-label="清空项目搜索"
              >
                <X size={12} />
              </button>
            ) : null}
          </div>

          <Select
            value={overviewTagFilter ?? 'all'}
            onValueChange={value => setOverviewTagFilter(value === 'all' ? null : value)}
          >
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部标签</SelectItem>
              {overviewAvailableTags.map(tag => (
                <SelectItem key={tag} value={tag}>
                  #{tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={overviewSortMode}
            onValueChange={value => setOverviewSortMode(value as SortMode)}
          >
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">按名称</SelectItem>
              <SelectItem value="mtime">按最近扫描</SelectItem>
              <SelectItem value="size">按体积</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={overviewCardZoom}
            onValueChange={value => setOverviewCardZoom(value as CardZoom)}
          >
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">小卡</SelectItem>
              <SelectItem value="md">中卡</SelectItem>
              <SelectItem value="lg">大卡</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            size="icon"
            variant={batchMode ? 'secondary' : 'ghost'}
            className="h-7 w-7"
            title="多选批量管理"
            onClick={toggleBatchMode}
          >
            <CheckSquare size={14} />
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="AI 批量提取未整理项目"
            disabled={!aiStatus?.available || (!overviewShowAll && !activeLibrary)}
            onClick={() =>
              void extractBatchWithAi({
                libraryId: overviewShowAll ? undefined : activeLibrary?.id,
                onlyUnextracted: true,
              })
            }
          >
            <Sparkles size={14} className={aiStatus?.available ? 'text-sky-500' : ''} />
          </Button>

          {overviewShowAll ? null : (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              title="查看全部项目（全部库）"
              aria-label="查看全部项目的卡片"
              onClick={showAllProjects}
            >
              <Layers size={14} />
            </Button>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={containerRef}
          data-lf-projects-overview-scroll=""
          className="h-full overflow-y-auto px-4 py-2"
        >
          {indexLoading ? (
            <div className="grid grid-cols-4 gap-3 pt-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-52 rounded-lg" />
              ))}
            </div>
          ) : overviewProjects.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FolderOpen size={22} />
                  </EmptyMedia>
                  <EmptyTitle>{hasFilters ? '没有匹配的项目' : '这里还没有项目'}</EmptyTitle>
                  <EmptyDescription>
                    {hasFilters
                      ? '尝试清空搜索关键词、标签筛选或变更筛选。'
                      : overviewShowAll
                        ? '项目库扫描完成后，归档根目录下的每个子目录都会显示为一张项目卡。'
                        : '该库尚未扫描到项目，可在左侧库列表中重新扫描。'}
                  </EmptyDescription>
                </EmptyHeader>
                {hasFilters ? (
                  <EmptyContent>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setOverviewSearchQuery('')
                        setOverviewTagFilter(null)
                        setOverviewOnlyChanged(false)
                      }}
                    >
                      清空筛选
                    </Button>
                  </EmptyContent>
                ) : null}
              </Empty>
            </div>
          ) : (
            <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
              {visibleRows.map(row =>
                row.kind !== 'cardRow' ? null : (
                  <div
                    key={row.key}
                    style={{
                      position: 'absolute',
                      top: `${row.top}px`,
                      left: 0,
                      right: 0,
                      height: `${row.height}px`,
                      display: 'grid',
                      gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                      gap: '12px',
                      paddingTop: '8px',
                    }}
                  >
                  {row.items.map(project => {
                    const isChecked = selectedProjectIds.has(project.id)
                    const coverSrc = project.coverRelPath
                      ? buildProjectCoverUrl(project.id, project.coverThumbKey)
                      : null
                    return (
                      <button
                        key={project.id}
                        type="button"
                        data-lf-project-card={project.id}
                        title={project.path}
                        onClick={() => handleCardClick(project)}
                        onContextMenu={e => {
                          e.preventDefault()
                          openProjectContextMenu(project, e.clientX, e.clientY)
                        }}
                        className={cn(
                          'group flex h-full min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors',
                          batchMode && isChecked
                            ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                            : 'border-border hover:border-primary/40',
                        )}
                      >
                        <div
                          className={cn(
                            'relative w-full shrink-0 overflow-hidden bg-muted/30',
                            zoomCfg.thumbClass,
                          )}
                        >
                          <LazyThumbImage
                            src={coverSrc}
                            alt={project.name}
                            category="folder"
                            className="h-full w-full rounded-none"
                          />
                          {batchMode ? (
                            <span
                              aria-hidden="true"
                              className={cn(
                                'absolute left-2 top-2 flex h-4 w-4 items-center justify-center rounded border bg-background/90',
                                isChecked
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border text-transparent',
                              )}
                            >
                              <Check size={11} />
                            </span>
                          ) : null}
                          <div className="absolute right-2 top-2 flex items-center gap-1">
                            {project.hasChanges ? (
                              <span
                                title="检测到目录文件变更"
                                className="h-2 w-2 rounded-full bg-amber-500 ring-2 ring-background/80"
                              />
                            ) : null}
                            {project.missing ? (
                              <Badge variant="destructive" className="px-1 py-0 text-[9px]">
                                缺失
                              </Badge>
                            ) : null}
                          </div>
                          {overviewShowAll ? (
                            <span className="absolute bottom-2 left-2 max-w-[calc(100%_-_1rem)] truncate rounded bg-background/85 px-1.5 py-0.5 text-[10px] text-muted-foreground backdrop-blur-sm">
                              {libraryNames.get(project.libraryId) ?? '项目库'}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col gap-1 p-2.5">
                          <div className="flex min-w-0 items-center gap-1">
                            <span
                              className={cn(
                                'min-w-0 flex-1 truncate text-xs font-medium',
                                overviewCardZoom === 'sm' ? 'line-clamp-1' : 'line-clamp-2',
                              )}
                            >
                              {project.name}
                            </span>
                            {project.aiExtractedAt ? (
                              <Sparkles
                                size={11}
                                className="shrink-0 text-sky-500"
                                aria-label="已 AI 提取"
                              />
                            ) : null}
                            {extensions.map(ext => (
                              <React.Fragment key={ext.id}>
                                {ext.renderProjectBadges?.(project, 'sidebar')}
                              </React.Fragment>
                            ))}
                          </div>

                          {overviewCardZoom !== 'sm' ? (
                            <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                              {project.projectType ? (
                                <span className="shrink-0 truncate rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                                  {project.projectType}
                                </span>
                              ) : null}
                              {project.tags.slice(0, 2).map(tag => (
                                <span
                                  key={tag}
                                  className="min-w-0 truncate text-[10px] text-muted-foreground"
                                >
                                  #{tag}
                                </span>
                              ))}
                              {project.tags.length > 2 ? (
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  +{project.tags.length - 2}
                                </span>
                              ) : null}
                            </div>
                          ) : null}

                          {overviewCardZoom !== 'sm' ? (
                            <p className="line-clamp-2 min-h-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">
                              {project.summary || '暂无摘要'}
                            </p>
                          ) : (
                            <div className="flex-1" />
                          )}

                          <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground tabular-nums">
                            <span>{project.fileCount} 项</span>
                            <span>{formatBytes(project.totalBytes)}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </div>

      {batchMode ? (
        <ProjectsBatchBar
          selectedProjects={selectedOverviewProjects}
          selectableCount={overviewProjects.length}
          onSelectAll={selectAllOverviewProjects}
        />
      ) : null}
    </div>
  )
}
