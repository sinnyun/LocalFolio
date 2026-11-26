// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

vi.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }): React.ReactElement => (
    <div>{children}</div>
  )
  return {
    ResponsiveContainer: Passthrough,
    ComposedChart: Passthrough,
    Tooltip: () => null,
    Area: () => null,
    Line: () => null,
    XAxis: () => null,
    CartesianGrid: () => null,
  }
})

const { FolioUiHost } = await import('@folio/core-ui-kit/client')
const { StudioConsole } = await import('../studio/StudioConsole.js')
const { STUDIO_NAV, ROUTE_META, isNavParent } = await import('../studio/routes.js')
const { createActivitySeries, createCustomers } = await import('../studio/data.js')

afterEach(() => {
  cleanup()
})

describe('@folio/app-studio-ui (Studio Admin port)', () => {
  it('maps every sidebar destination to route metadata', () => {
    const ids = STUDIO_NAV.flatMap(group =>
      group.items.flatMap(item => (isNavParent(item) ? item.subItems.map(child => child.id) : [item.id])),
    )
    expect(ids.length).toBeGreaterThan(25)
    for (const id of ids) {
      expect(ROUTE_META[id], `missing meta for ${id}`).toBeTruthy()
    }
  })

  it('generates deterministic demo data', () => {
    expect(createCustomers(6).map(row => row.id)).toEqual(createCustomers(6).map(row => row.id))
    expect(createCustomers(4)[0]?.email).toBe(createCustomers(4)[0]?.email)
    const series = createActivitySeries(12)
    expect(series).toHaveLength(12)
    expect(series[0]?.newCustomers).toBe(createActivitySeries(12)[0]?.newCustomers)
  })

  it('renders the default dashboard, navigates to a queued screen, and opens preferences', () => {
    render(
      <>
        <FolioUiHost />
        <div style={{ height: 800 }}>
          <StudioConsole />
        </div>
      </>,
    )

    expect(screen.getAllByText('Studio Admin').length).toBeGreaterThan(0)
    expect(screen.getByText('Customer Activity')).toBeTruthy()
    expect(screen.getByText('18,426 Customers')).toBeTruthy()

    const tasksButton = screen
      .getAllByRole('button')
      .find(button => button.textContent?.trim().startsWith('Tasks'))
    expect(tasksButton).toBeTruthy()
    fireEvent.click(tasksButton as HTMLButtonElement)
    expect(screen.getByText(/queued for the port/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Layout controls' }))
    expect(screen.getByText('Preferences')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tangerine' })).toBeTruthy()
  })
})
