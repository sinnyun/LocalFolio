import * as React from 'react'
import { FolderKanban, LayoutGrid, Sparkles } from 'lucide-react'
import { Badge, Button, Separator, cn } from '@folio/base-ui-kit/client'
import { useProjects } from '../context.js'
import { formatBytes, formatDateTime } from '../format.js'

/**
 * Right panel for the library overview: scope statistics, tag distribution and
 * the most recently changed projects. The detail inspector replaces it once a
 * project is opened.
 */
export function ProjectsOverviewInspector(): React.ReactElement {
  const {
    libraries,
    activeLibrary,
    overviewShowAll,
    overviewScopeProjects,
    overviewProjects,
    overviewAvailableTags,
    overviewTagFilter,
    overviewOnlyChanged,
    setOverviewTagFilter,
    setOverviewOnlyChanged,
    selectLibrary,
    openProject,
  } = useProjects()

  const changedProjects = React.useMemo(
    () => overviewScopeProjects.filter(project => project.hasChanges),
    [overviewScopeProjects],
  )
  const totalBytes = React.useMemo(
    () => overviewScopeProjects.reduce((sum, project) => sum + project.totalBytes, 0),
    [overviewScopeProjects],
  )
  const tagCounts = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const project of overviewScopeProjects) {
      for (const tag of project.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [overviewScopeProjects])
  const recentChanged = React.useMemo(
    () =>
      [...changedProjects]
        .sort((a, b) => b.lastScannedAt - a.lastScannedAt)
        .slice(0, 6),
    [changedProjects],
  )
  const hasFilters = Boolean(overviewTagFilter || overviewOnlyChanged)

  return (
    <div
      data-lf-projects-overview-inspector=""
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-3 text-xs"
    >
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <LayoutGrid size={15} className="text-primary" />
          <h3 className="text-sm font-semibold">项目卡片视图</h3>
        </div>
        <p className="leading-relaxed text-muted-foreground">
          {overviewShowAll
            ? '当前显示全部项目库的项目卡片。点击卡片进入项目，左侧栏会切换为该库的项目列表。'
            : '当前显示所选库的项目卡片。点击卡片进入项目，左侧栏会切换为该库的项目列表。'}
        </p>
        {hasFilters ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            <span>
              已筛选：{overviewProjects.length} / {overviewScopeProjects.length} 个项目
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-1.5 text-[11px]"
              onClick={() => {
                setOverviewTagFilter(null)
                setOverviewOnlyChanged(false)
              }}
            >
              清空
            </Button>
          </div>
        ) : null}
      </section>

      <Separator />

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <div className="text-[11px] text-muted-foreground">项目</div>
          <div className="text-sm font-semibold tabular-nums">{overviewScopeProjects.length}</div>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <div className="text-[11px] text-muted-foreground">项目库</div>
          <div className="text-sm font-semibold tabular-nums">
            {overviewShowAll ? libraries.length : activeLibrary ? 1 : 0}
          </div>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <div className="text-[11px] text-muted-foreground">有变更</div>
          <div className="text-sm font-semibold tabular-nums text-amber-500">
            {changedProjects.length}
          </div>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-2">
          <div className="text-[11px] text-muted-foreground">总体积</div>
          <div className="text-sm font-semibold tabular-nums">{formatBytes(totalBytes)}</div>
        </div>
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <span className="font-medium">{overviewShowAll ? '库分布' : '当前库'}</span>
        {libraries.length === 0 ? (
          <p className="text-muted-foreground">尚未添加项目库根目录。</p>
        ) : overviewShowAll ? (
          <div className="flex flex-col gap-1">
            {libraries.map(library => (
              <button
                key={library.id}
                type="button"
                onClick={() => selectLibrary(library.id)}
                className="flex items-center gap-2 rounded-md border border-border/70 px-2 py-1.5 text-left hover:bg-muted/60"
              >
                <FolderKanban size={13} className="shrink-0 text-sky-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{library.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {library.rootPath}
                  </span>
                </span>
                <Badge variant="secondary" className="text-[10px] tabular-nums">
                  {library.projectCount}
                </Badge>
              </button>
            ))}
          </div>
        ) : activeLibrary ? (
          <div className="flex flex-col gap-1 rounded-md border border-border bg-muted/20 p-2">
            <div className="flex items-center gap-1.5 font-medium">
              <FolderKanban size={13} className="text-sky-500" />
              <span className="truncate">{activeLibrary.name}</span>
            </div>
            <div className="break-all text-[11px] text-muted-foreground">
              {activeLibrary.rootPath}
            </div>
            <div className="text-[11px] text-muted-foreground">
              最近扫描：{formatDateTime(activeLibrary.lastScannedAt)}
            </div>
          </div>
        ) : null}
      </section>

      {tagCounts.length > 0 ? (
        <>
          <Separator />
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">标签</span>
              {overviewTagFilter ? (
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline"
                  onClick={() => setOverviewTagFilter(null)}
                >
                  清除
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1">
              {tagCounts.slice(0, 24).map(([tag, count]) => {
                const active = overviewTagFilter === tag
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setOverviewTagFilter(active ? null : tag)}
                    className={cn(
                      'max-w-[144px] truncate rounded px-1.5 py-0.5 text-[11px] transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    #{tag} <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </>
      ) : null}

      {recentChanged.length > 0 ? (
        <>
          <Separator />
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-500" />
              <span className="font-medium">最近变更</span>
            </div>
            <div className="flex flex-col gap-1">
              {recentChanged.map(project => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => openProject(project.id)}
                  className="rounded-md border border-border/70 px-2 py-1.5 text-left hover:bg-muted/60"
                >
                  <div className="truncate font-medium">{project.name}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    +{project.changeSummary.added} · ~{project.changeSummary.modified} · -
                    {project.changeSummary.removed}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <p className="mt-auto text-[10px] leading-relaxed text-muted-foreground">
        提示：在左侧库列表中切换范围；点击任意卡片进入项目后，可随时用“返回项目卡片”回到这里。
      </p>
    </div>
  )
}
