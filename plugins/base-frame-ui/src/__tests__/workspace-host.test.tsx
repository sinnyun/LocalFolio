// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { WorkspaceViewProps } from '@folio/base-contract'
import { createFolioFrameService } from '../frame/service.js'
import { frameStore } from '../frame/store.js'

afterEach(() => {
  cleanup()
  frameStore.reset()
})

const viewProps = { workspaceId: 'notes' } as WorkspaceViewProps

describe('folioFrame.WorkspaceHost', () => {
  it('renders the frame view and attaches itself as the host while mounted', () => {
    const View = (): React.ReactElement => <div data-testid="frame-view">四区</div>
    const opened: string[] = []
    const service = createFolioFrameService({
      View,
      openWorkspace: workspaceId => opened.push(workspaceId),
    })

    service.registerApp({ id: 'notes.workbench', title: '笔记', Main: View })

    const { unmount } = render(<service.WorkspaceHost {...viewProps} />)
    expect(screen.getByTestId('frame-view').textContent).toBe('四区')

    // Only an attached host may navigate; before mount nothing had claimed it.
    service.openApp('notes.workbench')
    expect(opened).toEqual(['notes'])

    unmount()
    service.openApp('notes.workbench')
    expect(opened).toEqual(['notes'])
  })
})
