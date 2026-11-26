import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import {
  AlertTriangle,
  Database,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  SidebarContent,
  SidebarFooter,
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
import { useMaterials } from '../context.js'
import type { MaterialProject } from '../types.js'

export function MaterialsSidebar({ frame }: FrameViewProps): React.ReactElement {
  const {
    status,
    projectsState,
    activeProject,
    activeFileFilter,
    projectFiles,
    loading,
    viewLayer,
    setViewLayer,
    setActiveFileFilter,
    setNewProjectOpen,
    setNewFileProjectId,
    setSettingsOpen,
    setDataScopeDefault,
    selectProject,
    renameProject,
    deleteProject,
    addFilesViaPicker,
    removeFileFromProject,
    openInVectorCraft,
    revealPath,
  } = useMaterials()

  const [query, setQuery] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draftName, setDraftName] = React.useState('')
  const collapsed = frame.layout.leftCollapsed

  const filteredProjects = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projectsState.projects
    return projectsState.projects.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        p.files.some(f => f.name.toLowerCase().includes(q)),
    )
  }, [projectsState.projects, query])

  const beginRename = (project: MaterialProject) => {
    setEditingId(project.id)
    setDraftName(project.name)
  }

  const commitRename = async (project: MaterialProject) => {
    const trimmed = draftName.trim()
    setEditingId(null)
    if (!trimmed || trimmed === project.name) return
    await renameProject(project.id, trimmed)
  }

  return (
    <SidebarContent data-lf-materials-sidebar="" className="flex h-full flex-col">
      <SidebarGroup className="flex-1 overflow-y-auto">
        <SidebarGroupLabel className="flex items-center justify-between pr-6">
          <span>物料项目</span>
        </SidebarGroupLabel>
        <SidebarGroupAction
          type="button"
          data-lf-materials-new-project=""
          title="新建物料项目"
          aria-label="新建物料项目"
          onClick={() => setNewProjectOpen(true)}
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
                placeholder="筛选项目或文件..."
                aria-label="筛选物料项目"
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>
        ) : null}

        {loading && projectsState.projects.length === 0 ? (
          <div className="space-y-1.5 px-2">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        ) : (
          <SidebarMenu>
            {filteredProjects.map(project => {
              const isActive = project.id === activeProject?.id
              const isEditing = editingId === project.id

              return (
                <SidebarMenuItem key={project.id} data-lf-materials-project-item={project.id}>
                  {isEditing && !collapsed ? (
                    <div className="px-1.5 py-1">
                      <Input
                        autoFocus
                        value={draftName}
                        onChange={e => setDraftName(e.target.value)}
                        onBlur={() => void commitRename(project)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            void commitRename(project)
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
                        tooltip={project.name}
                        data-lf-materials-project-btn={project.id}
                        onClick={() => void selectProject(project.id)}
                        onDoubleClick={() => {
                          if (!collapsed) beginRename(project)
                        }}
                        className="h-auto py-1.5 pr-7"
                      >
                        <Layers size={14} className="shrink-0 text-sky-500" />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                          <span className="truncate text-xs font-medium">{project.name}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {project.files.length} 个 VectorCraft 文件
                          </span>
                        </div>
                      </SidebarMenuButton>

                      {!collapsed ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuAction
                              showOnHover
                              aria-label={`操作项目 ${project.name}`}
                            >
                              <MoreHorizontal size={14} />
                            </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem
                              onClick={() => {
                                if (!isActive) void selectProject(project.id)
                                setNewFileProjectId(project.id)
                              }}
                            >
                              <FilePlus2 size={13} className="mr-2" />
                              新建 A3 横版文件
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void addFilesViaPicker(project.id)}>
                              <FolderPlus size={13} className="mr-2" />
                              导入 .vectorcraft 文件
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                if (!isActive) void selectProject(project.id)
                                setDataScopeDefault('project')
                                setViewLayer('data')
                              }}
                            >
                              <Database size={13} className="mr-2" />
                              项目物料数据
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => beginRename(project)}>
                              <Pencil size={13} className="mr-2" />
                              重命名项目
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void deleteProject(project.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 size={13} className="mr-2" />
                              删除项目
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </>
                  )}

                  {isActive && !collapsed ? (
                    <SidebarMenuSub className="mr-0 pr-0">
                      {project.files.map(file => {
                        const fileState = projectFiles.find(f => f.fileId === file.id)
                        const isFileSelected = activeFileFilter === file.id
                        return (
                          <SidebarMenuSubItem
                            key={file.id}
                            className="group/file flex items-center justify-between gap-1"
                          >
                            <SidebarMenuSubButton
                              isActive={isFileSelected}
                              onClick={() => {
                                setActiveFileFilter(isFileSelected ? 'all' : file.id)
                                if (viewLayer === 'data') setViewLayer('pages')
                              }}
                              className="h-auto flex-1 cursor-pointer py-1"
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                <span
                                  className={cn(
                                    'h-1.5 w-1.5 shrink-0 rounded-full',
                                    fileState?.activeInLiveControl
                                      ? 'bg-emerald-500'
                                      : fileState?.exists === false
                                        ? 'bg-amber-500'
                                        : 'bg-sky-500/70',
                                  )}
                                />
                                <span className="truncate text-[11px]">{file.name}</span>
                                {fileState ? (
                                  <Badge
                                    variant="secondary"
                                    className="ml-auto h-4 px-1 text-[10px] tabular-nums"
                                  >
                                    {fileState.artboardCount}页
                                  </Badge>
                                ) : null}
                                {fileState?.exists === false ? (
                                  <AlertTriangle size={11} className="shrink-0 text-amber-500" />
                                ) : null}
                              </div>
                            </SidebarMenuSubButton>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  className="h-5 w-5 shrink-0 opacity-60 hover:opacity-100"
                                  aria-label={`操作文件 ${file.name}`}
                                >
                                  <MoreHorizontal size={12} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  onClick={() => void openInVectorCraft(file.id)}
                                >
                                  <ExternalLink size={13} className="mr-2" />
                                  在 VectorCraft 中打开
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => void revealPath(file.path)}>
                                  <FolderOpen size={13} className="mr-2" />
                                  在资源管理器中显示
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => void removeFileFromProject(project.id, file.id)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 size={13} className="mr-2" />
                                  从项目移除
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </SidebarMenuSubItem>
                        )
                      })}

                      <div className="flex items-center gap-1 pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 flex-1 px-1.5 text-[11px]"
                          onClick={() => setNewFileProjectId(project.id)}
                        >
                          <FilePlus2 size={11} className="mr-1" />
                          新建A3
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 flex-1 px-1.5 text-[11px]"
                          onClick={() => void addFilesViaPicker(project.id)}
                        >
                          <FolderPlus size={11} className="mr-1" />
                          导入文件
                        </Button>
                      </div>
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              )
            })}

            {filteredProjects.length === 0 && !collapsed ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                暂无物料项目，点击右上角「+」创建
              </div>
            ) : null}
          </SidebarMenu>
        )}
      </SidebarGroup>

      {!collapsed ? (
        <SidebarFooter className="border-t p-2">
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant={viewLayer === 'data' ? 'default' : 'outline'}
              size="sm"
              data-lf-materials-open-data=""
              className="h-8 w-full justify-start text-xs"
              onClick={() => setViewLayer(viewLayer === 'data' ? 'pages' : 'data')}
            >
              <Database size={13} className="mr-2" />
              物料数据管理
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-between px-2 text-[11px] text-muted-foreground"
              onClick={() => setSettingsOpen(true)}
            >
              <span className="inline-flex items-center gap-1.5">
                <Settings size={12} />
                VectorCraft 设置
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[10px]',
                  status?.liveConnected
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : status?.cliFound
                      ? 'text-sky-600 dark:text-sky-400'
                      : 'text-amber-600',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    status?.liveConnected
                      ? 'bg-emerald-500'
                      : status?.cliFound
                        ? 'bg-sky-500'
                        : 'bg-amber-500',
                  )}
                />
                {status?.liveConnected ? '实时' : status?.cliFound ? 'CLI' : '未就绪'}
              </span>
            </Button>
          </div>
        </SidebarFooter>
      ) : null}
    </SidebarContent>
  )
}
