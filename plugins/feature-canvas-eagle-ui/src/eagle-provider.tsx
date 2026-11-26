import * as React from 'react'
import type {
  CanvasLinkResolveResult,
  CanvasLinkSourceProvider,
  CanvasLinkedItemInfo,
} from '@folio/base-contract'
import { RpcError, rpcCall } from '@folio/base-contract/rpc'
import { Badge, Button, cn, toast } from '@folio/base-ui-kit/client'
import {
  Activity,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileImage,
  Folder,
  Globe,
  Image as ImageIcon,
  Link2,
  MapPin,
  Trash2,
  XCircle,
} from 'lucide-react'
import {
  extractEagleSourceFromMeta,
  type EagleImageSource,
  type EagleOpenItemResult,
  type EaglePathResolveEntry,
} from './types.js'

const EAGLE_INFO_SEGMENT_RE = /(?:^|[\\/])([A-Za-z0-9]+)\.info[\\/][^\\/]+$/i
const EAGLE_DEEP_LINK_GLOBAL_RE =
  /eagle:\/\/item\/([A-Za-z0-9]+)(?:\/(?:[?#][^\s"'<>]*)?|[?#][^\s"'<>]*)?/gi

export interface EagleDebugEntry {
  readonly id: string
  readonly time: string
  readonly action: string
  readonly status: 'pending' | 'ok' | 'error'
  readonly summary: string
  readonly durationMs?: number
  readonly details?: unknown
}

export interface EagleDebugState {
  readonly panelOpen: boolean
  readonly entries: readonly EagleDebugEntry[]
  readonly lastOpenByAsset: Readonly<
    Record<string, { readonly status: 'pending' | 'ok' | 'error'; readonly message: string }>
  >
}

const MAX_DEBUG_ENTRIES = 30
let debugSeq = 0

let debugState: EagleDebugState = {
  panelOpen: false,
  entries: [],
  lastOpenByAsset: {},
}

const debugListeners = new Set<() => void>()

function emitDebugChange(): void {
  for (const listener of debugListeners) {
    listener()
  }
}

function subscribeDebugState(listener: () => void): () => void {
  debugListeners.add(listener)
  return () => {
    debugListeners.delete(listener)
  }
}

function getDebugSnapshot(): EagleDebugState {
  return debugState
}

function formatTimeNow(): string {
  const d = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function pushDebugEntry(entry: Omit<EagleDebugEntry, 'id' | 'time'>): string {
  debugSeq += 1
  const id = `eagle-dbg-${debugSeq}`
  const created: EagleDebugEntry = {
    id,
    time: formatTimeNow(),
    ...entry,
  }
  debugState = {
    ...debugState,
    entries: [created, ...debugState.entries].slice(0, MAX_DEBUG_ENTRIES),
  }
  emitDebugChange()
  return id
}

function updateDebugEntry(
  id: string,
  patch: Partial<Omit<EagleDebugEntry, 'id' | 'time'>>,
): void {
  debugState = {
    ...debugState,
    entries: debugState.entries.map(item => (item.id === id ? { ...item, ...patch } : item)),
  }
  emitDebugChange()
}

function setDebugPanelOpen(open: boolean): void {
  if (debugState.panelOpen === open) return
  debugState = { ...debugState, panelOpen: open }
  emitDebugChange()
}

function setAssetOpenFeedback(
  assetId: string,
  feedback: { readonly status: 'pending' | 'ok' | 'error'; readonly message: string },
): void {
  debugState = {
    ...debugState,
    lastOpenByAsset: {
      ...debugState.lastOpenByAsset,
      [assetId]: feedback,
    },
  }
  emitDebugChange()
}

function clearDebugEntries(): void {
  debugState = {
    ...debugState,
    entries: [],
    lastOpenByAsset: {},
  }
  emitDebugChange()
}

export function resetEagleDebugStore(): void {
  debugSeq = 0
  debugState = {
    panelOpen: false,
    entries: [],
    lastOpenByAsset: {},
  }
  emitDebugChange()
}

function useEagleDebugState(): EagleDebugState {
  return React.useSyncExternalStore(subscribeDebugState, getDebugSnapshot, getDebugSnapshot)
}

function formatErrorDetails(err: unknown): Record<string, unknown> {
  if (err instanceof RpcError) {
    return {
      name: err.name,
      code: err.code,
      status: err.status,
      message: err.message,
      details: err.details,
    }
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message }
  }
  return { message: String(err) }
}

export function isPotentialEagleInfoPath(rawPath: string): boolean {
  const trimmed = rawPath.trim().replace(/^["']|["']$/g, '')
  if (!trimmed) return false
  let decoded = trimmed
  if (trimmed.toLowerCase().startsWith('file://')) {
    try {
      decoded = decodeURIComponent(trimmed)
    } catch {
      decoded = trimmed
    }
  }
  return EAGLE_INFO_SEGMENT_RE.test(decoded)
}

export function extractEagleDeepLinkIds(text: string): string[] {
  if (!text) return []
  const ids: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(EAGLE_DEEP_LINK_GLOBAL_RE)) {
    const id = match[1]?.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function pathTail(filePath: string): string {
  const parts = filePath.split(/[\\/]+/).filter(Boolean)
  if (parts.length <= 2) return filePath
  return `…/${parts.slice(-2).join('/')}`
}

function copyTextWithToast(label: string, text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        toast({ title: `已复制${label}`, tone: 'success' })
      })
      .catch(() => {
        toast({ title: `复制${label}失败`, tone: 'danger' })
      })
    return
  }
  toast({ title: `当前环境不支持自动复制${label}`, tone: 'info' })
}

interface MetadataRowProps {
  readonly icon: React.ReactNode
  readonly label: string
  readonly value: string
  readonly copyValue?: string
}

function MetadataRow({ icon, label, value, copyValue }: MetadataRowProps): React.ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[10px] leading-4">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span title={copyValue ?? value} className="min-w-0 flex-1 truncate font-mono text-foreground">
        {value}
      </span>
      {copyValue ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          title={`复制${label}：${copyValue}`}
          aria-label={`复制${label}`}
          onClick={() => copyTextWithToast(label, copyValue)}
          className="size-4 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Copy size={10} />
        </Button>
      ) : null}
    </div>
  )
}

