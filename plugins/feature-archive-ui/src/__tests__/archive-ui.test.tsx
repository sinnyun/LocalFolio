// @vitest-environment happy-dom
import * as React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FrameController } from '@folio/base-contract'
import { ProjectsInspector } from '../../../workspace-projects-ui/src/components/ProjectsInspector.js'
import { ProjectsMain } from '../../../workspace-projects-ui/src/components/ProjectsMain.js'
import { ProjectsSidebar } from '../../../workspace-projects-ui/src/components/ProjectsSidebar.js'
import { ProjectsProvider } from '../../../workspace-projects-ui/src/context.js'
import { createFolioProjectsUiService } from '../../../workspace-projects-ui/src/extension-registry.js'
import type {
  LibraryIndex,
  ProjectDetailResult,
  TaskSnapshot,
} from '../../../workspace-projects-ui/src/types.js'
import { createArchiveProjectsExtension } from '../archive-extension.js'
import { resetArchiveStoreForTests } from '../archive-store.js'
import type { ArchiveToolStatus } from '../types.js'

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

const archivedIndex: LibraryIndex = {
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
      id: 'prj_arch',
      libraryId: 'lib_1',
      name: 'Archived Film',
      path: 'D:\\Archives\\2026\\Archived Film',
      coverRelPath: 'renders/frame.jpg',
      coverFingerprint: '2048:1700000000',
      coverThumbKey: 'aaa111bbb222',
      tags: ['样片'],
      summary: '已去重归档项目',
      projectType: '影视工程',
      fileCount: 1,
      folderCount: 1,
      totalBytes: 4096,
      lastScannedAt: 1700000001000,
      aiExtractedAt: null,
      hasChanges: false,
      changeSummary: { added: 0, modified: 0, removed: 0 },
      missing: false,
      metaWritable: true,
      archived: true,
      archiveBytes: 1024,
      archiveFileName: 'Archived Film.zpaq',
    },
  ],
}

const archivedDetail: ProjectDetailResult = {
  summary: archivedIndex.projects[0]!,
  manifest: {
    version: 1,
    projectId: 'prj_arch',
    name: 'Archived Film',
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    lastScannedAt: 1700000001000,
    coverRelPath: 'renders/frame.jpg',
    coverThumbFile: 'Archived Film-封面.jpg',
    summary: '已去重归档项目',
    projectType: '影视工程',
    tags: ['样片'],
    aiExtractedAt: null,
    archive: {
      mode: 'archived',
      engine: 'zpaqfranz',
      archiveFileName: 'Archived Film.zpaq',
      archiveBytes: 1024,
      originalBytes: 4096,
      archivedFileCount: 1,
      archivedAt: 1700000002000,
      verifiedAt: 1700000003000,
      sourceDisposal: 'recycle',
      versions: 1,
    },
    stats: { fileCount: 1, folderCount: 1, totalBytes: 4096, categories: { image: 1 } },
    fingerprintDigest: 'digest',
    groups: [
      {
        relPath: 'renders',
        name: 'renders',
        depth: 1,
        fileCount: 1,
        totalBytes: 4096,
        files: [
          {
            relPath: 'renders/frame.jpg',
            folderRelPath: 'renders',
            name: 'frame.jpg',
            ext: '.jpg',
            category: 'image',
            mime: 'image/jpeg',
            thumbSupported: true,
            size: 4096,
            mtimeMs: 1700000000000,
            fingerprint: '4096:1700000000000',
            thumbKey: 'aaa111bbb222',
          },
        ],
      },
    ],
  },
}

const toolInstalledStatus: ArchiveToolStatus = {
  installed: true,
  source: 'managed',
  version: '65.22',
  supportsChunkBackup: true,
  binaryPath: 'C:\\LocalFolio\\tools\\zpaqfranz\\zpaqfranz.exe',
  managedDir: 'C:\\LocalFolio\\tools\\zpaqfranz',
  managedBinaryPath: 'C:\\LocalFolio\\tools\\zpaqfranz\\zpaqfranz.exe',
  settings: {
    mirrorPrefix: '',
    customBinaryPath: null,
    defaultSourceDisposal: 'recycle',
    extractCacheMaxMb: 512,
    hideMetaDir: true,
    chunkSizeGb: 8,
    compressionMethod: 'default',
    useSequentialExtract: true,
  },
  cacheStats: {
    fileCount: 1,
    totalBytes: 2048,
    cacheDir: 'C:\\LocalFolio\\cache\\extracted',
  },
  activeMounts: [],
}

