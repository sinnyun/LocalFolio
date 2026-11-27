import * as React from 'react'
import type { ProjectsUiExtensionContext, TaskSnapshot } from '@folio/base-contract'
import { rpcCall } from '@folio/base-contract/rpc'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ImageOff,
  RefreshCw,
  Sparkles,
  Trash2,
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
  formatBytes,
} from '@folio/base-ui-kit/client'

const LARGE_SINGLE_FILE_BYTES = 500 * 1024 * 1024 // 500 MB
const LARGE_TOTAL_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB

interface MissingFileItem {
  readonly relPath: string
  readonly absPath: string
  readonly name: string
  readonly size: number
  readonly thumbKey: string
}

interface MissingExtGroup {
  readonly ext: string
  readonly count: number
  readonly totalBytes: number
  readonly items: readonly MissingFileItem[]
}

interface FailedEagleItem extends MissingFileItem {
  readonly ext: string
}

interface ProjectThumbsInspectResult {
  readonly projectId: string
  readonly projectName: string
  readonly readyCount: number
  readonly ignoredCount: number
  readonly pendingCount: number
  readonly unavailableCount: number
  readonly archivedItems: readonly { readonly relPath: string; readonly size: number }[]
  readonly missingCount: number
  readonly missingBytes: number
  readonly failedEagleCount: number
  readonly missingGroups: readonly MissingExtGroup[]
  readonly failedEagleItems: readonly FailedEagleItem[]
}

interface EagleStatusResult {
  readonly online: boolean
  readonly currentLibrary: { readonly path: string; readonly name: string } | null
  readonly apiBase: string
  readonly cacheLibraryPath: string
  readonly cumulativeImportedBytes: number
  readonly spaceThresholdBytes: number
  readonly spaceWarning: boolean
  readonly busy: boolean
}

