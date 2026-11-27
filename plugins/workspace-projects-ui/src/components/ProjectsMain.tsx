import * as React from 'react'
import {
  CollectionLightbox,
  useVirtualGroupedGrid,
} from '@folio/base-collection-ui/client'
import type { FrameViewProps } from '@folio/base-contract'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Search,
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
import {
  buildProjectThumbUrl,
  categoryLabel,
  filterAndSortGroups,
  formatBytes,
} from '../format.js'
import type {
  CardZoom,
  CategoryFilter,
  ProjectFileEntry,
  ProjectFolderGroup,
  SortMode,
} from '../types.js'
import { LazyThumbImage } from './LazyThumbImage.js'

const ZOOM_DIMENSIONS: Record<CardZoom, { minWidth: number; rowHeight: number; thumbH: string }> = {
  sm: { minWidth: 136, rowHeight: 176, thumbH: 'h-24' },
  md: { minWidth: 176, rowHeight: 218, thumbH: 'h-32' },
  lg: { minWidth: 228, rowHeight: 268, thumbH: 'h-44' },
}

export function ProjectsMain(_props: FrameViewProps): React.ReactElement {
  const {
    libraries,
    selectedProject,
    thumbnailRevision,
    detailLoading,
    projectManifest,
    selectedFile,
    fileSearchQuery,
    categoryFilter,
    cardZoom,
    sortMode,
    collapsedGroups,
    syncingProjectId,
    checkingProjectId,
    extensions,
    extensionContext,
    lightbox,
    selectFile,
    setFileSearchQuery,
    setCategoryFilter,
    setCardZoom,
    setSortMode,
    toggleGroupCollapsed,
    setAllGroupsCollapsed,
    pickAndAddLibrary,
    setAddDialogOpen,
    checkSelectedChanges,
    syncSelectedProject,
    openFile,
    revealPath,
    openLightboxForFile,
    setLightboxOpen,
    setLightboxIndex,
    openFileContextMenu,
  } = useProjects()

  const filteredGroups = React.useMemo(
    () =>
      projectManifest
        ? filterAndSortGroups(projectManifest.groups, fileSearchQuery, categoryFilter, sortMode)
        : [],
    [projectManifest, fileSearchQuery, categoryFilter, sortMode],
  )

  const zoomCfg = ZOOM_DIMENSIONS[cardZoom]
  const { containerRef, columnCount, totalHeight, visibleRows, activeStickyGroup } =
    useVirtualGroupedGrid<ProjectFolderGroup, ProjectFileEntry, HTMLDivElement>({
      groups: filteredGroups,
      getGroupKey: g => g.relPath,
      getGroupItems: g => g.files,
      collapsedKeys: collapsedGroups,
      minCardWidth: zoomCfg.minWidth,
      rowHeight: zoomCfg.rowHeight,
      headerHeight: 38,
      gapPx: 12,
      resetKey: selectedProject?.id ?? null,
    })

  const allCollapsed =
    filteredGroups.length > 0 && filteredGroups.every(g => collapsedGroups.has(g.relPath))

  const handleCardDoubleClick = (file: ProjectFileEntry): void => {
    if (file.category === 'image') {
      openLightboxForFile(file)
    } else {
      void openFile(file)
    }
  }

  if (libraries.length === 0) {
    return (
      <div data-lf-projects-main="" className="flex h-full items-center justify-center p-6">
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

  if (!selectedProject) {
    return (
      <div data-lf-projects-main="" className="flex h-full items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>请从左侧选择一个项目</EmptyTitle>
            <EmptyDescription>选中项目后可按文件夹分组浏览卡片与预览文件。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  const isChecking = checkingProjectId === selectedProject.id
  const isSyncing = syncingProjectId === selectedProject.id

  return (
    <div
      data-lf-projects-main=""
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{selectedProject.name}</h2>
            {selectedProject.projectType ? (
              <Badge variant="secondary" className="text-[11px]">
                {selectedProject.projectType}
              </Badge>
            ) : null}
            {extensions.map(ext => (
              <React.Fragment key={ext.id}>
                {ext.renderProjectBadges?.(selectedProject, 'header')}
              </React.Fragment>
            ))}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">{selectedProject.path}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative w-44">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={fileSearchQuery}
              onChange={e => setFileSearchQuery(e.target.value)}
              placeholder="搜当前项目文件…"
              className="h-7 pl-7 pr-6 text-xs"
            />
            {fileSearchQuery ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setFileSearchQuery('')}
                aria-label="清空文件搜索"
              >
                <X size={12} />
              </button>
            ) : null}
          </div>

          <Select
            value={categoryFilter}
            onValueChange={val => setCategoryFilter(val as CategoryFilter)}
          >
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分类</SelectItem>
              <SelectItem value="image">图片</SelectItem>
              <SelectItem value="design">设计工程</SelectItem>
              <SelectItem value="video">视频</SelectItem>
              <SelectItem value="document">文档</SelectItem>
              <SelectItem value="audio">音频</SelectItem>
              <SelectItem value="code">代码</SelectItem>
              <SelectItem value="archive">压缩包</SelectItem>
              <SelectItem value="other">其他</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortMode} onValueChange={val => setSortMode(val as SortMode)}>
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">按名称</SelectItem>
              <SelectItem value="size">按大小</SelectItem>
              <SelectItem value="mtime">按修改时间</SelectItem>
            </SelectContent>
          </Select>

          <Select value={cardZoom} onValueChange={val => setCardZoom(val as CardZoom)}>
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">小图</SelectItem>
              <SelectItem value="md">中图</SelectItem>
              <SelectItem value="lg">大图</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title={allCollapsed ? '展开全部分组' : '折叠全部分组'}
            onClick={() => setAllGroupsCollapsed(!allCollapsed)}
          >
            {allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={isChecking || isSyncing}
            onClick={() => void checkSelectedChanges()}
          >
            <RefreshCw size={13} className={cn('mr-1', isChecking && 'animate-spin')} />
            检测变更
          </Button>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title="在资源管理器中打开项目目录"
            onClick={() => void revealPath()}
          >
            <ExternalLink size={14} />
          </Button>

          {extensions.map(ext => (
            <React.Fragment key={ext.id}>
              {ext.renderToolbarActions?.(extensionContext)}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Change Alert Banner */}
      {selectedProject.hasChanges ? (
        <div
          data-lf-projects-change-banner=""
          className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs"
        >
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle size={14} className="shrink-0" />
            <span>
              检测到项目文件变更：+{selectedProject.changeSummary.added} 新增 · ~
              {selectedProject.changeSummary.modified} 修改 · -
              {selectedProject.changeSummary.removed} 删除
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {extensions.map(ext => (
              <React.Fragment key={ext.id}>
                {ext.renderChangeBannerActions?.(extensionContext)}
              </React.Fragment>
            ))}
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={isSyncing}
              onClick={() => void syncSelectedProject()}
            >
              {isSyncing ? '正在更新…' : '立即增量更新'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Virtualized Grouped Card Grid */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {activeStickyGroup ? (
          <div className="pointer-events-auto absolute left-0 right-4 top-0 z-10 flex h-9 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => toggleGroupCollapsed(activeStickyGroup.relPath)}
              className="flex items-center gap-1.5 text-xs font-medium hover:text-primary"
            >
              {collapsedGroups.has(activeStickyGroup.relPath) ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              <span>{activeStickyGroup.name}</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                ({activeStickyGroup.fileCount} · {formatBytes(activeStickyGroup.totalBytes)})
              </span>
            </button>
          </div>
        ) : null}

        <div
          ref={containerRef}
          data-lf-projects-scroll-container=""
          className="h-full overflow-y-auto px-4 py-2"
        >
          {detailLoading && !projectManifest ? (
            <div className="grid grid-cols-4 gap-3 pt-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-lg" />
              ))}
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>没有匹配的文件</EmptyTitle>
                  <EmptyDescription>尝试清空搜索关键词或切换文件分类筛选。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          ) : (
            <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
              {visibleRows.map(row => {
                if (row.kind === 'header') {
                  return (
                    <div
                      key={row.key}
                      style={{
                        position: 'absolute',
                        top: `${row.top}px`,
                        left: 0,
                        right: 0,
                        height: `${row.height}px`,
                      }}
                      className="flex items-center justify-between border-b border-border/60"
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroupCollapsed(row.group.relPath)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary"
                      >
                        {row.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        <span>{row.group.name}</span>
                        <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                          {row.group.fileCount} 项 · {formatBytes(row.group.totalBytes)}
                        </span>
                      </button>
                    </div>
                  )
                }

                return (
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
                      paddingTop: '10px',
                    }}
                  >
                    {row.items.map(file => {
                      const isSelected = selectedFile?.relPath === file.relPath
                      const thumbSrc = file.thumbSupported
                        ? buildProjectThumbUrl(
                            selectedProject.id,
                            file.relPath,
                            file.thumbKey,
                            thumbnailRevision,
                          )
                        : null
                      return (
                        <button
                          key={file.relPath}
                          type="button"
                          data-lf-project-card={file.relPath}
                          onClick={() => selectFile(file)}
                          onDoubleClick={() => handleCardDoubleClick(file)}
                          onContextMenu={e => {
                            e.preventDefault()
                            selectFile(file)
                            openFileContextMenu(file, e.clientX, e.clientY)
                          }}
                          className={cn(
                            'group flex min-w-0 flex-col overflow-hidden rounded-lg border bg-card p-2 text-left transition-colors',
                            isSelected
                              ? 'border-primary ring-1 ring-primary/40'
                              : 'border-border hover:border-primary/40',
                          )}
                        >
                          <LazyThumbImage
                            src={thumbSrc}
                            alt={file.name}
                            category={file.category}
                            ext={file.ext}
                            className={cn('w-full shrink-0', zoomCfg.thumbH)}
                          />
                          <div className="mt-2 min-w-0 flex-1">
                            <div className="truncate text-xs font-medium" title={file.name}>
                              {file.name}
                            </div>
                            <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                              <span>{categoryLabel(file.category)}</span>
                              <span>{formatBytes(file.size)}</span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Image Lightbox */}
      <CollectionLightbox
        state={lightbox}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />
    </div>
  )
}