function EagleLinkedItemDetails({
  item,
}: {
  readonly item: CanvasLinkedItemInfo
}): React.ReactElement | null {
  const source = extractEagleSourceFromMeta(item.rawMeta)
  const [expanded, setExpanded] = React.useState(false)

  if (!source) return null

  const folderText =
    source.folders.length > 0 ? source.folders.map(f => f.name).join(' / ') : '未分类'
  const entryDisplay = source.name ? `${source.name} · ${source.itemId}` : source.itemId

  return (
    <div
      data-lf-eagle-source={item.assetId}
      className="mt-0.5 rounded-md border border-sky-500/30 bg-sky-500/5 px-2 py-1"
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Badge
            variant="outline"
            className="shrink-0 border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[9px] font-semibold text-sky-700 dark:text-sky-300"
          >
            Eagle
          </Badge>
          <span title={entryDisplay} className="truncate text-[10px] font-medium text-foreground">
            {source.name || source.itemId}
          </span>
          <span title={folderText} className="truncate text-[10px] text-muted-foreground">
            · {folderText}
          </span>
        </div>

        <button
          type="button"
          data-lf-eagle-toggle={item.assetId}
          aria-expanded={expanded}
          onClick={() => setExpanded(prev => !prev)}
          className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          <span>{expanded ? '收起' : '详情'}</span>
        </button>
      </div>

      {expanded ? (
        <div
          data-lf-eagle-details={item.assetId}
          className={cn('mt-1.5 space-y-1 border-t border-sky-500/20 pt-1.5')}
        >
          <MetadataRow
            icon={<ImageIcon size={11} />}
            label="Eagle 条目"
            value={entryDisplay}
            copyValue={entryDisplay}
          />
          <MetadataRow
            icon={<Folder size={11} />}
            label="所属文件夹"
            value={folderText}
            copyValue={folderText}
          />
          <MetadataRow
            icon={<MapPin size={11} />}
            label="本地文件路径"
            value={pathTail(source.originalPath)}
            copyValue={source.originalPath}
          />
          <MetadataRow
            icon={<Link2 size={11} />}
            label="画布资源 URI"
            value={source.originalUri ? pathTail(source.originalUri) : '—'}
            copyValue={source.originalUri || undefined}
          />
          <MetadataRow
            icon={<FileImage size={11} />}
            label="缩略图路径"
            value={source.thumbnailPath ? pathTail(source.thumbnailPath) : '—'}
            copyValue={source.thumbnailPath || undefined}
          />
          <MetadataRow
            icon={<Globe size={11} />}
            label="Eagle API"
            value={`条目 ${source.itemId}`}
            copyValue={source.apiUrl || undefined}
          />
        </div>
      ) : null}
    </div>
  )
}

