// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  FolioButton,
  FolioCard,
  FolioDialog,
  FolioDialogContent,
  FolioDialogDescription,
  FolioDialogHeader,
  FolioDialogTitle,
  FolioIconLayers,
  FolioInput,
  FolioSwitch,
  FolioTabs,
  FolioTabsContent,
  FolioTabsList,
  FolioTabsTrigger,
  FolioTag,
  FolioUiHost,
  apply,
  clearToasts,
  getPortalContainer,
  toast,
} from '../client.js'

afterEach(() => {
  clearToasts()
  cleanup()
})

describe('@folio/base-ui-kit', () => {
  it('renders base controls with scoped .lf-* classes and icons', () => {
    const onClick = vi.fn()
    render(
      <FolioCard>
        <FolioButton variant="primary" size="sm" icon={<FolioIconLayers size={14} />} onClick={onClick}>
          操作
        </FolioButton>
        <FolioTag tone="success">已就绪</FolioTag>
        <FolioInput aria-label="名称" placeholder="输入名称" />
      </FolioCard>,
    )

    const btn = screen.getByRole('button', { name: '操作' })
    expect(btn.className).toContain('lf-btn')
    expect(btn.getAttribute('data-variant')).toBe('primary')
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)

    const tag = screen.getByText('已就绪')
    expect(tag.className).toContain('lf-tag')
    expect(tag.getAttribute('data-tone')).toBe('success')

    const input = screen.getByLabelText('名称')
    expect(input.className).toContain('lf-input')
  })

  it('toggles Radix Switch and switches Radix Tabs', () => {
    const onCheckedChange = vi.fn()
    render(
      <>
        <FolioSwitch aria-label="启用开关" onCheckedChange={onCheckedChange} />
        <FolioTabs defaultValue="a">
          <FolioTabsList>
            <FolioTabsTrigger value="a">页签 A</FolioTabsTrigger>
            <FolioTabsTrigger value="b">页签 B</FolioTabsTrigger>
          </FolioTabsList>
          <FolioTabsContent value="a">内容 A</FolioTabsContent>
          <FolioTabsContent value="b">内容 B</FolioTabsContent>
        </FolioTabs>
      </>,
    )

    const sw = screen.getByRole('switch', { name: '启用开关' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(sw.getAttribute('aria-checked')).toBe('true')

    expect(screen.getByText('内容 A')).toBeTruthy()
    fireEvent.mouseDown(screen.getByRole('tab', { name: '页签 B' }))
    fireEvent.click(screen.getByRole('tab', { name: '页签 B' }))
    expect(screen.getByText('内容 B')).toBeTruthy()
  })

  it('mounts Dialog inside FolioUiHost portal root instead of document.body and renders toasts', () => {
    render(
      <>
        <FolioUiHost />
        <FolioDialog open>
          <FolioDialogContent>
            <FolioDialogHeader>
              <FolioDialogTitle>确认操作</FolioDialogTitle>
              <FolioDialogDescription>将在隔离容器内渲染。</FolioDialogDescription>
            </FolioDialogHeader>
          </FolioDialogContent>
        </FolioDialog>
      </>,
    )

    const portalRoot = getPortalContainer()
    expect(portalRoot).not.toBeNull()
    expect(portalRoot?.querySelector('[data-folio-dialog]')).not.toBeNull()
    expect(screen.getByText('确认操作')).toBeTruthy()

    act(() => {
      toast({ title: '保存成功', description: '已写入配置', tone: 'success', durationMs: 0 })
    })
    expect(screen.getByText('保存成功')).toBeTruthy()
    expect(screen.getByText('已写入配置')).toBeTruthy()
  })

  it('registers folioUi service and shell.overlay host via ctx.effect and cleans up', () => {
    const cleanups: Array<() => void> = []
    const provideSpy = vi.fn(() => vi.fn())
    const registerSpy = vi.fn(() => vi.fn())
    const slots = {
      inject: vi.fn((_name: string, install: () => (() => void) | void) => {
        const d = install()
        return () => d?.()
      }),
      register: registerSpy,
    }
    const ctx = {
      slots,
      provide: provideSpy,
      effect(fn: () => (() => void) | void) {
        const cleanupFn = fn()
        if (cleanupFn) cleanups.push(cleanupFn)
        return () => cleanupFn?.()
      },
    }

    apply(ctx as never)
    expect(provideSpy).toHaveBeenCalledWith('folioUi', expect.objectContaining({ toast: expect.any(Function) }))
    expect(registerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'shell.overlay', id: 'folio.ui.host', order: 3 }),
      FolioUiHost,
    )

    for (const fn of cleanups) fn()
    expect(getPortalContainer()).toBeNull()
  })
})
