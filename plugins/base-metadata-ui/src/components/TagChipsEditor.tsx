import * as React from 'react'
import { Plus, Tag, X } from 'lucide-react'
import { Badge, Button, FolioInput, Input, cn } from '@folio/base-ui-kit/client'

export const TAG_COLOR_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#64748b',
] as const

export interface TagOption {
  readonly id: string
  readonly name: string
  readonly color?: string
}

export interface StringTagChipsEditorProps {
  readonly mode?: 'string'
  readonly tags: readonly string[]
  readonly onChange: (nextTags: string[]) => void
  readonly placeholder?: string
  readonly className?: string
  readonly prefix?: string
  readonly addButtonLabel?: string
  readonly emptyText?: string
  readonly disabled?: boolean
}

export function StringTagChipsEditor({
  tags,
  onChange,
  placeholder = '输入新标签…',
  className,
  prefix = '#',
  addButtonLabel,
  emptyText,
  disabled = false,
}: StringTagChipsEditorProps): React.ReactElement {
  const [draft, setDraft] = React.useState('')

  const handleAdd = (): void => {
    if (disabled) return
    const clean = draft.trim()
    if (!clean) return
    if (!tags.includes(clean)) {
      onChange([...tags, clean])
    }
    setDraft('')
  }

  const handleRemove = (tag: string): void => {
    if (disabled) return
    onChange(tags.filter(t => t !== tag))
  }

  return (
    <div data-lf-string-tag-editor="" className={cn('flex flex-col gap-1.5', className)}>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map(tag => (
            <Badge
              key={tag}
              variant="secondary"
              data-lf-tag-chip={tag}
              className="gap-1 pr-1 text-[11px]"
            >
              <span>
                {prefix}
                {tag}
              </span>
              <button
                type="button"
                disabled={disabled}
                data-lf-tag-remove={tag}
                onClick={() => handleRemove(tag)}
                className="rounded hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`移除标签 ${tag}`}
              >
                <X size={11} />
              </button>
            </Badge>
          ))}
        </div>
      ) : emptyText ? (
        <span className="text-[11px] text-muted-foreground">{emptyText}</span>
      ) : null}

      <div className="flex gap-1.5">
        <Input
          value={draft}
          disabled={disabled}
          data-lf-tag-input=""
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleAdd()
            }
          }}
          placeholder={placeholder}
          className="h-7 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          data-lf-tag-add=""
          aria-label={addButtonLabel ?? '添加标签'}
          className="h-7 px-2"
          onClick={handleAdd}
        >
          <Plus size={13} />
          {addButtonLabel ? <span>{addButtonLabel}</span> : null}
        </Button>
      </div>
    </div>
  )
}

export interface ColoredTagChipsEditorProps<TTag extends TagOption = TagOption> {
  readonly mode?: 'colored'
  readonly allTags: readonly TTag[]
  readonly selectedTagIds: readonly string[]
  readonly onToggleTag: (tagId: string) => void
  readonly onQuickCreate?: (name: string, color: string) => Promise<TTag | void | null> | TTag | void | null
  readonly onManageClick?: () => void
  readonly label?: React.ReactNode
  readonly manageLabel?: string
  readonly placeholder?: string
  readonly maxSuggestions?: number
  readonly className?: string
  readonly disabled?: boolean
}

