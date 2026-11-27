// @vitest-environment happy-dom
import * as React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FrameController } from '@folio/base-contract'
import { dispatchFolioTopic } from '@folio/base-contract/rpc'
import { ProjectsInspector } from '../components/ProjectsInspector.js'
import { ProjectsLeft } from '../components/ProjectsLeft.js'
import { ProjectsMain } from '../components/ProjectsMain.js'
import { ProjectsStatus } from '../components/ProjectsStatus.js'
import { ProjectsProvider } from '../context.js'
import type {
  AiStatusResult,
  LibraryIndex,
  ProjectAiSamplePreview,
  ProjectDetailResult,
  TaskSnapshot,
} from '../types.js'

const mockFrame: FrameController = {
  appId: 'projects.library',
  layout: { leftCollapsed: false, leftWidth: 280, rightCollapsed: false, rightWidth: 320 },
  listApps: () => [],
  activateApp: () => {},
  setLeftCollapsed: () => {},
  setRightCollapsed: () => {},
  toggleLeft: () => {},
  toggleRight: () => {},
  setLeftWidth: () => {},
  setRightWidth: () => {},
  resetLayout: () => {},
}

const sampleIndex: LibraryIndex = {
  version: 1,
  libraries: [
    {
      id: 'lib_1',
      name: '2026 归档库',
      rootPath: 'D:\\Archives\\2026',
      addedAt: 1700000000000,
      lastScannedAt: 1700000001000,
      projectCount: 1,
    },
  ],
  projects: [
    {
      id: 'prj_1',
      libraryId: 'lib_1',
      name: 'Brand Campaign',
      path: 'D:\\Archives\\2026\\Brand Campaign',
      coverRelPath: 'renders/hero.jpg',
      coverFingerprint: '1024:1700000000',
      coverThumbKey: 'abc123def456',
      tags: ['KV'],
      summary: '主视觉归档',
      projectType: '平面设计',
      fileCount: 2,
      folderCount: 1,
      totalBytes: 3072,
      lastScannedAt: 1700000001000,
      aiExtractedAt: null,
      hasChanges: true,
      changeSummary: { added: 1, modified: 0, removed: 0 },
      missing: false,
      metaWritable: true,
    },
  ],
}

const multiLibraryIndex: LibraryIndex = {
  version: 1,
  libraries: [
    sampleIndex.libraries[0]!,
    {
      id: 'lib_2',
      name: '2025 归档库',
      rootPath: 'D:\\Archives\\2025',
      addedAt: 1700000000000,
      lastScannedAt: 1700000002000,
      projectCount: 1,
    },
  ],
  projects: [
    sampleIndex.projects[0]!,
    {
      ...sampleIndex.projects[0]!,
      id: 'prj_2',
      libraryId: 'lib_2',
      name: 'Second Campaign',
      path: 'D:\\Archives\\2025\\Second Campaign',
      tags: ['KV', '旧档'],
    },
  ],
}

const sampleDetail: ProjectDetailResult = {
  summary: sampleIndex.projects[0]!,
  manifest: {
    version: 1,
    projectId: 'prj_1',
    name: 'Brand Campaign',
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    lastScannedAt: 1700000001000,
    coverRelPath: 'renders/hero.jpg',
    coverThumbFile: '120-abc123def456.jpg',
    summary: '主视觉归档',
    projectType: '平面设计',
    tags: ['KV'],
    aiExtractedAt: null,
    stats: {
      fileCount: 2,
      folderCount: 1,
      totalBytes: 3072,
      categories: { image: 1, document: 1 },
    },
    fingerprintDigest: 'digest',
    groups: [
      {
        relPath: 'renders',
        name: 'renders',
        depth: 1,
        fileCount: 2,
        totalBytes: 3072,
        files: [
          {
            relPath: 'renders/hero.jpg',
            folderRelPath: 'renders',
            name: 'hero.jpg',
            ext: '.jpg',
            category: 'image',
            mime: 'image/jpeg',
            thumbSupported: true,
            size: 2048,
            mtimeMs: 1700000000000,
            fingerprint: '2048:1700000000000',
            thumbKey: 'abc123def456',
          },
          {
            relPath: 'renders/brief.pdf',
            folderRelPath: 'renders',
            name: 'brief.pdf',
            ext: '.pdf',
            category: 'document',
            mime: 'application/pdf',
            thumbSupported: true,
            size: 1024,
            mtimeMs: 1700000000000,
            fingerprint: '1024:1700000000000',
            thumbKey: 'fff000111222',
          },
        ],
      },
    ],
  },
}

