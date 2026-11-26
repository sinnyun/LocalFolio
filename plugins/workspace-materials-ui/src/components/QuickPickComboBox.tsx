import * as React from 'react'
import { BookmarkPlus, Check, ChevronDown, Plus, X } from 'lucide-react'
import { Button, Input, cn } from '@folio/base-ui-kit/client'
import type { MaterialOptionItem } from '../types.js'

export interface QuickPickComboBoxProps {
  readonly id?: string
  readonly label: string
  readonly value: string
  readonly placeholder?: string
  readonly projectOptions: readonly MaterialOptionItem[]
  readonly defaultOptions: readonly MaterialOptionItem[]
  readonly allowAppend?: boolean
  readonly onChange: (nextValue: string) => void
  readonly onCommit: (nextValue: string) => void
  readonly onSaveToProject?: (value: string) => Promise<void> | void
}

export function QuickPickComboBox({
  id,
  label,
  value,
  placeholder,
  projectOptions,
  defaultOptions,
  allowAppend = false,
  onChange,
  onCommit,
  onSaveToProject,
}: QuickPickComboBoxProps): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [filterActive, setFilterActive] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (!open) {
      setFilterActive(false)
      return undefined
    }
    const handleOutside = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const query = filterActive ? value.trim().toLowerCase() : ''
  const filterItems = (items: readonly MaterialOptionItem[]) =>
    !query
      ? items
      : items.filter(
          item =>
            item.value.toLowerCase().includes(query) ||
            item.label.toLowerCase().includes(query) ||
            item.description.toLowerCase().includes(query),
        )

  const filteredProject = filterItems(projectOptions)
  const filteredDefault = filterItems(defaultOptions)

  const exactExists = React.useMemo(() => {
    const v = value.trim()
    if (!v) return true
    return (
      projectOptions.some(o => o.value === v) ||
      defaultOptions.some(o => o.value === v)
    )
  }, [value, projectOptions, defaultOptions])

  const handleSelectOption = (optValue: string, append = false) => {
    const next =
      append && value.trim()
        ? value.trim().includes(optValue)
          ? value.trim()
          : `${value.trim()} / ${optValue}`
        : optValue
    onChange(next)
    onCommit(next)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative space-y-1" data-lf-quick-pick={id}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-medium text-foreground">
          {label}
        </label>
        {!exactExists && onSaveToProject ? (
          <button
            type="button"
            data-lf-quick-pick-save={id}
            onClick={() => void onSaveToProject(value.trim())}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10"
            title="将当前内容存入当前项目常用数据"
          >
            <BookmarkPlus size={11} />
            <span>存入项目</span>
          </button>
        ) : null}
      </div>

      <div className="relative flex items-center">
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onFocus={() => {
            setFilterActive(false)
            setOpen(true)
          }}
          onChange={e => {
            setFilterActive(true)
            setOpen(true)
            onChange(e.target.value)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onCommit(value)
              setOpen(false)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
          className="h-8 pr-14 text-xs"
        />
        <div className="absolute right-1 flex items-center gap-0.5">
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 text-muted-foreground"
              aria-label={`清空${label}`}
              onClick={() => {
                setFilterActive(false)
                onChange('')
                onCommit('')
              }}
            >
              <X size={12} />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            data-lf-quick-pick-toggle={id}
            className="h-6 w-6 text-muted-foreground"
            aria-label={`展开${label}快捷选项`}
            onClick={() => {
              setFilterActive(false)
              setOpen(prev => !prev)
            }}
          >
            <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {open ? (
        <div
          data-lf-quick-pick-menu={id}
          className="absolute left-0 right-0 top-full z-40 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {filteredProject.length > 0 ? (
            <div className="mb-1">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                项目数据（当前项目）
              </div>
              {filteredProject.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-1 rounded px-2 py-1 text-xs hover:bg-accent"
                >
                  <button
                    type="button"
                    data-lf-quick-pick-option={item.value}
                    onClick={() => handleSelectOption(item.value, false)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <Check
                      size={12}
                      className={cn(
                        'shrink-0',
                        value.trim() === item.value ? 'opacity-100 text-primary' : 'opacity-0',
                      )}
                    />
                    <span className="truncate font-medium">{item.value}</span>
                    {item.description ? (
                      <span className="truncate text-[10px] text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </button>
                  {allowAppend && value.trim() && value.trim() !== item.value ? (
                    <button
                      type="button"
                      title="追加到当前内容"
                      onClick={() => handleSelectOption(item.value, true)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus size={12} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {filteredDefault.length > 0 ? (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                默认数据
              </div>
              {filteredDefault.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-1 rounded px-2 py-1 text-xs hover:bg-accent"
                >
                  <button
                    type="button"
                    data-lf-quick-pick-option={item.value}
                    onClick={() => handleSelectOption(item.value, false)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  >
                    <Check
                      size={12}
                      className={cn(
                        'shrink-0',
                        value.trim() === item.value ? 'opacity-100 text-primary' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{item.value}</span>
                    {item.description ? (
                      <span className="truncate text-[10px] text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </button>
                  {allowAppend && value.trim() && value.trim() !== item.value ? (
                    <button
                      type="button"
                      title="追加到当前内容"
                      onClick={() => handleSelectOption(item.value, true)}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Plus size={12} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {filteredProject.length === 0 && filteredDefault.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">
              无匹配预设，按回车直接使用「{value || '...'}」
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
