import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import {
  AlertTriangle,
  Copy,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  Skeleton,
  cn,
} from '@folio/base-ui-kit/client'
import { useCanvas } from '../context.js'
import type { BoardMeta } from '../types.js'

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (diffSec < 60) return '刚刚'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} 小时前`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay} 天前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function CanvasSidebar({ frame }: FrameViewProps): React.ReactElement {
  const {
    boards,
    boardsLoading,
    activeBoardId,
    selectBoard,
    createBoard,
    renameBoard,
    duplicateBoard,
    deleteBoard,
  } = useCanvas()

  const [query, setQuery] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draftTitle, setDraftTitle] = React.useState('')

  const collapsed = frame.layout.leftCollapsed

  const filteredBoards = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return boards
    return boards.filter(b => b.title.toLowerCase().includes(q))
  }, [boards, query])

  const beginRename = (board: BoardMeta) => {
    setEditingId(board.id)
    setDraftTitle(board.title)
  }

  const commitRename = async (board: BoardMeta) => {
    const trimmed = draftTitle.trim()
    setEditingId(null)
    if (!trimmed || trimmed === board.title) return
    await renameBoard(board.id, trimmed)
  }

  return (
    <SidebarContent data-lf-canvas-sidebar="">
      <SidebarGroup>
        <SidebarGroupLabel className="flex items-center justify-between pr-6">
          <span>画板列表</span>
        </SidebarGroupLabel>
        <SidebarGroupAction
          type="button"
          data-lf-canvas-new-board=""
          title="新建画板"
          aria-label="新建画板"
          onClick={() => void createBoard()}
        >
          <Plus size={14} />
        </SidebarGroupAction>

        {!collapsed ? (
          <div className="px-2 pb-2">
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="筛选画板..."
                aria-label="筛选画板"
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>
        ) : null}

        {boardsLoading && boards.length === 0 ? (
          <div className="space-y-1.5 px-2">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ) : (
          <SidebarMenu>
            {filteredBoards.map(board => {
              const isActive = board.id === activeBoardId
              const isEditing = editingId === board.id

              return (
                <SidebarMenuItem key={board.id} data-lf-canvas-board-item={board.id}>
                  {isEditing && !collapsed ? (
                    <div className="px-1.5 py-1">
                      <Input
                        autoFocus
                        data-lf-canvas-rename-input={board.id}
                        value={draftTitle}
                        onChange={e => setDraftTitle(e.target.value)}
                        onBlur={() => void commitRename(board)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void commitRename(board)
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            e.stopPropagation()
                            setEditingId(null)
                          }
                        }}
                        className="h-7 text-xs"
                      />
                    </div>
                  ) : (
                    <>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={board.title}
                        data-lf-canvas-board-btn={board.id}
                        onClick={() => void selectBoard(board.id)}
                        onDoubleClick={() => {
                          if (!collapsed) beginRename(board)
                        }}
                        className="h-auto py-1.5 pr-7"
                      >
                        <ImageIcon size={14} className="shrink-0 text-muted-foreground" />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                          <span className="truncate text-xs font-medium">{board.title}</span>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span>{formatRelativeTime(board.updatedAt)}</span>
                            <span>·</span>
                            <span className="tabular-nums">{board.imageCount} 图</span>
                            {board.brokenCount > 0 ? (
                              <Badge
                                variant="outline"
                                data-lf-board-broken-badge={board.id}
                                className={cn(
                                  'ml-auto h-4 gap-0.5 border-amber-500/50 bg-amber-500/10 px-1 py-0 text-[10px] text-amber-600 dark:text-amber-400',
                                )}
                              >
                                <AlertTriangle size={10} />
                                {board.brokenCount}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </SidebarMenuButton>

                      {!collapsed ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuAction
                              showOnHover
                              data-lf-canvas-board-menu={board.id}
                              aria-label={`操作 ${board.title}`}
                            >
                              <MoreHorizontal size={14} />
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem
                              data-lf-canvas-rename-action={board.id}
                              onClick={() => beginRename(board)}
                            >
                              <Pencil size={13} className="mr-2" />
                              重命名
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              data-lf-canvas-duplicate-action={board.id}
                              onClick={() => void duplicateBoard(board.id)}
                            >
                              <Copy size={13} className="mr-2" />
                              复制画板
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              data-lf-canvas-delete-action={board.id}
                              onClick={() => void deleteBoard(board.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 size={13} className="mr-2" />
                              删除画板
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </>
                  )}
                </SidebarMenuItem>
              )
            })}

            {filteredBoards.length === 0 && !collapsed ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                没有匹配的画板
              </div>
            ) : null}
          </SidebarMenu>
        )}
      </SidebarGroup>
    </SidebarContent>
  )
}
