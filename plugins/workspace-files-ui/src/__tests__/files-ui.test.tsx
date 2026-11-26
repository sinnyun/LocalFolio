// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { WorkspaceViewProps } from '@folio/base-contract'
import { FolioUiHost } from '@folio/base-ui-kit/client'
import { FrameWorkbench } from '../../../base-frame-ui/src/frame/FrameWorkbench.js'
import { createFolioFrameService } from '../../../base-frame-ui/src/frame/service.js'
import { frameStore } from '../../../base-frame-ui/src/frame/store.js'
import { createFilesApp } from '../client.js'
import { filterEntries, formatBytes, groupEntries, sortEntries } from '../format.js'
import type { DirChildGroup, FileEntry } from '../types.js'

const NOW = new Date(2026, 10, 26, 15, 0, 0).getTime()

function makeEntry(overrides: Partial<FileEntry> & { name: string }): FileEntry {
  const isDir = overrides.isDir ?? false
  return {
    name: overrides.name,
    path: overrides.path ?? `C:\\Data\\${overrides.name}`,
    ext: overrides.ext ?? (isDir ? '' : '.txt'),
    isDir,
    isSymlink: false,
    isHidden: false,
    size: isDir ? 0 : (overrides.size ?? 1024),
    mtimeMs: overrides.mtimeMs ?? NOW,
    ctimeMs: overrides.ctimeMs ?? NOW,
    category: overrides.category ?? (isDir ? 'folder' : 'document'),
    mime: overrides.mime ?? (isDir ? 'inode/directory' : 'text/plain'),
    thumbSupported: overrides.thumbSupported ?? false,
  }
}

describe('format & grouping helpers', () => {
  it('formats sizes, filters, sorts, and groups by time, type, name, and parent-child', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')

    const entries: FileEntry[] = [
      makeEntry({ name: 'Photos', isDir: true, category: 'folder', mtimeMs: NOW }),
      makeEntry({
        name: 'sunset.png',
        ext: '.png',
        category: 'image',
        mime: 'image/png',
        size: 4096,
        mtimeMs: NOW - 86_400_000,
        thumbSupported: true,
      }),
      makeEntry({
        name: '2026-plan.md',
        ext: '.md',
        category: 'document',
        size: 512,
        mtimeMs: NOW - 3 * 86_400_000,
      }),
      makeEntry({
        name: '笔记.txt',
        ext: '.txt',
        category: 'document',
        size: 256,
        mtimeMs: NOW - 400 * 86_400_000,
      }),
    ]

    expect(filterEntries(entries, 'sun', 'all').map(e => e.name)).toEqual(['sunset.png'])
    expect(filterEntries(entries, '', 'document').map(e => e.name)).toEqual([
      '2026-plan.md',
      '笔记.txt',
    ])
    expect(sortEntries(entries, 'size', 'desc').map(e => e.name)).toEqual([
      'Photos',
      'sunset.png',
      '2026-plan.md',
      '笔记.txt',
    ])

    const byTime = groupEntries(entries, 'time', [], 'name', 'asc', '', 'all', new Date(NOW))
    expect(byTime.map(g => g.title)).toEqual(['今天', '昨天', '本周', '更早'])

    const byType = groupEntries(entries, 'type', [], 'name', 'asc', '', 'all', new Date(NOW))
    expect(byType.map(g => g.title)).toEqual(['文件夹', '图片', '文档'])

    const byName = groupEntries(entries, 'name', [], 'name', 'asc', '', 'all', new Date(NOW))
    expect(byName.map(g => g.title)).toEqual(['0-9', 'P', 'S', '中文与符号'])

    const childGroups: DirChildGroup[] = [
      {
        folderName: 'Photos',
        folderPath: 'C:\\Data\\Photos',
        entries: [
          makeEntry({
            name: 'inside.png',
            path: 'C:\\Data\\Photos\\inside.png',
            ext: '.png',
            category: 'image',
          }),
        ],
        totalChildren: 1,
        truncated: false,
      },
    ]
    const byParent = groupEntries(entries, 'parent', childGroups, 'name', 'asc', '', 'all', new Date(NOW))
    expect(byParent.map(g => g.title)).toEqual(['当前目录文件', 'Photos'])
    expect(byParent[1]?.entries.map(e => e.name)).toEqual(['inside.png'])
  })
})

function findByDataAttr(attr: string, value: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll(`[${attr}]`))
  return (nodes.find(el => el.getAttribute(attr) === value) as HTMLElement | undefined) ?? null
}