describe('@folio/feature-archive-ui', () => {
  const fetchSpy = vi.fn()
  let index: LibraryIndex

  beforeEach(() => {
    index = archivedIndex
    resetArchiveStoreForTests()
    fetchSpy.mockReset()
    fetchSpy.mockImplementation(async (url: string) => {
      const action = decodeURIComponent(String(url).split('/lf/rpc/')[1] ?? '')
      if (action === 'projects.libraries.list') {
        return new Response(JSON.stringify({ ok: true, data: index }), { status: 200 })
      }
      if (action === 'archive.projects.packBatch') {
        return new Response(JSON.stringify({ ok: true, data: { tasks: [], skippedCount: 0 } }), { status: 200 })
      }
      if (action === 'projects.detail.get') {
        return new Response(JSON.stringify({ ok: true, data: archivedDetail }), { status: 200 })
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
      if (action === 'archive.tool.status') {
        return new Response(JSON.stringify({ ok: true, data: toolInstalledStatus }), { status: 200 })
      }
      if (action === 'archive.project.inspectLive') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              projectId: 'prj_arch',
              archived: true,
              cleanExtracted: [
                {
                  relPath: 'renders/frame.jpg',
                  name: 'frame.jpg',
                  size: 4096,
                  mtimeMs: 1700000000000,
                  fingerprint: '4096:1700000000000',
                  thumbKey: 'aaa111bbb222',
                  thumbSupported: true,
                },
              ],
              modifiedExtracted: [],
              addedFiles: [
                {
                  relPath: 'renders/extra.png',
                  name: 'extra.png',
                  size: 1024,
                  mtimeMs: 1700000005000,
                  fingerprint: '1024:1700000005000',
                  thumbKey: 'bbb222ccc333',
                  thumbSupported: true,
                },
              ],
            },
          }),
          { status: 200 },
        )
      }
      if (action === 'archive.file.extractInPlace') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              extractedPath: 'D:\\Archives\\2026\\Archived Film\\renders\\frame.jpg',
              alreadyOnDisk: false,
              fingerprint: '4096:1700000000000',
            },
          }),
          { status: 200 },
        )
      }
      if (action === 'archive.project.cleanExtracted') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              removedCount: 1,
              removedRelPaths: ['renders/frame.jpg'],
              skippedModifiedCount: 0,
            },
          }),
          { status: 200 },
        )
      }
      if (
        action === 'archive.tool.download' ||
        action === 'archive.project.restore' ||
        action === 'archive.project.append'
      ) {
        const snap: TaskSnapshot = {
          id: `task_${action}`,
          scope: 'projects',
          queue: 'archive-ops',
          title: action,
          status: 'running',
          progress: { current: 0, total: 100, message: '执行中' },
          pausable: false,
          cancellable: true,
          createdAt: 1,
          startedAt: 1,
          updatedAt: 1,
          finishedAt: null,
          error: null,
        }
        return new Response(JSON.stringify({ ok: true, data: { task: snap } }), { status: 200 })
      }
      if (action === 'archive.file.extractTo') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: { cancelled: false, extractedPath: 'D:\\Exports\\frame.jpg' },
          }),
          { status: 200 },
        )
      }
      if (action === 'archive.project.exportArchive') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: { cancelled: false, exportedPath: 'D:\\Exports\\Archived Film.zpaq' },
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

  it('selects the entire list and submits only the unarchived projects in list order', async () => {
    const archived = archivedIndex.projects[0]!
    index = {
      ...archivedIndex,
      projects: [
        { ...archived, id: 'prj_first', name: 'First', archived: false },
        archived,
        { ...archived, id: 'prj_last', name: 'Last', archived: false },
      ],
    }
    const service = createFolioProjectsUiService()
    service.registerExtension(createArchiveProjectsExtension())
    render(
      <ProjectsProvider appId="projects.library" frame={mockFrame} projectsUiService={service}>
        <ProjectsSidebar appId="projects.library" frame={mockFrame} />
      </ProjectsProvider>,
    )

    await screen.findByText('First')
    fireEvent.click(screen.getByTitle('多选批量管理'))
    fireEvent.click(screen.getByRole('button', { name: '全选' }))
    expect(screen.getByText('已选 3 个项目')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '批量归档' }))
    expect(await screen.findByText(/将 2 个未归档项目/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '开始归档' }))
    await waitFor(() => {
      const call = fetchSpy.mock.calls.find(([url]) => String(url).includes('archive.projects.packBatch'))
      expect(call).toBeTruthy()
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
        projectIds: ['prj_first', 'prj_last'],
        sourceDisposal: 'recycle',
      })
    })
  })

  it('mounts onto folioProjects, supports one-click download dialog, file extractTo, archive export, and restore', async () => {
    const service = createFolioProjectsUiService()
    const dispose = service.registerExtension(createArchiveProjectsExtension())

    render(
      <ProjectsProvider appId="projects.library" frame={mockFrame} projectsUiService={service}>
        <div className="flex h-[720px] w-[1200px]">
          <ProjectsMain appId="projects.library" frame={mockFrame} />
          <ProjectsInspector appId="projects.library" frame={mockFrame} />
        </div>
      </ProjectsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('已归档')).toBeTruthy()
      expect(screen.getByText('节省 75%')).toBeTruthy()
    })

    // Open archive engine settings dialog & trigger download/update
    fireEvent.click(screen.getByRole('button', { name: /归档引擎/ }))
    await waitFor(() => {
      expect(screen.getByText('ZPAQ 归档引擎与工具管理')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: /重新下载 \/ 更新 zpaqfranz/ }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('archive.tool.download'),
        expect.anything(),
      )
    })
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    // Check live inspection cards: clean extracted & incremental delta -> clean & append
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '直接删除未修改提取文件' })).toBeTruthy()
      expect(screen.getByRole('button', { name: '追加归档到 .zpaq' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '直接删除未修改提取文件' }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('archive.project.cleanExtracted'),
        expect.anything(),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: '追加归档到 .zpaq' }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('archive.project.append'),
        expect.anything(),
      )
    })

    // Select file card and trigger both in-place extract and export-to-folder
    fireEvent.click(screen.getByText('frame.jpg'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '提取到原位置' })).toBeTruthy()
      expect(screen.getByRole('button', { name: '导出到其他目录…' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '提取到原位置' }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('archive.file.extractInPlace'),
        expect.anything(),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: '导出到其他目录…' }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('archive.file.extractTo'),
        expect.anything(),
      )
    })

    // Trigger export archive & restore
    fireEvent.click(screen.getByRole('button', { name: '导出归档包' }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('archive.project.exportArchive'),
        expect.anything(),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: '全部提取（保留包）' }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('archive.project.restore'),
        expect.objectContaining({
          body: expect.stringContaining('"extract_all_keep_archive"'),
        }),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: '解包还原（移除包）' }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('archive.project.restore'),
        expect.objectContaining({
          body: expect.stringContaining('"restore_and_remove_archive"'),
        }),
      )
    })

    dispose()
  })

  it('surfaces leftover .zpaq cleanup banner on unarchived projects and recycles it on click', async () => {
    const unarchivedIndex: LibraryIndex = {
      ...archivedIndex,
      projects: [
        {
          ...archivedIndex.projects[0]!,
          archived: false,
          archiveBytes: null,
          archiveFileName: null,
        },
      ],
    }
    const unarchivedDetail: ProjectDetailResult = {
      summary: unarchivedIndex.projects[0]!,
      manifest: {
        ...archivedDetail.manifest,
        archive: null,
      },
    }

    fetchSpy.mockImplementation(async (url: string) => {
      const action = decodeURIComponent(String(url).split('/lf/rpc/')[1] ?? '')
      if (action === 'projects.libraries.list') {
        return new Response(JSON.stringify({ ok: true, data: unarchivedIndex }), { status: 200 })
      }
      if (action === 'projects.detail.get') {
        return new Response(JSON.stringify({ ok: true, data: unarchivedDetail }), { status: 200 })
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
      if (action === 'archive.tool.status') {
        return new Response(JSON.stringify({ ok: true, data: toolInstalledStatus }), { status: 200 })
      }
      if (action === 'archive.project.inspectLive') {
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              projectId: 'prj_arch',
              archived: false,
              cleanExtracted: [],
              modifiedExtracted: [],
              addedFiles: [],
              leftoverArchiveFiles: [{ name: 'Archived Film.zpaq', size: 1024 }],
            },
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ ok: true, data: {} }), { status: 200 })
    })

    const service = createFolioProjectsUiService()
    const dispose = service.registerExtension(createArchiveProjectsExtension())

    render(
      <ProjectsProvider appId="projects.library" frame={mockFrame} projectsUiService={service}>
        <ProjectsInspector appId="projects.library" frame={mockFrame} />
      </ProjectsProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText(/检测到与原文件并存的残留归档包/)).toBeTruthy()
      expect(screen.getByRole('button', { name: '移入回收站清理归档包' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '移入回收站清理归档包' }))
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('archive.project.removeLeftoverArchive'),
        expect.anything(),
      )
    })

    dispose()
  })
})
