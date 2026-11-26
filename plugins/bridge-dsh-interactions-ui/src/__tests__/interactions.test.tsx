// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FOLIO_DRAG_MIME } from '@folio/base-contract'
import { FolioUiHost } from '@folio/base-ui-kit/client'
import type {
  DshContextMenusLike,
  DshFileActionsLike,
  DshFileDragLike,
  DshMenuContributionLike,
} from '../dsh-adapters.js'
import { FallbackContextMenuHost, createFallbackMenuStore } from '../fallback-menu.js'
import { createFolioInteractionsService } from '../service.js'

afterEach(() => {
  cleanup()
})

describe('@folio/bridge-dsh-interactions-ui', () => {
  it('delegates context menu registration and opening to DSH contextMenus when present', async () => {
    const registered: DshMenuContributionLike[] = []
    const openSpy = vi.fn()
    const closeSpy = vi.fn()

    const dshMenus: DshContextMenusLike = {
      register(contrib) {
        registered.push(contrib)
        return () => {
          const idx = registered.indexOf(contrib)
          if (idx >= 0) registered.splice(idx, 1)
        }
      },
      open: openSpy,
      close: closeSpy,
      notify: vi.fn(),
    }

    const service = createFolioInteractionsService({
      resolveContextMenus: () => dshMenus,
      resolveFileDrag: () => undefined,
      resolveFileActions: () => undefined,
      fallbackMenu: createFallbackMenuStore(),
    })

    const runSpy = vi.fn()
    const off = service.registerContextMenu({
      id: 'files.test',
      target: 'folio.files.entry',
      order: 10,
      resolve: value => [
        {
          id: 'open',
          label: `打开 ${String(value.path)}`,
          run: runSpy,
        },
      ],
    })

    expect(service.hasNativeContextMenu()).toBe(true)
    expect(registered).toHaveLength(1)

    service.openContextMenu(
      { kind: 'folio.files.entry', value: { path: 'C:\\demo.png' } },
      { x: 120, y: 80 },
    )
    expect(openSpy).toHaveBeenCalledWith(
      { kind: 'folio.files.entry', value: { path: 'C:\\demo.png' } },
      { x: 120, y: 80 },
    )

    const actions = await registered[0]!.resolve({ path: 'C:\\demo.png' }, new AbortController().signal)
    expect(actions[0]?.label).toBe('打开 C:\\demo.png')
    await actions[0]?.run?.()
    expect(runSpy).toHaveBeenCalledTimes(1)

    off()
    expect(registered).toHaveLength(0)
    service.dispose()
  })

  it('renders fallback context menu with submenus when DSH contextMenus is absent', async () => {
    const fallbackMenu = createFallbackMenuStore()
    const service = createFolioInteractionsService({
      resolveContextMenus: () => undefined,
      resolveFileDrag: () => undefined,
      resolveFileActions: () => undefined,
      fallbackMenu,
    })

    const subRun = vi.fn()
    service.registerContextMenu({
      id: 'files.fallback',
      target: 'folio.files.entry',
      order: 10,
      resolve: () => [
        {
          id: 'rate',
          label: '星级评分',
          children: [{ id: 'rate.5', label: '★★★★★ 5 星', run: subRun }],
        },
      ],
    })

    render(
      <>
        <FolioUiHost />
        <FallbackContextMenuHost store={fallbackMenu} onError={() => {}} />
      </>,
    )

    service.openContextMenu({ kind: 'folio.files.entry', value: { path: 'a.txt' } }, { x: 50, y: 50 })

    await waitFor(() => {
      expect(screen.getByText('星级评分')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('星级评分'))
    await waitFor(() => {
      expect(screen.getByText('★★★★★ 5 星')).toBeTruthy()
    })
    fireEvent.click(screen.getByText('★★★★★ 5 星'))
    expect(subRun).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-lf-fallback-context-menu]')).toBeNull()

    service.dispose()
  })

  it('manages DSH fileDrag preparation, Desktop native drag takeover, and fileActions', async () => {
    const startSpy = vi.fn().mockReturnValue(false)
    const releaseSpy = vi.fn()
    const reportFailureSpy = vi.fn()
    const readSpy = vi.fn()

    const dshDrag: DshFileDragLike = {
      actions: {
        prepare: vi.fn(async () => ({
          start: startSpy,
          release: releaseSpy,
        })),
        reportFailure: reportFailureSpy,
      },
      read: readSpy,
    }

    const saveSpy = vi.fn().mockResolvedValue({ status: 'saved', path: 'D:\\out.png' })
    const copySpy = vi.fn().mockResolvedValue(undefined)
    const dshActions: DshFileActionsLike = {
      canSaveAs: true,
      save: saveSpy,
      copyImage: copySpy,
    }

    const service = createFolioInteractionsService({
      resolveContextMenus: () => undefined,
      resolveFileDrag: () => dshDrag,
      resolveFileActions: () => dshActions,
      fallbackMenu: createFallbackMenuStore(),
    })

    expect(service.hasNativeFileDrag()).toBe(true)
    expect(service.canSaveAs()).toBe(true)

    const session = service.createFileDragSession(
      { kind: 'url', url: '/lf/files/download?path=C%3A%5Ca.png', name: 'a.png', mediaType: 'image/png' },
      { paths: ['C:\\a.png'], sourceWorkspace: 'files' },
    )
    session.prepare()
    await waitFor(() => {
      expect(dshDrag.actions.prepare).toHaveBeenCalledTimes(1)
    })

    const dataMap = new Map<string, string>()
    const transfer = {
      setData: (k: string, v: string) => dataMap.set(k, v),
      getData: (k: string) => dataMap.get(k) ?? '',
    } as unknown as DataTransfer

    const el = document.createElement('div')
    const continueBrowserDrag = session.start(transfer, el)
    expect(continueBrowserDrag).toBe(false)
    expect(startSpy).toHaveBeenCalledWith(transfer, el)
    expect(dataMap.get(FOLIO_DRAG_MIME)).toContain('C:\\\\a.png')

    session.release()
    expect(releaseSpy).toHaveBeenCalledTimes(1)

    await service.copyImage({ url: '/lf/files/media?path=a.png', name: 'a.png' })
    expect(copySpy).toHaveBeenCalledTimes(1)
    await service.saveFile({ url: '/lf/files/download?path=a.png', name: 'a.png' }, 'saveAs')
    expect(saveSpy).toHaveBeenCalledWith(
      { url: '/lf/files/download?path=a.png', name: 'a.png' },
      'saveAs',
    )

    service.readDroppedFile(transfer)
    expect(readSpy).toHaveBeenCalledWith(transfer)

    service.dispose()
  })
})