function EagleOpenItemButton({
  item,
}: {
  readonly item: CanvasLinkedItemInfo
}): React.ReactElement | null {
  const source = extractEagleSourceFromMeta(item.rawMeta)
  const debug = useEagleDebugState()
  const [opening, setOpening] = React.useState(false)

  if (!source) return null

  const feedback = debug.lastOpenByAsset[item.assetId]

  const handleOpen = async () => {
    if (opening) return
    const deepLink = `eagle://item/${source.itemId}`
    setOpening(true)
    setAssetOpenFeedback(item.assetId, { status: 'pending', message: '打开中...' })

    const entryId = pushDebugEntry({
      action: 'canvas.eagle.openItem',
      status: 'pending',
      summary: `请求打开 ${source.itemId}`,
      details: {
        assetId: item.assetId,
        itemId: source.itemId,
        deepLink,
      },
    })

    try {
      const res = await rpcCall<EagleOpenItemResult>('canvas.eagle.openItem', {
        itemId: source.itemId,
      })
      updateDebugEntry(entryId, {
        status: 'ok',
        durationMs: res.durationMs,
        summary: `已派发 ${res.deepLink} (${res.durationMs}ms${res.strippedElectronRunAsNode ? ', 已清理 ELECTRON_RUN_AS_NODE' : ''})`,
        details: res,
      })
      setAssetOpenFeedback(item.assetId, {
        status: 'ok',
        message: '已派发',
      })
      toast({
        title: '已在 Eagle 中定位条目',
        description: res.deepLink,
        tone: 'success',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      updateDebugEntry(entryId, {
        status: 'error',
        summary: `打开失败: ${msg}`,
        details: formatErrorDetails(err),
      })
      setAssetOpenFeedback(item.assetId, { status: 'error', message: msg })
      setDebugPanelOpen(true)
      toast({
        title: '无法在 Eagle 中打开条目',
        description: msg,
        tone: 'danger',
      })
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={opening}
        title="在 Eagle 中打开并定位此图片"
        data-lf-eagle-open-btn={item.assetId}
        onClick={() => void handleOpen()}
        className="h-6 border-sky-500/40 bg-sky-500/10 px-2 text-[11px] text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
      >
        <ExternalLink size={11} className="mr-1" />
        {opening ? '正在打开...' : '在 Eagle 中打开'}
      </Button>
      {feedback ? (
        <button
          type="button"
          data-lf-eagle-open-status={item.assetId}
          title="点击查看 Eagle 调试信息"
          onClick={() => setDebugPanelOpen(true)}
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] underline-offset-2 hover:underline',
            feedback.status === 'error'
              ? 'text-destructive'
              : feedback.status === 'ok'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-muted-foreground',
          )}
        >
          {feedback.status === 'error' ? '失败·查看' : feedback.status === 'ok' ? '已派发' : '派发中'}
        </button>
      ) : null}
    </div>
  )
}

