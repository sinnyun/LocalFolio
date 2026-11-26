import * as React from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FolioSwitch,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@folio/base-ui-kit/client'
import { useMaterials } from '../context.js'
import type { ExportFormat } from '../types.js'

export function ExportDialog(): React.ReactElement {
  const {
    status,
    activeProject,
    selectedPageKeys,
    exportDialogOpen,
    exportDefaultFormat,
    mutating,
    setExportDialogOpen,
    pickFolderPath,
    exportSelectedPages,
  } = useMaterials()

  const [format, setFormat] = React.useState<ExportFormat>(exportDefaultFormat)
  const [outputDir, setOutputDir] = React.useState('')
  const [ppi, setPpi] = React.useState<string>('150')
  const [mergedPdfName, setMergedPdfName] = React.useState('')
  const [revealAfter, setRevealAfter] = React.useState(true)

  React.useEffect(() => {
    if (!exportDialogOpen) return
    setFormat(exportDefaultFormat)
    setOutputDir(prev => prev || status?.settings.defaultExportDir || '')
    setMergedPdfName(activeProject ? `${activeProject.name}_物料` : '物料导出')
  }, [exportDialogOpen, exportDefaultFormat, status?.settings.defaultExportDir, activeProject])

  const isRaster = format === 'png' || format === 'jpg' || format === 'webp'

  const handleBrowse = async () => {
    const picked = await pickFolderPath(outputDir || undefined)
    if (picked) setOutputDir(picked)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!outputDir.trim()) return
    const result = await exportSelectedPages({
      format,
      outputDir: outputDir.trim(),
      ppi: Number(ppi) || 150,
      mergedPdfFileName: mergedPdfName.trim(),
      revealAfterExport: revealAfter,
    })
    if (result) {
      setExportDialogOpen(false)
    }
  }

  return (
    <Dialog open={exportDialogOpen} onOpenChange={open => setExportDialogOpen(open)}>
      <DialogContent className="sm:max-w-md" data-lf-export-dialog="">
        <DialogHeader>
          <DialogTitle>使用 VectorCraft 导出页面</DialogTitle>
          <DialogDescription>
            已选 {selectedPageKeys.size} 个页面，将直接调用本地 vectorcraft-cli 原生引擎导出。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={e => void handleSubmit(e)} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">导出格式</label>
            <Select value={format} onValueChange={v => setFormat(v as ExportFormat)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf-merged">多页 PDF（合并导出）</SelectItem>
                <SelectItem value="pdf-separate">单页 PDF（每页独立文件）</SelectItem>
                <SelectItem value="png">PNG 单张图片（每页一张）</SelectItem>
                <SelectItem value="jpg">JPG 单张图片（每页一张）</SelectItem>
                <SelectItem value="webp">WebP 单张图片（每页一张）</SelectItem>
                <SelectItem value="svg">SVG 矢量图（每页一张）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isRaster ? (
            <div className="space-y-1">
              <label className="text-xs font-medium">栅格分辨率 (PPI)</label>
              <Select value={ppi} onValueChange={setPpi}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="72">72 PPI（屏幕快速预览）</SelectItem>
                  <SelectItem value="150">150 PPI（高清审阅，推荐）</SelectItem>
                  <SelectItem value="300">300 PPI（印刷级超清）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {format === 'pdf-merged' ? (
            <div className="space-y-1">
              <label className="text-xs font-medium">PDF 文件名</label>
              <Input
                value={mergedPdfName}
                onChange={e => setMergedPdfName(e.target.value)}
                placeholder="例如：项目物料合集"
                className="h-8 text-xs"
              />
            </div>
          ) : null}

          <div className="space-y-1">
            <label className="text-xs font-medium">导出目录 *</label>
            <div className="flex items-center gap-1.5">
              <Input
                value={outputDir}
                onChange={e => setOutputDir(e.target.value)}
                placeholder="例如：D:\Exports\Materials"
                className="h-8 flex-1 text-xs"
                required
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => void handleBrowse()}
              >
                <FolderOpen size={13} className="mr-1" />
                浏览
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">导出完成后在资源管理器中显示</span>
            <FolioSwitch
              checked={revealAfter}
              onCheckedChange={v => setRevealAfter(Boolean(v))}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setExportDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              type="submit"
              data-lf-export-confirm-btn=""
              disabled={mutating || !outputDir.trim() || selectedPageKeys.size === 0}
            >
              {mutating ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : null}
              开始导出
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
