import * as React from 'react'
import {
  CollectionBrowser,
  CollectionLightbox,
  type CollectionItemRenderLayout,
} from '@folio/base-collection-ui/client'
import type { FrameViewProps } from '@folio/base-contract'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  FolderOpen,
  FolderPlus,
  RefreshCw,
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
  cn,
} from '@folio/base-ui-kit/client'
import { useProjects } from '../context.js'
import {
  buildProjectFileGroups,
  buildProjectThumbUrl,
  categoryLabel,
  formatBytes,
  formatDateTime,
} from '../format.js'
import type {
  CategoryFilter,
  FileGroupBy,
  FileSortKey,
  ProjectFileEntry,
  ProjectFolderGroup,
} from '../types.js'
import { LazyThumbImage } from './LazyThumbImage.js'
import { ProjectsOverview } from './ProjectsOverview.js'

const CATEGORY_FILTER_OPTIONS = [
  { value: 'all', label: '全部分类' },
  { value: 'image', label: '图片' },
  { value: 'design', label: '设计工程' },
  { value: 'video', label: '视频' },
  { value: 'document', label: '文档' },
  { value: 'audio', label: '音频' },
  { value: 'code', label: '代码' },
  { value: 'archive', label: '压缩包' },
  { value: 'other', label: '其他' },
] as const

const SORT_OPTIONS = [
  { value: 'name', label: '按名称' },
  { value: 'mtime', label: '按修改时间' },
  { value: 'size', label: '按文件大小' },
  { value: 'type', label: '按文件类型' },
] as const

export function ProjectsMain(props: FrameViewProps): React.ReactElement {
  const { overviewActive } = useProjects()
  return overviewActive ? <ProjectsOverview {...props} /> : <ProjectFilesView {...props} />
}

