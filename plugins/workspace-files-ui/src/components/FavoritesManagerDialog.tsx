import * as React from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  FolderOpen,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@folio/base-ui-kit/client'
import { useFiles } from '../context.js'
import { TAG_COLOR_PALETTE } from '../format.js'

export function FavoritesManagerDialog(): React.ReactElement {
  const {
    favorites,
    panes,
    activePaneId,
    favoritesManagerOpen,
    setFavoritesManagerOpen,
    navigateActivePane,
    addFavorite,
    updateFavorite,
    removeFavorite,
    createFavoriteGroup,
    updateFavoriteGroup,
    deleteFavoriteGroup,
    isFavoritePath,
  } = useFiles()

  const activePane = panes[activePaneId]
  const canFavCurrent = activePane.mode === 'directory' && Boolean(activePane.path)
  const currentAlreadyFav = canFavCurrent && isFavoritePath(activePane.path)

  const [selectedGroupId, setSelectedGroupId] = React.useState<string>('all')
  const [newGroupName, setNewGroupName] = React.useState('')
  const [newGroupColor, setNewGroupColor] = React.useState<string>(TAG_COLOR_PALETTE[0])

  const [editingGroupId, setEditingGroupId] = React.useState<string | null>(null)
  const [groupDraftName, setGroupDraftName] = React.useState('')
  const [groupDraftColor, setGroupDraftColor] = React.useState<string>(TAG_COLOR_PALETTE[0])

  const [addAlias, setAddAlias] = React.useState('')
  const [addGroupId, setAddGroupId] = React.useState('default')
  const [filterQuery, setFilterQuery] = React.useState('')

  const [editingItemId, setEditingItemId] = React.useState<string | null>(null)
  const [itemDraftName, setItemDraftName] = React.useState('')

  React.useEffect(() => {
    if (favoritesManagerOpen && canFavCurrent) {
      const parts = activePane.path.split(/[\\/]+/).filter(Boolean)
      setAddAlias(parts[parts.length - 1] || activePane.path)
    }
  }, [favoritesManagerOpen, canFavCurrent, activePane.path])

  React.useEffect(() => {
    if (selectedGroupId !== 'all' && !favorites.groups.some(g => g.id === selectedGroupId)) {
      setSelectedGroupId('all')
    }
    if (!favorites.groups.some(g => g.id === addGroupId)) {
      setAddGroupId('default')
    }
  }, [favorites.groups, selectedGroupId, addGroupId])

  const visibleItems = React.useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    return favorites.items.filter(item => {
      if (selectedGroupId !== 'all' && item.groupId !== selectedGroupId) return false
      if (q && !item.name.toLowerCase().includes(q) && !item.path.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [favorites.items, selectedGroupId, filterQuery])

  const handleCreateGroup = async (ev: React.FormEvent): Promise<void> => {
    ev.preventDefault()
    const name = newGroupName.trim()
    if (!name) return
    await createFavoriteGroup(name, newGroupColor)
    setNewGroupName('')
  }

  const handleSaveGroup = async (groupId: string): Promise<void> => {
    const name = groupDraftName.trim()
    if (!name) return
    await updateFavoriteGroup({ id: groupId, name, color: groupDraftColor })
    setEditingGroupId(null)
  }

  const handleMoveGroupOrder = async (index: number, delta: number): Promise<void> => {
    const group = favorites.groups[index]
    if (!group) return
    const nextOrder = Math.max(0, Math.min(favorites.groups.length - 1, index + delta))
    if (nextOrder === index) return
    await updateFavoriteGroup({ id: group.id, order: nextOrder })
  }

  const handleMoveItemOrder = async (itemId: string, groupId: string, delta: number): Promise<void> => {
    const groupItems = favorites.items.filter(i => i.groupId === groupId)
    const idx = groupItems.findIndex(i => i.id === itemId)
    if (idx < 0) return
    const nextOrder = Math.max(0, Math.min(groupItems.length - 1, idx + delta))
    if (nextOrder === idx) return
    await updateFavorite({ id: itemId, order: nextOrder })
  }

  return (
    <FolioDialog open={favoritesManagerOpen} onOpenChange={setFavoritesManagerOpen}>
      <FolioDialogContent
        data-lf-favorites-dialog=""
        className="w-[min(820px,calc(100vw-32px))] max-w-none"
      >
        <FolioDialogHeader>
          <FolioDialogTitle>管理文件夹收藏夹</FolioDialogTitle>
          <FolioDialogDescription>
            管理收藏分组与常用文件夹，支持分组归类、重命名、排序和快速跳转。
          </FolioDialogDescription>
        </FolioDialogHeader>

        <div className="grid max-h-[68vh] grid-cols-1 gap-4 overflow-hidden sm:grid-cols-[240px_1fr]">
          {/* Left column: Groups */}
          <div className="flex min-h-0 flex-col gap-2 rounded-lg border border-border bg-muted/20 p-2.5">
            <div className="text-xs font-semibold text-muted-foreground">收藏分组</div>

            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5">
              <button
                type="button"
                onClick={() => setSelectedGroupId('all')}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors hover:bg-accent',
                  selectedGroupId === 'all' && 'bg-accent font-medium text-accent-foreground',
                )}
              >
                <span>全部收藏</span>
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {favorites.items.length}
                </Badge>
              </button>

              {favorites.groups.map((group, idx) => {
                const count = favorites.items.filter(i => i.groupId === group.id).length
                const isEditing = editingGroupId === group.id
                if (isEditing) {
                  return (
                    <div
                      key={group.id}
                      className="space-y-1.5 rounded-md border border-border bg-background p-2"
                    >
                      <FolioInput
                        size="sm"
                        value={groupDraftName}
                        onChange={ev => setGroupDraftName(ev.target.value)}
                        onKeyDown={ev => {
                          if (ev.key === 'Enter') void handleSaveGroup(group.id)
                          if (ev.key === 'Escape') setEditingGroupId(null)
                        }}
                        className="w-full"
                      />
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex flex-wrap gap-1">
                          {TAG_COLOR_PALETTE.map(c => (
                            <button
                              key={c}
                              type="button"
                              aria-label={`选择颜色 ${c}`}
                              onClick={() => setGroupDraftColor(c)}
                              className={cn(
                                'size-4 rounded-full border',
                                groupDraftColor === c
                                  ? 'ring-2 ring-ring ring-offset-1'
                                  : 'border-transparent',
                              )}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        <div className="flex items-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="保存分组"
                            onClick={() => void handleSaveGroup(group.id)}
                          >
                            <Check size={12} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label="取消编辑"
                            onClick={() => setEditingGroupId(null)}
                          >
                            <X size={12} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={group.id}
                    className={cn(
                      'group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent',
                      selectedGroupId === group.id && 'bg-accent font-medium text-accent-foreground',
                    )}
                  >
                    <button
                      type="button"
                      data-lf-fav-group-select={group.id}
                      onClick={() => setSelectedGroupId(group.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: group.color }}
                      />
                      <span className="truncate">{group.name}</span>
                    </button>

                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      {count}
                    </Badge>

                    <div className="flex shrink-0 items-center opacity-70 group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label={`上移分组 ${group.name}`}
                        disabled={idx === 0}
                        onClick={() => void handleMoveGroupOrder(idx, -1)}
                        className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                      >
                        <ArrowUp size={11} />
                      </button>
                      <button
                        type="button"
                        aria-label={`下移分组 ${group.name}`}
                        disabled={idx === favorites.groups.length - 1}
                        onClick={() => void handleMoveGroupOrder(idx, 1)}
                        className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                      >
                        <ArrowDown size={11} />
                      </button>
                      <button
                        type="button"
                        aria-label={`编辑分组 ${group.name}`}
                        onClick={() => {
                          setEditingGroupId(group.id)
                          setGroupDraftName(group.name)
                          setGroupDraftColor(group.color)
                        }}
                        className="rounded p-0.5 hover:bg-muted"
                      >
                        <Pencil size={11} />
                      </button>
                      {group.id !== 'default' ? (
                        <button
                          type="button"
                          aria-label={`删除分组 ${group.name}`}
                          onClick={() => void deleteFavoriteGroup(group.id, 'move-to-default')}
                          className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 size={11} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>

            <form
              onSubmit={ev => void handleCreateGroup(ev)}
              className="space-y-2 border-t border-border pt-2"
            >
              <div className="flex gap-1.5">
                <FolioInput
                  size="sm"
                  data-lf-fav-new-group-input=""
                  placeholder="新建分组名称…"
                  value={newGroupName}
                  onChange={ev => setNewGroupName(ev.target.value)}
                  className="min-w-0 flex-1"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="secondary"
                  data-lf-fav-new-group-submit=""
                  disabled={!newGroupName.trim()}
                >
                  <Plus size={13} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TAG_COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`新分组颜色 ${c}`}
                    onClick={() => setNewGroupColor(c)}
                    className={cn(
                      'size-4 rounded-full border',
                      newGroupColor === c ? 'ring-2 ring-ring ring-offset-1' : 'border-transparent',
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </form>
          </div>

          {/* Right column: Items */}
          <div className="flex min-h-0 flex-col gap-3">
            {canFavCurrent ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground">收藏当前目录</span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">
                    {activePane.path}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FolioInput
                    size="sm"
                    placeholder="显示名称…"
                    value={addAlias}
                    onChange={ev => setAddAlias(ev.target.value)}
                    className="min-w-36 flex-1"
                  />
                  <Select value={addGroupId} onValueChange={setAddGroupId}>
                    <SelectTrigger size="sm" className="h-8 w-32 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="pointer-events-auto">
                      {favorites.groups.map(g => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    data-lf-fav-dialog-add-current=""
                    onClick={() => void addFavorite(activePane.path, addAlias, addGroupId)}
                  >
                    <Star size={13} />
                    <span>{currentAlreadyFav ? '更新收藏' : '添加到收藏夹'}</span>
                  </Button>
                </div>
              </div>
            ) : null}

            <FolioInput
              size="sm"
              placeholder="搜索已收藏的文件夹…"
              value={filterQuery}
              onChange={ev => setFilterQuery(ev.target.value)}
            />

            <div className="min-h-48 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {visibleItems.length === 0 ? (
                <div className="flex h-36 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                  暂无符合条件的收藏文件夹
                </div>
              ) : (
                visibleItems.map(item => {
                  const isEditing = editingItemId === item.id
                  return (
                    <div
                      key={item.id}
                      data-lf-fav-manage-item={item.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <FolioInput
                              size="sm"
                              value={itemDraftName}
                              onChange={ev => setItemDraftName(ev.target.value)}
                              onKeyDown={ev => {
                                if (ev.key === 'Enter') {
                                  void updateFavorite({ id: item.id, name: itemDraftName })
                                  setEditingItemId(null)
                                }
                                if (ev.key === 'Escape') setEditingItemId(null)
                              }}
                              className="h-7 flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => {
                                void updateFavorite({ id: item.id, name: itemDraftName })
                                setEditingItemId(null)
                              }}
                            >
                              <Check size={12} />
                            </Button>
                          </div>
                        ) : (
                          <div className="truncate font-medium text-foreground">{item.name}</div>
                        )}
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                          {item.path}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Select
                          value={item.groupId}
                          onValueChange={val => void updateFavorite({ id: item.id, groupId: val })}
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label={`移动 ${item.name} 所属分组`}
                            className="h-7 w-28 text-[11px]"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="pointer-events-auto">
                            {favorites.groups.map(g => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title="上移"
                          onClick={() => void handleMoveItemOrder(item.id, item.groupId, -1)}
                        >
                          <ArrowUp size={12} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title="下移"
                          onClick={() => void handleMoveItemOrder(item.id, item.groupId, 1)}
                        >
                          <ArrowDown size={12} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title="重命名"
                          onClick={() => {
                            setEditingItemId(item.id)
                            setItemDraftName(item.name)
                          }}
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title="打开该目录"
                          onClick={() => {
                            void navigateActivePane(item.path)
                            setFavoritesManagerOpen(false)
                          }}
                        >
                          <FolderOpen size={12} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          title="移除收藏"
                          onClick={() => void removeFavorite({ id: item.id })}
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
        </div>

        <FolioDialogFooter>
          <Button variant="outline" size="sm" onClick={() => setFavoritesManagerOpen(false)}>
            完成
          </Button>
        </FolioDialogFooter>
      </FolioDialogContent>
    </FolioDialog>
  )
}
