// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { pageSingleton } from '../page-singleton.js'

/**
 * Loads a second, independent instance of a module. Vite keys its module graph
 * by URL, so a query suffix evaluates a fresh copy — the stand-in for the plugin
 * row that live code replacement rebuilt while its consumers kept the exports
 * they already captured.
 */
function importCopy<T>(specifier: string): Promise<T> {
  return vi.importActual<T>(specifier)
}

afterEach(() => {
  cleanup()
})

describe('page identity across live replacement', () => {
  it('keeps the symbol registry itself module-copy independent', async () => {
    const copy = await importCopy<typeof import('../page-singleton.js')>('../page-singleton.js?replaced')

    const created = pageSingleton('test:registry', () => ({ owner: 'first' }))
    expect(copy.pageSingleton('test:registry', () => ({ owner: 'second' }))).toBe(created)
  })

  it('shares the sidebar context between one copy that provides and one that consumes', async () => {
    const frameCopy = await import('../components/ui/sidebar.js')
    const workspaceCopy = await importCopy<typeof frameCopy>('../components/ui/sidebar.js?replaced')

    expect(workspaceCopy.useSidebar).not.toBe(frameCopy.useSidebar)

    function Probe(): React.ReactElement {
      const { state } = workspaceCopy.useSidebar()
      return <span data-testid="probe">{state}</span>
    }

    render(
      <frameCopy.SidebarProvider open={false}>
        <Probe />
        <workspaceCopy.SidebarMenuButton tooltip="项目">物料项目</workspaceCopy.SidebarMenuButton>
      </frameCopy.SidebarProvider>,
    )

    expect(screen.getByTestId('probe').textContent).toBe('collapsed')
    expect(screen.getByRole('button', { name: '物料项目' })).toBeTruthy()
  })

  it('shares one portal container between the host copy and a consumer copy', async () => {
    const hostCopy = await import('../portal.js')
    const consumerCopy = await importCopy<typeof hostCopy>('../portal.js?replaced')
    const container = document.createElement('div')

    hostCopy.setPortalContainer(container)
    expect(consumerCopy.getPortalContainer()).toBe(container)

    consumerCopy.setPortalContainer(null)
    expect(hostCopy.getPortalContainer()).toBeNull()
  })

  it('shares one toast queue between a producer copy and the toaster copy', async () => {
    const producerCopy = await import('../toast.js')
    const toasterCopy = await importCopy<typeof producerCopy>('../toast.js?replaced')

    function Probe(): React.ReactElement {
      return <span data-testid="toasts">{toasterCopy.useToasts().length}</span>
    }

    render(<Probe />)
    act(() => {
      producerCopy.toast({ title: '共享通知', durationMs: 0 })
    })
    expect(screen.getByTestId('toasts').textContent).toBe('1')

    act(() => {
      toasterCopy.clearToasts()
    })
    expect(screen.getByTestId('toasts').textContent).toBe('0')
  })
})
