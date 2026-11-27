import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import {
  ArrowLeft,
  CheckSquare,
  FolderKanban,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Input,
  Skeleton,
  cn,
} from '@folio/base-ui-kit/client'
import { useVirtualList } from '@folio/base-collection-ui/client'
import { useProjects } from '../context.js'
import { buildProjectCoverUrl, formatBytes } from '../format.js'
import { LazyThumbImage } from './LazyThumbImage.js'
import { ProjectsBatchBar } from './ProjectsBatchBar.js'

const PROJECT_ROW_HEIGHT = 70

/**
 * Detail-mode sidebar: the project list of the currently open library. The
 * library selector lives in the overview sidebar; a back action returns to the
 * project card grid.
 */
export function ProjectsSidebar(_props: FrameViewProps): React.ReactElement {
  const {
    indexLoading,
    activeLibrary,
    projects,
    filteredProjects,
    availableTags,
    selectedProjectId,
    searchQuery,
    tagFilter,
    onlyChanged,
    aiStatus,
    batchMode,
    selectedProjectIds,
    extensions,
    extensionContext,
    closeProject,
    selectProject,
    setSearchQuery,
    setTagFilter,
    setOnlyChanged,
    rescanLibrary,
    extractBatchWithAi,
    toggleBatchMode,
    toggleProjectChecked,
    selectAllFilteredProjects,
    clearCheckedProjects,
    openProjectContextMenu,
  } = useProjects()

  const selectedBatchProjects = React.useMemo(
    () => filteredProjects.filter(project => selectedProjectIds.has(project.id)),
    [filteredProjects, selectedProjectIds],
  )

  const changedCount = React.useMemo(
    () => projects.filter(p => p.hasChanges).length,
    [projects],
  )

  const { containerRef, totalHeight, visibleItems } = useVirtualList<HTMLDivElement>({
    count: filteredProjects.length,
    itemHeight: PROJECT_ROW_HEIGHT,
    overscan: 6,
    resetKey: activeLibrary?.id ?? null,
  })

  return (
    <div
      data-lf-projects-sidebar=""
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <div className="flex flex-col gap-2 border-b border-border p-2.5">
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={closeProject}
            aria-label="返回项目卡片"
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft size={13} />
            返回项目卡片
          </button>
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              title="AI 批量提取未整理项目"
              disabled={!aiStatus?.available || !activeLibrary}
              onClick={() =>
                activeLibrary
                  ? void extractBatchWithAi({
                      libraryId: activeLibrary.id,
                      onlyUnextracted: true,
                    })
                  : undefined
              }
            >
              <Sparkles size={14} className={aiStatus?.available ? 'text-sky-500' : ''} />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={batchMode ? 'secondary' : 'ghost'}
              className="h-7 w-7 shrink-0"
              title="多选批量管理"
              onClick={toggleBatchMode}
            >
              <CheckSquare size={14} />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              title="后台扫描当前库变更"
              disabled={!activeLibrary}
              onClick={() => activeLibrary && void rescanLibrary(activeLibrary.id)}
            >
              <RefreshCw size={14} />
            </Button>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <FolderKanban size={13} className="shrink-0 text-sky-500" />
            <span className="truncate text-xs font-semibold">
              {activeLibrary?.name ?? '项目列表'}
            </span>
          </div>
          <div className="truncate pl-[19px] text-[10px] text-muted-foreground tabular-nums">
            {filteredProjects.length} / {projects.length} 个项目
          </div>
        </div>

        {/* Search & filter bar */}
        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="筛选项目名 / 标签…"
            className="h-7 pl-7 pr-7 text-xs"
          />
          {searchQuery ? (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery('')}
              aria-label="清空筛选"
            >
              <X size={12} />
            </button>
          ) : null}
        </div>

        {/* Quick filters */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setOnlyChanged(!onlyChanged)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors',
              onlyChanged
                ? 'bg-amber-500/20 text-amber-500 font-medium'
                : 'bg-muted/60 text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            有变更 ({changedCount})
          </button>

          {availableTags.slice(0, 6).map(tag => {
            const active = tagFilter === tag
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(active ? null : tag)}
                className={cn(
                  'max-w-[96px] truncate rounded px-1.5 py-0.5 text-[11px] transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:text-foreground',
                )}
              >
                #{tag}
              </button>
            )
          })}
        </div>
      </div>

      {/* Virtualized project list */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {indexLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
            <Skeleton className="h-14 w-full rounded-md" />
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-3 py-10 text-center text-xs text-muted-foreground">
            <p>没有匹配的项目</p>
            <Button size="sm" variant="outline" onClick={closeProject}>
              返回项目卡片
            </Button>
          </div>
        ) : (
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            {visibleItems.map(item => {
              const project = filteredProjects[item.index]
              if (!project) return null
              const isSelected = project.id === selectedProjectId
              const isChecked = selectedProjectIds.has(project.id)
              const coverSrc = project.coverRelPath
                ? buildProjectCoverUrl(project.id, project.coverThumbKey)
                : null
              return (
                <button
                  key={project.id}
                  type="button"
                  data-lf-project-item={project.id}
                  onClick={() => {
                    if (batchMode) toggleProjectChecked(project.id)
                    else selectProject(project.id)
                  }}
                  onContextMenu={e => {
                    e.preventDefault()
                    openProjectContextMenu(project, e.clientX, e.clientY)
                  }}
                  style={{
                    position: 'absolute',
                    top: `${item.top}px`,
                    left: 0,
                    right: 0,
                    height: `${item.height - 6}px`,
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg border px-2 text-left transition-colors',
                    batchMode && isChecked
                      ? 'border-primary bg-primary/10'
                      : isSelected
                        ? 'border-primary/50 bg-accent text-accent-foreground'
                        : 'border-transparent hover:bg-muted/60',
                  )}
                >
                  {batchMode ? (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      readOnly
                      aria-label={`选择 ${project.name}`}
                      className="h-3.5 w-3.5 shrink-0 accent-primary"
                    />
                  ) : null}
                  <LazyThumbImage
                    src={coverSrc}
                    alt={project.name}
                    category="folder"
                    compact
                    className="h-11 w-11 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium">{project.name}</span>
                      {extensions.map(ext => (
                        <React.Fragment key={ext.id}>
                          {ext.renderProjectBadges?.(project, 'sidebar')}
                        </React.Fragment>
                      ))}
                      {project.aiExtractedAt ? (
                        <Sparkles
                          size={11}
                          className="shrink-0 text-sky-500"
                          aria-label="已 AI 提取"
                        />
                      ) : null}
                      {project.hasChanges ? (
                        <span
                          title="检测到目录文件变更"
                          className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                        />
                      ) : null}
                      {project.missing ? (
                        <Badge variant="destructive" className="px-1 py-0 text-[9px]">
                          缺失
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
                      <span>{project.fileCount} 项</span>
                      <span>·</span>
                      <span>{formatBytes(project.totalBytes)}</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {batchMode ? (
        <ProjectsBatchBar
          selectedProjects={selectedBatchProjects}
          selectableCount={filteredProjects.length}
          onSelectAll={selectAllFilteredProjects}
        />
      ) : null}
    </div>
  )
}
