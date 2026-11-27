import * as React from 'react'
import type { ProjectsUiExtensionContext, ProjectsUiProjectInfo, TaskSnapshot } from '@folio/base-contract'
import { rpcCall } from '@folio/base-contract/rpc'
import { Archive } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@folio/base-ui-kit/client'
import { useArchiveUiStore } from '../archive-store.js'

const sourceDisposalLabels = {
  keep: '校验通过后保留源文件',
  recycle: '校验通过后将源文件移入回收站',
  delete: '校验通过后永久删除源文件',
}

export function ArchiveBatchControl({
  ctx,
  selectedProjects,
}: {
  readonly ctx: ProjectsUiExtensionContext
  readonly selectedProjects: readonly ProjectsUiProjectInfo[]
}): React.ReactElement {
  const { status, error } = useArchiveUiStore()
  const [selection, setSelection] = React.useState<{
    readonly projects: readonly ProjectsUiProjectInfo[]
    readonly skippedCount: number
  } | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const eligible = selectedProjects.filter(project => !project.archived)
  const sourceDisposal = status?.settings.defaultSourceDisposal
  const toolReady = Boolean(status?.installed && status.supportsChunkBackup)

  const submit = async (): Promise<void> => {
    if (!selection || !sourceDisposal || !toolReady || submitting) return
    setSubmitting(true)
    try {
      const result = await rpcCall<{ tasks: TaskSnapshot[]; skippedCount: number }>(
        'archive.projects.packBatch',
        { projectIds: selection.projects.map(project => project.id), sourceDisposal },
      )
      for (const task of result.tasks) ctx.onTaskEnqueued(task)
      if (result.tasks.length > 0) {
        const skipped = result.skippedCount + selection.skippedCount
        ctx.notify(`已将 ${result.tasks.length} 个项目依次加入归档队列${skipped ? `，跳过 ${skipped} 个` : ''}`)
      } else {
        ctx.notify('所选项目已归档、已在队列中或已移出项目库')
      }
      setSelection(null)
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : '启动批量归档失败', false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-6 px-2 text-[11px]"
        disabled={eligible.length === 0}
        onClick={() => setSelection({
          projects: eligible,
          skippedCount: selectedProjects.length - eligible.length,
        })}
      >
        <Archive size={11} className="mr-1" />
        批量归档
      </Button>
      <Dialog open={selection !== null} onOpenChange={open => {
        if (!open && !submitting) setSelection(null)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量归档项目</DialogTitle>
            <DialogDescription>
              将 {selection?.projects.length ?? 0} 个未归档项目按列表顺序逐个打包。
              {selection?.skippedCount ? `已跳过 ${selection.skippedCount} 个已归档项目。` : null}
            </DialogDescription>
          </DialogHeader>
          <ol className="max-h-48 list-decimal space-y-1 overflow-y-auto pl-6 text-sm">
            {selection?.projects.map(project => <li key={project.id}>{project.name}</li>)}
          </ol>
          {toolReady && sourceDisposal ? (
            <p className={sourceDisposal === 'delete' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
              {sourceDisposalLabels[sourceDisposal]}。
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {error ?? (status ? '请在归档设置中安装或更新 zpaqfranz。' : '正在读取归档引擎状态…')}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submitting} onClick={() => setSelection(null)}>
              取消
            </Button>
            <Button
              type="button"
              variant={sourceDisposal === 'delete' ? 'destructive' : 'default'}
              disabled={!toolReady || submitting}
              onClick={() => void submit()}
            >
              开始归档
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
