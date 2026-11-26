// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FolioUiHost } from '@folio/base-ui-kit/client'
import type {
  FrameAppDefinition,
  FrameProviderProps,
  FrameViewProps,
} from '@folio/base-contract'
import { FrameWorkbench } from '../frame/FrameWorkbench.js'
import { createFolioFrameService } from '../frame/service.js'
import { frameStore } from '../frame/store.js'

interface FixtureState {
  readonly item: string
  readonly setItem: (item: string) => void
}

const FixtureContext = React.createContext<FixtureState | null>(null)

function useFixture(): FixtureState {
  const value = React.useContext(FixtureContext)
  if (!value) throw new Error('fixture provider missing')
  return value
}

function FixtureProvider({ children }: FrameProviderProps): React.ReactElement {
  const [item, setItem] = React.useState('Alpha')
  return <FixtureContext.Provider value={{ item, setItem }}>{children}</FixtureContext.Provider>
}

function FixtureLeft(_props: FrameViewProps): React.ReactElement {
  const { setItem } = useFixture()
  return (
    <button type="button" onClick={() => setItem('Beta')}>
      切换 Beta
    </button>
  )
}

function FixtureMain(_props: FrameViewProps): React.ReactElement {
  return <div data-lf-fixture-main="">主区内容</div>
}

function FixtureRight(_props: FrameViewProps): React.ReactElement {
  const { item } = useFixture()
  return <div data-lf-fixture-right="">{item}</div>
}

function FixtureStatus(_props: FrameViewProps): React.ReactElement {
  const { item } = useFixture()
  return <span>当前 {item}</span>
}

const fixtureApp: FrameAppDefinition = {
  id: 'frame.fixture',
  title: '测试框架示例',
  pluginId: '@folio/bridge-frame-test-ui',
  order: 10,
  leftCollapse: 'icon',
  Provider: FixtureProvider,
  Left: FixtureLeft,
  Main: FixtureMain,
  Right: FixtureRight,
  Status: FixtureStatus,
}

function createService(openWorkspace?: (workspaceId: string) => void) {
  return createFolioFrameService({ View: FrameWorkbench, openWorkspace })
}

function setup(): void {
  const service = createService()
  service.registerApp(fixtureApp)
  render(
    <>
      <FolioUiHost />
      <FrameWorkbench />
    </>,
  )
}

function resizer(side: 'left' | 'right'): HTMLElement {
  const element = document.querySelector(`[data-lf-frame-resizer="${side}"]`) as HTMLElement | null
  if (!element) throw new Error(`missing ${side} resizer`)
  return element
}

beforeEach(() => {
  frameStore.reset()
})

afterEach(() => {
  cleanup()
})

describe('@folio/base-frame-ui', () => {
  it('registers apps through ctx.folioFrame and clamps layout writes', () => {
    const service = createService()
    const dispose = service.registerApp(fixtureApp)

    expect(service.listApps()).toHaveLength(1)
    expect(service.listAppSummaries()[0]).toMatchObject({
      id: 'frame.fixture',
      title: '测试框架示例',
      pluginId: '@folio/bridge-frame-test-ui',
    })
    expect(service.getActiveAppId()).toBe('frame.fixture')
    expect(service.getLayout().rightWidth).toBe(320)

    service.setLayout('frame.fixture', { rightWidth: 9999, leftCollapsed: true })
    expect(service.getLayout()).toMatchObject({ rightWidth: 620, leftCollapsed: true })

    dispose()
    expect(service.listApps()).toHaveLength(0)
  })

  it('navigates to the attached host workspace only while one is attached', () => {
    const opened: string[] = []
    const service = createService(id => opened.push(id))
    service.registerApp(fixtureApp)

    service.openApp('frame.fixture')
    expect(opened).toEqual([])

    const detach = service.attachHostWorkspace('frame-test')
    service.openApp('frame.fixture')
    expect(opened).toEqual(['frame-test'])

    detach()
    service.openApp('frame.fixture')
    expect(opened).toEqual(['frame-test'])
  })

  it('renders all four regions and shares Provider state between center, right and status', () => {
    setup()

    expect(document.querySelector('[data-lf-fixture-main]')).not.toBeNull()
    expect(document.querySelector('[data-lf-frame-right]')).not.toBeNull()
    expect(document.querySelector('[data-lf-frame-statusbar]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '切换 Beta' }))

    expect(document.querySelector('[data-lf-fixture-right]')?.textContent).toBe('Beta')
    expect(document.querySelector('[data-lf-frame-statusbar]')?.textContent).toContain('当前 Beta')
  })

  it('collapses and reopens the right panel from the header control and the rail', () => {
    setup()
    expect(document.querySelector('[data-lf-frame-right]')).not.toBeNull()

    fireEvent.click(document.querySelector('[data-lf-frame-collapse-right]') as HTMLElement)
    expect(document.querySelector('[data-lf-frame-right]')).toBeNull()
    expect(frameStore.getState().layouts['frame.fixture']?.rightCollapsed).toBe(true)

    fireEvent.click(document.querySelector('[data-lf-frame-right-rail]') as HTMLElement)
    expect(document.querySelector('[data-lf-frame-right]')).not.toBeNull()

    fireEvent.click(document.querySelector('[data-lf-frame-toggle-right]') as HTMLElement)
    expect(document.querySelector('[data-lf-frame-right]')).toBeNull()
  })

  it('resizes the side panels from the keyboard and keeps ARIA values in sync', () => {
    setup()

    const left = resizer('left')
    const startLeft = Number(left.getAttribute('aria-valuenow'))
    fireEvent.keyDown(left, { key: 'ArrowRight' })
    expect(Number(resizer('left').getAttribute('aria-valuenow'))).toBe(
      Math.min(startLeft + 8, 460),
    )

    const right = resizer('right')
    const startRight = Number(right.getAttribute('aria-valuenow'))
    fireEvent.keyDown(right, { key: 'ArrowLeft' })
    expect(Number(resizer('right').getAttribute('aria-valuenow'))).toBe(startRight + 8)
  })

  it('shows the empty state until an app registers', () => {
    render(
      <>
        <FolioUiHost />
        <FrameWorkbench />
      </>,
    )

    expect(document.querySelector('[data-lf-frame-empty]')).not.toBeNull()
  })

  it('switches apps from the framework-owned switcher', () => {
    const otherApp: FrameAppDefinition = {
      id: 'frame.other',
      title: '其他应用',
      order: 20,
      Main: () => <div data-lf-other-main="">其他应用内容</div>,
    }
    const service = createService()
    service.registerApp(fixtureApp)
    service.registerApp(otherApp)
    render(
      <>
        <FolioUiHost />
        <FrameWorkbench />
      </>,
    )

    const trigger = document.querySelector('[data-lf-frame-app-switcher]') as HTMLButtonElement
    expect(trigger).not.toBeNull()
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    const item = document.querySelector('[data-lf-frame-app="frame.other"]') as HTMLElement | null
    expect(item).not.toBeNull()
    fireEvent.click(item as HTMLElement)

    expect(document.querySelector('[data-lf-other-main]')).not.toBeNull()
    expect(frameStore.getState().activeAppId).toBe('frame.other')
  })
})
