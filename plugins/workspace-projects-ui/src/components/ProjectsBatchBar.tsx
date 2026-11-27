import * as React from 'react'
import { RefreshCw, Sparkles, Tags } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@folio/base-ui-kit/client'
import { useProjects } from '../context.js'
import type { ProjectSummary } from '../types.js'

export interface ProjectsBatchBarProps {
  readonly selectedProjects: readonly ProjectSummary[]
  readonly selectableCount: number
  readonly onSelectAll: () => void
}

/**
 * Shared multi-select action bar used by both the project card overview and the
 * project list inside a library. Owns its own tag dialog so either surface can
 * expose the same batch operations without duplicating state.
 */
export function ProjectsBatchBar({
  selectedProjects,
  selectableCount,
  onSelectAll,
}: ProjectsBatchBarProps): React.ReactElement {
  const {
    aiStatus,
    selectedProjectIds,
    extensions,
    extensionContext,
    extractBatchWithAi,
    batchTagProjects,
    batchSyncProjects,
    clearCheckedProjects,
  } = useProjects()
  const [tagDialogOpen, setTagDialogOpen] = React.useState(false)
  const [addTagsText, setAddTagsText] = React.useState('')
  const [removeTagsText, setRemoveTagsText] = React.useState('')
  const selectedIds = Array.from(selectedProjectIds)

  return (
    <>
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
              disabled={selectableCount === 0}
              onClick={onSelectAll}
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
            onClick={() => void extractBatchWithAi({ projectIds: selectedIds })}
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
            onClick={() => setTagDialogOpen(true)}
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
              void batchSyncProjects({ projectIds: selectedIds, onlyChanged: false })
            }
          >
            <RefreshCw size={11} className="mr-1" />
            同步
          </Button>
          {extensions.map(extension => (
            <React.Fragment key={extension.id}>
              {extension.renderBatchActions?.(extensionContext, selectedProjects)}
            </React.Fragment>
          ))}
        </div>
      </div>

      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
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
              const addTags = addTagsText
                .split(/[,，]/)
                .map(s => s.trim())
                .filter(Boolean)
              const removeTags = removeTagsText
                .split(/[,，]/)
                .map(s => s.trim())
                .filter(Boolean)
              await batchTagProjects(selectedIds, addTags, removeTags)
              setAddTagsText('')
              setRemoveTagsText('')
              setTagDialogOpen(false)
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">新增标签（逗号分隔）</label>
              <Input
                value={addTagsText}
                onChange={e => setAddTagsText(e.target.value)}
                placeholder="例如：2026, 重点客户"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">移除标签（逗号分隔，可选）</label>
              <Input
                value={removeTagsText}
                onChange={e => setRemoveTagsText(e.target.value)}
                placeholder="例如：待整理"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setTagDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={!addTagsText.trim() && !removeTagsText.trim()}>
                应用到选中项目
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