export function ColoredTagChipsEditor<TTag extends TagOption = TagOption>({
  allTags,
  selectedTagIds,
  onToggleTag,
  onQuickCreate,
  onManageClick,
  label = '标签',
  manageLabel = '管理标签',
  placeholder = '搜索或输入新标签…',
  maxSuggestions = 8,
  className,
  disabled = false,
}: ColoredTagChipsEditorProps<TTag>): React.ReactElement {
  const [query, setQuery] = React.useState('')
  const [creating, setCreating] = React.useState(false)

  const trimmedQuery = query.trim()
  const qLower = trimmedQuery.toLowerCase()

  const assignedTags = React.useMemo(
    () => allTags.filter(t => selectedTagIds.includes(t.id)),
    [allTags, selectedTagIds],
  )

  const unassignedTags = React.useMemo(
    () =>
      allTags.filter(
        t => !selectedTagIds.includes(t.id) && (!qLower || t.name.toLowerCase().includes(qLower)),
      ),
    [allTags, selectedTagIds, qLower],
  )

  const hasExactMatch = React.useMemo(
    () => Boolean(qLower) && allTags.some(t => t.name.toLowerCase() === qLower),
    [allTags, qLower],
  )

  const handleQuickCreate = async (): Promise<void> => {
    if (disabled || creating || !onQuickCreate || !trimmedQuery || hasExactMatch) return
    const color = TAG_COLOR_PALETTE[allTags.length % TAG_COLOR_PALETTE.length]
    setCreating(true)
    try {
      const created = await onQuickCreate(trimmedQuery, color)
      setQuery('')
      if (created && typeof created === 'object' && 'id' in created && created.id) {
        if (!selectedTagIds.includes(created.id)) {
          onToggleTag(created.id)
        }
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div data-lf-colored-tag-editor="" className={cn('space-y-2', className)}>
      {(label || onManageClick) ? (
        <div className="flex items-center justify-between gap-2">
          {label ? <span className="font-medium text-muted-foreground">{label}</span> : <span />}
          {onManageClick ? (
            <button
              type="button"
              disabled={disabled}
              data-lf-tag-manage=""
              onClick={onManageClick}
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Tag size={11} />
              <span>{manageLabel}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {assignedTags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {assignedTags.map(tag => (
            <span
              key={tag.id}
              data-lf-inspector-assigned-tag={tag.id}
              data-lf-assigned-tag={tag.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground"
            >
              {tag.color ? (
                <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
              ) : null}
              <span>{tag.name}</span>
              <button
                type="button"
                disabled={disabled}
                data-lf-inspector-tag-remove={tag.id}
                data-lf-tag-remove={tag.id}
                aria-label={`移除标签 ${tag.name}`}
                onClick={() => onToggleTag(tag.id)}
                className="ml-0.5 rounded-full text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <FolioInput
          size="sm"
          disabled={disabled}
          data-lf-inspector-tag-input=""
          data-lf-tag-input=""
          placeholder={placeholder}
          value={query}
          onChange={ev => setQuery(ev.target.value)}
          onKeyDown={ev => {
            if (ev.key === 'Enter' && trimmedQuery) {
              ev.preventDefault()
              if (hasExactMatch) {
                const exact = unassignedTags.find(t => t.name.toLowerCase() === qLower)
                if (exact) {
                  onToggleTag(exact.id)
                }
                setQuery('')
              } else if (onQuickCreate) {
                void handleQuickCreate()
              }
            }
          }}
          className="min-w-0 flex-1"
        />
      </div>

      {trimmedQuery && !hasExactMatch && onQuickCreate ? (
        <button
          type="button"
          disabled={disabled || creating}
          data-lf-inspector-tag-quick-create=""
          data-lf-tag-quick-create=""
          onClick={() => void handleQuickCreate()}
          className="flex w-full items-center gap-1.5 rounded-md border border-dashed border-primary/50 bg-primary/5 px-2 py-1 text-[11px] text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={12} />
          <span>创建并添加标签「{trimmedQuery}」</span>
        </button>
      ) : null}

      {unassignedTags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {unassignedTags.slice(0, maxSuggestions).map(tag => (
            <button
              key={tag.id}
              type="button"
              disabled={disabled}
              data-lf-inspector-tag-pick={tag.id}
              data-lf-tag-pick={tag.id}
              onClick={() => onToggleTag(tag.id)}
              className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-background px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={10} />
              {tag.color ? (
                <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
              ) : null}
              <span>{tag.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export type TagChipsEditorProps<TTag extends TagOption = TagOption> =
  | ({ readonly mode: 'string' } & Omit<StringTagChipsEditorProps, 'mode'>)
  | ({ readonly mode: 'colored' } & Omit<ColoredTagChipsEditorProps<TTag>, 'mode'>)

export function TagChipsEditor<TTag extends TagOption = TagOption>(
  props: TagChipsEditorProps<TTag>,
): React.ReactElement {
  if (props.mode === 'string') {
    const { mode: _mode, ...rest } = props
    return <StringTagChipsEditor {...rest} />
  }
  const { mode: _mode, ...rest } = props
  return <ColoredTagChipsEditor {...rest} />
}
