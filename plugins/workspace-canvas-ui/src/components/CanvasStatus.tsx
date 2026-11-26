import * as React from 'react'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'
import { useCanvas } from '../context.js'

export function CanvasStatus(): React.ReactElement {
  const {
    activeBoard,
    saveStatus,
    linkedImages,
    brokenCount,
    setRelinkFilter,
    setRelinkPanelOpen,
  } = useCanvas()

  return (
    <div
      data-lf-canvas-status=""
      className="flex min-w-0 items-center gap-2.5 text-[11px] text-muted-foreground"
    >
      <span className="max-w-[180px] truncate font-medium text-foreground">
        {activeBoard?.title ?? '画板'}
      </span>

      <span className="inline-flex items-center gap-1">
        {saveStatus === 'saving' ? (
          <>
            <Loader2 size={11} className="animate-spin" />
            <span>正在保存...</span>
          </>
        ) : saveStatus === 'dirty' ? (
          <span>未保存</span>
        ) : saveStatus === 'error' ? (
          <span className="text-destructive">保存失败</span>
        ) : (
          <>
            <Check size={11} className="text-emerald-600 dark:text-emerald-400" />
            <span>已保存</span>
          </>
        )}
      </span>

      <span className="tabular-nums">链接图片 {linkedImages.length}</span>

      {brokenCount > 0 ? (
        <button
          type="button"
          data-lf-canvas-status-broken=""
          onClick={() => {
            setRelinkFilter('missing')
            setRelinkPanelOpen(true)
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-amber-600 hover:bg-amber-500/15 dark:text-amber-400"
        >
          <AlertTriangle size={11} />
          <span>{brokenCount} 失效链接</span>
        </button>
      ) : null}

      <span className="hidden sm:inline">· 纯文件链接 · LOD ≤2048px</span>
    </div>
  )
}
