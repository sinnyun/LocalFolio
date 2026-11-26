import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { FolioIconCheck, FolioIconChevronDown } from '../icons.js'
import { usePortalContainer } from '../portal.js'

function cx(...parts: Array<string | undefined | false>): string {
  return parts.filter(Boolean).join(' ')
}

export interface FolioSelectOption {
  readonly value: string
  readonly label: string
  readonly disabled?: boolean
}

export interface FolioSelectProps {
  readonly value?: string
  readonly defaultValue?: string
  readonly onValueChange?: (value: string) => void
  readonly options: readonly FolioSelectOption[]
  readonly placeholder?: string
  readonly disabled?: boolean
  readonly className?: string
  readonly 'aria-label'?: string
}

export function FolioSelect({
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder = '请选择',
  disabled,
  className,
  'aria-label': ariaLabel,
}: FolioSelectProps): React.ReactElement {
  const container = usePortalContainer()
  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cx('lf-select-trigger', className)}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <FolioIconChevronDown size={13} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={container ?? undefined}>
        <SelectPrimitive.Content position="popper" sideOffset={4} className="lf-select-content">
          <SelectPrimitive.Viewport>
            {options.map(opt => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className="lf-select-item"
              >
                <SelectPrimitive.ItemIndicator className="lf-select-item-indicator">
                  <FolioIconCheck size={12} />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
