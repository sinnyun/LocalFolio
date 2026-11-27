import * as React from 'react'
import { FolioTextarea, cn } from '@folio/base-ui-kit/client'

export interface AutoSaveNoteFieldProps {
  readonly value: string
  readonly onSave: (nextValue: string) => void | Promise<void>
  readonly label?: React.ReactNode
  readonly placeholder?: string
  readonly rows?: number
  readonly className?: string
  readonly textareaClassName?: string
  readonly disabled?: boolean
  readonly showStatus?: boolean
  readonly dirtyHint?: string
  readonly savedHint?: string
  readonly 'data-lf-inspector-note'?: string
}

export function AutoSaveNoteField({
  value,
  onSave,
  label,
  placeholder = '输入备注说明…',
  rows = 3,
  className,
  textareaClassName,
  disabled = false,
  showStatus = true,
  dirtyHint = '未保存（失焦或 Ctrl+Enter 保存）',
  savedHint = '已保存',
  ...rest
}: AutoSaveNoteFieldProps): React.ReactElement {
  const [draft, setDraft] = React.useState(value)
  const [dirty, setDirty] = React.useState(false)

  const latestRef = React.useRef({
    draft,
    dirty,
    onSave,
  })
  latestRef.current = { draft, dirty, onSave }

  React.useEffect(() => {
    if (!dirty) {
      setDraft(value)
    }
  }, [value, dirty])

  const flush = React.useCallback(() => {
    const current = latestRef.current
    if (!current.dirty) return
    latestRef.current.dirty = false
    setDirty(false)
    void current.onSave(current.draft)
  }, [])

  React.useEffect(() => {
    return () => {
      const current = latestRef.current
      if (current.dirty) {
        void current.onSave(current.draft)
      }
    }
  }, [])

  const statusText = dirty ? dirtyHint : value ? savedHint : ''

  return (
    <div data-lf-autosave-note="" className={cn('space-y-1.5', className)}>
      {(label || showStatus) ? (
        <div className="flex items-center justify-between gap-2">
          {label ? <span className="font-medium text-muted-foreground">{label}</span> : <span />}
          {showStatus ? (
            <span data-lf-note-status="" className="text-[10px] text-muted-foreground">
              {statusText}
            </span>
          ) : null}
        </div>
      ) : null}
      <FolioTextarea
        data-lf-inspector-note={rest['data-lf-inspector-note'] ?? ''}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        value={draft}
        onChange={ev => {
          setDraft(ev.target.value)
          setDirty(true)
        }}
        onBlur={flush}
        onKeyDown={ev => {
          if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
            ev.preventDefault()
            flush()
          }
        }}
        className={cn('w-full resize-y text-xs', textareaClassName)}
      />
    </div>
  )
}
