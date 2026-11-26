import * as React from 'react'
import {
  CheckSquare,
  Copy,
  Database,
  ExternalLink,
  FileImage,
  FilePlus2,
  FileText,
  FolderPlus,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  cn,
} from '@folio/base-ui-kit/client'
import { useMaterials } from '../context.js'
import {
  buildPreviewUrl,
  formatSpecSummary,
  makePageKey,
  type MaterialPageSummary,
  type MaterialTemplateItem,
} from '../types.js'

export function PagesOverviewView(): React.ReactElement {
  const {
    activeProject,
    activeFileFilter,
    projectFiles,
    visiblePages,
    catalog,
    selectedPageKeys,
    mutating,
    previewRev,
    setActiveFileFilter,
    setViewLayer,
    setNewProjectOpen,
    setNewFileProjectId,
    setExportDialogOpen,
    addFilesViaPicker,
    togglePageSelection,
    selectAllVisiblePages,
    clearPageSelection,
    enterPageEditor,
    addPage,
    duplicatePage,
    deletePage,
    normalizeFileToA3,
    openInVectorCraft,
    syncNow,
  } = useMaterials()

  if (!activeProject) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Empty className="max-w-md border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileText size={20} />
            </EmptyMedia>
            <EmptyTitle>还没有物料项目</EmptyTitle>
            <EmptyDescription>
              创建一个物料项目，并新建或关联一个或多个 A3 横版 VectorCraft 文件开始整理物料。
            </EmptyDescription>
          </EmptyHeader>
          <Button type="button" onClick={() => setNewProjectOpen(true)}>
            <Plus size={14} className="mr-1.5" />
            新建物料项目
          </Button>
        </Empty>
      </div>
    )
  }

  const targetFileForCreate =
    (activeFileFilter !== 'all'
      ? projectFiles.find(f => f.fileId === activeFileFilter)
      : projectFiles[0]) ?? null

  const allSelected =
    visiblePages.length > 0 &&
    visiblePages.every(p => selectedPageKeys.has(makePageKey(p.fileId, p.artboardIndex)))

  const handleCreatePageFromTemplate = async (tpl: MaterialTemplateItem) => {
    if (!targetFileForCreate) return
    await addPage(targetFileForCreate.fileId, {
      title: tpl.title || tpl.name,
      showProjectName: tpl.showProjectName,
      material: tpl.material,
      craft: tpl.craft,
      size: tpl.size,
      quantity: tpl.quantity,
      note: tpl.note,
    })
  }

  return (
    <div data-lf-pages-overview="" className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 顶层操作栏 */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold">{activeProject.name}</h2>
          <Badge variant="secondary" className="text-[11px] tabular-nums">
            {projectFiles.length} 文件 · {visiblePages.length} 页
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {targetFileForCreate ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={mutating}
                className="h-7 text-xs"
                onClick={() => void addPage(targetFileForCreate.fileId)}
              >
                <Plus size={13} className="mr-1" />
                新建 A3 页面
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs">
                    <Sparkles size={13} className="mr-1 text-sky-500" />
                    按模板加页
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-72 w-60 overflow-y-auto">
                  {catalog.projectTemplates.length > 0 ? (
                    <>
                      <DropdownMenuLabel className="text-[10px] text-primary">
                        当前项目模板
                      </DropdownMenuLabel>
                      {catalog.projectTemplates.map(tpl => (
                        <DropdownMenuItem
                          key={tpl.id}
                          onClick={() => void handleCreatePageFromTemplate(tpl)}
                        >
                          {tpl.name}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                    默认物料模板
                  </DropdownMenuLabel>
                  {catalog.defaultTemplates.map(tpl => (
                    <DropdownMenuItem
                      key={tpl.id}
                      onClick={() => void handleCreatePageFromTemplate(tpl)}
                    >
                      {tpl.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void openInVectorCraft(targetFileForCreate.fileId)}
              >
                <ExternalLink size={13} className="mr-1" />
                在 VectorCraft 打开
              </Button>
            </>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void syncNow()}
          >
            <RefreshCw size={12} className={mutating ? 'mr-1 animate-spin' : 'mr-1'} />
            同步刷新
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setViewLayer('data')}
          >
            <Database size={13} className="mr-1" />
            物料数据管理
          </Button>
        </div>
      </header>

      {/* 文件切换 + 多选导出条 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant={activeFileFilter === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setActiveFileFilter('all')}
          >
            全部文件
          </Button>
          {projectFiles.map(file => (
            <Button
              key={file.fileId}
              type="button"
              variant={activeFileFilter === file.fileId ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setActiveFileFilter(file.fileId)}
            >
              <span className="max-w-36 truncate">{file.name}</span>
              <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
                ({file.pages.length})
              </span>
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-lf-pages-select-all=""
            disabled={visiblePages.length === 0}
            className="h-7 px-2 text-xs"
            onClick={() => (allSelected ? clearPageSelection() : selectAllVisiblePages())}
          >
            {allSelected ? (
              <CheckSquare size={13} className="mr-1 text-primary" />
            ) : (
              <Square size={13} className="mr-1" />
            )}
            {allSelected ? '取消全选' : '全选'}
          </Button>

          {selectedPageKeys.size > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              已选 {selectedPageKeys.size} 页
            </span>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            data-lf-export-images-btn=""
            disabled={selectedPageKeys.size === 0}
            className="h-7 text-xs"
            onClick={() => setExportDialogOpen(true, 'png')}
          >
            <FileImage size={13} className="mr-1" />
            导出单张图片
          </Button>

          <Button
            type="button"
            variant="default"
            size="sm"
            data-lf-export-pdf-btn=""
            disabled={selectedPageKeys.size === 0}
            className="h-7 text-xs"
            onClick={() => setExportDialogOpen(true, 'pdf-merged')}
          >
            <FileText size={13} className="mr-1" />
            导出多页 PDF
          </Button>
        </div>
      </div>

      {/* 页面缩略图网格 */}
      <div className="flex-1 overflow-y-auto p-4">
        {projectFiles.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <Empty className="max-w-md border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FilePlus2 size={20} />
                </EmptyMedia>
                <EmptyTitle>当前项目暂无 VectorCraft 文件</EmptyTitle>
                <EmptyDescription>
                  新建一个固定 A3 横版（420×297mm）的 .vectorcraft 文件，或导入现有文件。
                </EmptyDescription>
              </EmptyHeader>
              <div className="flex items-center gap-2">
                <Button type="button" onClick={() => setNewFileProjectId(activeProject.id)}>
                  <FilePlus2 size={14} className="mr-1.5" />
                  新建 A3 文件
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void addFilesViaPicker(activeProject.id)}
                >
                  <FolderPlus size={14} className="mr-1.5" />
                  导入 .vectorcraft
                </Button>
              </div>
            </Empty>
          </div>
        ) : visiblePages.length === 0 ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            未解析到画板页面，请检查所选 .vectorcraft 文件是否有效
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visiblePages.map((page: MaterialPageSummary) => {
              const pageKey = makePageKey(page.fileId, page.artboardIndex)
              const selected = selectedPageKeys.has(pageKey)
              const specLine = formatSpecSummary(page.fields)

              return (
                <div
                  key={pageKey}
                  data-lf-page-card={pageKey}
                  onDoubleClick={() => enterPageEditor(page.fileId, page.artboardIndex)}
                  className={cn(
                    'group flex flex-col overflow-hidden rounded-lg border bg-card transition-all hover:shadow-md',
                    selected ? 'border-primary ring-2 ring-primary/25' : 'border-border',
                  )}
                >
                  <div className="relative aspect-[420/297] w-full bg-white">
                    <img
                      src={buildPreviewUrl(page.filePath, page.artboardIndex, 72, previewRev)}
                      alt={`${page.pageNumber} ${page.fields.title}`}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />

                    {/* 多选复选框 */}
                    <button
                      type="button"
                      data-lf-page-checkbox={pageKey}
                      aria-label={`选择第 ${page.pageNumber} 页`}
                      onClick={e => {
                        e.stopPropagation()
                        togglePageSelection(page)
                      }}
                      className={cn(
                        'absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded border bg-background/90 shadow-sm transition',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:border-primary',
                      )}
                    >
                      {selected ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>

                    <div className="absolute right-2 top-2 flex items-center gap-1">
                      <Badge variant="secondary" className="bg-background/90 font-mono text-[10px]">
                        {page.pageNumber}
                      </Badge>
                      {!page.isA3Landscape ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-5 bg-amber-50 px-1.5 text-[10px] text-amber-700 hover:bg-amber-100"
                          onClick={e => {
                            e.stopPropagation()
                            void normalizeFileToA3(page.fileId, page.artboardIndex)
                          }}
                        >
                          非A3·点击统一
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col justify-between gap-2 p-2.5">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold">
                          {page.pageNumber} - {page.fields.title || page.artboardName}
                        </span>
                        {activeFileFilter === 'all' && projectFiles.length > 1 ? (
                          <Badge variant="outline" className="h-4 max-w-24 shrink-0 truncate px-1 text-[10px]">
                            {page.fileName}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="line-clamp-1 text-[11px] text-muted-foreground">
                        {specLine || '暂未填写材质 / 工艺 / 尺寸 / 数量 / 备注'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-1 pt-1">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        data-lf-page-edit-btn={pageKey}
                        className="h-7 flex-1 text-xs"
                        onClick={() => enterPageEditor(page.fileId, page.artboardIndex)}
                      >
                        <Pencil size={12} className="mr-1" />
                        编辑页面
                      </Button>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7"
                        title="复制页面"
                        onClick={() => void duplicatePage(page.fileId, page.artboardIndex)}
                      >
                        <Copy size={12} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="删除页面"
                        onClick={() => void deletePage(page.fileId, page.artboardIndex)}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