function EagleDebugPanel({
  items,
}: {
  readonly items: readonly CanvasLinkedItemInfo[]
}): React.ReactElement {
  const debug = useEagleDebugState()
  const eagleItems = items
    .map(item => ({ item, source: extractEagleSourceFromMeta(item.rawMeta) }))
    .filter((entry): entry is { item: CanvasLinkedItemInfo; source: EagleImageSource } =>
      Boolean(entry.source),
    )

  const latest = debug.entries[0]

  return (
    <div data-lf-eagle-debug-root="" className="border-t border-border bg-muted/20">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5">
        <button
          type="button"
          data-lf-eagle-debug-toggle=""
          aria-expanded={debug.panelOpen}
          onClick={() => setDebugPanelOpen(!debug.panelOpen)}
          className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-foreground hover:text-primary"
        >
          {debug.panelOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Bug size={12} className="shrink-0 text-sky-600 dark:text-sky-400" />
          <span>Eagle 调试</span>
          <Badge variant="secondary" className="px-1.5 py-0 text-[9px] tabular-nums">
            {debug.entries.length}
          </Badge>
        </button>

        <div className="flex min-w-0 items-center gap-1.5">
          {latest ? (
            <span
              title={latest.summary}
              className={cn(
                'max-w-[165px] truncate text-[10px]',
                latest.status === 'error'
                  ? 'text-destructive'
                  : latest.status === 'ok'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground',
              )}
            >
              {latest.summary}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {eagleItems.length > 0 ? `${eagleItems.length} 个 Eagle 链接` : '无调用记录'}
            </span>
          )}
        </div>
      </div>

      {debug.panelOpen ? (
        <div
          data-lf-eagle-debug-panel=""
          className="space-y-2 border-t border-border/70 bg-background/80 px-3 py-2 text-[10px]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-muted-foreground">最近调用日志</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                data-lf-eagle-copy-logs=""
                onClick={() =>
                  copyTextWithToast(
                    'Eagle 调试日志',
                    JSON.stringify(debug.entries, null, 2),
                  )
                }
                className="h-5 px-1.5 text-[10px]"
              >
                <Copy size={10} className="mr-1" />
                复制
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                data-lf-eagle-clear-logs=""
                onClick={() => clearDebugEntries()}
                className="h-5 px-1.5 text-[10px]"
              >
                <Trash2 size={10} className="mr-1" />
                清空
              </Button>
            </div>
          </div>

          <div
            data-lf-eagle-debug-logs=""
            className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5"
          >
            {debug.entries.length === 0 ? (
              <div className="rounded border border-dashed border-border py-3 text-center text-muted-foreground">
                点击「在 Eagle 中打开」后，调用细节会实时显示在这里。
              </div>
            ) : (
              debug.entries.map(entry => (
                <div
                  key={entry.id}
                  data-lf-eagle-log-entry={entry.action}
                  data-log-status={entry.status}
                  className={cn(
                    'rounded border p-1.5',
                    entry.status === 'error'
                      ? 'border-destructive/50 bg-destructive/5'
                      : entry.status === 'ok'
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-border bg-muted/20',
                  )}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex min-w-0 items-center gap-1">
                      {entry.status === 'error' ? (
                        <XCircle size={11} className="shrink-0 text-destructive" />
                      ) : entry.status === 'ok' ? (
                        <CheckCircle2
                          size={11}
                          className="shrink-0 text-emerald-600 dark:text-emerald-400"
                        />
                      ) : (
                        <Activity size={11} className="shrink-0 text-sky-500" />
                      )}
                      <span className="truncate font-mono font-semibold">{entry.action}</span>
                    </div>
                    <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                      {entry.time}
                      {entry.durationMs !== undefined ? ` · ${entry.durationMs}ms` : ''}
                    </span>
                  </div>
                  <div className="mt-0.5 break-all text-foreground">{entry.summary}</div>
                  {entry.details !== undefined ? (
                    <pre className="mt-1 max-h-24 overflow-auto break-all whitespace-pre-wrap rounded bg-muted/50 p-1 font-mono text-[9px] text-muted-foreground">
                      {JSON.stringify(entry.details, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function createEagleLinkSourceProvider(): CanvasLinkSourceProvider {
  return {
    id: 'canvas.eagle-links',
    order: 10,
    ownedMetaKeys: ['eagle'],

    async resolveLocalPaths(
      localPaths: readonly string[],
    ): Promise<readonly (CanvasLinkResolveResult | null)[]> {
      const candidateIndices: number[] = []
      const candidatePaths: string[] = []
      localPaths.forEach((rawPath, index) => {
        if (isPotentialEagleInfoPath(rawPath)) {
          candidateIndices.push(index)
          candidatePaths.push(rawPath)
        }
      })

      if (candidatePaths.length === 0) {
        return localPaths.map(() => null)
      }

      const entryId = pushDebugEntry({
        action: 'canvas.eagle.resolveFromPaths',
        status: 'pending',
        summary: `解析 ${candidatePaths.length} 个 .info 候选路径`,
        details: { paths: candidatePaths },
      })

      const output: Array<CanvasLinkResolveResult | null> = localPaths.map(() => null)
      try {
        const res = await rpcCall<{ readonly items: readonly EaglePathResolveEntry[] }>(
          'canvas.eagle.resolveFromPaths',
          { paths: candidatePaths },
        )

        let firstError: string | null = null
        let hitCount = 0
        res.items.forEach((entry, idx) => {
          const targetIdx = candidateIndices[idx]
          if (targetIdx === undefined) return
          if (entry.source) {
            hitCount += 1
            output[targetIdx] = {
              localPath: entry.source.originalPath,
              meta: { eagle: entry.source },
            }
          } else if (entry.error && !firstError) {
            firstError = entry.error
          }
        })

        updateDebugEntry(entryId, {
          status: firstError ? 'error' : 'ok',
          summary: `识别 ${hitCount} / ${candidatePaths.length} 个 Eagle 原图${firstError ? ` (${firstError})` : ''}`,
          details: res.items,
        })

        if (firstError) {
          toast({
            title: '未能读取 Eagle 来源信息，已按普通本地图片链接',
            description: firstError,
            tone: 'info',
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        updateDebugEntry(entryId, {
          status: 'error',
          summary: `调用失败: ${msg}`,
          details: formatErrorDetails(err),
        })
        toast({
          title: '未能连接 Eagle 来源解析服务，已按普通本地图片链接',
          description: msg,
          tone: 'info',
        })
      }
      return output
    },

    canHandleExternalText(text: string): boolean {
      return extractEagleDeepLinkIds(text).length > 0
    },

    async resolveExternalText(text: string): Promise<readonly CanvasLinkResolveResult[] | null> {
      const ids = extractEagleDeepLinkIds(text)
      if (ids.length === 0) return null

      const entryId = pushDebugEntry({
        action: 'canvas.eagle.resolveById',
        status: 'pending',
        summary: `解析 ${ids.length} 个 Eagle 深链接`,
        details: { ids },
      })

      const resolved: CanvasLinkResolveResult[] = []
      let firstError: string | null = null

      for (const itemId of ids) {
        try {
          const res = await rpcCall<{ readonly source: EagleImageSource }>(
            'canvas.eagle.resolveById',
            { itemId },
          )
          if (res.source?.originalPath) {
            resolved.push({
              localPath: res.source.originalPath,
              meta: { eagle: res.source },
            })
          }
        } catch (err) {
          if (!firstError) {
            firstError = err instanceof Error ? err.message : String(err)
          }
        }
      }

      if (resolved.length === 0) {
        updateDebugEntry(entryId, {
          status: 'error',
          summary: `深链接解析失败: ${firstError ?? 'Eagle API 未响应'}`,
          details: { ids, error: firstError },
        })
        toast({
          title: '无法从 Eagle 解析图片链接',
          description: firstError ?? '请确认 Eagle 正在运行且已开启本地 API。',
          tone: 'danger',
        })
        return []
      }

      updateDebugEntry(entryId, {
        status: firstError ? 'error' : 'ok',
        summary: `已转换 ${resolved.length} / ${ids.length} 个 Eagle 链接`,
        details: { ids, resolvedCount: resolved.length, firstError },
      })

      if (firstError) {
        toast({
          title: `已转换 ${resolved.length} / ${ids.length} 个 Eagle 链接`,
          description: firstError,
          tone: 'info',
        })
      }

      return resolved
    },

    renderLinkedItemDetails(item: CanvasLinkedItemInfo): React.ReactNode {
      return <EagleLinkedItemDetails item={item} />
    },

    renderLinkedItemActions(item: CanvasLinkedItemInfo): React.ReactNode {
      return <EagleOpenItemButton item={item} />
    },

    renderPanelExtra(items: readonly CanvasLinkedItemInfo[]): React.ReactNode {
      return <EagleDebugPanel items={items} />
    },
  }
}