describe('@folio/workspace-projects-ui', () => {
  const fetchSpy = vi.fn()

  beforeEach(() => {
    fetchSpy.mockReset()
    fetchSpy.mockImplementation(async (url: string, init?: RequestInit) => {
      const action = decodeURIComponent(String(url).split('/lf/rpc/')[1] ?? '')
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      if (action === 'projects.libraries.list') {
        return new Response(JSON.stringify({ ok: true, data: sampleIndex }), { status: 200 })
      }
      if (action === 'projects.ai.status') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              available: true,
              defaultRoute: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
              models: [
                {
                  provider: 'deepseek-official',
                  model: 'deepseek-v4-flash',
                  name: 'DeepSeek V4 Flash',
                },
              ],
            } satisfies AiStatusResult,
          }),
          { status: 200 },
        )
      }
      if (action === 'projects.ai.extract') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              detail: {
                ...sampleDetail,
                manifest: {
                  ...sampleDetail.manifest,
                  projectType: '品牌主视觉',
                  tags: ['KV', 'AI整理'],
                  aiExtractedAt: 1700000009999,
                  aiLastTrace: {
                    extractedAt: 1700000009999,
                    provider: 'deepseek-official',
                    model: 'deepseek-v4-flash',
                    status: 'success',
                    error: null,
                    systemPrompt: 'System prompt rules',
                    userPrompt: '项目名称: Brand Campaign\n采样目录内容',
                    sampledFiles: ['renders/brief.pdf'],
                    coverCandidates: ['renders/hero.jpg'],
                    rawResponse: '{"projectType":"品牌主视觉","tags":["KV","AI整理"],"summary":"AI 提取的主视觉项目摘要"}',
                    parsedOutput: {
                      projectType: '品牌主视觉',
                      tags: ['KV', 'AI整理'],
                      summary: 'AI 提取的主视觉项目摘要',
                      recommendedCoverRelPath: 'renders/hero.jpg',
                    },
                  },
                },
              },
              extracted: {
                projectType: '品牌主视觉',
                tags: ['KV', 'AI整理'],
                summary: 'AI 提取的主视觉项目摘要',
                recommendedCoverRelPath: 'renders/hero.jpg',
              },
            },
          }),
          { status: 200 },
        )
      }
      if (action === 'projects.ai.previewSample') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              sample: {
                projectName: 'Brand Campaign',
                fileCount: 2,
                folderCount: 1,
                totalBytes: 3072,
                categories: { image: 1, document: 1 },
                topExtensions: [{ ext: '.jpg', count: 1 }],
                treeLines: ['renders/ (2 files)'],
                textSnippets: [],
                coverCandidates: ['renders/hero.jpg'],
              },
              systemPrompt: 'System prompt rules',
              userPrompt: '实时采样: Brand Campaign',
            } satisfies ProjectAiSamplePreview,
          }),
          { status: 200 },
        )
      }
      if (action === 'projects.ai.extractBatch') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              total: 1,
              task: {
                id: 'task_ai_batch',
                scope: 'projects',
                queue: 'projects-ai',
                title: 'AI 批量提取 (1 个项目)',
                status: 'running',
                progress: { current: 0, total: 1, message: '准备中' },
                pausable: true,
                cancellable: true,
                createdAt: 1,
                startedAt: 1,
                updatedAt: 1,
                finishedAt: null,
                error: null,
              } satisfies TaskSnapshot,
            },
          }),
          { status: 200 },
        )
      }
      if (action === 'projects.batch.tag') {
        return new Response(JSON.stringify({ ok: true, data: { updatedCount: 1 } }), { status: 200 })
      }
      if (action === 'projects.detail.get') {
        return new Response(JSON.stringify({ ok: true, data: sampleDetail }), { status: 200 })
      }
      if (action === 'tasks.list') {
        return new Response(JSON.stringify({ ok: true, data: { tasks: [] } }), { status: 200 })
      }
      if (action === 'projects.sync') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              ...sampleDetail,
              summary: {
                ...sampleDetail.summary,
                hasChanges: false,
                changeSummary: { added: 0, modified: 0, removed: 0 },
              },
            },
          }),
          { status: 200 },
        )
      }
      if (action === 'projects.meta.update') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              ...sampleDetail,
              manifest: { ...sampleDetail.manifest, ...body },
            },
          }),
          { status: 200 },
        )
      }
      if (action === 'tasks.pause') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              id: body.id,
              scope: 'projects',
              queue: 'projects-scan',
              title: '扫描库',
              status: 'paused',
              progress: { current: 1, total: 2, message: '暂停中' },
              pausable: true,
              cancellable: true,
              createdAt: 1,
              startedAt: 1,
              updatedAt: 2,
              finishedAt: null,
              error: null,
            } satisfies TaskSnapshot,
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('navigates from project cards into a project and back, and keeps the detail surfaces working', async () => {
    const { container } = render(
      <ProjectsProvider appId="projects.library" frame={mockFrame}>
        <div className="flex h-[720px] w-[1200px]">
          <ProjectsLeft appId="projects.library" frame={mockFrame} />
          <ProjectsMain appId="projects.library" frame={mockFrame} />
          <ProjectsInspector appId="projects.library" frame={mockFrame} />
        </div>
        <ProjectsStatus appId="projects.library" frame={mockFrame} />
      </ProjectsProvider>,
    )

    // The default surface is the card overview with the library list on the left.
    await waitFor(() => {
      expect(container.querySelector('[data-lf-project-card="prj_1"]')).toBeTruthy()
    })
    expect(container.querySelector('[data-lf-projects-overview-sidebar]')).toBeTruthy()

    fireEvent.click(container.querySelector('[data-lf-project-card="prj_1"]') as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.getByText('hero.jpg')).toBeTruthy()
      expect(screen.getByText('brief.pdf')).toBeTruthy()
      expect(container.querySelector('[data-lf-projects-sidebar]')).toBeTruthy()
    })

    // Change banner is visible and sync button triggers projects.sync
    const syncBtn = screen.getByRole('button', { name: '立即增量更新' })
    fireEvent.click(syncBtn)
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('projects.sync'),
        expect.anything(),
      )
    })

    // Live SSE task topic expands progress & pause button in bottom status bar
    act(() => {
      dispatchFolioTopic({
        topic: 'tasks:projects',
        ts: Date.now(),
        payload: {
          id: 'task_scan_1',
          scope: 'projects',
          queue: 'projects-scan',
          title: '导入项目库：2026 归档库',
          status: 'running',
          progress: { current: 1, total: 2, message: '扫描 (1/2)：Brand Campaign' },
          pausable: true,
          cancellable: true,
          createdAt: 1,
          startedAt: 1,
          updatedAt: 2,
          finishedAt: null,
          error: null,
        } satisfies TaskSnapshot,
      })
    })

    await waitFor(() => {
      expect(screen.getByText('50%')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '暂停' }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('tasks.pause'),
        expect.anything(),
      )
    })

    // AI extraction panel shows model badge and triggers projects.ai.extract
    await waitFor(() => {
      expect(screen.getByText('deepseek-v4-flash')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'AI 提取当前项目' }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('projects.ai.extract'),
        expect.anything(),
      )
    })

    // Open AI Input/Output inspection modal and check both input prompt and output raw/parsed data
    fireEvent.click(screen.getByRole('button', { name: '查看输入/返回' }))
    await waitFor(() => {
      expect(screen.getByText(/项目名称: Brand Campaign/)).toBeTruthy()
    })
    const outputTab = screen.getByRole('tab', { name: /AI 返回的信息/ })
    fireEvent.mouseDown(outputTab)
    fireEvent.click(outputTab)
    await waitFor(() => {
      expect(screen.getAllByText(/AI 提取的主视觉项目摘要/).length).toBeGreaterThanOrEqual(2)
    })
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    // Toggle batch management mode, select all, and trigger batch AI extract
    fireEvent.click(screen.getByTitle('多选批量管理'))
    fireEvent.click(screen.getByRole('button', { name: '全选' }))
    expect(screen.getByText('已选 1 个项目')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'AI 提取' }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('projects.ai.extractBatch'),
        expect.anything(),
      )
    })

    // Both the sidebar and the center toolbar can return to the project cards.
    fireEvent.click(screen.getAllByRole('button', { name: '返回项目卡片' })[0]!)
    await waitFor(() => {
      expect(container.querySelector('[data-lf-project-card="prj_1"]')).toBeTruthy()
      expect(container.querySelector('[data-lf-projects-overview-sidebar]')).toBeTruthy()
    })
    expect(screen.queryByText('hero.jpg')).toBeNull()
  })

  it('scopes project cards by library and preserves the scope after returning from a project', async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      const action = decodeURIComponent(String(url).split('/lf/rpc/')[1] ?? '')
      if (action === 'projects.libraries.list') {
        return new Response(JSON.stringify({ ok: true, data: multiLibraryIndex }), {
          status: 200,
        })
      }
      if (action === 'projects.detail.get') {
        return new Response(JSON.stringify({ ok: true, data: sampleDetail }), { status: 200 })
      }
      if (action === 'projects.ai.status') {
        return new Response(
          JSON.stringify({ ok: true, data: { available: false, defaultRoute: null, models: [] } }),
          { status: 200 },
        )
      }
      if (action === 'tasks.list') {
        return new Response(JSON.stringify({ ok: true, data: { tasks: [] } }), { status: 200 })
      }
      return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 })
    })

    const { container } = render(
      <ProjectsProvider appId="projects.library" frame={mockFrame}>
        <div className="flex h-[720px] w-[1200px]">
          <ProjectsLeft appId="projects.library" frame={mockFrame} />
          <ProjectsMain appId="projects.library" frame={mockFrame} />
        </div>
      </ProjectsProvider>,
    )

    await waitFor(() => {
      expect(container.querySelector('[data-lf-project-card="prj_1"]')).toBeTruthy()
      expect(container.querySelector('[data-lf-project-card="prj_2"]')).toBeTruthy()
    })

    fireEvent.click(container.querySelector('[data-lf-project-library="lib_1"]') as HTMLButtonElement)
    await waitFor(() => {
      expect(container.querySelector('[data-lf-project-card="prj_1"]')).toBeTruthy()
      expect(container.querySelector('[data-lf-project-card="prj_2"]')).toBeNull()
    })

    fireEvent.click(container.querySelector('[data-lf-project-card="prj_1"]') as HTMLButtonElement)
    await waitFor(() => {
      expect(screen.getByText('hero.jpg')).toBeTruthy()
    })

    fireEvent.click(screen.getAllByRole('button', { name: '返回项目卡片' })[0]!)
    await waitFor(() => {
      expect(container.querySelector('[data-lf-project-card="prj_1"]')).toBeTruthy()
    })
    expect(container.querySelector('[data-lf-project-card="prj_2"]')).toBeNull()

    fireEvent.click(
      container.querySelector('[data-lf-project-library="__all__"]') as HTMLButtonElement,
    )
    await waitFor(() => {
      expect(container.querySelector('[data-lf-project-card="prj_2"]')).toBeTruthy()
    })
  })

  it('attaches scroll listener after late mount and renders items below the initial viewport on scroll', async () => {
    const manyFiles = Array.from({ length: 60 }, (_, idx) => ({
      relPath: `renders/item-${String(idx + 1).padStart(2, '0')}.jpg`,
      folderRelPath: 'renders',
      name: `item-${String(idx + 1).padStart(2, '0')}.jpg`,
      ext: '.jpg',
      category: 'image' as const,
      mime: 'image/jpeg',
      thumbSupported: true,
      size: 1024,
      mtimeMs: 1700000000000,
      fingerprint: `1024:${idx}`,
      thumbKey: `tk_${idx}`,
    }))

    const largeDetail: ProjectDetailResult = {
      summary: { ...sampleDetail.summary, fileCount: 60 },
      manifest: {
        ...sampleDetail.manifest,
        stats: { fileCount: 60, folderCount: 1, totalBytes: 61440, categories: { image: 60 } },
        groups: [
          {
            relPath: 'renders',
            name: 'renders',
            depth: 1,
            fileCount: 60,
            totalBytes: 61440,
            files: manyFiles,
          },
        ],
      },
    }

    fetchSpy.mockImplementation(async (url: string) => {
      const action = decodeURIComponent(String(url).split('/lf/rpc/')[1] ?? '')
      if (action === 'projects.libraries.list') {
        return new Response(JSON.stringify({ ok: true, data: sampleIndex }), { status: 200 })
      }
      if (action === 'projects.detail.get') {
        return new Response(JSON.stringify({ ok: true, data: largeDetail }), { status: 200 })
      }
      if (action === 'tasks.list') {
        return new Response(JSON.stringify({ ok: true, data: { tasks: [] } }), { status: 200 })
      }
      if (action === 'projects.ai.status') {
        return new Response(
          JSON.stringify({ ok: true, data: { available: false, defaultRoute: null, models: [] } }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 })
    })

    const { container } = render(
      <ProjectsProvider appId="projects.library" frame={mockFrame}>
        <ProjectsMain appId="projects.library" frame={mockFrame} />
      </ProjectsProvider>,
    )

    await waitFor(() => {
      expect(container.querySelector('[data-lf-project-card="prj_1"]')).toBeTruthy()
    })
    fireEvent.click(container.querySelector('[data-lf-project-card="prj_1"]') as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.getByText('item-01.jpg')).toBeTruthy()
    })
    // Item 60 is far below initial viewport + overscan
    expect(screen.queryByText('item-60.jpg')).toBeNull()

    const scroller = container.querySelector('[data-lf-projects-scroll-container]') as HTMLDivElement
    expect(scroller).toBeTruthy()

    act(() => {
      scroller.scrollTop = 2400
      fireEvent.scroll(scroller)
    })

    await waitFor(() => {
      expect(screen.getByText('item-60.jpg')).toBeTruthy()
    })
  })
})
