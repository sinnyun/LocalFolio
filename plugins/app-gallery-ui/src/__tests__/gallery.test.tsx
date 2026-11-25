// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FolioUiHost, getPortalContainer } from '@folio/core-ui-kit/client'
import { ImageGalleryView } from '../client.js'

afterEach(() => {
  cleanup()
})

describe('@folio/app-gallery-ui', () => {
  it('composes @folio/core-ui-kit shared primitives, filters categories, and opens Lightbox in portal root', () => {
    render(
      <>
        <FolioUiHost />
        <ImageGalleryView />
      </>,
    )

    expect(screen.getByText('A studio archive, gridded.')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Open image/i })).toHaveLength(8)

    const printTab = screen.getByRole('tab', { name: /Print/i })
    fireEvent.mouseDown(printTab)
    fireEvent.click(printTab)
    expect(screen.getByText('No print work yet')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show all work' }))
    const firstTile = screen.getAllByRole('button', { name: /Open image 1 of 8/i })[0]!
    fireEvent.click(firstTile)

    const portalRoot = getPortalContainer()
    expect(portalRoot?.querySelector('[data-slot="lightbox-content"]')).not.toBeNull()
  })
})
