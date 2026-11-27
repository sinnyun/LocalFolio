// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { FolioInteractionsService, WorkspaceViewProps } from '@folio/base-contract'
import { FolioUiHost } from '@folio/base-ui-kit/client'
import { FrameWorkbench } from '../../../base-frame-ui/src/frame/FrameWorkbench.js'
import { createFolioFrameService } from '../../../base-frame-ui/src/frame/service.js'
import { frameStore } from '../../../base-frame-ui/src/frame/store.js'
import {
  FallbackContextMenuHost,
  createFallbackMenuStore,
  createFolioInteractionsService,
} from '../../../bridge-dsh-interactions-ui/src/client.js'
import type { DshFileDragLike } from '../../../bridge-dsh-interactions-ui/src/dsh-adapters.js'
import { createFilesApp } from '../client.js'
import { filterEntries, formatBytes, groupEntries, sortEntries, toPathKey } from '../format.js'
import type {
  DirChildGroup,
  FavoritesState,
  FileEntry,
  FileMetaRecord,
  TagDef,
} from '../types.js'

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

function findByDataAttr(attr: string, value: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll(`[${attr}]`))
  return (nodes.find(el => el.getAttribute(attr) === value) as HTMLElement | undefined) ?? null
}

describe('format & grouping helpers', () => {
  it('formats sizes, filters, sorts, and groups by time, type, name, rating, and parent-child', () => {
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

    const metaMap: Record<string, FileMetaRecord> = {
      'c:\\data\\sunset.png': {
        path: 'C:\\Data\\sunset.png',
        rating: 5,
        tagIds: [],
        note: '',
        updatedAt: NOW,
      },
      'c:\\data\\2026-plan.md': {
        path: 'C:\\Data\\2026-plan.md',
        rating: 2,
        tagIds: [],
        note: '',
        updatedAt: NOW,
      },
    }

    expect(filterEntries(entries, 'sun', 'all').map(e => e.name)).toEqual(['sunset.png'])
    expect(filterEntries(entries, '', 'document').map(e => e.name)).toEqual([
      '2026-plan.md',
      '笔记.txt',
    ])
    expect(filterEntries(entries, '', 'all', metaMap, 4).map(e => e.name)).toEqual(['sunset.png'])
    expect(sortEntries(entries, 'size', 'desc').map(e => e.name)).toEqual([
      'Photos',
      'sunset.png',
      '2026-plan.md',
      '笔记.txt',
    ])
    expect(
      sortEntries(entries, 'rating', 'desc', false, metaMap)
        .slice(0, 2)
        .map(e => e.name),
    ).toEqual(['sunset.png', '2026-plan.md'])

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

    // Tag mode parent grouping derives groups directly from aggregated entries
    const tagEntries = [
      makeEntry({ name: 'a.png', path: 'C:\\Work\\a.png', ext: '.png', category: 'image' }),
      makeEntry({ name: 'b.png', path: 'C:\\Archive\\b.png', ext: '.png', category: 'image' }),
    ]
    const byTagParent = groupEntries(
      tagEntries,
      'parent',
      [],
      'name',
      'asc',
      '',
      'all',
      new Date(NOW),
      undefined,
      0,
      'tag',
    )
    expect(byTagParent.map(g => g.title)).toEqual(['Archive', 'Work'])
  })
})

