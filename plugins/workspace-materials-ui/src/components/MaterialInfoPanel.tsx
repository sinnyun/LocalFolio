import * as React from 'react'
import { BookmarkPlus, Check, RefreshCw, Sparkles } from 'lucide-react'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FolioSwitch,
  Input,
  Separator,
  toast,
} from '@folio/base-ui-kit/client'
import { useMaterials } from '../context.js'
import {
  formatSpecSummary,
  type MaterialFieldCategory,
  type MaterialFields,
  type MaterialPageSummary,
  type MaterialTemplateItem,
} from '../types.js'
import { QuickPickComboBox } from './QuickPickComboBox.js'

export interface MaterialInfoPanelProps {
  readonly page: MaterialPageSummary
  readonly isLiveActive: boolean
}

export function MaterialInfoPanel({
  page,
  isLiveActive,
}: MaterialInfoPanelProps): React.ReactElement {
  const {
    activeProject,
    catalog,
    mutating,
    updatePageHeader,
    upsertOption,
    upsertTemplate,
  } = useMaterials()

  const [draft, setDraft] = React.useState<MaterialFields>(page.fields)
  const [dirty, setDirty] = React.useState(false)
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftRef = React.useRef<MaterialFields>(page.fields)
  draftRef.current = draft

  const pageIdentity = `${page.fileId}::${page.artboardIndex}`
  const prevIdentityRef = React.useRef<string>(pageIdentity)

  React.useEffect(() => {
    if (prevIdentityRef.current !== pageIdentity) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      prevIdentityRef.current = pageIdentity
      setDraft(page.fields)
      setDirty(false)
      return
    }
    if (!dirty) {
      setDraft(page.fields)
    }
  }, [pageIdentity, page.fields, dirty])

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const commitWrite = React.useCallback(
    async (nextFields: MaterialFields) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      setDirty(false)
      await updatePageHeader(page.fileId, page.artboardIndex, nextFields, true)
    },
    [page.fileId, page.artboardIndex, updatePageHeader],
  )

  const scheduleDebouncedWrite = React.useCallback(
    (nextFields: MaterialFields) => {
      setDirty(true)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        void commitWrite(nextFields)
      }, 450)
    },
    [commitWrite],
  )

  const updateField = <K extends keyof MaterialFields>(
    key: K,
    value: MaterialFields[K],
    immediate = false,
  ) => {
    const next: MaterialFields = { ...draftRef.current, [key]: value }
    setDraft(next)
    if (immediate) {
      void commitWrite(next)
    } else {
      scheduleDebouncedWrite(next)
    }
  }

  const applyTemplate = (tpl: MaterialTemplateItem) => {
    const next: MaterialFields = {
      title: tpl.title || draftRef.current.title,
      showProjectName: tpl.showProjectName,
      projectNameOverride: draftRef.current.projectNameOverride,
      material: tpl.material,
      craft: tpl.craft,
      size: tpl.size,
      quantity: tpl.quantity,
      note: tpl.note,
    }
    setDraft(next)
    void commitWrite(next)
    toast({ title: `已套用物料模板「${tpl.name}」`, tone: "success" })
  }

  const saveFieldToProject = async (category: MaterialFieldCategory, value: string) => {
    const clean = value.trim()
    if (!clean) return
    await upsertOption({
      scope: 'project',
      category,
      value: clean,
      label: clean,
      description: '从页面编辑快捷存入',
    })
    toast({ title: `已存入当前项目常用选项：${clean}`, tone: "success" })
  }

  const saveCurrentAsTemplate = async () => {
    const tplName = draft.title.trim() || `模板 ${page.pageNumber}`
    await upsertTemplate({
      scope: 'project',
      name: tplName,
      title: draft.title.trim(),
      material: draft.material.trim(),
      craft: draft.craft.trim(),
      size: draft.size.trim(),
      quantity: draft.quantity.trim(),
      note: draft.note.trim(),
      showProjectName: draft.showProjectName,
    })
    toast({ title: `已存为项目物料模板「${tplName}」`, tone: "success" })
  }

  const byCat = (cat: MaterialFieldCategory) => ({
    projectOptions: catalog.projectOptions.filter(o => o.category === cat),
    defaultOptions: catalog.defaultOptions.filter(o => o.category === cat),
  })

  const projectDisplayName =
    draft.projectNameOverride.trim() || activeProject?.name || ''
  const leftPreview = [
    page.pageNumber,
    draft.title.trim() || `第 ${page.pageNumber} 页`,
    draft.showProjectName && projectDisplayName ? projectDisplayName : '',
  ]
    .filter(Boolean)
    .join(' - ')
  const rightPreview = formatSpecSummary(draft) || '待填写物料信息'

  return (
    <aside
      data-lf-material-info-panel=""
      className="flex h-full w-80 shrink-0 flex-col border-l bg-background"
    >
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">物料信息栏</span>
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            {isLiveActive ? '前台实时写入' : 'CLI 后台写入'}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => void saveCurrentAsTemplate()}
            title="将当前页面物料配置存为项目模板"
          >
            <BookmarkPlus size={12} className="mr-1" />
            存模板
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            data-lf-material-apply-btn=""
            disabled={mutating}
            className="h-7 px-2 text-[11px]"
            onClick={() => void commitWrite(draft)}
          >
            {mutating ? (
              <RefreshCw size={12} className="mr-1 animate-spin" />
            ) : (
              <Check size={12} className="mr-1" />
            )}
            写入画板
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {/* 物料模板快选 */}
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 p-2">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-foreground">快捷物料模板</div>
            <div className="text-[10px] text-muted-foreground">一键填充 标题与 5 项物料规格</div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 text-xs">
                <Sparkles size={12} className="mr-1 text-sky-500" />
                套用模板
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 w-64 overflow-y-auto">
              {catalog.projectTemplates.length > 0 ? (
                <>
                  <DropdownMenuLabel className="text-[10px] text-primary">
                    当前项目模板
                  </DropdownMenuLabel>
                  {catalog.projectTemplates.map(tpl => (
                    <DropdownMenuItem key={tpl.id} onClick={() => applyTemplate(tpl)}>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-xs font-medium">{tpl.name}</span>
                        <span className="truncate text-[10px] text-muted-foreground">
                          {[tpl.material, tpl.craft, tpl.size].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuLabel className="text-[10px] text-muted-foreground">
                默认物料模板
              </DropdownMenuLabel>
              {catalog.defaultTemplates.map(tpl => (
                <DropdownMenuItem key={tpl.id} onClick={() => applyTemplate(tpl)}>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-medium">{tpl.name}</span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {[tpl.material, tpl.craft, tpl.size].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 左侧序号 + 标题 + 可选项目名称 */}
        <div className="space-y-2.5 rounded-md border p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">画板顶部左侧</span>
            <Badge variant="secondary" className="font-mono text-[11px]">
              序号 {page.pageNumber}（自动）
            </Badge>
          </div>

          <QuickPickComboBox
            id="field-title"
            label="物料标题"
            value={draft.title}
            placeholder="例如：主舞台背景板 / 签到区"
            {...byCat('title')}
            onChange={v => updateField('title', v, false)}
            onCommit={v => updateField('title', v, true)}
            onSaveToProject={v => saveFieldToProject('title', v)}
          />

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="min-w-0">
              <div className="text-xs font-medium">显示项目名称</div>
              <div className="truncate text-[10px] text-muted-foreground">
                在标题右侧附加「- {projectDisplayName || '项目名'}」
              </div>
            </div>
            <FolioSwitch
              checked={draft.showProjectName}
              aria-label="显示项目名称"
              onCheckedChange={checked => updateField('showProjectName', Boolean(checked), true)}
            />
          </div>

          {draft.showProjectName ? (
            <Input
              value={draft.projectNameOverride}
              placeholder={activeProject ? `默认：${activeProject.name}` : '自定义显示项目名称'}
              onChange={e => updateField('projectNameOverride', e.target.value, false)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void commitWrite(draftRef.current)
                }
              }}
              className="h-7 text-xs"
            />
          ) : null}
        </div>

        <Separator />

        {/* 右侧：材质 | 工艺 | 尺寸 | 数量 | 备注 */}
        <div className="space-y-2.5 rounded-md border p-2.5">
          <div className="text-[11px] font-semibold text-muted-foreground">
            画板顶部右侧（材质 | 工艺 | 尺寸 | 数量 | 备注）
          </div>

          <QuickPickComboBox
            id="field-material"
            label="材质"
            value={draft.material}
            placeholder="选择或输入材质（如 10mm 安迪板）"
            {...byCat('material')}
            onChange={v => updateField('material', v, false)}
            onCommit={v => updateField('material', v, true)}
            onSaveToProject={v => saveFieldToProject('material', v)}
          />

          <QuickPickComboBox
            id="field-craft"
            label="工艺"
            value={draft.craft}
            placeholder="选择或输入工艺（如 高清UV直喷）"
            allowAppend
            {...byCat('craft')}
            onChange={v => updateField('craft', v, false)}
            onCommit={v => updateField('craft', v, true)}
            onSaveToProject={v => saveFieldToProject('craft', v)}
          />

          <QuickPickComboBox
            id="field-size"
            label="尺寸"
            value={draft.size}
            placeholder="选择或输入尺寸（如 400×300cm）"
            {...byCat('size')}
            onChange={v => updateField('size', v, false)}
            onCommit={v => updateField('size', v, true)}
            onSaveToProject={v => saveFieldToProject('size', v)}
          />

          <QuickPickComboBox
            id="field-quantity"
            label="数量"
            value={draft.quantity}
            placeholder="选择或输入数量（如 2 块）"
            {...byCat('quantity')}
            onChange={v => updateField('quantity', v, false)}
            onCommit={v => updateField('quantity', v, true)}
            onSaveToProject={v => saveFieldToProject('quantity', v)}
          />

          <QuickPickComboBox
            id="field-note"
            label="备注"
            value={draft.note}
            placeholder="选择或输入备注（如 需现场安装）"
            allowAppend
            {...byCat('note')}
            onChange={v => updateField('note', v, false)}
            onCommit={v => updateField('note', v, true)}
            onSaveToProject={v => saveFieldToProject('note', v)}
          />
        </div>
      </div>

      {/* 顶部栏实时预览条 */}
      <div className="border-t bg-muted/40 p-2.5">
        <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>顶部信息条预览（A3 横版顶栏）</span>
          <span>{dirty ? '输入中...' : '已同步'}</span>
        </div>
        <div className="flex items-center justify-between gap-2 rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-[11px] text-slate-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-slate-100">
          <span className="truncate font-semibold">{leftPreview}</span>
          <span className="truncate text-right text-[10px] opacity-85">{rightPreview}</span>
        </div>
      </div>
    </aside>
  )
}