describe('@folio/workspace-files-ui integration', () => {
  const rpcCalls: Array<{ actionId: string; input: unknown }> = []
  const writeTextMock = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    frameStore.reset()
    window.localStorage.clear()
    rpcCalls.length = 0
    writeTextMock.mockClear()

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextMock },
    })

    const dataEntries: FileEntry[] = [
      makeEntry({
        name: 'SubFolder',
        path: 'C:\\Data\\SubFolder',
        isDir: true,
        category: 'folder',
      }),
      makeEntry({
        name: 'hero.png',
        path: 'C:\\Data\\hero.png',
        ext: '.png',
        category: 'image',
        mime: 'image/png',
        size: 2048,
        thumbSupported: true,
      }),
      makeEntry({
        name: 'readme.md',
        path: 'C:\\Data\\readme.md',
        ext: '.md',
        category: 'document',
        size: 320,
      }),
    ]

    const subEntries: FileEntry[] = [
      makeEntry({
        name: 'nested.jpg',
        path: 'C:\\Data\\SubFolder\\nested.jpg',
        ext: '.jpg',
        category: 'image',
        mime: 'image/jpeg',
        size: 4096,
        thumbSupported: true,
      }),
    ]

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const actionId = decodeURIComponent(url.split('/lf/rpc/')[1] ?? '')
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
        rpcCalls.push({ actionId, input: body })

        const okJson = (data: unknown): Response =>
          new Response(JSON.stringify({ ok: true, data }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })

        if (actionId === 'files.roots') {
          return okJson({
            homePath: 'C:\\Data',
            platform: 'win32',
            quickFolders: [
              { id: 'home', name: '主目录', path: 'C:\\Data', kind: 'home', pinned: false },
              { id: 'desktop', name: '桌面', path: 'C:\\Data\\Desktop', kind: 'desktop', pinned: false },
            ],
            drives: [
              {
                id: 'C:',
                name: '本地磁盘 (C:)',
                path: 'C:\\',
                label: '',
                kind: 'fixed',
                totalBytes: 100 * 1024 ** 3,
                freeBytes: 40 * 1024 ** 3,
                usedBytes: 60 * 1024 ** 3,
              },
            ],
            pinnedFolders: [],
          })
        }

        if (actionId === 'files.list') {
          const reqPath = String(body.path ?? 'C:\\Data')
          if (reqPath === 'C:\\Data\\SubFolder') {
            return okJson({
              path: 'C:\\Data\\SubFolder',
              parentPath: 'C:\\Data',
              breadcrumbs: [
                { name: 'C:', path: 'C:\\' },
                { name: 'Data', path: 'C:\\Data' },
                { name: 'SubFolder', path: 'C:\\Data\\SubFolder' },
              ],
              entries: subEntries,
              childGroups: [],
              totalEntries: subEntries.length,
              truncated: false,
            })
          }
          return okJson({
            path: 'C:\\Data',
            parentPath: 'C:\\',
            breadcrumbs: [
              { name: 'C:', path: 'C:\\' },
              { name: 'Data', path: 'C:\\Data' },
            ],
            entries: dataEntries,
            childGroups: body.includeSubdirChildren
              ? [
                  {
                    folderName: 'SubFolder',
                    folderPath: 'C:\\Data\\SubFolder',
                    entries: subEntries,
                    totalChildren: 1,
                    truncated: false,
                  },
                ]
              : [],
            totalEntries: dataEntries.length,
            truncated: false,
          })
        }

        if (actionId === 'files.tree') {
          return okJson({
            path: String(body.path ?? ''),
            children: [{ name: 'SubFolder', path: 'C:\\Data\\SubFolder', hasSubdirs: false }],
          })
        }

        if (actionId === 'files.inspect') {
          const target = String(body.path ?? '')
          const found = [...dataEntries, ...subEntries].find(e => e.path === target) ?? dataEntries[1]
          return okJson({
            entry: found,
            resolvedPath: found.path,
            parentPath: 'C:\\Data',
            readonly: false,
            childCount: null,
            folderChildCount: null,
            fileChildCount: null,
            imageDimensions: found.category === 'image' ? { width: 1920, height: 1080 } : null,
            textPreview: found.name === 'readme.md' ? '# Readme' : null,
            textTruncated: false,
            mediaUrl: found.category === 'image' ? `/lf/files/media?path=${encodeURIComponent(found.path)}` : null,
            thumbUrl: found.thumbSupported ? `/lf/files/thumb?path=${encodeURIComponent(found.path)}` : null,
          })
        }

        if (actionId === 'files.reveal') {
          return okJson({ revealedPath: body.path })
        }

        return okJson({})
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  function mountWorkspace() {
    const service = createFolioFrameService({ View: FrameWorkbench })
    service.registerApp(createFilesApp())
    render(
      <>
        <FolioUiHost />
        <service.WorkspaceHost {...({ workspaceId: 'files' } as WorkspaceViewProps)} />
      </>,
    )
  }

  it('renders sidebar roots, tree expansion, dual-pane, view/filter/group controls, and right inspector actions', async () => {
    mountWorkspace()

    await waitFor(() => {
      expect(screen.getByText('hero.png')).toBeTruthy()
      expect(findByDataAttr('data-lf-quick-folder', 'C:\\Data')).not.toBeNull()
    })

    // Sidebar quick folders & drives
    expect(findByDataAttr('data-lf-drive', 'C:')?.textContent).toContain('60%')

    // Expand drive in file tree
    const treeToggle = findByDataAttr('data-lf-tree-toggle', 'C:\\') as HTMLButtonElement
    fireEvent.click(treeToggle)
    await waitFor(() => {
      expect(findByDataAttr('data-lf-tree-select', 'C:\\Data\\SubFolder')).not.toBeNull()
    })

    // Select hero.png and verify right inspector metadata, copy path, and explorer reveal
    fireEvent.click(findByDataAttr('data-lf-file-item', 'C:\\Data\\hero.png')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-files-inspector]')?.textContent).toContain('1920 × 1080')
    })

    fireEvent.click(document.querySelector('[data-lf-inspector-copy-path]')!)
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('C:\\Data\\hero.png')
    })

    fireEvent.click(document.querySelector('[data-lf-inspector-reveal]')!)
    await waitFor(() => {
      expect(rpcCalls.some(c => c.actionId === 'files.reveal')).toBe(true)
    })

    // Collapse & reopen right inspector using frame control
    fireEvent.click(document.querySelector('[data-lf-frame-collapse-right]')!)
    expect(document.querySelector('[data-lf-frame-right]')).toBeNull()
    fireEvent.click(document.querySelector('[data-lf-frame-right-rail]')!)
    expect(document.querySelector('[data-lf-frame-right]')).not.toBeNull()

    // Filter files in left pane
    const filterInput = document.querySelector('[data-lf-files-filter="left"]') as HTMLInputElement
    fireEvent.change(filterInput, { target: { value: 'readme' } })
    expect(findByDataAttr('data-lf-file-item', 'C:\\Data\\hero.png')).toBeNull()
    expect(findByDataAttr('data-lf-file-item', 'C:\\Data\\readme.md')).not.toBeNull()
    fireEvent.change(filterInput, { target: { value: '' } })

    // Adjust grid size slider and switch to list view and back
    const gridSlider = document.querySelector('[data-lf-files-grid-size="left"]') as HTMLInputElement
    fireEvent.change(gridSlider, { target: { value: '192' } })
    expect(
      (document.querySelector('[data-lf-files-grid="left"]') as HTMLElement).style.gridTemplateColumns,
    ).toContain('192px')

    fireEvent.click(document.querySelector('[data-lf-files-view-list="left"]')!)
    expect(document.querySelector('[data-lf-files-list="left"]')).not.toBeNull()
    fireEvent.click(document.querySelector('[data-lf-files-view-grid="left"]')!)

    // Editable path navigation + back/forward
    fireEvent.click(document.querySelector('[data-lf-files-edit-path="left"]')!)
    const pathInput = document.querySelector('[data-lf-files-path-input="left"]') as HTMLInputElement
    fireEvent.change(pathInput, { target: { value: 'C:\\Data\\SubFolder' } })
    fireEvent.submit(pathInput.closest('form')!)

    await waitFor(() => {
      expect(findByDataAttr('data-lf-file-item', 'C:\\Data\\SubFolder\\nested.jpg')).not.toBeNull()
    })

    fireEvent.click(document.querySelector('[data-lf-files-back="left"]')!)
    await waitFor(() => {
      expect(findByDataAttr('data-lf-file-item', 'C:\\Data\\hero.png')).not.toBeNull()
    })
    fireEvent.click(document.querySelector('[data-lf-files-forward="left"]')!)
    await waitFor(() => {
      expect(findByDataAttr('data-lf-file-item', 'C:\\Data\\SubFolder\\nested.jpg')).not.toBeNull()
    })

    // Up navigation back to C:\Data
    fireEvent.click(document.querySelector('[data-lf-files-up="left"]')!)
    await waitFor(() => {
      expect(findByDataAttr('data-lf-file-item', 'C:\\Data\\hero.png')).not.toBeNull()
    })

    // Toggle dual pane
    fireEvent.click(document.querySelector('[data-lf-files-dual-toggle]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-files-pane="right"]')).not.toBeNull()
    })
  })
})
