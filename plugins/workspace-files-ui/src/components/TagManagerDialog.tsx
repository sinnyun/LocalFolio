import * as React from 'react'
import { Check, FolderSearch, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  Badge,
  Button,
  FolioDialog,
  FolioDialogContent,
  FolioDialogDescription,
  FolioDialogFooter,
  FolioDialogHeader,
  FolioDialogTitle,
  FolioInput,
  cn,
} from '@folio/base-ui-kit/client'
import { useFiles } from '../context.js'
import { TAG_COLOR_PALETTE } from '../format.js'

export function TagManagerDialog(): React.ReactElement {
  const {
    metadata,
    tagManagerOpen,
    setTagManagerOpen,
    createTag,
    updateTag,
    deleteTag,
    openTagViewActivePane,
  } = useFiles()

  const [newName, setNewName] = React.useState('')
  const [newColor, setNewColor] = React.useState<string>(TAG_COLOR_PALETTE[0])
  const [newDesc, setNewDesc] = React.useState('')
  const [filterQuery, setFilterQuery] = React.useState('')

  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draftName, setDraftName] = React.useState('')
  const [draftColor, setDraftColor] = React.useState<string>(TAG_COLOR_PALETTE[0])
  const [draftDesc, setDraftDesc] = React.useState('')

  const visibleTags = React.useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return metadata.tags
    return metadata.tags.filter(
      t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    )
  }, [metadata.tags, filterQuery])

  const handleCreate = async (ev: React.FormEvent): Promise<void> => {
    ev.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    const created = await createTag(trimmed, newColor, newDesc)
    if (created) {
      setNewName('')
      setNewDesc('')
    }
  }

  const handleSaveEdit = async (id: string): Promise<void> => {
    const trimmed = draftName.trim()
    if (!trimmed) return
    await updateTag({ id, name: trimmed, color: draftColor, description: draftDesc })
    setEditingId(null)
  }

  return (
    <FolioDialog open={tagManagerOpen} onOpenChange={setTagManagerOpen}>
      <FolioDialogContent
        data-lf-tag-manager-dialog=""
        className="w-[min(640px,calc(100vw-32px))] max-w-none"
      >
        <FolioDialogHeader>
          <FolioDialogTitle>标签管理器</FolioDialogTitle>
          <FolioDialogDescription>
            创建、编辑或删除本地文件标签，或点击标签在主视图中聚合浏览所有关联文件。
          </FolioDialogDescription>
        </FolioDialogHeader>

        <div className="flex max-h-[68vh] flex-col gap-3 overflow-hidden">
          {/* New Tag Form */}
          <form
            onSubmit={ev => void handleCreate(ev)}
            className="space-y-2 rounded-lg border border-border bg-muted/20 p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <FolioInput
                size="sm"
                data-lf-tag-manager-new-name=""
                placeholder="新标签名称…"
                value={newName}
                onChange={ev => setNewName(ev.target.value)}
                className="min-w-36 flex-1"
              />
              <FolioInput
                size="sm"
                placeholder="备注说明（可选）…"
                value={newDesc}
                onChange={ev => setNewDesc(ev.target.value)}
                className="min-w-36 flex-1"
              />
              <Button
                type="submit"
                size="sm"
                data-lf-tag-manager-create=""
                disabled={!newName.trim()}
              >
                <Plus size={13} />
                <span>创建标签</span>
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">颜色：</span>
              <div className="flex flex-wrap gap-1.5">
                {TAG_COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`选择标签颜色 ${c}`}
                    onClick={() => setNewColor(c)}
                    className={cn(
                      'size-4 rounded-full border',
                      newColor === c ? 'ring-2 ring-ring ring-offset-1' : 'border-transparent',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </form>

          <FolioInput
            size="sm"
            placeholder="搜索已有标签…"
            value={filterQuery}
            onChange={ev => setFilterQuery(ev.target.value)}
          />

          <div className="min-h-44 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {visibleTags.length === 0 ? (
              <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                暂无标签，在上方创建一个标签或直接在文件检查器中快速添加
              </div>
            ) : (
              visibleTags.map(tag => {
                const count = metadata.tagCounts[tag.id] ?? 0
                const isEditing = editingId === tag.id

                if (isEditing) {
                  return (
                    <div
                      key={tag.id}
                      className="space-y-2 rounded-lg border border-border bg-muted/20 p-2.5 text-xs"
                    >
                      <div className="flex flex-wrap gap-2">
                        <FolioInput
                          size="sm"
                          value={draftName}
                          onChange={ev => setDraftName(ev.target.value)}
                          onKeyDown={ev => {
                            if (ev.key === 'Enter') void handleSaveEdit(tag.id)
                            if (ev.key === 'Escape') setEditingId(null)
                          }}
                          className="min-w-32 flex-1"
                        />
                        <FolioInput
                          size="sm"
                          placeholder="描述…"
                          value={draftDesc}
                          onChange={ev => setDraftDesc(ev.target.value)}
                          className="min-w-36 flex-1"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {TAG_COLOR_PALETTE.map(c => (
                            <button
                              key={c}
                              type="button"
                              aria-label={`修改标签颜色 ${c}`}
                              onClick={() => setDraftColor(c)}
                              className={cn(
                                'size-4 rounded-full border',
                                draftColor === c
                                  ? 'ring-2 ring-ring ring-offset-1'
                                  : 'border-transparent',
                              )}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="xs"
                            variant="default"
                            onClick={() => void handleSaveEdit(tag.id)}
                          >
                            <Check size={12} />
                            <span>保存</span>
                          </Button>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                          >
                            <X size={12} />
                            <span>取消</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={tag.id}
                    data-lf-tag-manager-item={tag.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-foreground">{tag.name}</span>
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                            {count} 文件
                          </Badge>
                        </div>
                        {tag.description ? (
                          <div className="truncate text-[11px] text-muted-foreground">
                            {tag.description}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        data-lf-tag-open-view={tag.id}
                        onClick={() => {
                          void openTagViewActivePane(tag.id)
                          setTagManagerOpen(false)
                        }}
                      >
                        <FolderSearch size={12} />
                        <span>聚合查看</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`编辑标签 ${tag.name}`}
                        onClick={() => {
                          setEditingId(tag.id)
                          setDraftName(tag.name)
                          setDraftColor(tag.color)
                          setDraftDesc(tag.description)
                        }}
                      >
                        <Pencil size={12} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        data-lf-tag-delete={tag.id}
                        aria-label={`删除标签 ${tag.name}`}
                        onClick={() => void deleteTag(tag.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <FolioDialogFooter>
          <Button variant="outline" size="sm" onClick={() => setTagManagerOpen(false)}>
            完成
          </Button>
        </FolioDialogFooter>
      </FolioDialogContent>
    </FolioDialog>
  )
}
