// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FolioUiHost, getPortalContainer } from '@folio/base-ui-kit/client'
import { Sidebar07DemoView } from '../client.js'

afterEach(() => {
  cleanup()
})

describe('@folio/test-sidebar-ui (sidebar-07)', () => {
  it('renders sidebar-07 from @folio/base-ui-kit primitives, opens dropdowns in portal root, and toggles collapse', () => {
    render(
      <>
        <FolioUiHost />
        <Sidebar07DemoView />
      </>,
    )

    expect(screen.getByText('Acme Inc')).toBeTruthy()
    expect(screen.getByText('Design Engineering')).toBeTruthy()

    // Open TeamSwitcher dropdown (Radix DropdownMenu opens on pointerDown / keyDown)
    const teamTrigger = document.querySelector('[data-lf-team-switcher]') as HTMLButtonElement
    expect(teamTrigger).not.toBeNull()
    fireEvent.pointerDown(teamTrigger, { button: 0, ctrlKey: false })
    const portalRoot = getPortalContainer()
    expect(portalRoot?.querySelector('[data-slot="dropdown-menu-content"]')).not.toBeNull()
    expect(screen.getByText('Acme Corp.')).toBeTruthy()
    // Select team to close modal dropdown menu
    fireEvent.click(screen.getByRole('menuitem', { name: /Acme Corp\./i }))
    expect(screen.getByText('Startup')).toBeTruthy()

    // Click a sub-item to verify breadcrumb & main panel update
    fireEvent.click(screen.getByRole('button', { name: 'Starred' }))
    expect(screen.getAllByText('Starred').length).toBeGreaterThanOrEqual(2)

    // Toggle sidebar collapse via SidebarTrigger
    const trigger = document.querySelector('[data-sidebar="trigger"]') as HTMLButtonElement
    expect(trigger).not.toBeNull()
    fireEvent.click(trigger)
    expect(document.querySelector('[data-state="collapsed"]')).not.toBeNull()
  })
})
