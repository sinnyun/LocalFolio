import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import {
  ChevronRight,
  Crosshair,
  Download,
  FileText,
  Film,
  Folder,
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
  Usb,
} from 'lucide-react'
import {
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

  const activePath = panes[activePaneId].path
  const isCurrent = activePath.toLowerCase() === path.toLowerCase()
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
    panes,
    activePaneId,
    navigateActivePane,
    pinFolder,
    unpinFolder,
    locateInTree,
  } = useFiles()

  const activePane = panes[activePaneId]
  const activePathLower = activePane.path.toLowerCase()

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
      {/* 1. 快捷文件夹 */}
      <SidebarGroup>
        <SidebarGroupLabel>快捷文件夹</SidebarGroupLabel>
        {activePane.path ? (
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

      {/* 2. 驱动器 */}
      <SidebarGroup>
        <SidebarGroupLabel>驱动器</SidebarGroupLabel>
        <SidebarMenu>
          {(roots?.drives ?? []).map(drive => {
            const active = activePathLower === drive.path.toLowerCase()
            const usedRatio =
              drive.totalBytes > 0 ? Math.min(100, Math.round((drive.usedBytes / drive.totalBytes) * 100)) : 0
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

      {/* 3. 文件树 */}
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>文件树</SidebarGroupLabel>
        {activePane.path ? (
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
