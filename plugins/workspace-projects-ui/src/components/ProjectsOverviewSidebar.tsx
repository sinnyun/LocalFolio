import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import {
  Check,
  FolderKanban,
  FolderPlus,
  Layers,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  cn,
} from '@folio/base-ui-kit/client'
import { useProjects } from '../context.js'

/**
 * Overview sidebar: the list of libraries. Selecting one scopes the project
 * card grid on the right; "全部项目" shows every project across libraries.
 */
export function ProjectsOverviewSidebar(_props: FrameViewProps): React.ReactElement {
  const {
    indexLoading,
    libraries,
    allProjects,
    activeLibraryId,
    overviewShowAll,
    addDialogOpen,
    setAddDialogOpen,
    showAllProjects,
    selectLibrary,
    pickAndAddLibrary,
    addLibraryByPath,
    rescanLibrary,
    removeLibrary,
  } = useProjects()

  const [manualPath, setManualPath] = React.useState('')
  const [manualName, setManualName] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

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
    <div
      data-lf-projects-overview-sidebar=""
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <div className="flex flex-col gap-2 border-b border-border p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">项目库</span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-7 w-7 shrink-0"
            title="添加项目库文件夹"
            onClick={() => void pickAndAddLibrary()}
          >
            <FolderPlus size={14} />
          </Button>
        </div>

        <button
          type="button"
          data-lf-project-library="__all__"
          onClick={showAllProjects}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors',
            overviewShowAll
              ? 'border-primary/50 bg-accent text-accent-foreground'
              : 'border-transparent hover:bg-muted/60',
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Layers size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">全部项目</span>
            <span className="block text-[10px] text-muted-foreground tabular-nums">
              {allProjects.length} 个项目 · {libraries.length} 个库
            </span>
          </span>
          {overviewShowAll ? <Check size={14} className="shrink-0 text-primary" /> : null}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          库列表
        </div>

        {indexLoading ? (
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        ) : libraries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-2 py-8 text-center text-[11px] text-muted-foreground">
            <FolderKanban size={22} />
            <p>尚未添加项目库根目录</p>
            <div className="flex flex-col items-stretch gap-1.5">
              <Button size="sm" variant="outline" onClick={() => void pickAndAddLibrary()}>
                <FolderPlus size={14} className="mr-1.5" />
                选择文件夹添加
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddDialogOpen(true)}>
                手动输入路径
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {libraries.map(library => {
              const isActive = !overviewShowAll && library.id === activeLibraryId
              return (
                <div
                  key={library.id}
                  className={cn(
                    'group flex items-center rounded-lg border pr-1 transition-colors',
                    isActive
                      ? 'border-primary/50 bg-accent text-accent-foreground'
                      : 'border-transparent hover:bg-muted/60',
                  )}
                >
                  <button
                    type="button"
                    data-lf-project-library={library.id}
                    onClick={() => selectLibrary(library.id)}
                    title={library.rootPath}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                        isActive
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted/60 text-muted-foreground',
                      )}
                    >
                      <FolderKanban size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {library.name}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                          {library.projectCount}
                        </span>
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {library.rootPath}
                      </span>
                    </span>
                  </button>
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      title="后台扫描当前库变更"
                      aria-label={`扫描 ${library.name}`}
                      onClick={() => void rescanLibrary(library.id)}
                      className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-background/80 hover:text-foreground"
                    >
                      <RefreshCw size={12} />
                    </button>
                    <button
                      type="button"
                      title="从索引移除此库（不删原文件）"
                      aria-label={`移除 ${library.name}`}
                      onClick={() => void removeLibrary(library.id)}
                      className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-background/80 hover:text-destructive"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={() => setAddDialogOpen(true)}
          className="w-full rounded px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          手动输入路径添加库…
        </button>
      </div>

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
