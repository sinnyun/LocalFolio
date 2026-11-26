import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import {
  ChevronRight,
  Crosshair,
  Download,
  FileText,
  Film,
  Folder,
  FolderHeart,
  FolderOpen,
  HardDrive,
  Home,
  Image,
  Loader2,
  Monitor,
  Music,
  Pin,
  PinOff,
  Plus,
  SlidersHorizontal,
  Star,
  Tag,
  Trash2,
  Usb,
} from 'lucide-react'
import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  Skeleton,
  cn,
} from '@folio/base-ui-kit/client'
import { useFiles } from '../context.js'
import { formatBytes } from '../format.js'
import type { DriveInfo, QuickFolder } from '../types.js'

function quickFolderIcon(kind: QuickFolder['kind']): React.ReactElement {
  const props = { size: 15, strokeWidth: 1.75 }
  switch (kind) {
    case 'home':
      return <Home {...props} />
    case 'desktop':
      return <Monitor {...props} />
    case 'documents':
      return <FileText {...props} />
    case 'downloads':
      return <Download {...props} />
    case 'pictures':
      return <Image {...props} />
    case 'videos':
      return <Film {...props} />
    case 'music':
      return <Music {...props} />
    case 'pinned':
      return <Pin {...props} className="text-sky-500" />
  }
}

function driveIcon(kind: DriveInfo['kind']): React.ReactElement {
  const props = { size: 15, strokeWidth: 1.75 }
  if (kind === 'removable') return <Usb {...props} />
  return <HardDrive {...props} />
}

interface TreeBranchProps {
  readonly path: string
  readonly name: string
  readonly hasSubdirs: boolean
  readonly depth: number
}

