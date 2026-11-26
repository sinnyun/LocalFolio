// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import type { Context } from '@deepseek-ai/cordis'
import {
  FolioShell,
  clampFloatingRect,
  createShellController,
  createShellOverlayPlugin,
  isEditableEventTarget,
  type DshSlotsLike,
} from '../client.js'
import { useShellStore } from '../shell/shell-store.js'

afterEach(() => {
  cleanup()
  useShellStore.getState().reset()
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-windows-titlebar')
  document.documentElement.style.removeProperty('--dsh-windows-titlebar-height')
  document.querySelectorAll('[data-windows-menu]').forEach(el => el.remove())
  document.querySelectorAll('[data-lf-caption-bar]').forEach(el => el.remove())
})

describe('@folio/base-shell-ui (native DSH DOM + floating panels)', () => {
  it('mounts overlay directly in DSH DOM without Shadow DOM, supports dynamic workspaces & maximizable floating panels, and layers Esc', async () => {
    const registeredSlots = new Map<
      string,
      Array<{ id?: string; Component: React.ComponentType<any> }>
    >()
    const slots: DshSlotsLike = {
      inject(_name, install) {
        const d = install()
        return () => d?.()
      },
      register(spec, Component) {
        const list = registeredSlots.get(spec.name) ?? []
        const entry = { id: spec.id, Component }
        list.push(entry)
        registeredSlots.set(spec.name, list)
        return () => {
          const cur = registeredSlots.get(spec.name)
          if (!cur) return
          const i = cur.indexOf(entry)
          if (i >= 0) cur.splice(i, 1)
        }
      },
    }

    const provided = new Map<string, unknown>()
    const recordingCalls: boolean[] = []
    const controller = createShellController(false)
    const plugin = createShellOverlayPlugin({ enableEvents: false, controller })

    const cleanups: Array<() => void> = []
    const fakeCtx = {
      slots,
      provide(key: string, val: unknown) {
        provided.set(key, val)
        return () => {
          provided.delete(key)
        }
      },
      get(key: string) {
        if (key === 'shortcuts') {
          return {
            recording: (flag: boolean) => {
              recordingCalls.push(flag)
            },
          }
        }
        return undefined
      },
      effect(fn: () => () => void) {
        cleanups.push(fn())
      },
    } as unknown as Context

    plugin.apply(fakeCtx)
    expect(provided.get('folioShell')).toBe(controller)

    const Entry = registeredSlots.get('conversation.header.leading')![0]!.Component
    const Overlay = registeredSlots
      .get('shell.overlay')!
      .find(entry => entry.id === 'folio.shell.overlay')!.Component
    const Floating = registeredSlots
      .get('shell.overlay')!
      .find(entry => entry.id === 'folio.shell.floating')!.Component

    const { container } = render(
      <div>
        <Entry />
        <Overlay />
        <Floating />
      </div>,
    )

    const entryBtn = container.querySelector('[data-lf-entry]') as HTMLButtonElement
    entryBtn.focus()
    fireEvent.click(entryBtn)

    await waitFor(() => {
      expect(container.querySelector('[data-lf-overlay]')).not.toBeNull()
    })
    // Web keeps the in-overlay top bar; the Windows caption row never mounts.
    expect(container.querySelector('[data-lf-topbar]')).not.toBeNull()
    expect(document.querySelector('[data-lf-caption-bar]')).toBeNull()
    // Zero Shadow DOM wall!
    expect(container.querySelector('[data-lf-shadow-host]')).toBeNull()
    expect(recordingCalls).toEqual([true])

    // Register dynamic workspace & floating panel from independent plugins
    let disposeWs = () => {}
    let disposePanel = () => {}
    act(() => {
      disposeWs = controller.registerWorkspace({
        id: 'canvas',
        title: '画板',
        order: 2,
        pluginId: '@folio/app-canvas-ui',
        MainView: () => <div data-testid="canvas-view">Canvas Native</div>,
      })
      disposePanel = controller.registerFloatingPanel({
        id: 'canvas.inspector',
        title: '画板属性浮窗',
        pluginId: '@folio/app-canvas-ui',
        defaultWidth: 480,
        defaultHeight: 320,
        Component: ({ maximized, toggleMaximize }) => (
          <div data-testid="float-body">
            {maximized ? 'MAX' : 'NORMAL'}
            <button type="button" onClick={toggleMaximize}>
              toggle
            </button>
          </div>
        ),
      })
    })

    await waitFor(() => {
      expect(container.querySelector('[data-testid="canvas-view"]')?.textContent).toBe(
        'Canvas Native',
      )
    })

    // Open floating panel -> maximize -> restore
    act(() => {
      controller.openFloatingPanel('canvas.inspector')
    })
    await waitFor(() => {
      expect(container.querySelector('[data-lf-floating-panel="canvas.inspector"]')).not.toBeNull()
    })

    const maxBtn = container.querySelector(
      '[data-lf-floating-maximize="canvas.inspector"]',
    ) as HTMLButtonElement
    fireEvent.click(maxBtn)
    expect(
      container
        .querySelector('[data-lf-floating-panel="canvas.inspector"]')
        ?.getAttribute('data-lf-maximized'),
    ).toBe('true')
    expect(container.querySelector('[data-testid="float-body"]')?.textContent).toContain('MAX')

    fireEvent.click(maxBtn)
    expect(
      container
        .querySelector('[data-lf-floating-panel="canvas.inspector"]')
        ?.getAttribute('data-lf-maximized'),
    ).toBe('false')

    // First Esc closes the floating panel while keeping the main overlay open
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(container.querySelector('[data-lf-floating-panel="canvas.inspector"]')).toBeNull()
    })
    expect(controller.isOpen()).toBe(true)

    // Second Esc closes the main overlay and restores shortcuts + focus
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(container.querySelector('[data-lf-overlay]')).toBeNull()
    })
    expect(recordingCalls).toEqual([true, false])
    expect(document.activeElement).toBe(entryBtn)

    act(() => {
      disposePanel()
      disposeWs()
    })
    for (const c of cleanups) c()
    expect(registeredSlots.get('shell.overlay')).toHaveLength(0)
  })

  it('keeps the workspace switcher in the Windows caption row instead of the top bar', async () => {
    const registeredSlots = new Map<
      string,
      Array<{ id?: string; Component: React.ComponentType<any> }>
    >()
    const slots: DshSlotsLike = {
      inject(_name, install) {
        const d = install()
        return () => d?.()
      },
      register(spec, Component) {
        const list = registeredSlots.get(spec.name) ?? []
        const entry = { id: spec.id, Component }
        list.push(entry)
        registeredSlots.set(spec.name, list)
        return () => {
          const cur = registeredSlots.get(spec.name)
          if (!cur) return
          const i = cur.indexOf(entry)
          if (i >= 0) cur.splice(i, 1)
        }
      },
    }

    const controller = createShellController(false)
    const plugin = createShellOverlayPlugin({ enableEvents: false, controller })
    const cleanups: Array<() => void> = []
    const fakeCtx = {
      slots,
      provide: () => () => {},
      get: () => undefined,
      effect(fn: () => () => void) {
        cleanups.push(fn())
      },
    } as unknown as Context

    plugin.apply(fakeCtx)

    document.documentElement.setAttribute('data-windows-titlebar', '')
    document.documentElement.style.setProperty('--dsh-windows-titlebar-height', '40px')
    const menuHost = document.createElement('div')
    menuHost.setAttribute('data-windows-menu', '')
    menuHost.getBoundingClientRect = () =>
      ({ x: 48, y: 0, left: 48, top: 0, right: 160, bottom: 40, width: 112, height: 40 }) as DOMRect
    document.body.append(menuHost)

    const Entry = registeredSlots.get('conversation.header.leading')![0]!.Component
    const Caption = registeredSlots
      .get('shell.overlay')!
      .find(entry => entry.id === 'folio.shell.caption')!.Component
    const Overlay = registeredSlots
      .get('shell.overlay')!
      .find(entry => entry.id === 'folio.shell.overlay')!.Component

    act(() => {
      controller.registerWorkspace({
        id: 'gallery',
        title: '图片画廊',
        order: 2,
        pluginId: '@folio/test-gallery-ui',
        MainView: () => <div data-testid="gallery-view" />,
      })
      controller.registerWorkspace({
        id: 'starter',
        title: '预览',
        order: 1,
        pluginId: '@folio/test-overview-ui',
        MainView: () => <div data-testid="starter-view" />,
      })
      controller.registerCaptionAction({
        id: 'test.panel-action',
        order: 5,
        Component: ({ isOpen }) => (
          <button type="button" data-testid="caption-action">
            {isOpen ? 'open' : 'closed'}
          </button>
        ),
      })
    })

    const { container } = render(
      <>
        <Entry />
        <Caption />
        <Overlay />
      </>,
    )

    await waitFor(() => {
      expect(document.querySelector('[data-lf-caption-bar]')).not.toBeNull()
    })

    // One toggle replaces the DSH entry button; the row starts after 应用 / 编辑.
    expect(container.querySelector('[data-lf-entry]')).toBeNull()
    const bar = document.querySelector('[data-lf-caption-bar]') as HTMLElement
    expect(bar.style.left).toBe('168px')
    expect(bar.style.right).toBe('180px')
    expect(bar.style.top).toBe('0px')
    expect(bar.querySelectorAll('[data-lf-caption-tab]')).toHaveLength(2)

    const toggle = document.querySelector('[data-lf-caption-toggle]') as HTMLButtonElement
    expect(toggle.textContent).toContain('工作台')

    // Picking a workspace from the caption opens the panel on that workspace.
    fireEvent.click(document.querySelector('[data-lf-caption-tab="gallery"]')!)
    await waitFor(() => {
      expect(container.querySelector('[data-lf-overlay]')).not.toBeNull()
    })
    expect(useShellStore.getState().activeWorkspaceId).toBe('gallery')
    expect(toggle.textContent).toContain('返回 DSH')

    // Windows drops the in-overlay top bar entirely.
    expect(container.querySelector('[data-lf-topbar]')).toBeNull()

    // A plugin-contributed caption action renders inside the row while open.
    expect(document.querySelector('[data-testid="caption-action"]')?.textContent).toBe('open')

    // The same button closes the panel again.
    fireEvent.click(toggle)
    await waitFor(() => {
      expect(container.querySelector('[data-lf-overlay]')).toBeNull()
    })
    expect(controller.isOpen()).toBe(false)

    for (const c of cleanups) c()
  })

  it('isolates crashing workspaces with ErrorBoundary, clamps floating rects, and detects editable targets', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onExit = vi.fn()
    function Boom(): React.ReactElement {
      throw new Error('boom')
    }

    const { container } = render(
      <FolioShell
        enableEvents={false}
        workspaces={[{ id: 'bad', title: '故障插件', order: 1, MainView: Boom }]}
        activeWorkspaceId="bad"
        onSelectWorkspace={() => {}}
        onOpenFloatingPanel={() => {}}
        onCloseFloatingPanel={() => {}}
        onExit={onExit}
      />,
    )

    expect(container.querySelector('[data-lf-error-boundary="故障插件"]')).not.toBeNull()
    fireEvent.click(container.querySelector('[data-lf-exit]')!)
    expect(onExit).toHaveBeenCalledTimes(1)

    const clamped = clampFloatingRect({ x: -9999, y: -50, width: 100, height: 100 }, 320, 220)
    expect(clamped.width).toBe(320)
    expect(clamped.height).toBe(220)
    expect(clamped.y).toBe(0)

    const input = document.createElement('input')
    expect(isEditableEventTarget({ composedPath: () => [input] } as unknown as Event)).toBe(true)
    errSpy.mockRestore()
  })
})
