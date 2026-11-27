// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ProjectsUiExtensionContext } from '@folio/base-contract'
import { MissingThumbsToolbarControl } from '../components/MissingThumbsDialog.js'

afterEach(() => vi.unstubAllGlobals())

it('submits only the selected archived paths even when Eagle is offline', async () => {
  const ctx: ProjectsUiExtensionContext = {
    selectedProject: {
      id: 'project', name: '归档项目', libraryId: 'library', path: 'D:/归档项目',
      fileCount: 2, totalBytes: 9, archived: true,
    },
    selectedFile: null,
    projectArchive: null,
    notify: vi.fn(),
    onTaskEnqueued: vi.fn(),
    refreshProjects: async () => {},
    refreshSelectedProject: async () => {},
    openFile: async () => {},
    revealPath: async () => {},
  }
  const task = { id: 'thumb-task' }
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => {
    let data: unknown = { online: false }
    if (url.endsWith('thumbs.eagle.project.inspect')) {
      data = {
        projectId: 'project', readyCount: 0, missingCount: 0, ignoredCount: 0, missingGroups: [],
        archivedItems: [{ relPath: '设计/a.psd', size: 4 }, { relPath: '设计/b.psb', size: 5 }],
      }
    } else if (url.endsWith('archive.project.rebuildThumbs')) {
      data = { task }
    }
    return new Response(JSON.stringify({ ok: true, data }))
  })
  vi.stubGlobal('fetch', fetch)
  render(<MissingThumbsToolbarControl ctx={ctx} />)
  fireEvent.click(screen.getByTitle('查看缩略图并补图'))
  fireEvent.click(await screen.findByRole('checkbox', { name: /a\.psd/ }))
  fireEvent.click(screen.getByRole('button', { name: '从归档补缩略图' }))
  await waitFor(() => expect(ctx.onTaskEnqueued).toHaveBeenCalledWith(task))
  const request = fetch.mock.calls.find(([url]) => url.endsWith('archive.project.rebuildThumbs'))
  expect(JSON.parse(String(request?.[1]?.body))).toEqual({ projectId: 'project', relPaths: ['设计/a.psd'] })
})
