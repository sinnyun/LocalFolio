import * as React from 'react'
import type { ProjectsUiExtensionContext } from '@folio/base-contract'
import {
  CheckCircle2,
  Download,
  FolderOpen,
  HardDrive,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@folio/base-ui-kit/client'
import {
  clearArchiveCache,
  downloadZpaqfranz,
  formatBytes,
  pickLocalZpaqfranz,
  refreshArchiveStatus,
  revealZpaqfranzDir,
  setArchiveDialogOpen,
  updateArchiveSettings,
  useArchiveUiStore,
} from '../archive-store.js'
import type { ArchiveCompressionMethod, ArchiveSourceDisposal } from '../types.js'

const CHUNK_PRESETS_GB = [2, 4, 8, 16] as const

export interface ArchiveSettingsDialogProps {
  readonly ctx: ProjectsUiExtensionContext
}

export function ArchiveSettingsDialog({ ctx }: ArchiveSettingsDialogProps): React.ReactElement {
  const { status, dialogOpen, downloading, savingSettings } = useArchiveUiStore()

  const [mirrorPrefix, setMirrorPrefix] = React.useState('')
  const [disposal, setDisposal] = React.useState<ArchiveSourceDisposal>('recycle')
  const [cacheMbText, setCacheMbText] = React.useState('512')
  const [hideMetaDir, setHideMetaDir] = React.useState(true)
  const [chunkSizeGbText, setChunkSizeGbText] = React.useState('8')
  const [compressionMethod, setCompressionMethod] =
    React.useState<ArchiveCompressionMethod>('default')
  const [useSequentialExtract, setUseSequentialExtract] = React.useState(true)

  React.useEffect(() => {
    if (!status?.settings) return
    setMirrorPrefix(status.settings.mirrorPrefix)
    setDisposal(status.settings.defaultSourceDisposal)
    setCacheMbText(String(status.settings.extractCacheMaxMb))
    setHideMetaDir(status.settings.hideMetaDir)
    setChunkSizeGbText(String(status.settings.chunkSizeGb ?? 8))
    setCompressionMethod(status.settings.compressionMethod ?? 'default')
    setUseSequentialExtract(status.settings.useSequentialExtract ?? true)
  }, [status?.settings])

  const handleDownload = async (): Promise<void> => {
    try {
      const task = await downloadZpaqfranz(mirrorPrefix.trim(), ctx.onTaskEnqueued)
      if (task) {
        ctx.notify('已开始在后台下载安装 zpaqfranz…', true)
      }
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : '下载 zpaqfranz 失败', false)
    }
  }

  const handlePickLocal = async (): Promise<void> => {
    try {
      const res = await pickLocalZpaqfranz()
      if (!res.cancelled) {
        ctx.notify(`已导入 zpaqfranz (${res.status.version ?? 'installed'})`, true)
      }
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : '导入本地 exe 失败', false)
    }
  }

  const handleSave = async (): Promise<void> => {
    const parsedMb = Math.min(16384, Math.max(64, Number(cacheMbText) || 512))
    const parsedChunkGb = Math.min(1024, Math.max(0.25, Number(chunkSizeGbText) || 8))
    try {
      await updateArchiveSettings({
        mirrorPrefix: mirrorPrefix.trim(),
        defaultSourceDisposal: disposal,
        extractCacheMaxMb: parsedMb,
        hideMetaDir,
        chunkSizeGb: parsedChunkGb,
        compressionMethod,
        useSequentialExtract,
      })
      ctx.notify('已保存归档引擎设置', true)
      setArchiveDialogOpen(false)
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : '保存设置失败', false)
    }
  }

  const handleClearCache = async (): Promise<void> => {
    try {
      await clearArchiveCache()
      ctx.notify('已清空临时提取缓存', true)
    } catch (err) {
      ctx.notify(err instanceof Error ? err.message : '清空缓存失败', false)
    }
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setArchiveDialogOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ZPAQ 归档引擎与工具管理</DialogTitle>
          <DialogDescription>
            优先托管 zpaqfranz-full.exe（支持固定大小分卷、虚拟盘挂载与跨卷去重）。查看缩略图无需解压；打开或导出归档内文件时自动按需单文件提取。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-xs">
          {/* Engine status & one-click installer */}
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">引擎状态</span>
              {status?.installed ? (
                <Badge variant="secondary" className="gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={12} />
                  zpaqfranz {status.version ?? 'installed'}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
                  未安装
                </Badge>
              )}
            </div>

            {status?.installed && status.supportsChunkBackup === false ? (
              <div className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                当前版本低于 65.11，不支持 backup -chunk 固定大小分卷，请点击下方按钮更新到最新版。
              </div>
            ) : null}

            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">固定托管目录</span>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 truncate rounded bg-background px-2 py-1 text-[11px] text-foreground">
                  {status?.managedDir ?? '插件独立数据目录\\tools\\zpaqfranz'}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() => void revealZpaqfranzDir()}
                >
                  <FolderOpen size={12} className="mr-1" />
                  打开目录
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                disabled={downloading}
                onClick={() => void handleDownload()}
              >
                <Download size={12} className="mr-1" />
                {downloading
                  ? '下载安装中…'
                  : status?.installed
                    ? '重新下载 / 更新 zpaqfranz'
                    : '一键下载安装 zpaqfranz'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => void handlePickLocal()}
              >
                手动导入本地 exe
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => void refreshArchiveStatus()}
              >
                刷新状态
              </Button>
            </div>

            <div className="flex flex-col gap-1 pt-1">
              <label className="text-[11px] text-muted-foreground">
                GitHub 下载镜像 / 加速前缀（可选，直连受限时填写）
              </label>
              <Input
                value={mirrorPrefix}
                onChange={e => setMirrorPrefix(e.target.value)}
                placeholder="例如：https://ghproxy.net/"
                className="h-7 text-xs"
              />
            </div>
          </div>

          {/* Archive policy & extract cache */}
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-medium">固定分卷大小上限（GB）</span>
                <span className="text-[11px] text-muted-foreground">
                  新归档采用 backup -chunk 自动切分，保留全局跨卷去重与断电保护
                </span>
              </div>
              <div className="flex items-center gap-1">
                {CHUNK_PRESETS_GB.map(gb => (
                  <Button
                    key={gb}
                    type="button"
                    size="sm"
                    variant={Number(chunkSizeGbText) === gb ? 'secondary' : 'ghost'}
                    className="h-6 px-1.5 text-[11px] tabular-nums"
                    onClick={() => setChunkSizeGbText(String(gb))}
                  >
                    {gb}G
                  </Button>
                ))}
                <Input
                  type="number"
                  min={0.25}
                  max={1024}
                  step={0.5}
                  aria-label="分卷大小上限（GB）"
                  value={chunkSizeGbText}
                  onChange={e => setChunkSizeGbText(e.target.value)}
                  className="h-7 w-16 text-xs tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-medium">压缩等级（Zstd）</span>
                <span className="text-[11px] text-muted-foreground">
                  {compressionMethod === 'm7'
                    ? '-m7：冷归档高压缩（64MB 块，压缩时约占 3GB 内存，解压极快）'
                    : compressionMethod === 'm9'
                      ? '-m9：较高压缩率，比默认略慢但体积更小、解压同样极快'
                      : '默认（-m8/-m8l）：日常高频归档甜点，压缩与解压均极快'}
                </span>
              </div>
              <Select
                value={compressionMethod}
                onValueChange={v => setCompressionMethod(v as ArchiveCompressionMethod)}
              >
                <SelectTrigger className="h-7 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">默认平衡（推荐）</SelectItem>
                  <SelectItem value="m9">较高压缩（-m9）</SelectItem>
                  <SelectItem value="m7">冷归档高压缩（-m7）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-medium">归档后源文件处理方式</span>
                <span className="text-[11px] text-muted-foreground">
                  仅在 zpaqfranz 完整性校验 100% 通过后执行
                </span>
              </div>
              <Select
                value={disposal}
                onValueChange={v => setDisposal(v as ArchiveSourceDisposal)}
              >
                <SelectTrigger className="h-7 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recycle">移入回收站（推荐）</SelectItem>
                  <SelectItem value="keep">保留原文件仅备份</SelectItem>
                  <SelectItem value="delete">彻底删除源文件</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-2 select-none">
              <div className="flex flex-col">
                <span className="font-medium">整包还原使用顺序写入（xx）</span>
                <span className="text-[11px] text-muted-foreground">
                  显著提升机械硬盘（HDD）解包速度并减少磁盘碎片
                </span>
              </div>
              <input
                type="checkbox"
                checked={useSequentialExtract}
                onChange={e => setUseSequentialExtract(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-2 select-none">
              <div className="flex flex-col">
                <span className="font-medium">隐藏 .folio-meta 缓存目录</span>
                <span className="text-[11px] text-muted-foreground">
                  保持资源管理器整洁（Everything 仍可索引可读缩略图名称）
                </span>
              </div>
              <input
                type="checkbox"
                checked={hideMetaDir}
                onChange={e => setHideMetaDir(e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
            </label>

            <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
              <div className="flex flex-col">
                <span className="flex items-center gap-1 font-medium">
                  <HardDrive size={12} /> 临时提取缓存上限（MB）
                </span>
                <span className="text-[11px] text-muted-foreground">
                  当前占用：{formatBytes(status?.cacheStats.totalBytes ?? 0)}（
                  {status?.cacheStats.fileCount ?? 0} 个文件）
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={64}
                  max={16384}
                  value={cacheMbText}
                  onChange={e => setCacheMbText(e.target.value)}
                  className="h-7 w-20 text-xs tabular-nums"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => void handleClearCache()}
                >
                  <Trash2 size={12} className="mr-1" />
                  清空缓存
                </Button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setArchiveDialogOpen(false)}>
            关闭
          </Button>
          <Button type="button" disabled={savingSettings} onClick={() => void handleSave()}>
            {savingSettings ? '保存中…' : '保存设置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
