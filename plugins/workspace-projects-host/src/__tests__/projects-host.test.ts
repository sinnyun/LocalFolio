import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FolioNativeService, NativeImageProxyResult } from '@folio/base-contract'
import { createFolioRuntimeService } from '../../../base-runtime-host/src/host.js'
import { createFolioStorageService } from '../../../base-storage-host/src/host.js'
import { registerBaseTasksHost } from '../../../base-tasks-host/src/host.js'
import { createFolioThumbsService } from '../../../base-thumbs-host/src/host.js'
import { registerFeatureThumbsEagleHost } from '../../../feature-thumbs-eagle-host/src/host.js'
import { buildProjectSample, parseAiExtractionJson } from '../ai-sampler.js'
import type { DshLlmLike } from '../ai-extractor.js'
import { createWorkspaceProjectsHost, registerWorkspaceProjectsHost } from '../host.js'
import type {
  AiStatusResult,
  LibraryIndex,
  ProjectAiSamplePreview,
  ProjectCheckResult,
  ProjectDetailResult,
} from '../types.js'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lf-projects-host-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(dir => fsp.rm(dir, { recursive: true, force: true })),
  )
})

function createMockNative(calls: { renderCount: number; opened: string[]; revealed: string[] }): FolioNativeService {
  const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
  return {
    async getThumbnail(): Promise<NativeImageProxyResult | null> {
      return { buffer: fakeJpeg, mime: 'image/jpeg' }
    },
    async renderImageProxy(): Promise<NativeImageProxyResult | null> {
      calls.renderCount += 1
      return { buffer: fakeJpeg, mime: 'image/jpeg' }
    },
    async pickFolder() {
      return { supported: true, cancelled: true, folderPath: null }
    },
    async pickFiles() {
      return { supported: true, cancelled: true, paths: [] }
    },
    async revealPath(targetPath) {
      calls.revealed.push(targetPath)
      return { revealedPath: targetPath }
    },
    async openPath(targetPath) {
      calls.opened.push(targetPath)
      return { openedPath: targetPath }
    },
    async setHiddenAttribute() {
      return true
    },
  }
}

async function waitForTasksDone(
  runtime: ReturnType<typeof createFolioRuntimeService>,
  scope: string,
): Promise<void> {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const res = await runtime.executeAction<{ tasks: Array<{ status: string }> }>('tasks.list', {
      scope,
    })
    if (res.tasks.length > 0 && res.tasks.every(t => ['completed', 'failed', 'cancelled'].includes(t.status))) {
      return
    }
    await new Promise(r => setTimeout(r, 20))
  }
  throw new Error('Timed out waiting for background scan task')
}

