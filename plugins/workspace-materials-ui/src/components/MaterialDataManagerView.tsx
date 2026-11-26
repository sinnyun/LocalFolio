import * as React from 'react'
import {
  ArrowLeft,
  ArrowRightLeft,
  CheckSquare,
  FilePlus2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Square,
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
  FolioSwitch,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
} from '@folio/base-ui-kit/client'
import { useMaterials } from '../context.js'
import type {
  MaterialDataScope,
  MaterialFieldCategory,
  MaterialOptionItem,
  MaterialTemplateItem,
} from '../types.js'

const CATEGORY_LABELS: Record<MaterialFieldCategory, string> = {
  title: '常用标题',
  material: '材质',
  craft: '工艺',
  size: '尺寸',
  quantity: '数量',
  note: '备注',
}

const ALL_CATEGORIES: readonly MaterialFieldCategory[] = [
  'material',
  'craft',
  'size',
  'quantity',
  'note',
  'title',
]

export function MaterialDataManagerView(): React.ReactElement {
  const {
    activeProject,
    projectFiles,
    catalog,
    dataScopeDefault,
    setViewLayer,
    addPage,
    upsertOption,
    deleteOptions,
    copyOption,
    upsertTemplate,
    deleteTemplates,
    copyTemplate,
    resetCatalogDefaults,
  } = useMaterials()

  const [scope, setScope] = React.useState<MaterialDataScope>(
    activeProject ? dataScopeDefault : 'default',
  )
  const [subTab, setSubTab] = React.useState<'options' | 'templates'>('options')
  const [categoryFilter, setCategoryFilter] = React.useState<'all' | MaterialFieldCategory>('all')
  const [query, setQuery] = React.useState('')
  const [selectedOptionIds, setSelectedOptionIds] = React.useState<Set<string>>(() => new Set())
  const [selectedTemplateIds, setSelectedTemplateIds] = React.useState<Set<string>>(() => new Set())

  const [optionDialogOpen, setOptionDialogOpen] = React.useState(false)
  const [editingOption, setEditingOption] = React.useState<MaterialOptionItem | null>(null)
  const [optCategory, setOptCategory] = React.useState<MaterialFieldCategory>('material')
  const [optValue, setOptValue] = React.useState('')
  const [optDesc, setOptDesc] = React.useState('')

  const [templateDialogOpen, setTemplateDialogOpen] = React.useState(false)
  const [editingTemplate, setEditingTemplate] = React.useState<MaterialTemplateItem | null>(null)
  const [tplName, setTplName] = React.useState('')
  const [tplTitle, setTplTitle] = React.useState('')
  const [tplMaterial, setTplMaterial] = React.useState('')
  const [tplCraft, setTplCraft] = React.useState('')
  const [tplSize, setTplSize] = React.useState('')
  const [tplQuantity, setTplQuantity] = React.useState('')
  const [tplNote, setTplNote] = React.useState('')
  const [tplShowProject, setTplShowProject] = React.useState(false)

  const currentOptions =
    scope === 'default' ? catalog.defaultOptions : catalog.projectOptions
  const currentTemplates =
    scope === 'default' ? catalog.defaultTemplates : catalog.projectTemplates

  const filteredOptions = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return currentOptions.filter(item => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
      if (!q) return true
      return (
        item.value.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        CATEGORY_LABELS[item.category].includes(q)
      )
    })
  }, [currentOptions, categoryFilter, query])

  const filteredTemplates = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return currentTemplates
    return currentTemplates.filter(tpl =>
      [tpl.name, tpl.title, tpl.material, tpl.craft, tpl.size, tpl.quantity, tpl.note]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [currentTemplates, query])

  const openAddOption = () => {
    setEditingOption(null)
    setOptCategory(categoryFilter === 'all' ? 'material' : categoryFilter)
    setOptValue('')
    setOptDesc('')
    setOptionDialogOpen(true)
  }

  const openEditOption = (item: MaterialOptionItem) => {
    setEditingOption(item)
    setOptCategory(item.category)
    setOptValue(item.value)
    setOptDesc(item.description)
    setOptionDialogOpen(true)
  }

  const submitOption = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!optValue.trim()) return
    await upsertOption({
      scope,
      id: editingOption?.id,
      category: optCategory,
      value: optValue.trim(),
      label: optValue.trim(),
      description: optDesc.trim(),
    })
    setOptionDialogOpen(false)
    toast({ title: editingOption ? '物料选项已更新' : '已添加物料选项', tone: "success" })
  }

  const openAddTemplate = () => {
    setEditingTemplate(null)
    setTplName('')
    setTplTitle('')
    setTplMaterial('')
    setTplCraft('')
    setTplSize('')
    setTplQuantity('')
    setTplNote('')
    setTplShowProject(false)
    setTemplateDialogOpen(true)
  }

  const openEditTemplate = (tpl: MaterialTemplateItem) => {
    setEditingTemplate(tpl)
    setTplName(tpl.name)
    setTplTitle(tpl.title)
    setTplMaterial(tpl.material)
    setTplCraft(tpl.craft)
    setTplSize(tpl.size)
    setTplQuantity(tpl.quantity)
    setTplNote(tpl.note)
    setTplShowProject(tpl.showProjectName)
    setTemplateDialogOpen(true)
  }

  const submitTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tplName.trim()) return
    await upsertTemplate({
      scope,
      id: editingTemplate?.id,
      name: tplName.trim(),
      title: tplTitle.trim(),
      material: tplMaterial.trim(),
      craft: tplCraft.trim(),
      size: tplSize.trim(),
      quantity: tplQuantity.trim(),
      note: tplNote.trim(),
      showProjectName: tplShowProject,
    })
    setTemplateDialogOpen(false)
    toast({ title: editingTemplate ? '物料模板已更新' : '已添加物料模板', tone: "success" })
  }

  const toggleOptionSelect = (id: string) => {
    setSelectedOptionIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleTemplateSelect = (id: string) => {
    setSelectedTemplateIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBatchDeleteOptions = async () => {
    const ids = Array.from(selectedOptionIds)
    if (ids.length === 0) return
    await deleteOptions(scope, ids)
    setSelectedOptionIds(new Set())
    toast({ title: `已删除 ${ids.length} 条选项`, tone: "success" })
  }

  const handleBatchDeleteTemplates = async () => {
    const ids = Array.from(selectedTemplateIds)
    if (ids.length === 0) return
    await deleteTemplates(scope, ids)
    setSelectedTemplateIds(new Set())
    toast({ title: `已删除 ${ids.length} 个模板`, tone: "success" })
  }

  const handleQuickAddPageWithTemplate = async (tpl: MaterialTemplateItem) => {
    const firstFile = projectFiles[0]
    if (!firstFile) {
      toast({ title: '当前项目尚未关联 .vectorcraft 文件，请先新建或导入文件', tone: "info" })
      return
    }
    await addPage(firstFile.fileId, {
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
    <div data-lf-data-manager="" className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 顶部栏 */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => setViewLayer('pages')}
          >
            <ArrowLeft size={13} className="mr-1" />
            返回页面管理
          </Button>
          <h2 className="text-sm font-semibold">物料数据表格管理</h2>
          {activeProject ? (
            <Badge variant="outline" className="text-[11px]">
              当前项目：{activeProject.name}
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Tabs
            value={scope}
            onValueChange={v => {
              setScope(v as MaterialDataScope)
              setSelectedOptionIds(new Set())
              setSelectedTemplateIds(new Set())
            }}
          >
            <TabsList className="h-8">
              <TabsTrigger value="default" data-lf-data-scope-default="" className="text-xs">
                默认数据（全局）
              </TabsTrigger>
              <TabsTrigger
                value="project"
                data-lf-data-scope-project=""
                disabled={!activeProject}
                className="text-xs"
              >
                项目数据（当前项目）
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {scope === 'default' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void resetCatalogDefaults()}
            >
              <RotateCcw size={12} className="mr-1" />
              恢复默认数据
            </Button>
          ) : null}
        </div>
      </header>

      {/* 二级切换与筛选工具条 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={subTab} onValueChange={v => setSubTab(v as 'options' | 'templates')}>
            <TabsList className="h-7">
              <TabsTrigger value="options" data-lf-data-tab-options="" className="text-xs">
                快捷字段选项表 ({currentOptions.length})
              </TabsTrigger>
              <TabsTrigger value="templates" data-lf-data-tab-templates="" className="text-xs">
                物料模板表 ({currentTemplates.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {subTab === 'options' ? (
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                variant={categoryFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => setCategoryFilter('all')}
              >
                全部
              </Button>
              {ALL_CATEGORIES.map(cat => (
                <Button
                  key={cat}
                  type="button"
                  variant={categoryFilter === cat ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setCategoryFilter(cat)}
                >
                  {CATEGORY_LABELS[cat]}
                </Button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-52">
            <Search
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索物料数据..."
              className="h-7 pl-7 text-xs"
            />
          </div>

          {subTab === 'options' ? (
            <>
              {selectedOptionIds.size > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => void handleBatchDeleteOptions()}
                >
                  <Trash2 size={12} className="mr-1" />
                  批量删除 ({selectedOptionIds.size})
                </Button>
              ) : null}
              <Button
                type="button"
                variant="default"
                size="sm"
                data-lf-data-add-option=""
                className="h-7 text-xs"
                onClick={openAddOption}
              >
                <Plus size={12} className="mr-1" />
                新增选项
              </Button>
            </>
          ) : (
            <>
              {selectedTemplateIds.size > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => void handleBatchDeleteTemplates()}
                >
                  <Trash2 size={12} className="mr-1" />
                  批量删除 ({selectedTemplateIds.size})
                </Button>
              ) : null}
              <Button
                type="button"
                variant="default"
                size="sm"
                data-lf-data-add-template=""
                className="h-7 text-xs"
                onClick={openAddTemplate}
              >
                <Plus size={12} className="mr-1" />
                新增模板
              </Button>
            </>
          )}
        </div>
      </div>

      {/* 数据表格区 */}
      <div className="flex-1 overflow-auto p-4">
        {subTab === 'options' ? (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <button
                      type="button"
                      aria-label="全选选项"
                      onClick={() => {
                        if (selectedOptionIds.size === filteredOptions.length) {
                          setSelectedOptionIds(new Set())
                        } else {
                          setSelectedOptionIds(new Set(filteredOptions.map(o => o.id)))
                        }
                      }}
                      className="flex items-center justify-center text-muted-foreground"
                    >
                      {filteredOptions.length > 0 &&
                      selectedOptionIds.size === filteredOptions.length ? (
                        <CheckSquare size={14} className="text-primary" />
                      ) : (
                        <Square size={14} />
                      )}
                    </button>
                  </TableHead>
                  <TableHead className="w-24 text-xs">分类</TableHead>
                  <TableHead className="text-xs">快捷值</TableHead>
                  <TableHead className="text-xs">说明备注</TableHead>
                  <TableHead className="w-44 text-right text-xs">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                      {scope === 'project'
                        ? '当前项目暂无自定义选项，可从默认数据复制或点击「新增选项」'
                        : '暂无匹配选项'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOptions.map(item => (
                    <TableRow key={item.id} data-lf-option-row={item.id}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleOptionSelect(item.id)}
                          aria-label={`选择 ${item.value}`}
                          className="flex items-center justify-center text-muted-foreground"
                        >
                          {selectedOptionIds.has(item.id) ? (
                            <CheckSquare size={14} className="text-primary" />
                          ) : (
                            <Square size={14} />
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {CATEGORY_LABELS[item.category]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{item.value}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                        {item.description || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {activeProject ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[11px]"
                              title={scope === 'default' ? '复制到当前项目' : '提升为全局默认'}
                              onClick={() =>
                                void copyOption(
                                  item.id,
                                  scope,
                                  scope === 'default' ? 'project' : 'default',
                                )
                              }
                            >
                              <ArrowRightLeft size={11} className="mr-1" />
                              {scope === 'default' ? '复制到项目' : '设为默认'}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6"
                            title="编辑"
                            onClick={() => openEditOption(item)}
                          >
                            <Pencil size={12} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            title="删除"
                            onClick={() => void deleteOptions(scope, [item.id])}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <button
                      type="button"
                      aria-label="全选模板"
                      onClick={() => {
                        if (selectedTemplateIds.size === filteredTemplates.length) {
                          setSelectedTemplateIds(new Set())
                        } else {
                          setSelectedTemplateIds(new Set(filteredTemplates.map(t => t.id)))
                        }
                      }}
                      className="flex items-center justify-center text-muted-foreground"
                    >
                      {filteredTemplates.length > 0 &&
                      selectedTemplateIds.size === filteredTemplates.length ? (
                        <CheckSquare size={14} className="text-primary" />
                      ) : (
                        <Square size={14} />
                      )}
                    </button>
                  </TableHead>
                  <TableHead className="text-xs">模板名称</TableHead>
                  <TableHead className="text-xs">默认标题</TableHead>
                  <TableHead className="text-xs">材质</TableHead>
                  <TableHead className="text-xs">工艺</TableHead>
                  <TableHead className="text-xs">尺寸</TableHead>
                  <TableHead className="text-xs">数量</TableHead>
                  <TableHead className="text-xs">备注</TableHead>
                  <TableHead className="w-52 text-right text-xs">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-xs text-muted-foreground">
                      {scope === 'project'
                        ? '当前项目暂无自定义模板，可从默认数据复制或点击「新增模板」'
                        : '暂无匹配模板'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTemplates.map(tpl => (
                    <TableRow key={tpl.id} data-lf-template-row={tpl.id}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => toggleTemplateSelect(tpl.id)}
                          aria-label={`选择模板 ${tpl.name}`}
                          className="flex items-center justify-center text-muted-foreground"
                        >
                          {selectedTemplateIds.has(tpl.id) ? (
                            <CheckSquare size={14} className="text-primary" />
                          ) : (
                            <Square size={14} />
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="text-xs font-semibold">{tpl.name}</TableCell>
                      <TableCell className="text-xs">{tpl.title || '—'}</TableCell>
                      <TableCell className="text-xs">{tpl.material || '—'}</TableCell>
                      <TableCell className="text-xs">{tpl.craft || '—'}</TableCell>
                      <TableCell className="text-xs">{tpl.size || '—'}</TableCell>
                      <TableCell className="text-xs">{tpl.quantity || '—'}</TableCell>
                      <TableCell className="max-w-44 truncate text-xs text-muted-foreground">
                        {tpl.note || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {projectFiles.length > 0 ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 px-1.5 text-[11px]"
                              title="用此模板在项目首个文件新建一页"
                              onClick={() => void handleQuickAddPageWithTemplate(tpl)}
                            >
                              <FilePlus2 size={11} className="mr-1" />
                              加页
                            </Button>
                          ) : null}
                          {activeProject ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[11px]"
                              onClick={() =>
                                void copyTemplate(
                                  tpl.id,
                                  scope,
                                  scope === 'default' ? 'project' : 'default',
                                )
                              }
                            >
                              {scope === 'default' ? '复制到项目' : '设为默认'}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6"
                            onClick={() => openEditTemplate(tpl)}
                          >
                            <Pencil size={12} />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => void deleteTemplates(scope, [tpl.id])}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* 新增/编辑选项弹窗 */}
      <Dialog open={optionDialogOpen} onOpenChange={setOptionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingOption ? '编辑快捷物料选项' : '新增快捷物料选项'}</DialogTitle>
            <DialogDescription>
              所属作用域：{scope === 'default' ? '全局默认数据' : `项目数据（${activeProject?.name}）`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={e => void submitOption(e)} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">字段分类</label>
              <Select
                value={optCategory}
                onValueChange={v => setOptCategory(v as MaterialFieldCategory)}
              >
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">选项内容</label>
              <Input
                value={optValue}
                onChange={e => setOptValue(e.target.value)}
                placeholder="例如：10mm 安迪板（雪弗板）"
                className="h-8 text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">说明备注（可选）</label>
              <Input
                value={optDesc}
                onChange={e => setOptDesc(e.target.value)}
                placeholder="例如：室内主展板常用基材"
                className="h-8 text-xs"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOptionDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit">保存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 新增/编辑模板弹窗 */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? '编辑物料模板' : '新增物料模板'}</DialogTitle>
            <DialogDescription>
              所属作用域：{scope === 'default' ? '全局默认数据' : `项目数据（${activeProject?.name}）`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={e => void submitTemplate(e)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">模板名称 *</label>
                <Input
                  value={tplName}
                  onChange={e => setTplName(e.target.value)}
                  placeholder="如：签到处背景板"
                  className="h-8 text-xs"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">默认页面标题</label>
                <Input
                  value={tplTitle}
                  onChange={e => setTplTitle(e.target.value)}
                  placeholder="如：签到区背景板"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">材质</label>
                <Input
                  value={tplMaterial}
                  onChange={e => setTplMaterial(e.target.value)}
                  placeholder="如：10mm 安迪板"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">工艺</label>
                <Input
                  value={tplCraft}
                  onChange={e => setTplCraft(e.target.value)}
                  placeholder="如：高清UV直喷"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">尺寸</label>
                <Input
                  value={tplSize}
                  onChange={e => setTplSize(e.target.value)}
                  placeholder="如：400×300cm"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">数量</label>
                <Input
                  value={tplQuantity}
                  onChange={e => setTplQuantity(e.target.value)}
                  placeholder="如：1 套"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">备注</label>
              <Input
                value={tplNote}
                onChange={e => setTplNote(e.target.value)}
                placeholder="如：需现场安装"
                className="h-8 text-xs"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs">默认显示项目名称</span>
              <FolioSwitch
                checked={tplShowProject}
                onCheckedChange={v => setTplShowProject(Boolean(v))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit">保存模板</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
