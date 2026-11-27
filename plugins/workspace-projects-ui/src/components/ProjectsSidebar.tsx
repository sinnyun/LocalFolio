import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import {
  CheckSquare,
  FolderPlus,
  RefreshCw,
  Search,
  Sparkles,
  Tags,
  Trash2,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  cn,
} from '@folio/base-ui-kit/client'
import { useVirtualList } from '@folio/base-collection-ui/client'
import { useProjects } from '../context.js'
import { buildProjectCoverUrl, formatBytes } from '../format.js'
import { LazyThumbImage } from './LazyThumbImage.js'

const PROJECT_ROW_HEIGHT = 70

export function ProjectsSidebar(_props: FrameViewProps): React.ReactElement {
  const {
    indexLoading,
    libraries,
    activeLibraryId,
    activeLibrary,
    projects,
    filteredProjects,
    availableTags,
    selectedProjectId,
    searchQuery,
    tagFilter,
    onlyChanged,
    addDialogOpen,
    aiStatus,
    batchMode,
    selectedProjectIds,
    extensions,
    extensionContext,
    setActiveLibraryId,
    selectProject,
    setSearchQuery,
    setTagFilter,
    setOnlyChanged,
    setAddDialogOpen,
    pickAndAddLibrary,
    addLibraryByPath,
    rescanLibrary,
    removeLibrary,
    extractBatchWithAi,
    batchTagProjects,
    batchSyncProjects,
    toggleBatchMode,
    toggleProjectChecked,
    selectAllFilteredProjects,
    clearCheckedProjects,
    openProjectContextMenu,
  } = useProjects()

  const [manualPath, setManualPath] = React.useState('')
  const [manualName, setManualName] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [batchTagOpen, setBatchTagOpen] = React.useState(false)
  const [batchAddTagsText, setBatchAddTagsText] = React.useState('')
  const [batchRemoveTagsText, setBatchRemoveTagsText] = React.useState('')
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
    resetKey: activeLibraryId,
  })

  const handleManualSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!manualPath.trim() || submitting) return
    setSubmitting(true)
    const ok = await addLibraryByPath(manualPath.trim(), manualName.trim() || undefined)
    setSubmitting(false)
    if (ok) {
      setManualPath('')
      setManualName('')
      setAddDialogOpen(false)
    }
  }

  return (
    <div data-lf-projects-sidebar="" className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      {/* Library switcher & actions */}
      <div className="flex flex-col gap-2 border-b border-border p-2.5">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <Select
              value={activeLibraryId}
              onValueChange={val => setActiveLibraryId(val)}
              disabled={libraries.length === 0}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="选择项目库…" />
              </SelectTrigger>
              <SelectContent>
                {libraries.map(lib => (
                  <SelectItem key={lib.id} value={lib.id}>
                    {lib.name} ({lib.projectCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            title="添加项目库文件夹"
            onClick={() => void pickAndAddLibrary()}
          >
            <FolderPlus size={14} />
          </Button>
          {activeLibrary ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                title="AI 批量提取未整理项目"
                disabled={!aiStatus?.available}
                onClick={() =>
                  void extractBatchWithAi({ libraryId: activeLibrary.id, onlyUnextracted: true })
                }
              >
                <Sparkles size={14} className={aiStatus?.available ? 'text-sky-500' : ''} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant={batchMode ? 'secondary' : 'ghost'}
                className="h-8 w-8 shrink-0"
                title="多选批量管理"
                onClick={toggleBatchMode}
              >
                <CheckSquare size={14} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                title="后台扫描库变更"
                onClick={() => void rescanLibrary(activeLibrary.id)}
              >
                <RefreshCw size={14} />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                title="从索引移除此库（不删原文件）"
                onClick={() => void removeLibrary(activeLibrary.id)}
              >
                <Trash2 size={14} />
              </Button>
            </>
          ) : null}
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
            <p>{libraries.length === 0 ? '尚未添加项目库根目录' : '没有匹配的项目'}</p>
            {libraries.length === 0 ? (
              <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)}>
                <FolderPlus size={14} className="mr-1.5" />
                手动输入路径添加
              </Button>
            ) : null}
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
                    selectProject(project.id)
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

      {/* Batch action bar */}
      {batchMode ? (
        <div
          data-lf-projects-batch-bar=""
          className="flex flex-col gap-1.5 border-t border-border bg-muted/40 p-2 text-[11px]"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">已选 {selectedProjectIds.size} 个项目</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="text-primary hover:underline disabled:opacity-50"
                title="全选当前列表的筛选结果"
                disabled={filteredProjects.length === 0}
                onClick={selectAllFilteredProjects}
              >
                全选
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:underline"
                onClick={clearCheckedProjects}
              >
                清空
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={!aiStatus?.available || selectedProjectIds.size === 0}
              onClick={() =>
                void extractBatchWithAi({ projectIds: Array.from(selectedProjectIds) })
              }
            >
              <Sparkles size={11} className="mr-1 text-sky-500" />
              AI 提取
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={selectedProjectIds.size === 0}
              onClick={() => setBatchTagOpen(true)}
            >
              <Tags size={11} className="mr-1" />
              批量标签
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={selectedProjectIds.size === 0}
              onClick={() =>
                void batchSyncProjects({
                  projectIds: Array.from(selectedProjectIds),
                  onlyChanged: false,
                })
              }
            >
              <RefreshCw size={11} className="mr-1" />
              同步
            </Button>
            {extensions.map(extension => (
              <React.Fragment key={extension.id}>
                {extension.renderBatchActions?.(extensionContext, selectedBatchProjects)}
              </React.Fragment>
            ))}
          </div>
        </div>
      ) : null}

      {/* Batch Tag Dialog */}
      <Dialog open={batchTagOpen} onOpenChange={setBatchTagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量修改项目标签</DialogTitle>
            <DialogDescription>
              为已选的 {selectedProjectIds.size} 个项目添加或移除标签（多个标签用逗号分隔）。
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async e => {
              e.preventDefault()
              const addTags = batchAddTagsText
                .split(/[,，]/)
                .map(s => s.trim())
                .filter(Boolean)
              const removeTags = batchRemoveTagsText
                .split(/[,，]/)
                .map(s => s.trim())
                .filter(Boolean)
              await batchTagProjects(Array.from(selectedProjectIds), addTags, removeTags)
              setBatchAddTagsText('')
              setBatchRemoveTagsText('')
              setBatchTagOpen(false)
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">新增标签（逗号分隔）</label>
              <Input
                value={batchAddTagsText}
                onChange={e => setBatchAddTagsText(e.target.value)}
                placeholder="例如：2026, 重点客户"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">移除标签（逗号分隔，可选）</label>
              <Input
                value={batchRemoveTagsText}
                onChange={e => setBatchRemoveTagsText(e.target.value)}
                placeholder="例如：待整理"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setBatchTagOpen(false)}>
                取消
              </Button>
              <Button
                type="submit"
                disabled={!batchAddTagsText.trim() && !batchRemoveTagsText.trim()}
              >
                应用到选中项目
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add library dialog (manual fallback or explicit entry) */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加归档项目库</DialogTitle>
            <DialogDescription>
              输入本地归档根目录路径（其直接子目录将被识别为独立项目，并在项目内生成 .folio-meta 缓存）。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={e => void handleManualSubmit(e)} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">库根目录路径</label>
              <Input
                value={manualPath}
                onChange={e => setManualPath(e.target.value)}
                placeholder="例如：D:\\Archives\\2026-Projects"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">显示名称（可选）</label>
              <Input
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                placeholder="留空则使用文件夹名称"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting || !manualPath.trim()}>
                {submitting ? '正在添加…' : '添加并后台扫描'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
