import * as React from 'react'
import { CheckCircle2, Radio, TriangleAlert } from 'lucide-react'
import { useMaterials } from '../context.js'

export function MaterialsStatus(): React.ReactElement {
  const { status, activeProject, projectFiles, visiblePages, viewLayer, selectedPageKeys } =
    useMaterials()

  const layerLabel =
    viewLayer === 'pages'
      ? '第一层：页面管理与导出'
      : viewLayer === 'editor'
        ? '第二层：幻灯片式编辑'
        : '物料数据表格管理'

  return (
    <div
      data-lf-materials-status=""
      className="flex min-w-0 items-center gap-2.5 text-[11px] text-muted-foreground"
    >
      <span className="max-w-44 truncate font-medium text-foreground">
        {activeProject?.name ?? '物料工作区'}
      </span>

      <span>·</span>
      <span>{layerLabel}</span>

      <span>·</span>
      <span className="tabular-nums">
        {projectFiles.length} 文件 / {visiblePages.length} 页 (A3 横版)
      </span>

      {selectedPageKeys.size > 0 ? (
        <>
          <span>·</span>
          <span className="font-medium text-primary tabular-nums">
            已选 {selectedPageKeys.size} 页
          </span>
        </>
      ) : null}

      <span>·</span>
      {status?.liveConnected ? (
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <Radio size={11} />
          <span>VectorCraft 前台实时联动 :{status.controlPort}</span>
        </span>
      ) : status?.cliFound ? (
        <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400">
          <CheckCircle2 size={11} />
          <span>{status.cliVersion || 'VectorCraft CLI 就绪'}</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-amber-600">
          <TriangleAlert size={11} />
          <span>未检测到 VectorCraft CLI</span>
        </span>
      )}
    </div>
  )
}