function ProjectFilesView(_props: FrameViewProps): React.ReactElement {
  const {
    libraries,
    selectedProject,
    thumbnailRevision,
    detailLoading,
    projectManifest,
    selectedFile,
    fileSearchQuery,
    categoryFilter,
    viewMode,
    cardSize,
    groupBy,
    sortKey,
    sortDir,
    syncingProjectId,
    checkingProjectId,
    extensions,
    extensionContext,
    lightbox,
    closeProject,
    selectFile,
    setFileSearchQuery,
    setCategoryFilter,
    setViewMode,
    setCardSize,
    setGroupBy,
    setSortKey,
    setSortDir,
    pickAndAddLibrary,
    setAddDialogOpen,
    checkSelectedChanges,
    syncSelectedProject,
    revealPath,
    openLightboxForFile,
    openFile,
    setLightboxOpen,
    setLightboxIndex,
    openFileContextMenu,
  } = useProjects()

  const filteredGroups = React.useMemo(
    () =>
      projectManifest
        ? buildProjectFileGroups(projectManifest.groups, {
            groupBy,
            query: fileSearchQuery,
            categoryFilter,
            sortKey,
            sortDir,
          })
        : [],
    [projectManifest, fileSearchQuery, categoryFilter, groupBy, sortKey, sortDir],
  )

  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(() => new Set())

  React.useEffect(() => {
    setCollapsedGroups(new Set())
  }, [selectedProject?.id])

  const toggleGroupCollapsed = (key: string): void => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const allCollapsed =
    filteredGroups.length > 0 && filteredGroups.every(group => collapsedGroups.has(group.relPath))

  const toggleAllGroups = (collapse: boolean): void => {
    setCollapsedGroups(collapse ? new Set(filteredGroups.map(group => group.relPath)) : new Set())
  }

  const handleCardDoubleClick = (file: ProjectFileEntry): void => {
    if (file.category === 'image') {
      openLightboxForFile(file)
    } else {
      void openFile(file)
    }
  }

  const renderFile = (
    file: ProjectFileEntry,
    layout: CollectionItemRenderLayout,
  ): React.ReactElement => {
    const isSelected = selectedFile?.relPath === file.relPath
    const thumbSrc = file.thumbSupported
      ? buildProjectThumbUrl(
          selectedProject!.id,
          file.relPath,
          file.thumbKey,
          thumbnailRevision,
        )
      : null
    const interactionProps = {
      type: 'button' as const,
      'data-lf-project-card': file.relPath,
      onClick: () => selectFile(file),
      onDoubleClick: () => handleCardDoubleClick(file),
      onContextMenu: (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        selectFile(file)
        openFileContextMenu(file, event.clientX, event.clientY)
      },
    }

    if (layout.mode === 'list') {
      return (
        <button
          {...interactionProps}
          className={cn(
            'grid h-full w-full grid-cols-[1fr_116px_76px_120px] items-center gap-2 rounded px-3 text-left text-xs transition-colors hover:bg-accent/50',
            isSelected && 'bg-accent text-accent-foreground',
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <LazyThumbImage
              src={thumbSrc}
              alt={file.name}
              category={file.category}
              ext={file.ext}
              compact
              fallbackIconSize={16}
              objectFit="contain"
              className="size-7 shrink-0"
            />
            <span className="truncate font-medium">{file.name}</span>
          </div>
          <span className="truncate text-[11px] text-muted-foreground">
            {categoryLabel(file.category)}
          </span>
          <span className="text-right text-[11px] tabular-nums text-muted-foreground">
            {formatBytes(file.size)}
          </span>
          <span className="text-right text-[11px] tabular-nums text-muted-foreground">
            {formatDateTime(file.mtimeMs)}
          </span>
        </button>
      )
    }

    return (
      <button
        {...interactionProps}
        className={cn(
          'group flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border bg-card p-2 text-left transition-colors',
          isSelected
            ? 'border-primary ring-1 ring-primary/40'
            : 'border-border hover:border-primary/40',
        )}
      >
        <div className="relative min-h-0 w-full flex-1">
          <LazyThumbImage
            src={thumbSrc}
            alt={file.name}
            category={file.category}
            ext={file.ext}
            objectFit={layout.mode === 'grid' ? 'contain' : 'cover'}
            onAspectRatio={layout.reportAspectRatio}
            className="h-full w-full"
          />
        </div>
        <div className="mt-1.5 min-w-0">
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
      <CollectionBrowser<ProjectFolderGroup, ProjectFileEntry>
        groups={filteredGroups}
        getGroupKey={group => group.relPath}
        getGroupItems={group => group.files}
        getGroupTitle={group => group.name}
        getGroupMeta={group =>
          `${group.fileCount} 项 · ${formatBytes(group.totalBytes)}`
        }
        hasHeader={group => Boolean(group.name)}
        getItemKey={file => file.relPath}
        getItemAspectKey={file => `projects:${selectedProject.id}:${file.relPath}`}
        getItemAspect={file => (file.category === 'image' ? 1 : 1.25)}
        renderItem={(file, _group, layout) => renderFile(file, layout)}
        collapsedKeys={collapsedGroups}
        onToggleGroupCollapsed={toggleGroupCollapsed}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        viewDataAttrPrefix="data-lf-projects"
        cardSize={cardSize}
        onCardSizeChange={setCardSize}
        cardSizeDataAttr={{ 'data-lf-projects-card-size': '' }}
        filter={{
          value: fileSearchQuery,
          onChange: setFileSearchQuery,
          placeholder: '搜当前项目文件…',
          ariaLabel: '筛选项目文件',
          dataAttr: { 'data-lf-projects-filter': '' },
        }}
        category={{
          value: categoryFilter,
          onChange: value => setCategoryFilter(value as CategoryFilter),
          options: CATEGORY_FILTER_OPTIONS,
          dataAttr: { 'data-lf-projects-category': '' },
        }}
        groupBy={{
          value: groupBy,
          onChange: value => setGroupBy(value as FileGroupBy),
          dataAttr: { 'data-lf-projects-groupby': '' },
        }}
        sort={{
          value: sortKey,
          onChange: value => setSortKey(value as FileSortKey),
          options: SORT_OPTIONS,
          dir: sortDir,
          onDirChange: setSortDir,
          dataAttr: { 'data-lf-projects-sortby': '' },
          dirDataAttr: { 'data-lf-projects-sortdir': '' },
        }}
        leading={
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              title="返回项目卡片"
              aria-label="返回项目卡片"
              onClick={closeProject}
            >
              <ArrowLeft size={15} />
            </Button>
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
              <p className="max-w-64 truncate text-[11px] text-muted-foreground">
                {selectedProject.path}
              </p>
            </div>
          </div>
        }
        actions={
          <>
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
              size="icon-xs"
              variant="ghost"
              title="在资源管理器中打开项目目录"
              aria-label="在资源管理器中打开项目目录"
              onClick={() => void revealPath()}
            >
              <ExternalLink size={14} />
            </Button>
            {extensions.map(ext => (
              <React.Fragment key={ext.id}>
                {ext.renderToolbarActions?.(extensionContext)}
              </React.Fragment>
            ))}
          </>
        }
        banner={
          selectedProject.hasChanges ? (
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
          ) : null
        }
        loading={detailLoading && !projectManifest}
        emptyState={
          <Empty>
            <EmptyHeader>
              <EmptyTitle>没有匹配的文件</EmptyTitle>
              <EmptyDescription>尝试清空搜索关键词或切换文件分类筛选。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
        listRowHeight={36}
        listHeader={
          viewMode === 'list' ? (
            <div
              data-lf-projects-list-header=""
              className="grid grid-cols-[1fr_116px_76px_120px] items-center gap-2 rounded-t-lg border border-border border-b-0 bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground"
            >
              <span>名称</span>
              <span>类型</span>
              <span className="text-right">大小</span>
              <span className="text-right">修改时间</span>
            </div>
          ) : null
        }
        scrollDataAttr={{ 'data-lf-projects-scroll-container': '' }}
        metaHeight={64}
        resetKey={`${selectedProject.id}:${groupBy}:${viewMode}`}
      />

      {/* Image Lightbox */}
      <CollectionLightbox
        state={lightbox}
        onOpenChange={setLightboxOpen}
        onIndexChange={setLightboxIndex}
      />
    </div>
  )
}
