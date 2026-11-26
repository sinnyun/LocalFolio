import * as React from 'react'
import { ArrowLeft, Database, Download, ExternalLink, RefreshCw } from 'lucide-react'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@folio/base-ui-kit/client'
import { useMaterials } from '../context.js'
import { MaterialInfoPanel } from './MaterialInfoPanel.js'
import { PagePreviewStage } from './PagePreviewStage.js'
import { SlidePageRail } from './SlidePageRail.js'

export function PageEditorView(): React.ReactElement {
  const {
    activeProject,
    projectFiles,
    editorFile,
    editorPage,
    mutating,
    setViewLayer,
    enterPageEditor,
    openInVectorCraft,
    syncNow,
    setExportDialogOpen,
    selectedPageKeys,
    exportSelectedPages,
    pickFolderPath,
    status,
  } = useMaterials()

  const activeFile = editorFile ?? projectFiles[0] ?? null
  const activePage = editorPage ?? activeFile?.pages[0] ?? null

  // ArrowUp / ArrowDown navigation across slides when not typing in an input
  React.useEffect(() => {
    if (!activeFile || !activePage) return undefined
    const onKeyDown = (ev: KeyboardEvent) => {
      const target = ev.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      if (ev.key === 'ArrowUp' && activePage.artboardIndex > 0) {
        ev.preventDefault()
        enterPageEditor(activeFile.fileId, activePage.artboardIndex - 1)
      } else if (
        ev.key === 'ArrowDown' &&
        activePage.artboardIndex < activeFile.pages.length - 1
      ) {
        ev.preventDefault()
        enterPageEditor(activeFile.fileId, activePage.artboardIndex + 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeFile, activePage, enterPageEditor])

  if (!activeFile || !activePage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
        <p>当前文件暂无可编辑画板</p>
        <Button type="button" variant="outline" onClick={() => setViewLayer('pages')}>
          <ArrowLeft size={14} className="mr-1.5" />
          返回页面管理
        </Button>
      </div>
    )
  }

  const handleQuickExportCurrent = async () => {
    const dir =
      status?.settings.defaultExportDir ||
      (await pickFolderPath())
    if (!dir) {
      setExportDialogOpen(true, 'png')
      return
    }
    await exportSelectedPages({
      format: 'png',
      outputDir: dir,
      ppi: 150,
      overrideItems: [{ fileId: activeFile.fileId, artboardIndex: activePage.artboardIndex }],
    })
  }

  return (
    <div data-lf-page-editor-view="" className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 顶部工具条 */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b bg-background px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-lf-editor-back-btn=""
            className="h-7 px-2.5 text-xs"
            onClick={() => setViewLayer('pages')}
          >
            <ArrowLeft size={13} className="mr-1" />
            返回页面管理
          </Button>

          {projectFiles.length > 1 ? (
            <Select
              value={activeFile.fileId}
              onValueChange={fid => enterPageEditor(fid, 0)}
            >
              <SelectTrigger size="sm" className="h-7 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projectFiles.map(f => (
                  <SelectItem key={f.fileId} value={f.fileId}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="truncate text-xs font-medium text-foreground">
              {activeProject?.name} / {activeFile.name}
            </span>
          )}

          <Badge
            variant={activeFile.activeInLiveControl ? 'default' : 'secondary'}
            className="h-5 px-1.5 text-[10px]"
          >
            {activeFile.activeInLiveControl
              ? activeFile.dirtyInLiveControl
                ? '前台 VectorCraft 编辑中（未保存）'
                : '前台 VectorCraft 实时联动'
              : '后台 CLI 模式'}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={mutating}
            className="h-7 px-2.5 text-xs"
            onClick={() => void syncNow(activeFile.fileId)}
          >
            <RefreshCw size={12} className={mutating ? 'mr-1 animate-spin' : 'mr-1'} />
            双向同步
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => void openInVectorCraft(activeFile.fileId, activePage.artboardIndex)}
          >
            <ExternalLink size={12} className="mr-1" />
            在 VectorCraft 打开此页
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => {
              if (selectedPageKeys.size > 0) setExportDialogOpen(true, 'png')
              else void handleQuickExportCurrent()
            }}
          >
            <Download size={12} className="mr-1" />
            导出图片
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setViewLayer('data')}
          >
            <Database size={12} className="mr-1" />
            物料数据
          </Button>
        </div>
      </header>

      {/* 幻灯片三栏主区 */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SlidePageRail
          file={activeFile}
          activeIndex={activePage.artboardIndex}
          onSelectIndex={idx => enterPageEditor(activeFile.fileId, idx)}
        />

        <PagePreviewStage
          page={activePage}
          totalPages={activeFile.pages.length}
          onSelectIndex={idx => enterPageEditor(activeFile.fileId, idx)}
        />

        <MaterialInfoPanel
          page={activePage}
          isLiveActive={activeFile.activeInLiveControl}
        />
      </div>
    </div>
  )
}