export function MissingThumbsToolbarControl({
  ctx,
}: {
  readonly ctx: ProjectsUiExtensionContext
}): React.ReactElement | null {
  const project = ctx.selectedProject
  const projectId = project?.id
  const notify = ctx.notify
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [inspection, setInspect] = React.useState<ProjectThumbsInspectResult | null>(null)
  const [eagleStatus, setEagleStatus] = React.useState<EagleStatusResult | null>(null)
  const [selectedPaths, setSelectedPaths] = React.useState<Set<string>>(() => new Set())
  const [selectedArchivePaths, setSelectedArchivePaths] = React.useState<Set<string>>(() => new Set())
  const [expandedExts, setExpandedExts] = React.useState<Set<string>>(() => new Set())
  const [showFailed, setShowFailed] = React.useState(false)
  const [confirmLarge, setConfirmLarge] = React.useState<{
    readonly totalBytes: number
    readonly oversizedCount: number
    readonly allPaths: readonly string[]
    readonly safePaths: readonly string[]
  } | null>(null)

  const refreshData = React.useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [inspectRes, statusRes] = await Promise.all([
        rpcCall<ProjectThumbsInspectResult>('thumbs.eagle.project.inspect', {
          projectId,
        }),
        rpcCall<EagleStatusResult>('thumbs.eagle.status', {}),
      ])
      setInspect(inspectRes)
      setEagleStatus(statusRes)
    } catch (err) {
      notify(err instanceof Error ? err.message : '加载无缩略图列表失败', false)
    } finally {
      setLoading(false)
    }
  }, [notify, projectId])

  React.useEffect(() => {
    setSelectedPaths(new Set())
    setSelectedArchivePaths(new Set())
    setConfirmLarge(null)
  }, [open, projectId])

  React.useEffect(() => {
    if (open && projectId) {
      void refreshData()
    }
  }, [open, projectId, refreshData])

  if (!project) return null
  const inspect = inspection?.projectId === project.id ? inspection : null
  const archivedItems = inspect?.archivedItems ?? []
  const selectedArchiveItems = archivedItems.filter(item => selectedArchivePaths.has(item.relPath))
  const archiveSelectedBytes = selectedArchiveItems.reduce((total, item) => total + item.size, 0)

  const allMissingMap = new Map<string, MissingFileItem>()
  if (inspect) {
    for (const g of inspect.missingGroups) {
      for (const item of g.items) {
        allMissingMap.set(item.absPath, item)
      }
    }
  }

  const toggleGroup = (group: MissingExtGroup, checked: boolean): void => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      for (const item of group.items) {
        if (checked) next.add(item.absPath)
        else next.delete(item.absPath)
      }
      return next
    })
  }

  const toggleFile = (absPath: string, checked: boolean): void => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (checked) next.add(absPath)
      else next.delete(absPath)
      return next
    })
  }

  const toggleExpandExt = (ext: string): void => {
    setExpandedExts(prev => {
      const next = new Set(prev)
      if (next.has(ext)) next.delete(ext)
      else next.add(ext)
      return next
    })
  }

  const executeEagleBatch = async (paths: readonly string[]): Promise<void> => {
    if (paths.length === 0) return
    setSubmitting(true)
    try {
      const res = await rpcCall<{ task: TaskSnapshot }>('thumbs.eagle.generate', {
        filePaths: [...paths],
        projectId: project.id,
      })
      ctx.onTaskEnqueued(res.task)
      ctx.notify(`已提交 ${paths.length} 个文件至 Eagle 串行补全队列`, true)
      setConfirmLarge(null)
      setSelectedPaths(new Set())
      setOpen(false)
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : 'Eagle 补全启动失败', false)
    } finally {
      setSubmitting(false)
    }
  }

  const executeArchiveBatch = async (): Promise<void> => {
    if (selectedArchiveItems.length === 0 || submitting) return
    setSubmitting(true)
    try {
      const { task } = await rpcCall<{ task: TaskSnapshot }>('archive.project.rebuildThumbs', {
        projectId: project.id,
        relPaths: selectedArchiveItems.map(item => item.relPath),
      })
      ctx.onTaskEnqueued(task)
      ctx.notify(`已提交 ${selectedArchiveItems.length} 个归档文件补图任务`, true)
      setOpen(false)
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : '归档补图任务启动失败', false)
    } finally {
      setSubmitting(false)
    }
  }

  const selectedMissingPaths = Array.from(selectedPaths).filter(filePath => allMissingMap.has(filePath))

  const handleRequestGenerate = (): void => {
    const picked = selectedMissingPaths
    if (picked.length === 0) return
    let totalBytes = 0
    let oversizedCount = 0
    const safePaths: string[] = []
    for (const p of picked) {
      const item = allMissingMap.get(p)
      const size = item?.size ?? 0
      totalBytes += size
      if (size > LARGE_SINGLE_FILE_BYTES) {
        oversizedCount += 1
      } else {
        safePaths.push(p)
      }
    }

    if (oversizedCount > 0 || totalBytes > LARGE_TOTAL_BYTES) {
      setConfirmLarge({
        totalBytes,
        oversizedCount,
        allPaths: picked,
        safePaths,
      })
      return
    }

    void executeEagleBatch(picked)
  }

  const handleResetCacheLib = async (): Promise<void> => {
    try {
      await rpcCall('thumbs.eagle.cache.reset', {})
      ctx.notify('已重建并清空 Eagle 专用缓存库', true)
      await refreshData()
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : '清理 Eagle 缓存库失败', false)
    }
  }

  const selectedBytes = selectedMissingPaths.reduce(
    (sum, p) => sum + (allMissingMap.get(p)?.size ?? 0),
    0,
  )

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={() => setOpen(true)}
        title="查看缩略图并补图"
      >
        <ImageOff className="h-3.5 w-3.5" />
        <span>无缩略图</span>
        {inspect && inspect.missingCount + archivedItems.length > 0 ? (
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            {inspect.missingCount + archivedItems.length}
          </Badge>
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ImageOff className="h-4 w-4" />
              <span>无缩略图待办 · {project.name}</span>
            </DialogTitle>
            <DialogDescription>
              查看项目缓存和本机生成结果，可选用 Eagle 补图，或从归档包为指定文件生成缩略图。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs">
            {/* Eagle Service Status Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                <Badge variant={eagleStatus?.online ? 'default' : 'destructive'}>
                  {eagleStatus?.online ? 'Eagle 在线' : 'Eagle 未启动'}
                </Badge>
                {eagleStatus?.online && eagleStatus.currentLibrary ? (
                  <span className="text-muted-foreground">
                    当前库：{eagleStatus.currentLibrary.name}（补全时将自动切换至专用缓存库并切回）
                  </span>
                ) : (
                  <span className="text-muted-foreground">请先启动 Eagle 客户端后再执行手动补全</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  disabled={loading}
                  onClick={() => void refreshData()}
                >
                  <RefreshCw className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                  刷新
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => void handleResetCacheLib()}
                  title="重建清空 Eagle 专用缓存库"
                >
                  <Trash2 className="mr-1 h-3 w-3" />
                  清缓存库
                </Button>
              </div>
            </div>

            {eagleStatus?.spaceWarning ? (
              <div className="flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-600 dark:text-amber-400">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    Eagle 专用缓存库累计导入已达 {formatBytes(eagleStatus.cumulativeImportedBytes)}，建议空闲时清理重建以释放空间。
                  </span>
                </div>
                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => void handleResetCacheLib()}>
                  立即清理
                </Button>
              </div>
            ) : null}

            {/* Summary Metrics */}
            {inspect ? (
              <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                <span>已有缩略图：{inspect.readyCount}</span>
                <span>待补全：{inspect.missingCount}（{formatBytes(inspect.missingBytes)}）</span>
                {inspect.pendingCount > 0 ? <span>尚未尝试生成：{inspect.pendingCount}</span> : null}
                {archivedItems.length > 0 ? <span>可从归档补图：{archivedItems.length}</span> : null}
                {inspect.unavailableCount > 0 ? <span>原文件不可用且无缩略图：{inspect.unavailableCount}</span> : null}
                <span>已忽略杂项：{inspect.ignoredCount}</span>
                {inspect.failedEagleCount > 0 ? (
                  <span className="text-destructive">Eagle 失败：{inspect.failedEagleCount}</span>
                ) : null}
              </div>
            ) : null}

            {/* Extension-Grouped Missing Backlog */}
            <div className="max-h-72 overflow-y-auto rounded-md border">
              {loading && !inspect ? (
                <div className="p-6 text-center text-muted-foreground">正在统计项目缩略图状态...</div>
              ) : !inspect || inspect.missingGroups.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground">
                  当前没有待用 Eagle 补图的本地文件。
                </div>
              ) : (
                <div className="divide-y">
                  {inspect.missingGroups.map(group => {
                    const selectedInGroup = group.items.filter(it => selectedPaths.has(it.absPath)).length
                    const allChecked = selectedInGroup === group.items.length && group.items.length > 0
                    const isExpanded = expandedExts.has(group.ext)
                    return (
                      <div key={group.ext}>
                        <div className="flex items-center justify-between px-3 py-2 hover:bg-muted/40">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 cursor-pointer accent-primary"
                              checked={allChecked}
                              onChange={e => toggleGroup(group, e.target.checked)}
                            />
                            <button
                              type="button"
                              className="flex items-center gap-1 font-medium"
                              onClick={() => toggleExpandExt(group.ext)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                              <span>{group.ext}</span>
                            </button>
                            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                              {group.count}
                            </Badge>
                          </div>
                          <span className="text-muted-foreground">{formatBytes(group.totalBytes)}</span>
                        </div>

                        {isExpanded ? (
                          <div className="space-y-1 border-t bg-muted/20 px-6 py-2">
                            {group.items.map(item => (
                              <label
                                key={item.absPath}
                                className="flex cursor-pointer items-center justify-between gap-2 py-0.5"
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 cursor-pointer accent-primary"
                                    checked={selectedPaths.has(item.absPath)}
                                    onChange={e => toggleFile(item.absPath, e.target.checked)}
                                  />
                                  <span className="truncate" title={item.relPath}>
                                    {item.relPath}
                                  </span>
                                </span>
                                <span className="shrink-0 text-muted-foreground">
                                  {formatBytes(item.size)}
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {archivedItems.length > 0 ? (
              <section className="space-y-2 rounded-md border px-3 py-2" aria-label="归档内补缩略图">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">归档内补缩略图</span>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={selectedArchiveItems.length === archivedItems.length}
                      disabled={submitting || loading}
                      onChange={event => setSelectedArchivePaths(new Set(
                        event.currentTarget.checked ? archivedItems.map(item => item.relPath) : [],
                      ))}
                    />
                    全选归档文件
                  </label>
                </div>
                <div className="max-h-36 divide-y overflow-y-auto">
                  {archivedItems.map(item => (
                    <label key={item.relPath} className="flex items-center gap-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selectedArchivePaths.has(item.relPath)}
                        disabled={submitting || loading}
                        onChange={event => {
                          const checked = event.currentTarget.checked
                          setSelectedArchivePaths(prev => {
                            const next = new Set(prev)
                            if (checked) next.add(item.relPath)
                            else next.delete(item.relPath)
                            return next
                          })
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate" title={item.relPath}>{item.relPath}</span>
                      <span className="shrink-0 text-muted-foreground">{formatBytes(item.size)}</span>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    已选 {selectedArchiveItems.length} 个（{formatBytes(archiveSelectedBytes)}），逐个临时提取。
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={selectedArchiveItems.length === 0 || submitting || loading}
                    onClick={() => void executeArchiveBatch()}
                  >
                    从归档补缩略图
                  </Button>
                </div>
              </section>
            ) : null}

            {/* Collapsible FAILED_EAGLE Section */}
            {inspect && inspect.failedEagleCount > 0 ? (
              <div className="rounded-md border">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left font-medium hover:bg-muted/40"
                  onClick={() => setShowFailed(v => !v)}
                >
                  <span className="flex items-center gap-1.5 text-destructive">
                    {showFailed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span>Eagle 生成失败（已熔断跳过）：{inspect.failedEagleCount}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">点击展开手动重试</span>
                </button>
                {showFailed ? (
                  <div className="max-h-36 divide-y overflow-y-auto border-t px-3 py-1">
                    {inspect.failedEagleItems.map(item => (
                      <div key={item.absPath} className="flex items-center justify-between gap-2 py-1.5">
                        <span className="truncate" title={item.relPath}>
                          {item.relPath} ({formatBytes(item.size)})
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={submitting || !eagleStatus?.online}
                          onClick={() => void executeEagleBatch([item.absPath])}
                        >
                          重试
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Large File Confirmation Warning (Defense Layer 3) */}
            {confirmLarge ? (
              <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
                <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <div className="font-medium">大文件拷贝开销提醒</div>
                    <p className="mt-0.5 text-[11px] opacity-90">
                      已勾选文件总计 {formatBytes(confirmLarge.totalBytes)}
                      {confirmLarge.oversizedCount > 0
                        ? `，其中包含 ${confirmLarge.oversizedCount} 个大于 500MB 的超大文件`
                        : ''}
                      。Eagle 导入会复制源文件到专用缓存库，可能耗时较长并占用磁盘空间。
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setConfirmLarge(null)}
                  >
                    取消
                  </Button>
                  {confirmLarge.safePaths.length > 0 && confirmLarge.oversizedCount > 0 ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      disabled={submitting}
                      onClick={() => void executeEagleBatch(confirmLarge.safePaths)}
                    >
                      剔除超大文件后生成（{confirmLarge.safePaths.length} 个）
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    disabled={submitting}
                    onClick={() => void executeEagleBatch(confirmLarge.allPaths)}
                  >
                    仍全部用 Eagle 生成（{confirmLarge.allPaths.length} 个）
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <span className="text-xs text-muted-foreground">
              已选 {selectedMissingPaths.length} 个文件（{formatBytes(selectedBytes)}）
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                关闭
              </Button>
              <Button
                size="sm"
                disabled={selectedMissingPaths.length === 0 || submitting || loading || !eagleStatus?.online}
                onClick={handleRequestGenerate}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                用 Eagle 补全
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
