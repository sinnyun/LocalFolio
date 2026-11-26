import * as React from 'react'
import type { ProjectsUiExtensionContext, TaskSnapshot } from '@folio/base-contract'
import { rpcCall } from '@folio/base-contract/rpc'
import {
  Archive,
  CheckCircle2,
  Download,
  ExternalLink,
  FilePlus2,
  PackageOpen,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { Badge, Button } from '@folio/base-ui-kit/client'
import {
  downloadZpaqfranz,
  formatBytes,
  formatDateTime,
  setArchiveDialogOpen,
  useArchiveUiStore,
} from '../archive-store.js'
import type { ArchiveLiveInspection } from '../types.js'

export function ArchiveInspectorSection({
  ctx,
}: {
  readonly ctx: ProjectsUiExtensionContext
}): React.ReactElement | null {
  const { status, downloading } = useArchiveUiStore()
  const [busy, setBusy] = React.useState(false)
  const [inspection, setInspection] = React.useState<ArchiveLiveInspection | null>(null)

  const project = ctx.selectedProject
  const archive = ctx.projectArchive
  const isArchived = Boolean(project && (archive?.mode === 'archived' || project.archived))

  const refreshInspection = React.useCallback(async () => {
    if (!project) {
      setInspection(null)
      return
    }
    try {
      const res = await rpcCall<ArchiveLiveInspection>('archive.project.inspectLive', {
        projectId: project.id,
      })
      setInspection(res)
    } catch {
      setInspection(null)
    }
  }, [project?.id])

  React.useEffect(() => {
    void refreshInspection()
  }, [
    refreshInspection,
    isArchived,
    archive?.archivedAt,
    archive?.extractedFiles?.length,
    project?.fileCount,
    project?.hasChanges,
  ])

  React.useEffect(() => {
    if (typeof window === 'undefined' || !project) return undefined
    const onInvalidate = (ev: Event): void => {
      const detail = (ev as CustomEvent<{ scope?: string }>).detail
      if (detail?.scope === 'archive' || detail?.scope === 'projects' || detail?.scope === '*') {
        void refreshInspection()
      }
    }
    window.addEventListener('folio:invalidate', onInvalidate)
    return () => {
      window.removeEventListener('folio:invalidate', onInvalidate)
    }
  }, [project?.id, refreshInspection])

  if (!project) return null

  const originalBytes = archive?.originalBytes ?? project.totalBytes
  const archiveBytes = archive?.archiveBytes ?? project.archiveBytes ?? 0
  const savedPct =
    originalBytes > 0 && archiveBytes > 0
      ? Math.max(0, Math.round((1 - archiveBytes / originalBytes) * 100))
      : null

  const cleanCount = inspection?.cleanExtracted.length ?? 0
  const modifiedCount = inspection?.modifiedExtracted.length ?? 0
  const addedCount = inspection?.addedFiles.length ?? 0
  const leftoverFiles = inspection?.leftoverArchiveFiles ?? []
  const hasDelta = modifiedCount > 0 || addedCount > 0

  const handleRemoveLeftoverArchive = async (archiveFileName: string): Promise<void> => {
    setBusy(true)
    try {
      await rpcCall('archive.project.removeLeftoverArchive', {
        projectId: project.id,
        archiveFileName,
        disposal: 'recycle',
      })
      await Promise.all([refreshInspection(), ctx.refreshSelectedProject(), ctx.refreshProjects()])
      ctx.notify(`已将残留归档包「${archiveFileName}」移入回收站并刷新索引`, true)
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : '清理残留归档包失败', false)
    } finally {
      setBusy(false)
    }
  }

  const runTaskAction = async (
    actionId: string,
    payload: Record<string, unknown>,
    startedMsg: string,
  ): Promise<void> => {
    setBusy(true)
    try {
      const res = await rpcCall<{ task: TaskSnapshot }>(actionId, payload)
      ctx.onTaskEnqueued(res.task)
      ctx.notify(startedMsg, true)
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : '操作失败', false)
    } finally {
      setBusy(false)
    }
  }

  const handleCleanUnmodified = async (): Promise<void> => {
    setBusy(true)
    try {
      const res = await rpcCall<{
        removedCount: number
        skippedModifiedCount: number
      }>('archive.project.cleanExtracted', { projectId: project.id })
      await Promise.all([refreshInspection(), ctx.refreshSelectedProject(), ctx.refreshProjects()])
      if (res.removedCount > 0) {
        ctx.notify(`已直接删除 ${res.removedCount} 个未修改的归档提取文件`, true)
      } else {
        ctx.notify('没有可安全清理的未修改提取文件', false)
      }
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : '清理提取文件失败', false)
    } finally {
      setBusy(false)
    }
  }

  const handleQuickDownload = async (): Promise<void> => {
    try {
      await downloadZpaqfranz(undefined, ctx.onTaskEnqueued)
      ctx.notify('已开始在后台下载安装 zpaqfranz…', true)
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : '下载 zpaqfranz 失败', false)
    }
  }

  const handleExportArchive = async (): Promise<void> => {
    try {
      const res = await rpcCall<{ cancelled: boolean; exportedPath: string | null }>(
        'archive.project.exportArchive',
        { projectId: project.id, reveal: true },
      )
      if (!res.cancelled && res.exportedPath) {
        ctx.notify(`已导出归档包到：${res.exportedPath}`, true)
      }
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : '导出归档包失败', false)
    }
  }

  return (
    <section data-lf-archive-inspector="" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium">
          <Archive size={13} className="text-violet-500" />
          <span>归档备份（ZPAQ）</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[11px] text-muted-foreground"
          onClick={() => setArchiveDialogOpen(true)}
        >
          <Settings size={11} className="mr-1" />
          设置
        </Button>
      </div>

      {!status?.installed ? (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px]">
          <p className="text-amber-700 dark:text-amber-300">
            尚未安装 zpaqfranz 引擎，下载到固定目录后即可直接归档与按需打开包内文件。
          </p>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-7 flex-1 text-xs"
              disabled={downloading}
              onClick={() => void handleQuickDownload()}
            >
              <Download size={12} className="mr-1" />
              {downloading ? '下载中…' : '一键下载 zpaqfranz'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setArchiveDialogOpen(true)}
            >
              配置/导入
            </Button>
          </div>
        </div>
      ) : isArchived ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2.5 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary" className="gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={11} />
              已去重归档 {archive?.versions ? `v${archive.versions}` : ''}
            </Badge>
            <span className="truncate text-muted-foreground" title={archive?.archiveFileName}>
              {archive?.archiveFileName ?? project.archiveFileName}
            </span>
          </div>

          <div className="flex items-center justify-between tabular-nums text-muted-foreground">
            <span>
              {formatBytes(originalBytes)} →{' '}
              <strong className="text-foreground">{formatBytes(archiveBytes)}</strong>
            </span>
            {savedPct !== null ? <span>节省 {savedPct}%</span> : null}
          </div>

          {archive ? (
            <div className="text-[10px] text-muted-foreground">
              归档：{formatDateTime(archive.archivedAt)} · 校验：{formatDateTime(archive.verifiedAt)}
            </div>
          ) : null}

          {cleanCount > 0 ? (
            <div
              data-lf-archive-clean-extracted=""
              className="flex flex-col gap-1.5 rounded border border-sky-500/30 bg-sky-500/10 p-2 text-[11px]"
            >
              <div className="flex items-center gap-1 font-medium text-sky-600 dark:text-sky-400">
                <Sparkles size={12} />
                <span>已提取到项目原位置（未修改）：{cleanCount} 个</span>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                以下文件来自归档内部且未被修改，不计入增量变更，可直接删除释放空间：
                {' '}
                {inspection!.cleanExtracted
                  .slice(0, 3)
                  .map(f => f.name)
                  .join('、')}
                {cleanCount > 3 ? ` 等 ${cleanCount} 个` : ''}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 border-sky-500/40 text-[11px]"
                disabled={busy}
                onClick={() => void handleCleanUnmodified()}
              >
                <Trash2 size={11} className="mr-1" />
                直接删除未修改提取文件
              </Button>
            </div>
          ) : null}

          {hasDelta ? (
            <div
              data-lf-archive-delta=""
              className="flex flex-col gap-1.5 rounded border border-violet-500/30 bg-violet-500/10 p-2 text-[11px]"
            >
              <div className="flex items-center gap-1 font-medium text-violet-600 dark:text-violet-400">
                <FilePlus2 size={12} />
                <span>
                  检测到增量文件：+{addedCount} 新增 · ~{modifiedCount} 已修改
                </span>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                可直接增量追加打包进 {archive?.archiveFileName ?? project.archiveFileName}（去重生成新版本并更新缩略图）。
              </p>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                disabled={busy}
                onClick={() =>
                  void runTaskAction(
                    'archive.project.append',
                    { projectId: project.id },
                    `已启动「${project.name}」增量追加归档`,
                  )
                }
              >
                <Archive size={12} className="mr-1" />
                追加归档到 .zpaq
              </Button>
            </div>
          ) : null}

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            缩略图实时可读；双击项目内文件会自动提取临时副本打开，或「提取到原位置」还原单文件。
          </p>

          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() =>
                void runTaskAction(
                  'archive.project.verify',
                  { projectId: project.id },
                  `正在后台校验「${project.name}」归档完整性`,
                )
              }
            >
              <ShieldCheck size={12} className="mr-1" />
              校验完整性
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => void handleExportArchive()}
            >
              <Upload size={12} className="mr-1" />
              导出归档包
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
              disabled={busy}
              title="解压全部文件到原位置，同时把 .zpaq 包移入回收站，恢复为普通项目（不留重复文件）"
              onClick={() =>
                void runTaskAction(
                  'archive.project.restore',
                  {
                    projectId: project.id,
                    mode: 'restore_and_remove_archive',
                    removeArchive: true,
                  },
                  `正在解包还原「${project.name}」并清理归档包`,
                )
              }
            >
              <PackageOpen size={12} className="mr-1" />
              解包还原（移除包）
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={busy}
              title="将所有文件提取回原位置，保留 .zpaq 包和归档状态，用完可一键直接删除"
              onClick={() =>
                void runTaskAction(
                  'archive.project.restore',
                  {
                    projectId: project.id,
                    mode: 'extract_all_keep_archive',
                    removeArchive: false,
                  },
                  `正在全部提取「${project.name}」到原位置（保留归档包）`,
                )
              }
            >
              <Download size={12} className="mr-1" />
              全部提取（保留包）
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 text-[11px] text-muted-foreground"
            onClick={() =>
              void ctx.revealPath(archive?.archiveFileName ?? project.archiveFileName ?? undefined)
            }
          >
            <ExternalLink size={11} className="mr-1" />
            定位归档包位置
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2.5 text-[11px]">
          {leftoverFiles.length > 0 ? (
            <div
              data-lf-archive-leftover=""
              className="flex flex-col gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px]"
            >
              <span className="font-medium text-amber-600 dark:text-amber-400">
                检测到与原文件并存的残留归档包：
              </span>
              {leftoverFiles.map(file => (
                <div key={file.name} className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted-foreground" title={file.name}>
                    {file.name}（{formatBytes(file.size)}）
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 border-amber-500/40 px-2 text-[11px]"
                    disabled={busy}
                    onClick={() => void handleRemoveLeftoverArchive(file.name)}
                  >
                    <Trash2 size={11} className="mr-1" />
                    移入回收站清理归档包
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          <p className="leading-relaxed text-muted-foreground">
            先为所有可预览文件生成 360px 缩略图并保留原路径与名称，再用 zpaqfranz 块级去重打包，校验通过后清理源文件。
          </p>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() =>
              void runTaskAction(
                'archive.project.pack',
                { projectId: project.id },
                `已启动「${project.name}」缩略图预热与 ZPAQ 归档打包`,
              )
            }
          >
            <Archive size={12} className="mr-1.5" />
            归档此项目
          </Button>
        </div>
      )}
    </section>
  )
}
