import * as React from 'react'
import type { TaskItemStatus, TaskSnapshot } from '@folio/base-contract'
import { Badge, Button, cn } from '@folio/base-ui-kit/client'
import { useTaskItems } from '@folio/base-tasks-ui/client'
import { CheckCheck, RefreshCw, RotateCcw } from 'lucide-react'

type ItemFilter = 'all' | 'failed' | 'unfinished' | 'succeeded'

const FILTERS: Array<{ id: ItemFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'failed', label: '失败' },
  { id: 'unfinished', label: '未完成' },
  { id: 'succeeded', label: '成功' },
]

const itemStatusLabels: Record<TaskItemStatus, string> = {
  pending: '待处理',
  running: '处理中',
  succeeded: '成功',
  failed: '失败',
  cancelled: '已取消',
  skipped: '已跳过',
}

const itemStatusTone: Record<TaskItemStatus, string> = {
  pending: 'text-muted-foreground',
  running: 'text-primary',
  succeeded: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-destructive',
  cancelled: 'text-amber-600 dark:text-amber-400',
  skipped: 'text-muted-foreground',
}

export interface TaskItemListProps {
  readonly task: TaskSnapshot
  readonly retrying: boolean
  readonly onRetry: (itemKeys?: readonly string[]) => Promise<void>
}

function isRetryableStatus(status: TaskItemStatus): boolean {
  return status === 'failed' || status === 'cancelled' || status === 'pending'
}

/**
 * Item-level ledger of one task: browse failed / pending / succeeded entries,
 * select single or multiple failures and hand them back to the producer's
 * retry handler.
 */
export function TaskItemList({
  task,
  retrying,
  onRetry,
}: TaskItemListProps): React.ReactElement {
  const [filter, setFilter] = React.useState<ItemFilter>('all')
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const summary = task.items
  const live =
    task.status === 'queued' || task.status === 'running' || task.status === 'paused'
  const itemRevision = `${task.status}:${summary?.total ?? 0}`
  const { page, loading, error, reload } = useTaskItems({
    taskId: task.id,
    status: filter,
    limit: 500,
    refreshKey: itemRevision,
    live,
  })

  const items = page?.items ?? []

  React.useEffect(() => {
    setSelected(new Set())
  }, [task.id])

  React.useEffect(() => {
    setSelected(prev => {
      if (prev.size === 0) return prev
      const visible = new Set(items.map(item => item.key))
      const next = new Set([...prev].filter(key => visible.has(key)))
      return next.size === prev.size ? prev : next
    })
  }, [items])

  const selectable = items.filter(item => isRetryableStatus(item.status))
  const allSelected = selectable.length > 0 && selectable.every(item => selected.has(item.key))
  const someSelected = selectable.some(item => selected.has(item.key))
  const selectAllRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected
    }
  }, [someSelected, allSelected])

  const toggleOne = (key: string): void => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectVisible = (checked: boolean): void => {
    setSelected(prev => {
      const next = new Set(prev)
      for (const item of selectable) {
        if (checked) next.add(item.key)
        else next.delete(item.key)
      }
      return next
    })
  }

  const runRetry = async (keys?: readonly string[]): Promise<void> => {
    if (!task.retryable || retrying) return
    try {
      await onRetry(keys)
      setSelected(new Set())
      await reload()
    } catch {
      // The monitor surfaces the failure; keep the selection so it can be retried again.
    }
  }

  const failedCount = summary?.failed ?? 0
  const cancelledCount = summary?.cancelled ?? 0
  const pendingCount = summary?.pending ?? 0
  const retryAllCount =
    failedCount + cancelledCount + (task.status === 'failed' ? pendingCount : 0)
  const unfinishedCount = failedCount + pendingCount + cancelledCount
  const counter: Record<ItemFilter, number> = {
    all: summary?.total ?? page?.summary.total ?? 0,
    failed: failedCount,
    unfinished: unfinishedCount,
    succeeded: summary?.succeeded ?? 0,
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map(entry => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={filter === entry.id}
            onClick={() => setFilter(entry.id)}
            className={cn(
              'rounded px-2 py-0.5 text-xs transition-colors hover:bg-muted',
              filter === entry.id ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground',
            )}
          >
            {entry.label}
            <span className="ml-1 tabular-nums opacity-70">{counter[entry.id]}</span>
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">
          单勾或全选失败项后重试
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-xs">
          <input
            ref={selectAllRef}
            type="checkbox"
            className="h-3.5 w-3.5 accent-primary"
            checked={allSelected}
            disabled={selectable.length === 0 || retrying}
            onChange={event => selectVisible(event.target.checked)}
            aria-label="全选当前可重试子项"
          />
          全选当前可重试
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={selected.size === 0 || retrying || !task.retryable}
          onClick={() => void runRetry([...selected])}
        >
          <RefreshCw size={13} className={retrying ? 'animate-spin' : undefined} />
          重试选中（{selected.size}）
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={retryAllCount === 0 || retrying || !task.retryable}
          onClick={() => void runRetry()}
        >
          <CheckCheck size={13} />
          重试全部失败（{retryAllCount}）
        </Button>
        {!task.retryable && unfinishedCount > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            该任务未注册重试处理器，暂时无法单独重试
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="max-h-72 divide-y overflow-auto rounded border bg-background text-xs">
        {items.length === 0 ? (
          <li className="px-2 py-3 text-center text-muted-foreground">
            {loading ? '正在读取子项…' : '当前筛选下没有子项。'}
          </li>
        ) : null}
        {items.map(item => {
          const retryable = isRetryableStatus(item.status)
          return (
            <li key={item.key} className="flex items-start gap-2 px-2 py-1.5">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
                checked={selected.has(item.key)}
                disabled={!retryable || retrying}
                onChange={() => toggleOne(item.key)}
                aria-label={`选择 ${item.label}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="break-all font-medium" title={item.key}>
                    {item.label}
                  </span>
                  <span className={cn('shrink-0 text-[11px]', itemStatusTone[item.status])}>
                    {itemStatusLabels[item.status]}
                  </span>
                  {item.attempts > 1 ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      第 {item.attempts} 次
                    </span>
                  ) : null}
                  {item.retriedBy ? (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      已重试
                    </Badge>
                  ) : null}
                </div>
                {item.error ? (
                  <p className="mt-0.5 break-words text-[11px] text-destructive">{item.error}</p>
                ) : null}
              </div>
              {retryable && task.retryable ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  disabled={retrying}
                  onClick={() => void runRetry([item.key])}
                  title="只重试这一项"
                >
                  <RotateCcw size={11} />
                  重试
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          显示 {items.length} / {page?.total ?? counter[filter]} 项
        </span>
        {task.itemsTruncated ? (
          <span className="text-amber-600 dark:text-amber-400">
            子项过多，仅保留前 5000 项明细
          </span>
        ) : null}
        <button
          type="button"
          className="ml-auto rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
          onClick={() => void reload()}
          disabled={loading}
        >
          刷新子项
        </button>
      </div>
    </div>
  )
}
