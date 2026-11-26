// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FolioUiHost } from '@folio/core-ui-kit/client'
import { AdminConsole } from '../admin/AdminConsole.js'
import { APP_ENTRIES, createTasks, createUsers } from '../admin/data.js'
import { NAV_GROUPS, ROUTE_META, isCollapsible } from '../admin/routes.js'

afterEach(() => {
  cleanup()
})

const clickNav = (name: string): void => {
  const buttons = screen.getAllByRole('button')
  const target = buttons.find(button => button.textContent?.trim().startsWith(name))
  if (!target) throw new Error(`nav button ${name} not found`)
  fireEvent.click(target)
}

describe('@folio/app-admin-ui (shadcn-admin port)', () => {
  it('keeps every sidebar route mapped to breadcrumb metadata', () => {
    const routes = NAV_GROUPS.flatMap(group =>
      group.items.flatMap(item => (isCollapsible(item) ? item.items.map(child => child.route) : item.route)),
    )
    expect(routes.length).toBeGreaterThan(10)
    for (const route of routes) {
      expect(ROUTE_META[route]).toBeTruthy()
      expect(ROUTE_META[route].crumbs.length).toBeGreaterThan(0)
    }
  })

  it('generates deterministic demo data without faker runtime state', () => {
    expect(createTasks(5).map(task => task.id)).toEqual(createTasks(5).map(task => task.id))
    expect(createUsers(5).map(user => user.email)).toEqual(createUsers(5).map(user => user.email))
    expect(APP_ENTRIES).toHaveLength(15)
  })

  it('renders the dashboard, navigates to tasks, and routes through the command palette', () => {
    render(
      <>
        <FolioUiHost />
        <AdminConsole />
      </>,
    )

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy()
    expect(screen.getByText('Total Revenue')).toBeTruthy()
    expect(screen.getByRole('img', { name: /Monthly revenue bar chart/i })).toBeTruthy()

    clickNav('Tasks')
    expect(screen.getByRole('heading', { name: 'Tasks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Add Task/i })).toBeTruthy()
    expect(screen.getByPlaceholderText('Filter by title or ID...')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const search = screen.getByPlaceholderText('Search pages, settings, errors...')
    fireEvent.change(search, { target: { value: 'Users' } })
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(screen.getByRole('heading', { name: 'User List' })).toBeTruthy()
  })

  it('switches the local admin palette from the appearance settings page', () => {
    render(
      <>
        <FolioUiHost />
        <AdminConsole />
      </>,
    )

    clickNav('Settings')
    fireEvent.click(screen.getByRole('button', { name: /Appearance/i }))
    fireEvent.click(screen.getByRole('button', { name: /Dark/i }))

    const root = document.querySelector('[data-lf-admin]')
    expect(root?.classList.contains('dark')).toBe(true)
    expect((root as HTMLElement).style.getPropertyValue('--background')).toBe('#020817')
  })
})
