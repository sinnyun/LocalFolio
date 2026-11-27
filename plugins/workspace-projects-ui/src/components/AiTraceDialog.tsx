import * as React from 'react'
import { copyTextToClipboard } from '@folio/base-metadata-ui/client'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Copy, RefreshCw } from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@folio/base-ui-kit/client'
import { useProjects } from '../context.js'
import { formatDateTime } from '../format.js'
import type { ProjectAiSamplePreview } from '../types.js'

export interface AiTraceDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export function AiTraceDialog({ open, onOpenChange }: AiTraceDialogProps): React.ReactElement {
  const { projectManifest, previewSelectedAiSample } = useProjects()
  const trace = projectManifest?.aiLastTrace ?? null

  const [tab, setTab] = React.useState<'input' | 'output'>('input')
  const [inputMode, setInputMode] = React.useState<'trace' | 'live'>(trace ? 'trace' : 'live')
  const [livePreview, setLivePreview] = React.useState<ProjectAiSamplePreview | null>(null)
  const [loadingLive, setLoadingLive] = React.useState(false)
  const [showSystemPrompt, setShowSystemPrompt] = React.useState(false)
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null)

  const loadLivePreview = React.useCallback(async () => {
    setLoadingLive(true)
    const res = await previewSelectedAiSample()
    setLivePreview(res)
    setLoadingLive(false)
  }, [previewSelectedAiSample])

  React.useEffect(() => {
    if (!open) return
    setInputMode(trace ? 'trace' : 'live')
    setTab('input')
    if (!trace) {
      void loadLivePreview()
    }
  }, [open, trace, loadLivePreview])

  const handleSwitchInputMode = (mode: 'trace' | 'live'): void => {
    setInputMode(mode)
    if (mode === 'live' && !livePreview && !loadingLive) {
      void loadLivePreview()
    }
  }

  const handleCopy = async (key: string, text: string): Promise<void> => {
    const ok = await copyTextToClipboard(text)
    if (!ok) return
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(curr => (curr === key ? null : curr)), 1500)
  }

  const activeSystemPrompt =
    inputMode === 'trace' && trace ? trace.systemPrompt : livePreview?.systemPrompt ?? ''
  const activeUserPrompt =
    inputMode === 'trace' && trace ? trace.userPrompt : livePreview?.userPrompt ?? ''
  const activeSampledFiles =
    inputMode === 'trace' && trace
      ? trace.sampledFiles
      : livePreview?.sample.textSnippets.map(s => s.relPath) ?? []
  const activeCoverCandidates =
    inputMode === 'trace' && trace
      ? trace.coverCandidates
      : livePreview?.sample.coverCandidates ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[84vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>AI 输入采样与返回详情</DialogTitle>
          <DialogDescription>
            查看提交给 DSH 模型的目录采样/提示词上下文，以及模型返回的原始响应与结构化解析结果。
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={v => setTab(v as 'input' | 'output')}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <TabsList className="grid w-full shrink-0 grid-cols-2">
            <TabsTrigger value="input">发给 AI 的信息</TabsTrigger>
            <TabsTrigger value="output">
              AI 返回的信息
              {trace ? (
                <Badge
                  variant={trace.status === 'success' ? 'secondary' : 'destructive'}
                  className="ml-1.5 px-1.5 py-0 text-[10px]"
                >
                  {trace.status === 'success' ? '成功' : '失败'}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Input sent / to be sent to AI */}
          <TabsContent
            value="input"
            className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {trace ? (
                  <Button
                    type="button"
                    size="sm"
                    variant={inputMode === 'trace' ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => handleSwitchInputMode('trace')}
                  >
                    上次提取实际发送
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant={inputMode === 'live' ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  onClick={() => handleSwitchInputMode('live')}
                >
                  实时采样预览
                </Button>
              </div>

              {inputMode === 'live' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  disabled={loadingLive}
                  onClick={() => void loadLivePreview()}
                >
                  <RefreshCw size={12} className={loadingLive ? 'mr-1 animate-spin' : 'mr-1'} />
                  重新采样
                </Button>
              ) : trace ? (
                <span className="text-[11px] text-muted-foreground">
                  发送时间：{formatDateTime(trace.extractedAt)} · {trace.provider} / {trace.model}
                </span>
              ) : null}
            </div>

            {inputMode === 'live' && loadingLive ? (
              <div className="rounded-md border border-border p-4 text-center text-muted-foreground">
                正在读取目录采样…
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/20 p-2.5 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground">
                      读取正文的文件（最多 2 份 / 2000 字）
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {activeSampledFiles.length > 0 ? (
                        activeSampledFiles.map(f => (
                          <Badge key={f} variant="secondary" className="text-[10px]">
                            {f}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-[11px] text-muted-foreground">未命中关键文本文件</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground">
                      提供的封面候选（{activeCoverCandidates.length}）
                    </div>
                    <div className="mt-1 max-h-16 overflow-y-auto text-[11px] text-muted-foreground">
                      {activeCoverCandidates.length > 0
                        ? activeCoverCandidates.join('、')
                        : '无可用封面候选'}
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-muted/30 px-2.5 py-1.5">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[11px] font-medium"
                      onClick={() => setShowSystemPrompt(v => !v)}
                    >
                      {showSystemPrompt ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      系统指令（System Prompt）
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => void handleCopy('sys', activeSystemPrompt)}
                    >
                      <Copy size={11} className="mr-1" />
                      {copiedKey === 'sys' ? '已复制' : '复制'}
                    </Button>
                  </div>
                  {showSystemPrompt ? (
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-[11px] leading-relaxed">
                      {activeSystemPrompt || '（空）'}
                    </pre>
                  ) : null}
                </div>

                <div className="flex min-h-0 flex-1 flex-col rounded-md border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-muted/30 px-2.5 py-1.5">
                    <span className="text-[11px] font-medium">
                      发送给 AI 的项目内容（User Prompt · {activeUserPrompt.length} 字符）
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => void handleCopy('user', activeUserPrompt)}
                    >
                      <Copy size={11} className="mr-1" />
                      {copiedKey === 'user' ? '已复制' : '复制'}
                    </Button>
                  </div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-[11px] leading-relaxed">
                    {activeUserPrompt || '（暂无内容）'}
                  </pre>
                </div>
              </>
            )}
          </TabsContent>

          {/* Tab 2: AI Output */}
          <TabsContent
            value="output"
            className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 text-xs"
          >
            {!trace ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-muted-foreground">
                该项目尚未执行过 AI 提取。可先在左侧查看「实时采样预览」，再点击面板上的「AI 提取当前项目」。
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="flex items-center gap-2">
                    {trace.status === 'success' ? (
                      <CheckCircle2 size={14} className="text-emerald-500" />
                    ) : (
                      <AlertCircle size={14} className="text-destructive" />
                    )}
                    <span className="font-medium">
                      {trace.status === 'success' ? '提取成功' : '提取失败'}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {trace.provider} / {trace.model}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {formatDateTime(trace.extractedAt)}
                  </span>
                </div>

                {trace.error ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-[11px] text-destructive">
                    错误原因：{trace.error}
                  </div>
                ) : null}

                {trace.parsedOutput ? (
                  <div className="flex flex-col gap-1.5 rounded-md border border-border p-2.5">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      结构化解析结果
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 text-[11px] sm:grid-cols-2">
                      <div>
                        <span className="text-muted-foreground">项目类型：</span>
                        <span className="font-medium">{trace.parsedOutput.projectType}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">推荐封面：</span>
                        <span className="font-mono">
                          {trace.parsedOutput.recommendedCoverRelPath ?? '无'}
                        </span>
                      </div>
                    </div>
                    <div className="text-[11px]">
                      <span className="text-muted-foreground">标签：</span>
                      <span className="inline-flex flex-wrap gap-1">
                        {trace.parsedOutput.tags.map(t => (
                          <Badge key={t} variant="secondary" className="text-[10px]">
                            #{t}
                          </Badge>
                        ))}
                      </span>
                    </div>
                    <div className="text-[11px]">
                      <span className="text-muted-foreground">一句话简介：</span>
                      <span>{trace.parsedOutput.summary}</span>
                    </div>
                  </div>
                ) : null}

                <div className="flex min-h-0 flex-1 flex-col rounded-md border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-muted/30 px-2.5 py-1.5">
                    <span className="text-[11px] font-medium">
                      模型原始返回文本（Raw Response）
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => void handleCopy('raw', trace.rawResponse)}
                    >
                      <Copy size={11} className="mr-1" />
                      {copiedKey === 'raw' ? '已复制' : '复制'}
                    </Button>
                  </div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-[11px] leading-relaxed">
                    {trace.rawResponse || '（模型未返回文本内容）'}
                  </pre>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
