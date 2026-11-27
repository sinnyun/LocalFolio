// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  AutoSaveNoteField,
  ColoredTagChipsEditor,
  StarRatingInput,
  StringTagChipsEditor,
  TAG_COLOR_PALETTE,
  TagChipsEditor,
  type TagOption,
  apply,
  copyTextToClipboard,
  name,
  useCopyFeedback,
} from '../client.js'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('@folio/base-metadata-ui', () => {
  describe('plugin metadata', () => {
    it('exports plugin name and no-op apply', () => {
      expect(name).toBe('base-metadata-ui')
      expect(() => apply({} as never)).not.toThrow()
    })
  })

  describe('clipboard helpers', () => {
    let originalClipboard: Clipboard | undefined
    let originalExecCommand: ((commandId: string, showUI?: boolean, value?: string) => boolean) | undefined

    beforeEach(() => {
      originalClipboard = navigator.clipboard
      originalExecCommand = (document as unknown as { execCommand?: typeof document.execCommand }).execCommand
    })

    afterEach(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      })
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        writable: true,
        value: originalExecCommand,
      })
    })

    it('uses navigator.clipboard.writeText when available', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      })

      const ok = await copyTextToClipboard('C:\\Projects\\demo')
      expect(ok).toBe(true)
      expect(writeText).toHaveBeenCalledWith('C:\\Projects\\demo')
    })

    it('falls back to document.execCommand("copy") when navigator.clipboard fails or is missing', async () => {
      const writeText = vi.fn().mockRejectedValue(new Error('denied'))
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      })
      const execCommand = vi.fn().mockReturnValue(true)
      Object.defineProperty(document, 'execCommand', {
        configurable: true,
        writable: true,
        value: execCommand,
      })

      const ok = await copyTextToClipboard('fallback-text')
      expect(ok).toBe(true)
      expect(writeText).toHaveBeenCalledWith('fallback-text')
      expect(execCommand).toHaveBeenCalledWith('copy')
      expect(document.querySelectorAll('textarea').length).toBe(0)

      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: undefined,
      })
      execCommand.mockReturnValue(false)
      expect(await copyTextToClipboard('no-clipboard')).toBe(false)
    })

    it('manages transient copied state via useCopyFeedback', async () => {
      vi.useFakeTimers()
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      })

      function CopyProbe() {
        const { copied, copy } = useCopyFeedback(1200)
        return (
          <button type="button" onClick={() => void copy('hello')}>
            {copied ? '已复制' : '复制'}
          </button>
        )
      }

      render(<CopyProbe />)
      const btn = screen.getByRole('button', { name: '复制' })
      await act(async () => {
        fireEvent.click(btn)
        await Promise.resolve()
      })
      expect(screen.getByRole('button', { name: '已复制' })).toBeTruthy()

      act(() => {
        vi.advanceTimersByTime(1200)
      })
      expect(screen.getByRole('button', { name: '复制' })).toBeTruthy()
    })
  })

  describe('StarRatingInput', () => {
    it('supports 1-5 stars, hover preview, toggling current rating off, and clear button', () => {
      const onChange = vi.fn()
      const { rerender } = render(<StarRatingInput value={0} onChange={onChange} />)

      expect(screen.queryByRole('button', { name: '清除星级' })).toBeNull()

      const star3 = screen.getByRole('button', { name: '评分 3 星' })
      fireEvent.mouseEnter(star3)
      const svgs = document.querySelectorAll('[data-lf-star-rating] svg')
      expect(svgs[0]?.getAttribute('class')).toContain('fill-amber-400')
      expect(svgs[2]?.getAttribute('class')).toContain('fill-amber-400')
      expect(svgs[3]?.getAttribute('class')).not.toContain('fill-amber-400')

      fireEvent.mouseLeave(document.querySelector('[data-lf-star-rating]')!)
      expect(svgs[2]?.getAttribute('class')).not.toContain('fill-amber-400')

      fireEvent.click(star3)
      expect(onChange).toHaveBeenCalledWith(3)

      rerender(<StarRatingInput value={3} onChange={onChange} />)
      expect(screen.getByRole('button', { name: '评分 3 星' }).getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(screen.getByRole('button', { name: '评分 3 星' }))
      expect(onChange).toHaveBeenCalledWith(0)

      const clearBtn = screen.getByRole('button', { name: '清除星级' })
      fireEvent.click(clearBtn)
      expect(onChange).toHaveBeenLastCalledWith(0)
    })
  })

  describe('TagChipsEditor', () => {
    it('supports string tag mode: add on Enter or button click, deduplicate, and remove', () => {
      function StringHarness() {
        const [tags, setTags] = React.useState<string[]>(['渲染'])
        return <TagChipsEditor mode="string" tags={tags} onChange={setTags} />
      }

      render(<StringHarness />)
      expect(screen.getByText('#渲染')).toBeTruthy()

      const input = screen.getByPlaceholderText('输入新标签…')
      fireEvent.change(input, { target: { value: '  平面设计  ' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(screen.getByText('#平面设计')).toBeTruthy()

      fireEvent.change(input, { target: { value: '平面设计' } })
      fireEvent.click(screen.getByRole('button', { name: '添加标签' }))
      expect(screen.getAllByText('#平面设计')).toHaveLength(1)

      fireEvent.change(input, { target: { value: '三维' } })
      fireEvent.click(screen.getByRole('button', { name: '添加标签' }))
      expect(screen.getByText('#三维')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: '移除标签 渲染' }))
      expect(screen.queryByText('#渲染')).toBeNull()
    })

    it('renders StringTagChipsEditor directly as well', () => {
      const onChange = vi.fn()
      render(<StringTagChipsEditor tags={['alpha']} onChange={onChange} />)
      fireEvent.click(screen.getByRole('button', { name: '移除标签 alpha' }))
      expect(onChange).toHaveBeenCalledWith([])
    })

    it('supports colored tag mode: filter, toggle assign/remove, quick create, and manage action', async () => {
      const onManageClick = vi.fn()
      const onQuickCreate = vi.fn(async (tagName: string, color: string) => ({
        id: `tag_${tagName}`,
        name: tagName,
        color,
      }))

      function ColoredHarness() {
        const [allTags, setAllTags] = React.useState<TagOption[]>([
          { id: 't1', name: '建筑', color: TAG_COLOR_PALETTE[0] },
          { id: 't2', name: '景观', color: TAG_COLOR_PALETTE[1] },
          { id: 't3', name: '室内', color: TAG_COLOR_PALETTE[2] },
        ])
        const [selectedIds, setSelectedIds] = React.useState<string[]>(['t1'])

        const handleToggle = (id: string) => {
          setSelectedIds(prev => (prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]))
        }

        const handleQuickCreate = async (tagName: string, color: string) => {
          const created = await onQuickCreate(tagName, color)
          setAllTags(prev => [...prev, created])
          return created
        }

        return (
          <ColoredTagChipsEditor
            allTags={allTags}
            selectedTagIds={selectedIds}
            onToggleTag={handleToggle}
            onQuickCreate={handleQuickCreate}
            onManageClick={onManageClick}
          />
        )
      }

      render(<ColoredHarness />)
      expect(document.querySelector('[data-lf-assigned-tag="t1"]')).not.toBeNull()
      expect(document.querySelector('[data-lf-tag-pick="t2"]')).not.toBeNull()
      expect(document.querySelector('[data-lf-tag-pick="t3"]')).not.toBeNull()

      fireEvent.click(screen.getByRole('button', { name: '管理标签' }))
      expect(onManageClick).toHaveBeenCalledTimes(1)

      const searchInput = screen.getByPlaceholderText('搜索或输入新标签…')
      fireEvent.change(searchInput, { target: { value: '景' } })
      expect(document.querySelector('[data-lf-tag-pick="t2"]')).not.toBeNull()
      expect(document.querySelector('[data-lf-tag-pick="t3"]')).toBeNull()

      fireEvent.click(document.querySelector('[data-lf-tag-pick="t2"]')!)
      expect(document.querySelector('[data-lf-assigned-tag="t2"]')).not.toBeNull()

      fireEvent.change(searchInput, { target: { value: '新素材' } })
      const quickCreateBtn = document.querySelector('[data-lf-tag-quick-create]')!
      expect(quickCreateBtn.textContent).toContain('创建并添加标签「新素材」')

      await act(async () => {
        fireEvent.click(quickCreateBtn)
        await Promise.resolve()
      })
      expect(onQuickCreate).toHaveBeenCalledWith('新素材', TAG_COLOR_PALETTE[3])
      expect(document.querySelector('[data-lf-assigned-tag="tag_新素材"]')).not.toBeNull()

      fireEvent.click(screen.getByRole('button', { name: '移除标签 建筑' }))
      expect(document.querySelector('[data-lf-assigned-tag="t1"]')).toBeNull()
    })
  })

  describe('AutoSaveNoteField', () => {
    it('tracks dirty state and flushes on blur, Ctrl/Cmd+Enter, and unmount', () => {
      const onSave = vi.fn()
      const { unmount } = render(
        <AutoSaveNoteField value="初始备注" label="文件备注" onSave={onSave} />,
      )

      const textarea = screen.getByPlaceholderText('输入备注说明…') as HTMLTextAreaElement
      expect(textarea.value).toBe('初始备注')
      expect(screen.getByText('已保存')).toBeTruthy()

      // Blur without edits does not save
      fireEvent.blur(textarea)
      expect(onSave).not.toHaveBeenCalled()

      // Edit and save via Ctrl+Enter
      fireEvent.change(textarea, { target: { value: '第一版备注' } })
      expect(screen.getByText('未保存（失焦或 Ctrl+Enter 保存）')).toBeTruthy()
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
      expect(onSave).toHaveBeenCalledTimes(1)
      expect(onSave).toHaveBeenCalledWith('第一版备注')

      // Edit and save via blur
      fireEvent.change(textarea, { target: { value: '失焦备注' } })
      fireEvent.blur(textarea)
      expect(onSave).toHaveBeenCalledTimes(2)
      expect(onSave).toHaveBeenLastCalledWith('失焦备注')

      // Edit and flush on unmount
      fireEvent.change(textarea, { target: { value: '卸载前未提交' } })
      unmount()
      expect(onSave).toHaveBeenCalledTimes(3)
      expect(onSave).toHaveBeenLastCalledWith('卸载前未提交')
    })
  })
})