describe('@folio/workspace-projects-host', () => {
  it('counts project thumbnails after originals are removed and excludes unavailable files from Eagle', async () => {
    const dataDir = await makeTempDir()
    const libRoot = await makeTempDir()
    const projDir = path.join(libRoot, 'Archive')
    await fsp.mkdir(projDir)
    await fsp.writeFile(path.join(projDir, 'cached.jpg'), 'image')
    await fsp.writeFile(path.join(projDir, 'archived.psd'), 'design')
    await fsp.writeFile(path.join(projDir, 'pending.psd'), 'design')
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({ storage, admit: () => true, trustedOrigins: [] })
    const tasks = registerBaseTasksHost({ runtime })
    const native = createMockNative({ renderCount: 0, opened: [], revealed: [] })
    const thumbs = createFolioThumbsService({ native, storage, tasks: tasks.service })
    const host = createWorkspaceProjectsHost({ runtime, storage, tasks: tasks.service, native, thumbs, workerPath: null })
    const disposeEagle = registerFeatureThumbsEagleHost({
      runtime, storage, tasks: tasks.service, thumbs, projectsHost: host.service,
    })
    try {
      await runtime.executeAction('projects.libraries.add', { rootPath: libRoot })
      await waitForTasksDone(runtime, 'projects')
      const [project] = await host.service.listProjects()
      expect(await host.service.warmProjectFileThumbs(project!.id, ['cached.jpg'])).toMatchObject({ warmed: 1 })
      await thumbs.clearCache()
      await fsp.unlink(path.join(projDir, 'cached.jpg'))
      await fsp.unlink(path.join(projDir, 'archived.psd'))
      const result = await runtime.executeAction('thumbs.eagle.project.inspect', { projectId: project!.id })
      expect(result).toMatchObject({
        readyCount: 1,
        unavailableCount: 1,
        pendingCount: 1,
        missingCount: 0,
        missingGroups: [],
      })
    } finally {
      disposeEagle()
      host.dispose()
      thumbs.dispose()
      tasks.dispose()
      runtime.dispose()
    }
  })

  it('scans a library into .folio-meta, detects size+mtimeMs changes, syncs incrementally, and serves immutable cached thumbs', async () => {
    const dataDir = await makeTempDir()
    const libRoot = await makeTempDir()

    const alphaDir = path.join(libRoot, 'Project Alpha')
    const alphaImages = path.join(alphaDir, 'renders')
    await fsp.mkdir(alphaImages, { recursive: true })
    await fsp.mkdir(path.join(alphaDir, 'node_modules', 'pkg'), { recursive: true })
    await fsp.writeFile(path.join(alphaDir, 'README.md'), '# Alpha')
    await fsp.writeFile(path.join(alphaImages, 'cover.jpg'), Buffer.from('fake-image-bytes'))
    await fsp.writeFile(path.join(alphaImages, 'shot-2.png'), Buffer.from('fake-png-bytes'))
    await fsp.writeFile(path.join(alphaDir, 'node_modules', 'pkg', 'index.js'), 'ignored')

    const nativeCalls = { renderCount: 0, opened: [] as string[], revealed: [] as string[] }
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const tasksHost = registerBaseTasksHost({ runtime })
    const native = createMockNative(nativeCalls)
    const thumbs = createFolioThumbsService({ native, tasks: tasksHost.service })
    const disposeProjects = registerWorkspaceProjectsHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      native,
      thumbs,
      workerPath: null,
    })

    // 1. Add library -> scans in background & generates flat cover <项目名>-封面.jpg (no 120- / cover/)
    const addRes = await runtime.executeAction<{ library: { id: string } }>('projects.libraries.add', {
      rootPath: libRoot,
      name: '归档库',
    })
    await waitForTasksDone(runtime, 'projects')

    const index = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    expect(index.libraries).toHaveLength(1)
    expect(index.projects).toHaveLength(1)
    const alpha = index.projects[0]!
    expect(alpha.name).toBe('Project Alpha')
    expect(alpha.fileCount).toBe(3) // node_modules ignored
    expect(alpha.coverRelPath).toBe('renders/cover.jpg')
    expect(alpha.hasChanges).toBe(false)
    expect(nativeCalls.renderCount).toBe(1) // lazy: only cover generated during library add

    // Verify in-place .folio-meta/manifest.json & flat <项目名>-封面.jpg (no cover/ dir, no 120- file)
    const manifestStat = await fsp.stat(path.join(alphaDir, '.folio-meta', 'manifest.json'))
    expect(manifestStat.isFile()).toBe(true)
    const coverPath = path.join(alphaDir, '.folio-meta', 'Project Alpha-封面.jpg')
    const coverBytesBefore = await fsp.readFile(coverPath)
    expect(coverBytesBefore.length).toBeGreaterThan(0)
    await expect(fsp.stat(path.join(alphaDir, '.folio-meta', 'cover'))).rejects.toThrow()

    // 2. Update manual metadata & switch cover -> overwrites single cover file
    await runtime.executeAction('projects.meta.update', {
      projectId: alpha.id,
      summary: '核心客户主视觉项目',
      projectType: '平面视觉',
      tags: ['KV', '2026'],
      coverRelPath: 'renders/shot-2.png',
    })
    const metaDirEntries = await fsp.readdir(path.join(alphaDir, '.folio-meta'))
    expect(metaDirEntries.filter(n => n.endsWith('-封面.jpg'))).toEqual(['Project Alpha-封面.jpg'])

    // Restore original cover for subsequent checks
    await runtime.executeAction('projects.meta.update', {
      projectId: alpha.id,
      coverRelPath: 'renders/cover.jpg',
    })

    // 3. Mutate files on disk and checkChanges
    await fsp.writeFile(path.join(alphaImages, 'shot-3.jpg'), Buffer.from('new-shot'))
    await fsp.writeFile(path.join(alphaDir, 'README.md'), '# Alpha Updated Longer')

    const checkRes = await runtime.executeAction<ProjectCheckResult>('projects.checkChanges', {
      projectId: alpha.id,
    })
    expect(checkRes.hasChanges).toBe(true)
    expect(checkRes.changeSummary).toEqual({ added: 1, modified: 1, removed: 0 })

    // 4. Incremental sync preserves manual metadata and updates manifest
    const syncRes = await runtime.executeAction<ProjectDetailResult>('projects.sync', {
      projectId: alpha.id,
    })
    expect(syncRes.summary.hasChanges).toBe(false)
    expect(syncRes.summary.fileCount).toBe(4)
    expect(syncRes.manifest.summary).toBe('核心客户主视觉项目')
    expect(syncRes.manifest.tags).toEqual(['KV', '2026'])

    // 5. Lazy 360px readable mirrored thumb HTTP route: first request generates & caches, second hits disk cache
    const detail = await runtime.executeAction<ProjectDetailResult>('projects.detail.get', {
      projectId: alpha.id,
    })
    const shot2 = detail.manifest.groups
      .flatMap(g => g.files)
      .find(f => f.name === 'shot-2.png')!

    const rendersBefore = nativeCalls.renderCount
    const thumbUrl = `http://127.0.0.1/lf/projects/thumb?projectId=${alpha.id}&relPath=${encodeURIComponent(shot2.relPath)}&tk=${shot2.thumbKey}`
    const r1 = await runtime.rpc.fetch(new Request(thumbUrl))
    expect(r1.status).toBe(200)
    expect(r1.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(nativeCalls.renderCount).toBe(rendersBefore + 1)

    // Assert Everything-friendly readable mirrored path on disk
    const readableThumbName = `shot-2.png__${shot2.thumbKey.slice(0, 8)}.jpg`
    const rendersThumbDir = await fsp.readdir(path.join(alphaDir, '.folio-meta', 'thumbs', 'renders'))
    expect(rendersThumbDir).toContain(readableThumbName)

    const r2 = await runtime.rpc.fetch(new Request(thumbUrl))
    expect(r2.status).toBe(200)
    expect(nativeCalls.renderCount).toBe(rendersBefore + 1) // disk cache hit!

    // Also verify kind=cover HTTP route serves the cover cleanly
    const coverRouteRes = await runtime.rpc.fetch(
      new Request(`http://127.0.0.1/lf/projects/thumb?projectId=${alpha.id}&kind=cover&v=1`),
    )
    expect(coverRouteRes.status).toBe(200)

    // 6. Path traversal rejection
    const badUrl = `http://127.0.0.1/lf/projects/thumb?projectId=${alpha.id}&relPath=${encodeURIComponent('../outside.txt')}&tk=deadbeef`
    const badRes = await runtime.rpc.fetch(new Request(badUrl))
    expect(badRes.status).toBe(403)

    // 7. Native open & reveal actions
    await runtime.executeAction('projects.file.open', {
      projectId: alpha.id,
      relPath: shot2.relPath,
    })
    await runtime.executeAction('projects.file.reveal', {
      projectId: alpha.id,
      relPath: shot2.relPath,
    })
    expect(nativeCalls.opened).toHaveLength(1)
    expect(nativeCalls.revealed).toHaveLength(1)

    // 8. Remove library only drops index, preserves in-place .folio-meta
    await runtime.executeAction('projects.libraries.remove', { libraryId: addRes.library.id })
    const afterRemove = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    expect(afterRemove.libraries).toHaveLength(0)
    expect(afterRemove.projects).toHaveLength(0)
    await expect(fsp.stat(path.join(alphaDir, '.folio-meta', 'manifest.json'))).resolves.toBeTruthy()

    disposeProjects()
    thumbs.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })

  it('picks up newly registered format extensions from folioThumbs during scan', async () => {
    const dataDir = await makeTempDir()
    const libRoot = await makeTempDir()
    const projDir = path.join(libRoot, 'Custom Format Project')
    await fsp.mkdir(projDir, { recursive: true })
    await fsp.writeFile(path.join(projDir, 'model.c4d'), Buffer.from('C4D-FILE'))

    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const tasksHost = registerBaseTasksHost({ runtime })
    const native = createMockNative({ renderCount: 0, opened: [], revealed: [] })
    const thumbs = createFolioThumbsService({ native, tasks: tasksHost.service })
    thumbs.registerProvider({
      id: 'c4d-custom',
      extensions: ['.c4d'],
      async generate() {
        return { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), mime: 'image/jpeg' }
      },
    })

    const host = createWorkspaceProjectsHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      native,
      thumbs,
      workerPath: null,
    })

    await runtime.executeAction('projects.libraries.add', { rootPath: libRoot })
    await waitForTasksDone(runtime, 'projects')

    const list = await host.service.listProjects()
    const proj = list[0]!
    const snap = await host.service.readProjectSnapshot(proj.id)
    expect(snap?.files[0]?.name).toBe('model.c4d')
    expect(snap?.files[0]?.thumbSupported).toBe(true)

    host.dispose()
    thumbs.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })

  it('samples project docs safely (2000-char cap, skips binary) and extracts/batches metadata via DSH ctx.llm', async () => {
    const dataDir = await makeTempDir()
    const libRoot = await makeTempDir()

    const proj1 = path.join(libRoot, 'Brand Kit')
    const proj2 = path.join(libRoot, 'Motion Reel')
    await fsp.mkdir(path.join(proj1, 'assets'), { recursive: true })
    await fsp.mkdir(path.join(proj2, 'clips'), { recursive: true })

    // Long README (> 2000 chars) + binary .bin file that must be skipped in text sampling
    await fsp.writeFile(path.join(proj1, 'README.md'), `# Brand Kit\n${'A'.repeat(3500)}`)
    await fsp.writeFile(path.join(proj1, 'assets', 'binary.txt'), Buffer.from([0x00, 0x01, 0x02]))
    await fsp.writeFile(path.join(proj1, 'assets', 'cover.jpg'), Buffer.from('jpg-bytes'))
    await fsp.writeFile(path.join(proj2, '说明.md'), '2026 年度宣传片剪辑与调色归档')
    await fsp.writeFile(path.join(proj2, 'clips', 'preview.png'), Buffer.from('png-bytes'))

    const nativeCalls = { renderCount: 0, opened: [] as string[], revealed: [] as string[] }
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const tasksHost = registerBaseTasksHost({ runtime })

    const llmCalls: string[] = []
    const mockLlm: DshLlmLike = {
      listProviders: () => [{ id: 'deepseek-official', name: 'DeepSeek' }],
      listModels: async provider => [
        { provider, id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
      ],
      async *stream(opts) {
        const userText = opts.messages[0]?.content[0]?.text ?? ''
        llmCalls.push(userText)
        const isBrand = userText.includes('Brand Kit')
        const jsonPayload = JSON.stringify({
          projectType: isBrand ? '品牌视觉' : '影视剪辑',
          tags: isBrand ? ['品牌', 'VI'] : ['视频', '宣传片'],
          summary: isBrand ? '品牌视觉识别与资产归档' : '年度宣传片成片与素材工程',
          recommendedCoverRelPath: isBrand ? 'assets/cover.jpg' : 'clips/preview.png',
        })
        yield { type: 'text-delta', text: '```json\n' }
        yield { type: 'text-delta', text: jsonPayload }
        yield { type: 'text-delta', text: '\n```' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }

    const native = createMockNative(nativeCalls)
    const thumbs = createFolioThumbsService({ native, tasks: tasksHost.service })
    const disposeProjects = registerWorkspaceProjectsHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      native,
      thumbs,
      workerPath: null,
      getLlm: () => mockLlm,
      getDefaultModel: () => ({
        currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }),
      }),
    })

    // Add library & wait for initial scan
    const addRes = await runtime.executeAction<{ library: { id: string } }>('projects.libraries.add', {
      rootPath: libRoot,
      name: 'AI 测试库',
    })
    await waitForTasksDone(runtime, 'projects')

    const status = await runtime.executeAction<AiStatusResult>('projects.ai.status', {})
    expect(status.available).toBe(true)
    expect(status.defaultRoute).toEqual({
      provider: 'deepseek-official',
      model: 'deepseek-v4-flash',
    })

    const idx = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    const p1 = idx.projects.find(p => p.name === 'Brand Kit')!
    const p2 = idx.projects.find(p => p.name === 'Motion Reel')!

    // Verify sampler caps text at 2000 chars and skips binary content
    const detail1 = await runtime.executeAction<ProjectDetailResult>('projects.detail.get', {
      projectId: p1.id,
    })
    const sample1 = await buildProjectSample(p1.path, detail1.manifest)
    const totalSnippetChars = sample1.textSnippets.reduce((acc, s) => acc + s.content.length, 0)
    expect(totalSnippetChars).toBeLessThanOrEqual(2005) // 2000 + ellipsis
    expect(sample1.textSnippets.every(s => !s.relPath.endsWith('binary.txt'))).toBe(true)
    expect(sample1.coverCandidates).toContain('assets/cover.jpg')

    // Verify parseAiExtractionJson rejects malformed output
    expect(() => parseAiExtractionJson('not json at all')).toThrow()

    // Verify previewSample RPC action
    const preview = await runtime.executeAction<ProjectAiSamplePreview>('projects.ai.previewSample', {
      projectId: p1.id,
    })
    expect(preview.systemPrompt).toContain('JSON')
    expect(preview.userPrompt).toContain('Brand Kit')
    expect(preview.sample.textSnippets.map(s => s.relPath)).toContain('README.md')

    // Single project AI extract
    const extractRes = await runtime.executeAction<{
      detail: ProjectDetailResult
      extracted: { projectType: string; tags: string[] }
    }>('projects.ai.extract', {
      projectId: p1.id,
      applyCover: true,
    })
    expect(extractRes.extracted.projectType).toBe('品牌视觉')
    expect(extractRes.detail.manifest.tags).toEqual(['品牌', 'VI'])
    expect(extractRes.detail.manifest.aiExtractedAt).not.toBeNull()
    expect(extractRes.detail.manifest.aiLastTrace?.status).toBe('success')
    expect(extractRes.detail.manifest.aiLastTrace?.userPrompt).toContain('Brand Kit')
    expect(extractRes.detail.manifest.aiLastTrace?.rawResponse).toContain('品牌视觉')
    expect(extractRes.detail.manifest.aiLastTrace?.parsedOutput?.projectType).toBe('品牌视觉')

    // Batch AI extract with onlyUnextracted: true -> only p2 should be processed
    const callsBeforeBatch = llmCalls.length
    const batchRes = await runtime.executeAction<{ total: number }>('projects.ai.extractBatch', {
      libraryId: addRes.library.id,
      onlyUnextracted: true,
    })
    expect(batchRes.total).toBe(1)
    await waitForTasksDone(runtime, 'projects')
    expect(llmCalls.length).toBe(callsBeforeBatch + 1)

    const idxAfterBatch = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    const p2After = idxAfterBatch.projects.find(p => p.id === p2.id)!
    expect(p2After.projectType).toBe('影视剪辑')
    expect(p2After.aiExtractedAt).not.toBeNull()

    // Batch tag & batch sync
    const tagRes = await runtime.executeAction<{ updatedCount: number }>('projects.batch.tag', {
      projectIds: [p1.id, p2.id],
      addTags: ['重点归档'],
      removeTags: ['VI'],
    })
    expect(tagRes.updatedCount).toBe(2)

    const idxAfterTag = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    expect(idxAfterTag.projects.find(p => p.id === p1.id)?.tags).toEqual(['品牌', '重点归档'])

    const batchSyncRes = await runtime.executeAction<{ total: number }>('projects.batch.sync', {
      projectIds: [p1.id, p2.id],
      onlyChanged: false,
    })
    expect(batchSyncRes.total).toBe(2)
    await waitForTasksDone(runtime, 'projects')

    // Trace is preserved across incremental sync
    const detailAfterSync = await runtime.executeAction<ProjectDetailResult>('projects.detail.get', {
      projectId: p1.id,
    })
    expect(detailAfterSync.manifest.aiLastTrace?.status).toBe('success')

    disposeProjects()
    thumbs.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })

  it('persists error aiLastTrace when model returns invalid JSON', async () => {
    const dataDir = await makeTempDir()
    const libRoot = await makeTempDir()
    const projDir = path.join(libRoot, 'Broken Output')
    await fsp.mkdir(projDir, { recursive: true })
    await fsp.writeFile(path.join(projDir, 'README.md'), 'Demo readme content')

    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const tasksHost = registerBaseTasksHost({ runtime })
    const badLlm: DshLlmLike = {
      listProviders: () => [{ id: 'mock', name: 'Mock' }],
      listModels: async p => [{ provider: p, id: 'mock-bad', name: 'Mock Bad' }],
      async *stream() {
        yield { type: 'text-delta', text: 'invalid non-json response' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }

    const native = createMockNative({ renderCount: 0, opened: [], revealed: [] })
    const thumbs = createFolioThumbsService({ native, tasks: tasksHost.service })
    const disposeProjects = registerWorkspaceProjectsHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      native,
      thumbs,
      workerPath: null,
      getLlm: () => badLlm,
      getDefaultModel: () => ({ currentSelection: () => ({ provider: 'mock', model: 'mock-bad' }) }),
    })

    await runtime.executeAction('projects.libraries.add', { rootPath: libRoot })
    await waitForTasksDone(runtime, 'projects')
    const idx = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    const proj = idx.projects[0]!

    await expect(
      runtime.executeAction('projects.ai.extract', { projectId: proj.id }),
    ).rejects.toMatchObject({ code: 'ai_invalid_output' })

    const detail = await runtime.executeAction<ProjectDetailResult>('projects.detail.get', {
      projectId: proj.id,
    })
    expect(detail.manifest.aiLastTrace?.status).toBe('error')
    expect(detail.manifest.aiLastTrace?.rawResponse).toBe('invalid non-json response')
    expect(detail.manifest.aiLastTrace?.userPrompt).toContain('Demo readme content')

    disposeProjects()
    thumbs.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })
})