describe('@folio/workspace-files-ui integration', () => {
  const rpcCalls: Array<{ actionId: string; input: unknown }> = []
  const writeTextMock = vi.fn().mockResolvedValue(undefined)

  let favoritesState: FavoritesState
  let tagsState: TagDef[]
  let filesMetaState: Record<string, FileMetaRecord>

  beforeEach(() => {
    frameStore.reset()
    window.localStorage.clear()
    rpcCalls.length = 0
    writeTextMock.mockClear()

    favoritesState = {
      version: 1,
      groups: [{ id: 'default', name: '常用收藏', color: '#3b82f6', order: 0 }],
      items: [],
    }
    tagsState = [
      { id: 'tag_existing', name: '设计稿', color: '#8b5cf6', description: '', createdAt: NOW },
    ]
    filesMetaState = {}

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

    const allKnownEntries = [...dataEntries, ...subEntries]

    const computeCounts = (): Record<string, number> => {
      const counts: Record<string, number> = {}
      for (const t of tagsState) counts[t.id] = 0
      for (const rec of Object.values(filesMetaState)) {
        for (const tid of rec.tagIds) {
          if (tid in counts) counts[tid] += 1
        }
      }
      return counts
    }

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
          const found = allKnownEntries.find(e => e.path === target) ?? dataEntries[1]
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

        // Favorites mocks
        if (actionId === 'files.favorites.get') {
          return okJson(favoritesState)
        }
        if (actionId === 'files.favorites.add') {
          const favPath = String(body.path)
          const favName = String(body.name || favPath.split('\\').pop() || favPath)
          const groupId = String(body.groupId || 'default')
          const existing = favoritesState.items.find(i => i.path.toLowerCase() === favPath.toLowerCase())
          if (existing) {
            favoritesState = {
              ...favoritesState,
              items: favoritesState.items.map(i =>
                i.id === existing.id ? { ...i, name: favName, groupId } : i,
              ),
            }
          } else {
            favoritesState = {
              ...favoritesState,
              items: [
                ...favoritesState.items,
                {
                  id: `fav_${favoritesState.items.length + 1}`,
                  groupId,
                  name: favName,
                  path: favPath,
                  order: favoritesState.items.length,
                  createdAt: NOW,
                },
              ],
            }
          }
          return okJson(favoritesState)
        }
        if (actionId === 'files.favorites.update') {
          const id = String(body.id)
          favoritesState = {
            ...favoritesState,
            items: favoritesState.items.map(i =>
              i.id === id
                ? {
                    ...i,
                    name: body.name !== undefined ? String(body.name) : i.name,
                    groupId: body.groupId !== undefined ? String(body.groupId) : i.groupId,
                  }
                : i,
            ),
          }
          return okJson(favoritesState)
        }
        if (actionId === 'files.favorites.remove') {
          favoritesState = {
            ...favoritesState,
            items: favoritesState.items.filter(
              i =>
                i.id !== body.id &&
                (!body.path || i.path.toLowerCase() !== String(body.path).toLowerCase()),
            ),
          }
          return okJson(favoritesState)
        }
        if (actionId === 'files.favorites.group.create') {
          favoritesState = {
            ...favoritesState,
            groups: [
              ...favoritesState.groups,
              {
                id: `grp_${favoritesState.groups.length + 1}`,
                name: String(body.name),
                color: String(body.color || '#10b981'),
                order: favoritesState.groups.length,
              },
            ],
          }
          return okJson(favoritesState)
        }

        // Metadata & Tag mocks
        if (actionId === 'files.meta.get') {
          return okJson({ tags: tagsState, files: filesMetaState, tagCounts: computeCounts() })
        }
        if (actionId === 'files.meta.set') {
          const filePath = String(body.path)
          const key = toPathKey(filePath)
          const prev = filesMetaState[key]
          const rating = body.rating !== undefined ? Number(body.rating) : (prev?.rating ?? 0)
          const tagIds = body.tagIds !== undefined ? (body.tagIds as string[]) : (prev?.tagIds ?? [])
          const note = body.note !== undefined ? String(body.note) : (prev?.note ?? '')
          if (rating === 0 && tagIds.length === 0 && note.trim() === '') {
            delete filesMetaState[key]
          } else {
            filesMetaState[key] = { path: filePath, rating, tagIds, note, updatedAt: NOW }
          }
          return okJson({
            key,
            record: filesMetaState[key] ?? null,
            tagCounts: computeCounts(),
          })
        }
        if (actionId === 'files.tags.create') {
          const newTag: TagDef = {
            id: `tag_${tagsState.length + 1}`,
            name: String(body.name),
            color: String(body.color || '#3b82f6'),
            description: String(body.description || ''),
            createdAt: NOW,
          }
          tagsState = [...tagsState, newTag]
          return okJson({ tag: newTag, tags: tagsState, tagCounts: computeCounts() })
        }
        if (actionId === 'files.tags.update') {
          const id = String(body.id)
          tagsState = tagsState.map(t =>
            t.id === id
              ? {
                  ...t,
                  name: body.name !== undefined ? String(body.name) : t.name,
                  color: body.color !== undefined ? String(body.color) : t.color,
                  description:
                    body.description !== undefined ? String(body.description) : t.description,
                }
              : t,
          )
          return okJson({
            tag: tagsState.find(t => t.id === id),
            tags: tagsState,
            tagCounts: computeCounts(),
          })
        }
        if (actionId === 'files.tags.delete') {
          const id = String(body.id)
          tagsState = tagsState.filter(t => t.id !== id)
          for (const [k, rec] of Object.entries(filesMetaState)) {
            const nextTagIds = rec.tagIds.filter(tid => tid !== id)
            if (rec.rating === 0 && nextTagIds.length === 0 && rec.note.trim() === '') {
              delete filesMetaState[k]
            } else {
              filesMetaState[k] = { ...rec, tagIds: nextTagIds }
            }
          }
          return okJson({ tags: tagsState, files: filesMetaState, tagCounts: computeCounts() })
        }
        if (actionId === 'files.tags.files') {
          const tagId = String(body.tagId)
          const tag = tagsState.find(t => t.id === tagId)!
          const matchedEntries = allKnownEntries.filter(entry =>
            filesMetaState[toPathKey(entry.path)]?.tagIds.includes(tagId),
          )
          return okJson({
            tag,
            entries: matchedEntries,
            missingPaths: [],
            totalCount: matchedEntries.length,
          })
        }

        return okJson({})
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  function mountWorkspace(interactions?: FolioInteractionsService, extra?: React.ReactNode) {
    const service = createFolioFrameService({ View: FrameWorkbench })
    service.registerApp(createFilesApp(interactions ? () => interactions : undefined))
    render(
      <>
        <FolioUiHost />
        {extra}
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

    // Adjust the card-size slider and verify the tile geometry follows it
    const gridSlider = document.querySelector('[data-lf-files-grid-size="left"]') as HTMLInputElement
    fireEvent.change(gridSlider, { target: { value: '192' } })
    expect(gridSlider.value).toBe('192')
    const tile = document.querySelector('[data-lf-collection-item]') as HTMLElement
    expect(tile.style.width).toBe('223px')

    fireEvent.click(document.querySelector('[data-lf-files-view-list="left"]')!)
    expect(document.querySelector('[data-lf-files-list="left"]')).not.toBeNull()
    expect(document.querySelector('[data-lf-files-list-header="left"]')).not.toBeNull()
    fireEvent.click(document.querySelector('[data-lf-files-view-waterfall="left"]')!)
    expect(document.querySelector('[data-lf-files-waterfall="left"]')).not.toBeNull()
    fireEvent.click(document.querySelector('[data-lf-files-view-equal="left"]')!)
    expect(document.querySelector('[data-lf-files-equal="left"]')).not.toBeNull()
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

  it('supports grouped folder favorites, inspector ratings/tags/notes, tag manager, and tag aggregation view', async () => {
    mountWorkspace()

    await waitFor(() => {
      expect(screen.getByText('hero.png')).toBeTruthy()
      expect(findByDataAttr('data-lf-sidebar-tag', 'tag_existing')).not.toBeNull()
    })

    // 1. Add current folder to Favorites from sidebar and manage groups in dialog
    fireEvent.click(document.querySelector('[data-lf-fav-add-current]')!)
    await waitFor(() => {
      expect(findByDataAttr('data-lf-favorite-item', 'C:\\Data')).not.toBeNull()
    })

    fireEvent.click(document.querySelector('[data-lf-fav-manage]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-favorites-dialog]')).not.toBeNull()
    })

    const newGrpInput = document.querySelector('[data-lf-fav-new-group-input]') as HTMLInputElement
    fireEvent.change(newGrpInput, { target: { value: '素材分组' } })
    fireEvent.click(document.querySelector('[data-lf-fav-new-group-submit]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-fav-group-select="grp_2"]')?.textContent).toBe(
        '素材分组',
      )
    })
    fireEvent.click(screen.getByRole('button', { name: '完成' }))

    // 2. Select hero.png and set star rating, quick-create tag, and save note in Right Inspector
    fireEvent.click(findByDataAttr('data-lf-file-item', 'C:\\Data\\hero.png')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-inspector-meta]')).not.toBeNull()
    })

    fireEvent.click(document.querySelector('[data-lf-inspector-star="4"]')!)
    await waitFor(() => {
      expect(
        findByDataAttr('data-lf-file-item', 'C:\\Data\\hero.png')?.querySelector(
          '[data-lf-entry-rating="4"]',
        ),
      ).not.toBeNull()
    })

    const tagInput = document.querySelector('[data-lf-inspector-tag-input]') as HTMLInputElement
    fireEvent.change(tagInput, { target: { value: '精选封面' } })
    fireEvent.click(document.querySelector('[data-lf-inspector-tag-quick-create]')!)

    await waitFor(() => {
      expect(findByDataAttr('data-lf-sidebar-tag', 'tag_2')?.textContent).toContain('精选封面')
    })

    const noteBox = document.querySelector('[data-lf-inspector-note]') as HTMLTextAreaElement
    fireEvent.change(noteBox, { target: { value: '首页轮播主图' } })
    fireEvent.blur(noteBox)

    await waitFor(() => {
      expect(
        rpcCalls.some(
          c =>
            c.actionId === 'files.meta.set' &&
            (c.input as { note?: string }).note === '首页轮播主图',
        ),
      ).toBe(true)
    })

    // 3. Open Tag Manager Dialog and create/delete a temporary tag
    fireEvent.click(document.querySelector('[data-lf-tags-manage]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-tag-manager-dialog]')).not.toBeNull()
    })

    const mgrInput = document.querySelector('[data-lf-tag-manager-new-name]') as HTMLInputElement
    fireEvent.change(mgrInput, { target: { value: '临时归档' } })
    fireEvent.click(document.querySelector('[data-lf-tag-manager-create]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-tag-manager-item="tag_3"]')).not.toBeNull()
    })

    fireEvent.click(document.querySelector('[data-lf-tag-delete="tag_3"]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-tag-manager-item="tag_3"]')).toBeNull()
    })
    fireEvent.click(screen.getByRole('button', { name: '完成' }))

    // 4. Click tag in Left Sidebar to open Tag Aggregation View in Center Pane, then navigate Back
    fireEvent.click(findByDataAttr('data-lf-sidebar-tag', 'tag_2')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-pane-tag-header="left"]')?.textContent).toContain(
        '精选封面',
      )
      expect(findByDataAttr('data-lf-file-item', 'C:\\Data\\hero.png')).not.toBeNull()
      expect(findByDataAttr('data-lf-file-item', 'C:\\Data\\readme.md')).toBeNull()
    })

    fireEvent.click(document.querySelector('[data-lf-files-back="left"]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-files-breadcrumbs="left"]')).not.toBeNull()
      expect(findByDataAttr('data-lf-file-item', 'C:\\Data\\readme.md')).not.toBeNull()
    })
  })

  it('supports bridged context menu actions and native file drag on entries', async () => {
    const fallbackMenu = createFallbackMenuStore()
    const startMock = vi.fn(() => false)
    const releaseMock = vi.fn()
    const prepareMock = vi.fn(async () => ({
      start: startMock,
      release: releaseMock,
    }))
    const fileDrag: DshFileDragLike = {
      actions: {
        prepare: prepareMock,
        reportFailure: vi.fn(),
      },
      read: () => undefined,
    }
    const copyImageMock = vi.fn(async () => {})
    const saveMock = vi.fn(async () => undefined)
    const interactions = createFolioInteractionsService({
      resolveContextMenus: () => undefined,
      resolveFileDrag: () => fileDrag,
      resolveFileActions: () => ({
        canSaveAs: true,
        save: saveMock,
        copyImage: copyImageMock,
      }),
      fallbackMenu,
    })

    mountWorkspace(
      interactions,
      <FallbackContextMenuHost store={fallbackMenu} onError={() => {}} />,
    )

    const heroItem = await waitFor(() => {
      const el = findByDataAttr('data-lf-file-item', 'C:\\Data\\hero.png')
      expect(el).not.toBeNull()
      return el!
    })

    // 1. Native context menu contribution + fallback menu + DSH fileActions bridge
    fireEvent.contextMenu(heroItem, { clientX: 120, clientY: 96 })
    await waitFor(() => {
      expect(document.querySelector('[data-lf-fallback-menuitem="files.open-lightbox"]')).not.toBeNull()
      expect(document.querySelector('[data-lf-fallback-menuitem="files.rating"]')).not.toBeNull()
      expect(document.querySelector('[data-lf-fallback-menuitem="files.tags"]')).not.toBeNull()
      expect(document.querySelector('[data-lf-fallback-menuitem="files.copy-image"]')).not.toBeNull()
      expect(document.querySelector('[data-lf-fallback-menuitem="files.download"]')).not.toBeNull()
      expect(document.querySelector('[data-lf-fallback-menuitem="files.save-as"]')).not.toBeNull()
      expect(document.querySelector('[data-lf-fallback-menuitem="files.copy-path"]')).not.toBeNull()
      expect(document.querySelector('[data-lf-fallback-menuitem="files.reveal"]')).not.toBeNull()
    })

    fireEvent.click(document.querySelector('[data-lf-fallback-menuitem="files.copy-image"]')!)
    await waitFor(() => {
      expect(copyImageMock).toHaveBeenCalledWith({
        url: `/lf/files/media?path=C%3A%5CData%5Chero.png&v=${NOW}`,
        name: 'hero.png',
        mediaType: 'image/png',
      })
    })

    // Rating submenu action triggers meta update
    fireEvent.contextMenu(heroItem, { clientX: 120, clientY: 96 })
    await waitFor(() => {
      expect(document.querySelector('[data-lf-fallback-menuitem="files.rating"]')).not.toBeNull()
    })
    fireEvent.click(document.querySelector('[data-lf-fallback-menuitem="files.rating"]')!)
    await waitFor(() => {
      expect(document.querySelector('[data-lf-fallback-menuitem="files.rating.5"]')).not.toBeNull()
    })
    fireEvent.click(document.querySelector('[data-lf-fallback-menuitem="files.rating.5"]')!)
    await waitFor(() => {
      expect(rpcCalls.some(c => c.actionId === 'files.meta.set')).toBe(true)
    })

    // 2. Native file drag: pointerDown prepares DSH session; Desktop start()===false prevents HTML5 fallback drag
    expect(heroItem.getAttribute('draggable')).toBe('true')
    fireEvent.pointerDown(heroItem)
    await waitFor(() => {
      expect(prepareMock).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'url',
          url: `/lf/files/download?path=C%3A%5CData%5Chero.png&v=${NOW}`,
          name: 'hero.png',
          mediaType: 'image/png',
        }),
        expect.any(AbortSignal),
      )
    })

    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true })
    Object.defineProperty(dragStart, 'dataTransfer', {
      value: {
        setData: vi.fn(),
        effectAllowed: 'all',
        dropEffect: 'none',
      },
    })
    heroItem.dispatchEvent(dragStart)
    expect(startMock).toHaveBeenCalledTimes(1)
    expect(dragStart.defaultPrevented).toBe(true)

    fireEvent.dragEnd(heroItem)
    expect(releaseMock).toHaveBeenCalledTimes(1)
  })
})