function TreeBranch({ path, name, hasSubdirs, depth }: TreeBranchProps): React.ReactElement {
  const {
    panes,
    activePaneId,
    treeChildren,
    treeExpanded,
    treeLoading,
    toggleTreeNode,
    navigateActivePane,
  } = useFiles()

  const activePane = panes[activePaneId]
  const isCurrent =
    activePane.mode === 'directory' && activePane.path.toLowerCase() === path.toLowerCase()
  const isExpanded = treeExpanded.has(path)
  const isLoading = treeLoading.has(path)
  const children = treeChildren[path] ?? []
  const canExpand = hasSubdirs || children.length > 0

  return (
    <div data-lf-tree-node={path}>
      <div
        className={cn(
          'group/tree flex h-7 items-center gap-1 rounded-md pr-2 text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          isCurrent && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <button
          type="button"
          data-lf-tree-toggle={path}
          aria-label={isExpanded ? `折叠 ${name}` : `展开 ${name}`}
          aria-expanded={isExpanded}
          disabled={!canExpand}
          onClick={ev => {
            ev.stopPropagation()
            if (canExpand) void toggleTreeNode(path)
          }}
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted',
            !canExpand && 'pointer-events-none opacity-0',
          )}
        >
          {isLoading ? (
            <Loader2 size={12} className="animate-spin text-muted-foreground" />
          ) : (
            <ChevronRight
              size={12}
              className={cn(
                'text-muted-foreground transition-transform duration-150',
                isExpanded && 'rotate-90',
              )}
            />
          )}
        </button>

        <button
          type="button"
          data-lf-tree-select={path}
          onClick={() => void navigateActivePane(path)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {isExpanded ? (
            <FolderOpen size={14} className="shrink-0 text-sky-500" />
          ) : (
            <Folder size={14} className="shrink-0 text-sky-500" />
          )}
          <span className="truncate">{name}</span>
        </button>
      </div>

      {isExpanded ? (
        <div data-lf-tree-children={path}>
          {isLoading && children.length === 0 ? (
            <div
              className="py-1 text-[11px] text-muted-foreground"
              style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
            >
              加载中…
            </div>
          ) : children.length === 0 ? (
            <div
              className="py-1 text-[11px] text-muted-foreground"
              style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
            >
              无子文件夹
            </div>
          ) : (
            children.map(child => (
              <TreeBranch
                key={child.path}
                path={child.path}
                name={child.name}
                hasSubdirs={child.hasSubdirs}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export function FilesSidebar(_props: FrameViewProps): React.ReactElement {
  const {
    roots,
    rootsLoading,
    favorites,
    metadata,
    panes,
    activePaneId,
    navigateActivePane,
    openTagViewActivePane,
    pinFolder,
    unpinFolder,
    locateInTree,
    addFavorite,
    removeFavorite,
    isFavoritePath,
    setFavoritesManagerOpen,
    setTagManagerOpen,
  } = useFiles()

  const activePane = panes[activePaneId]
  const activePathLower = activePane.mode === 'directory' ? activePane.path.toLowerCase() : ''
  const canFavCurrent = activePane.mode === 'directory' && Boolean(activePane.path)
  const currentIsFav = canFavCurrent && isFavoritePath(activePane.path)

  const treeRoots = React.useMemo(() => {
    if (!roots) return []
    if (roots.drives.length > 0 && roots.platform === 'win32') {
      return roots.drives.map(d => ({ id: d.id, name: d.name, path: d.path }))
    }
    const items: Array<{ id: string; name: string; path: string }> = []
    if (roots.homePath) items.push({ id: 'home', name: '主目录', path: roots.homePath })
    for (const d of roots.drives) {
      if (d.path !== roots.homePath) items.push({ id: d.id, name: d.name, path: d.path })
    }
    return items
  }, [roots])

  return (
    <SidebarContent data-lf-files-sidebar="">
      {/* 1. 收藏夹 */}
      <SidebarGroup data-lf-files-favorites="">
        <SidebarGroupLabel>收藏夹</SidebarGroupLabel>
        <div className="absolute top-3.5 right-3 flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
          {canFavCurrent ? (
            <button
              type="button"
              data-lf-fav-add-current=""
              aria-label={currentIsFav ? '取消收藏当前目录' : '将当前目录添加到收藏夹'}
              title={currentIsFav ? '取消收藏当前目录' : '将当前目录添加到收藏夹'}
              onClick={() =>
                void (currentIsFav
                  ? removeFavorite({ path: activePane.path })
                  : addFavorite(activePane.path))
              }
              className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Star
                size={13}
                className={cn(currentIsFav && 'fill-amber-400 text-amber-500')}
              />
            </button>
          ) : null}
          <button
            type="button"
            data-lf-fav-manage=""
            aria-label="管理收藏夹"
            title="管理收藏夹"
            onClick={() => setFavoritesManagerOpen(true)}
            className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <SlidersHorizontal size={13} />
          </button>
        </div>

        <SidebarMenu>
          {favorites.items.length === 0 ? (
            <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
              {canFavCurrent ? (
                <button
                  type="button"
                  data-lf-fav-empty-add=""
                  onClick={() => void addFavorite(activePane.path)}
                  className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Plus size={12} />
                  <span>收藏当前文件夹</span>
                </button>
              ) : (
                <div className="text-[11px] text-muted-foreground">暂无收藏文件夹</div>
              )}
            </div>
          ) : (
            favorites.groups.map(group => {
              const items = favorites.items.filter(i => i.groupId === group.id)
              if (items.length === 0 && favorites.groups.length > 1) return null
              return (
                <Collapsible key={group.id} asChild defaultOpen className="group/fav">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={group.name}>
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: group.color }}
                        />
                        <span className="truncate font-medium">{group.name}</span>
                        <Badge
                          variant="secondary"
                          className="ml-auto px-1.5 py-0 text-[10px] group-data-[collapsible=icon]:hidden"
                        >
                          {items.length}
                        </Badge>
                        <ChevronRight
                          size={12}
                          className="shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]/fav:rotate-90 group-data-[collapsible=icon]:hidden"
                        />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {items.map(fav => {
                          const isCurrent = activePathLower === fav.path.toLowerCase()
                          return (
                            <SidebarMenuSubItem key={fav.id} className="group/fav-item relative">
                              <SidebarMenuSubButton
                                asChild
                                isActive={isCurrent}
                                data-lf-favorite-item={fav.path}
                              >
                                <button
                                  type="button"
                                  title={fav.path}
                                  onClick={() => void navigateActivePane(fav.path)}
                                  className="w-full pr-6 text-left"
                                >
                                  <FolderHeart size={13} className="shrink-0 text-amber-500" />
                                  <span className="truncate">{fav.name}</span>
                                </button>
                              </SidebarMenuSubButton>
                              <button
                                type="button"
                                aria-label={`移除收藏 ${fav.name}`}
                                onClick={ev => {
                                  ev.stopPropagation()
                                  void removeFavorite({ id: fav.id })
                                }}
                                className="absolute top-1.5 right-1 hidden size-4 items-center justify-center rounded text-muted-foreground hover:text-destructive group-hover/fav-item:flex"
                              >
                                <Trash2 size={11} />
                              </button>
                            </SidebarMenuSubItem>
                          )
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )
            })
          )}
        </SidebarMenu>
      </SidebarGroup>

      {/* 2. 标签 */}
      <SidebarGroup data-lf-files-tags="">
        <SidebarGroupLabel>标签</SidebarGroupLabel>
        <SidebarGroupAction
          data-lf-tags-manage=""
          title="打开标签管理器"
          aria-label="打开标签管理器"
          onClick={() => setTagManagerOpen(true)}
        >
          <SlidersHorizontal size={13} />
        </SidebarGroupAction>
        <SidebarMenu>
          {metadata.tags.length === 0 ? (
            <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
              <button
                type="button"
                data-lf-tags-empty-manage=""
                onClick={() => setTagManagerOpen(true)}
                className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                <Tag size={12} />
                <span>管理 / 新建标签</span>
              </button>
            </div>
          ) : (
            metadata.tags.map(tag => {
              const count = metadata.tagCounts[tag.id] ?? 0
              const isActive = activePane.mode === 'tag' && activePane.activeTagId === tag.id
              return (
                <SidebarMenuItem key={tag.id}>
                  <SidebarMenuButton
                    isActive={isActive}
                    tooltip={`${tag.name} (${count})`}
                    data-lf-sidebar-tag={tag.id}
                    onClick={() => void openTagViewActivePane(tag.id)}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="truncate">{tag.name}</span>
                    <Badge
                      variant="secondary"
                      className="ml-auto px-1.5 py-0 text-[10px] tabular-nums group-data-[collapsible=icon]:hidden"
                    >
                      {count}
                    </Badge>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })
          )}
        </SidebarMenu>
      </SidebarGroup>

      {/* 3. 快捷文件夹 */}
      <SidebarGroup>
        <SidebarGroupLabel>快捷文件夹</SidebarGroupLabel>
        {canFavCurrent ? (
          <SidebarGroupAction
            title="将当前目录固定到快捷文件夹"
            aria-label="将当前目录固定到快捷文件夹"
            onClick={() => void pinFolder(activePane.path)}
          >
            <Plus size={14} />
          </SidebarGroupAction>
        ) : null}
        <SidebarMenu>
          {rootsLoading && !roots ? (
            <div className="space-y-1.5 px-2 py-1">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-4/5" />
            </div>
          ) : (
            (roots?.quickFolders ?? []).map(folder => {
              const active = activePathLower === folder.path.toLowerCase()
              return (
                <SidebarMenuItem key={folder.id}>
                  <SidebarMenuButton
                    isActive={active}
                    tooltip={folder.name}
                    data-lf-quick-folder={folder.path}
                    onClick={() => void navigateActivePane(folder.path)}
                  >
                    {quickFolderIcon(folder.kind)}
                    <span className="truncate">{folder.name}</span>
                  </SidebarMenuButton>
                  {folder.pinned ? (
                    <SidebarMenuAction
                      showOnHover
                      aria-label={`取消固定 ${folder.name}`}
                      title="取消固定"
                      onClick={ev => {
                        ev.stopPropagation()
                        void unpinFolder(folder.path)
                      }}
                    >
                      <PinOff size={13} />
                    </SidebarMenuAction>
                  ) : null}
                </SidebarMenuItem>
              )
            })
          )}
        </SidebarMenu>
      </SidebarGroup>

      {/* 4. 驱动器 */}
      <SidebarGroup>
        <SidebarGroupLabel>驱动器</SidebarGroupLabel>
        <SidebarMenu>
          {(roots?.drives ?? []).map(drive => {
            const active = activePathLower === drive.path.toLowerCase()
            const usedRatio =
              drive.totalBytes > 0
                ? Math.min(100, Math.round((drive.usedBytes / drive.totalBytes) * 100))
                : 0
            const isTight = usedRatio >= 90
            const capacityText =
              drive.totalBytes > 0
                ? `可用 ${formatBytes(drive.freeBytes)} / 共 ${formatBytes(drive.totalBytes)}`
                : '容量未知'

            return (
              <SidebarMenuItem key={drive.id}>
                <SidebarMenuButton
                  isActive={active}
                  tooltip={`${drive.name} · ${capacityText}`}
                  data-lf-drive={drive.id}
                  onClick={() => void navigateActivePane(drive.path)}
                  className="h-auto py-1.5"
                >
                  {driveIcon(drive.kind)}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-xs font-medium">{drive.name}</span>
                      {drive.totalBytes > 0 ? (
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {usedRatio}%
                        </span>
                      ) : null}
                    </div>
                    {drive.totalBytes > 0 ? (
                      <>
                        <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              isTight ? 'bg-destructive' : 'bg-primary',
                            )}
                            style={{ width: `${usedRatio}%` }}
                          />
                        </div>
                        <span className="truncate text-[10px] tabular-nums text-muted-foreground">
                          {capacityText}
                        </span>
                      </>
                    ) : null}
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroup>

      {/* 5. 文件树 */}
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>文件树</SidebarGroupLabel>
        {canFavCurrent ? (
          <SidebarGroupAction
            title="在文件树中定位当前目录"
            aria-label="在文件树中定位当前目录"
            data-lf-tree-locate=""
            onClick={() => void locateInTree(activePane.path)}
          >
            <Crosshair size={14} />
          </SidebarGroupAction>
        ) : null}
        <div data-lf-files-tree="" className="flex flex-col gap-0.5 px-1">
          {treeRoots.map(node => (
            <TreeBranch
              key={node.id}
              path={node.path}
              name={node.name}
              hasSubdirs={true}
              depth={0}
            />
          ))}
        </div>
      </SidebarGroup>
    </SidebarContent>
  )
}
