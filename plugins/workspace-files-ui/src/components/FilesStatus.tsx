import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import { useFiles } from '../context.js'
import { formatBytes, groupEntries } from '../format.js'

export function FilesStatus(_props: FrameViewProps): React.ReactElement {
  const { panes, activePaneId, dualPane, selectedEntry } = useFiles()
  const pane = panes[activePaneId]

  const visibleCount = React.useMemo(() => {
    const groups = groupEntries(
      pane.entries,
      pane.groupBy,
      pane.childGroups,
      pane.sortBy,
      pane.sortDir,
      pane.filterQuery,
      pane.categoryFilter,
    )
    return groups.reduce((acc, g) => acc + g.entries.length, 0)
  }, [
    pane.entries,
    pane.groupBy,
    pane.childGroups,
    pane.sortBy,
    pane.sortDir,
    pane.filterQuery,
    pane.categoryFilter,
  ])

  const folderLabel =
    pane.breadcrumbs[pane.breadcrumbs.length - 1]?.name || pane.path || '加载中…'

  return (
    <div
      data-lf-files-status=""
      className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap"
    >
      {dualPane ? (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
          {activePaneId === 'left' ? '左栏' : '右栏'}
        </span>
      ) : null}
      <span className="truncate font-medium text-foreground">{folderLabel}</span>
      <span aria-hidden="true" className="opacity-40">
        ·
      </span>
      <span className="tabular-nums">
        {pane.filterQuery.trim() || pane.categoryFilter !== 'all'
          ? `筛选 ${visibleCount} / ${pane.totalEntries} 项`
          : `共 ${pane.totalEntries} 项`}
        {pane.truncated ? '（已截断）' : ''}
      </span>
      {selectedEntry ? (
        <>
          <span aria-hidden="true" className="opacity-40">
            ·
          </span>
          <span className="truncate text-foreground">
            已选：{selectedEntry.name}
            {!selectedEntry.isDir ? ` (${formatBytes(selectedEntry.size)})` : ''}
          </span>
        </>
      ) : null}
    </div>
  )
}
