import * as React from 'react'
import type { FrameViewProps } from '@folio/base-contract'
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  FolderOpen,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from 'lucide-react'
import {
  Badge,
  Button,
  Input,
  Separator,
} from '@folio/base-ui-kit/client'
import { useProjects } from '../context.js'
import {
  buildProjectThumbUrl,
  categoryLabel,
  formatBytes,
  formatDateTime,
} from '../format.js'
import type { FileCategory } from '../types.js'
import { AiTraceDialog } from './AiTraceDialog.js'
import { LazyThumbImage } from './LazyThumbImage.js'

export function ProjectsInspector(_props: FrameViewProps): React.ReactElement {
  const {
    aiStatus,
    aiApplyCover,
    extractingProjectId,
    selectedProject,
    projectManifest,
    selectedFile,
    syncingProjectId,
    checkingProjectId,
    extensions,
    extensionContext,
    setAiApplyCover,
    extractSelectedWithAi,
    checkSelectedChanges,
    syncSelectedProject,
    updateProjectMeta,
    openFile,
    revealPath,
  } = useProjects()

  const [projectType, setProjectType] = React.useState('')
  const [summary, setSummary] = React.useState('')
  const [tags, setTags] = React.useState<string[]>([])
  const [newTag, setNewTag] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [traceOpen, setTraceOpen] = React.useState(false)

  React.useEffect(() => {
    if (!projectManifest) {
      setProjectType('')
      setSummary('')
      setTags([])
      return
    }
    setProjectType(projectManifest.projectType)
    setSummary(projectManifest.summary)
    setTags([...projectManifest.tags])
  }, [projectManifest])

  if (!selectedProject || !projectManifest) {
    return (
      <div
        data-lf-projects-inspector=""
        className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground"
      >
        选择项目后在此查看详情与元数据
      </div>
    )
  }

  const isChecking = checkingProjectId === selectedProject.id
  const isSyncing = syncingProjectId === selectedProject.id

  const handleAddTag = (): void => {
    const clean = newTag.trim()
    if (!clean) return
    if (!tags.includes(clean)) {
      setTags(prev => [...prev, clean])
    }
    setNewTag('')
  }

  const handleSaveMeta = async (): Promise<void> => {
    setSaving(true)
    await updateProjectMeta({
      projectType: projectType.trim(),
      summary: summary.trim(),
      tags,
    })
    setSaving(false)
  }

  const categoryEntries = Object.entries(projectManifest.stats.categories).sort(
    (a, b) => b[1] - a[1],
  )

  return (
    <div
      data-lf-projects-inspector=""
      className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-3 text-xs"
    >
      {/* Project overview */}
      <section className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{projectManifest.name}</h3>
            <p className="text-[11px] text-muted-foreground">
              最近扫描：{formatDateTime(projectManifest.lastScannedAt)}
            </p>
          </div>
          {!selectedProject.metaWritable ? (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              只读目录缓存
            </Badge>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-muted/30 p-2 text-center">
          <div>
            <div className="text-[11px] text-muted-foreground">总体积</div>
            <div className="font-semibold tabular-nums">
              {formatBytes(projectManifest.stats.totalBytes)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">文件数</div>
            <div className="font-semibold tabular-nums">{projectManifest.stats.fileCount}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">子目录</div>
            <div className="font-semibold tabular-nums">{projectManifest.stats.folderCount}</div>
          </div>
        </div>

        {categoryEntries.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {categoryEntries.map(([cat, count]) => (
              <Badge key={cat} variant="secondary" className="text-[10px]">
                {categoryLabel(cat as FileCategory)} {count}
              </Badge>
            ))}
          </div>
        ) : null}
      </section>

      <Separator />

      {/* Change detection & sync */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-medium">文件变更状态</span>
          {selectedProject.hasChanges ? (
            <Badge className="bg-amber-500/20 text-amber-500 hover:bg-amber-500/20">待更新</Badge>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500">
              <CheckCircle2 size={12} /> 已同步
            </span>
          )}
        </div>

        {selectedProject.hasChanges ? (
          <p className="text-[11px] text-muted-foreground">
            新增 {selectedProject.changeSummary.added} · 修改 {selectedProject.changeSummary.modified}{' '}
            · 删除 {selectedProject.changeSummary.removed}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 flex-1 text-xs"
            disabled={isChecking || isSyncing}
            onClick={() => void checkSelectedChanges()}
          >
            <RefreshCw size={12} className={isChecking ? 'mr-1 animate-spin' : 'mr-1'} />
            检测变更
          </Button>
          <Button
            size="sm"
            variant={selectedProject.hasChanges ? 'default' : 'secondary'}
            className="h-7 flex-1 text-xs"
            disabled={isSyncing}
            onClick={() => void syncSelectedProject()}
          >
            {isSyncing ? '更新中…' : '增量更新'}
          </Button>
        </div>
      </section>

      <Separator />

      {/* Editable project metadata */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="font-medium">项目元数据（.folio-meta）</span>
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            disabled={saving}
            onClick={() => void handleSaveMeta()}
          >
            <Save size={12} className="mr-1" />
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">项目类型</label>
          <Input
            value={projectType}
            onChange={e => setProjectType(e.target.value)}
            placeholder="例如：品牌设计 / 宣传片 / 建筑渲染"
            className="h-7 text-xs"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-muted-foreground">项目摘要</label>
          <textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            rows={3}
            placeholder="填写项目简介、交付物说明…"
            className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-muted-foreground">标签</label>
          <div className="flex flex-wrap gap-1">
            {tags.map(tag => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1 text-[11px]">
                #{tag}
                <button
                  type="button"
                  onClick={() => setTags(prev => prev.filter(t => t !== tag))}
                  className="rounded hover:text-destructive"
                  aria-label={`移除标签 ${tag}`}
                >
                  <X size={11} />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Input
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddTag()
                }
              }}
              placeholder="输入新标签…"
              className="h-7 text-xs"
            />
            <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={handleAddTag}>
              <Plus size={13} />
            </Button>
          </div>
        </div>

        {/* AI Smart Extraction */}
        <div
          data-lf-projects-ai-panel=""
          className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2.5 text-[11px]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Sparkles size={13} className="text-sky-500" />
              AI 智能整理
            </div>
            {aiStatus?.available && aiStatus.defaultRoute ? (
              <Badge variant="secondary" className="max-w-[140px] truncate text-[10px]">
                {aiStatus.defaultRoute.model}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                未连接模型
              </Badge>
            )}
          </div>

          <p className="leading-relaxed text-muted-foreground">
            {aiStatus?.available
              ? '自动采样目录树、说明文档前 2000 字与文件分布，生成项目类型、标签、摘要与推荐封面。'
              : aiStatus?.reason ?? '请先在 DSH 设置中配置可用模型。'}
          </p>

          {projectManifest.aiExtractedAt ? (
            <div className="text-[10px] text-muted-foreground">
              最近 AI 提取：{formatDateTime(projectManifest.aiExtractedAt)}
            </div>
          ) : null}

          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={aiApplyCover}
              onChange={e => setAiApplyCover(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-input accent-primary"
            />
            <span>采用 AI 推荐封面</span>
          </label>

          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-xs"
              disabled={!aiStatus?.available || extractingProjectId === selectedProject.id}
              onClick={() => void extractSelectedWithAi(aiApplyCover)}
            >
              <Sparkles
                size={12}
                className={
                  extractingProjectId === selectedProject.id
                    ? 'mr-1.5 animate-pulse text-sky-500'
                    : 'mr-1.5 text-sky-500'
                }
              />
              {extractingProjectId === selectedProject.id ? '正在 AI 提取…' : 'AI 提取当前项目'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={projectManifest.aiLastTrace?.status === 'error' ? 'destructive' : 'ghost'}
              className="h-7 px-2 text-xs"
              title="查看发给 AI 的采样信息与 AI 返回结果"
              onClick={() => setTraceOpen(true)}
            >
              <Eye size={12} className="mr-1" />
              查看输入/返回
            </Button>
          </div>
        </div>

        <AiTraceDialog open={traceOpen} onOpenChange={setTraceOpen} />
      </section>

      {extensions.map(ext => {
        const panel = ext.renderInspectorSection?.(extensionContext)
        if (!panel) return null
        return (
          <React.Fragment key={ext.id}>
            <Separator />
            {panel}
          </React.Fragment>
        )
      })}

      {/* Selected file details */}
      {selectedFile ? (
        <>
          <Separator />
          <section data-lf-projects-selected-file="" className="flex flex-col gap-2">
            <span className="font-medium">选中文件</span>
            <div className="flex items-center gap-2.5 rounded-md border border-border p-2">
              <LazyThumbImage
                src={
                  selectedFile.thumbSupported
                    ? buildProjectThumbUrl(
                        selectedProject.id,
                        selectedFile.relPath,
                        selectedFile.thumbKey,
                      )
                    : null
                }
                alt={selectedFile.name}
                category={selectedFile.category}
                ext={selectedFile.ext}
                compact
                className="h-12 w-12 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{selectedFile.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {selectedFile.relPath}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {formatBytes(selectedFile.size)} · {formatDateTime(selectedFile.mtimeMs)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => void openFile(selectedFile)}
              >
                <ExternalLink size={12} className="mr-1" />
                打开原文件
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => void revealPath(selectedFile.relPath)}
              >
                <FolderOpen size={12} className="mr-1" />
                资源管理器定位
              </Button>
              {selectedFile.thumbSupported ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs"
                  onClick={() => void updateProjectMeta({ coverRelPath: selectedFile.relPath })}
                >
                  <ImageIcon size={12} className="mr-1" />
                  设为项目封面
                </Button>
              ) : null}
              {extensions.map(ext => (
                <React.Fragment key={ext.id}>
                  {ext.renderFileActions?.(extensionContext, selectedFile)}
                </React.Fragment>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
