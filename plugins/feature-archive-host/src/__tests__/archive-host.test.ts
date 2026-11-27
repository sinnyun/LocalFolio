import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FolioNativeService, NativeImageProxyResult, TaskSnapshot } from '@folio/base-contract'
import { createFolioFsService } from '../../../base-fs-host/src/host.js'
import { createFolioRuntimeService } from '../../../base-runtime-host/src/host.js'
import { createFolioStorageService } from '../../../base-storage-host/src/host.js'
import { registerBaseTasksHost } from '../../../base-tasks-host/src/host.js'
import { createFolioThumbsService } from '../../../base-thumbs-host/src/host.js'
import { createWorkspaceProjectsHost } from '../../../workspace-projects-host/src/host.js'
import type {
  LibraryIndex,
  ProjectCheckResult,
  ProjectDetailResult,
} from '../../../workspace-projects-host/src/types.js'
import { resolveArchiveReadFileName, type ArchiveCliRunner } from '../archive-service.js'
import { isZpaqfranzVersionAtLeast, pickBestWindowsAsset } from '../archive-tool.js'
import { registerFeatureArchiveHost } from '../host.js'
import type { ArchiveToolStatus } from '../types.js'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lf-archive-host-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(dir => fsp.rm(dir, { recursive: true, force: true })),
  )
})

function createMockNative(calls: {
  opened: string[]
  revealed: string[]
  recycled: string[]
}): FolioNativeService {
  const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
  return {
    async getThumbnail(): Promise<NativeImageProxyResult | null> {
      return { buffer: fakeJpeg, mime: 'image/jpeg' }
    },
    async renderImageProxy(): Promise<NativeImageProxyResult | null> {
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
    async recyclePaths(pathsToRecycle) {
      for (const p of pathsToRecycle) {
        calls.recycled.push(p)
        await fsp.rm(p, { recursive: true, force: true })
      }
      return { recycled: pathsToRecycle.length }
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
    if (
      res.tasks.length > 0 &&
      res.tasks.every(t => ['completed', 'failed', 'cancelled'].includes(t.status))
    ) {
      return
    }
    await new Promise(r => setTimeout(r, 20))
  }
  throw new Error('Timed out waiting for background task')
}

function createFakeZpaqRunner(failVerify = false): ArchiveCliRunner {
  const bundles = new Map<string, Record<string, string>>()

  const collectRecursive = async (
    baseDir: string,
    currDir: string,
    entriesFilter: Set<string>,
    out: Record<string, string>,
  ): Promise<void> => {
    const items = await fsp.readdir(currDir, { withFileTypes: true })
    for (const item of items) {
      const full = path.join(currDir, item.name)
      const rel = path.relative(baseDir, full).split(path.sep).join('/')
      const top = rel.split('/')[0]!
      if (!entriesFilter.has(top)) continue
      if (item.isDirectory()) {
        await collectRecursive(baseDir, full, entriesFilter, out)
      } else if (item.isFile()) {
        out[rel] = (await fsp.readFile(full)).toString('base64')
      }
    }
  }

  return {
    async add({ projectPath, archiveFileName, entries }) {
      const map: Record<string, string> = {}
      await collectRecursive(projectPath, projectPath, new Set(entries), map)
      bundles.set(path.join(projectPath, archiveFileName), map)
      await fsp.writeFile(path.join(projectPath, archiveFileName), JSON.stringify(map), 'utf8')
    },
    async test() {
      if (failVerify) {
        throw new Error('checksum mismatch simulated')
      }
    },
    async extractFile({ archiveAbsPath, relPath, destFilePath }) {
      const raw = bundles.get(archiveAbsPath) ?? JSON.parse(await fsp.readFile(archiveAbsPath, 'utf8'))
      const b64 = raw[relPath]
      if (!b64) throw new Error(`missing in archive: ${relPath}`)
      await fsp.mkdir(path.dirname(destFilePath), { recursive: true })
      await fsp.writeFile(destFilePath, Buffer.from(b64, 'base64'))
    },
    async extractAll({ projectPath, archiveFileName }) {
      const archiveAbsPath = path.join(projectPath, archiveFileName)
      const raw = (bundles.get(archiveAbsPath) ??
        JSON.parse(await fsp.readFile(archiveAbsPath, 'utf8'))) as Record<string, string>
      for (const [relPath, b64] of Object.entries(raw)) {
        const target = path.join(projectPath, ...relPath.split('/'))
        await fsp.mkdir(path.dirname(target), { recursive: true })
        await fsp.writeFile(target, Buffer.from(b64, 'base64'))
      }
    },
  }
}

describe('@folio/feature-archive-host', () => {
  it('queues unique unarchived projects in the requested order and continues after verification fails', async () => {
    const dataDir = await makeTempDir()
    const libRoot = await makeTempDir()
    const fakeExe = path.join(dataDir, 'zpaqfranz.exe')
    await fsp.writeFile(fakeExe, Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(50 * 1024)]))
    for (const name of ['Archived', 'Fails', 'Succeeds']) {
      await fsp.mkdir(path.join(libRoot, name))
      await fsp.writeFile(path.join(libRoot, name, 'notes.txt'), name)
    }
    const native = createMockNative({ opened: [], revealed: [], recycled: [] })
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({ storage, admit: () => true, trustedOrigins: [] })
    const tasks = registerBaseTasksHost({ runtime })
    const thumbs = createFolioThumbsService({ native, tasks: tasks.service })
    const projects = createWorkspaceProjectsHost({
      runtime, storage, tasks: tasks.service, native, thumbs, workerPath: null,
    })
    const events: string[] = []
    const runner = createFakeZpaqRunner()
    const archive = registerFeatureArchiveHost({
      runtime, storage, tasks: tasks.service, native, projectsHost: projects.service,
      runner: {
        ...runner,
        async add(opts) {
          events.push(`add:${path.basename(opts.projectPath)}`)
          await runner.add(opts)
        },
        async test(opts) {
          const name = path.basename(opts.projectPath)
          events.push(`verify:${name}`)
          if (name === 'Fails') throw new Error('verification failed')
        },
      },
    })
    try {
      await runtime.executeAction('projects.libraries.add', { rootPath: libRoot })
      await waitForTasksDone(runtime, 'projects')
      await runtime.executeAction('archive.tool.pickLocal', { filePath: fakeExe })
      const ids = new Map((await projects.service.listProjects()).map(project => [project.name, project.id]))
      const archived = ids.get('Archived')!
      const fails = ids.get('Fails')!
      const succeeds = ids.get('Succeeds')!
      await runtime.executeAction('archive.project.pack', { projectId: archived, sourceDisposal: 'keep' })
      await waitForTasksDone(runtime, 'projects')
      events.length = 0
      await fsp.writeFile(path.join(libRoot, 'Succeeds', 'new.txt'), 'added since scan')

      const result = await runtime.executeAction<{ tasks: TaskSnapshot[]; skippedCount: number }>(
        'archive.projects.packBatch',
        { projectIds: [fails, archived, succeeds, fails], sourceDisposal: 'keep' },
      )
      expect(result.tasks.map(task => task.meta?.projectId)).toEqual([fails, succeeds])
      expect(result.skippedCount).toBe(1)
      await waitForTasksDone(runtime, 'projects')
      expect(events).toEqual(['add:Fails', 'verify:Fails', 'add:Succeeds', 'verify:Succeeds'])
      expect(result.tasks.map(task => tasks.service.getTask(task.id)?.status)).toEqual(['failed', 'completed'])
      expect((await projects.service.readProjectSnapshot(succeeds))?.files.map(file => file.name)).toContain('new.txt')
      await expect(fsp.readFile(path.join(libRoot, 'Fails', 'notes.txt'), 'utf8')).resolves.toBe('Fails')
    } finally {
      archive.dispose()
      projects.dispose()
      thumbs.dispose()
      tasks.dispose()
      runtime.dispose()
    }
  })

  it('packs with thumb pre-warm, recycles sources cleanly, extracts seamlessly for open/media/export, and restores project', async () => {
    const dataDir = await makeTempDir()
    const libRoot = await makeTempDir()
    const exportDir = await makeTempDir()
    const fakeToolDir = await makeTempDir()

    const fakeExe = path.join(fakeToolDir, 'zpaqfranz.exe')
    await fsp.writeFile(fakeExe, Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(50 * 1024)]))

    const projDir = path.join(libRoot, 'Archive Demo')
    await fsp.mkdir(path.join(projDir, 'renders'), { recursive: true })
    await fsp.writeFile(path.join(projDir, 'renders', 'hero.jpg'), Buffer.from('FAKE-HERO-IMAGE-CONTENT'))
    await fsp.writeFile(path.join(projDir, 'renders', 'alt.jpg'), Buffer.from('FAKE-ALT-IMAGE-CONTENT'))
    await fsp.writeFile(path.join(projDir, 'notes.txt'), 'Project archival notes')

    const calls = { opened: [] as string[], revealed: [] as string[], recycled: [] as string[] }
    const native = createMockNative(calls)
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const tasksHost = registerBaseTasksHost({ runtime })
    const thumbs = createFolioThumbsService({ native, tasks: tasksHost.service })
    const projectsHost = createWorkspaceProjectsHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      native,
      thumbs,
      fs: createFolioFsService(),
      workerPath: null,
    })
    const archiveHost = registerFeatureArchiveHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      native,
      projectsHost: projectsHost.service,
      runner: createFakeZpaqRunner(false),
    })

    // 1. Add library
    await runtime.executeAction('projects.libraries.add', { rootPath: libRoot })
    await waitForTasksDone(runtime, 'projects')

    const idx = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    const project = idx.projects[0]!

    // Configure fake zpaqfranz.exe via archive.tool.pickLocal
    const pickRes = await runtime.executeAction<{ cancelled: boolean; status: ArchiveToolStatus }>(
      'archive.tool.pickLocal',
      { filePath: fakeExe },
    )
    expect(pickRes.cancelled).toBe(false)
    expect(pickRes.status.installed).toBe(true)

    // 2. Pack project (warms thumbs -> adds -> verifies -> recycles sources -> marks archived)
    await runtime.executeAction('archive.project.pack', {
      projectId: project.id,
      sourceDisposal: 'recycle',
    })
    await waitForTasksDone(runtime, 'projects')

    expect(calls.recycled.length).toBeGreaterThanOrEqual(2)
    await expect(fsp.stat(path.join(projDir, 'renders'))).rejects.toThrow()
    await expect(fsp.stat(path.join(projDir, 'Archive Demo.zpaq'))).resolves.toBeTruthy()
    await expect(fsp.stat(path.join(projDir, '.folio-meta', 'Archive Demo-封面.jpg'))).resolves.toBeTruthy()

    const idxArchived = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    expect(idxArchived.projects[0]?.archived).toBe(true)
    expect(idxArchived.projects[0]?.hasChanges).toBe(false)

    // 3. Change detection ignores archived removal & .zpaq file
    const check = await runtime.executeAction<ProjectCheckResult>('projects.checkChanges', {
      projectId: project.id,
    })
    expect(check.hasChanges).toBe(false)
    expect(check.missing).toBe(false)

    // 4. Transparent projects.file.open extracts single file preserving name and launches default app
    const openRes = await runtime.executeAction<{ openedPath: string; extractedFromArchive: boolean }>(
      'projects.file.open',
      { projectId: project.id, relPath: 'notes.txt' },
    )
    expect(openRes.extractedFromArchive).toBe(true)
    expect(path.basename(openRes.openedPath)).toBe('notes.txt')
    expect(await fsp.readFile(openRes.openedPath, 'utf8')).toBe('Project archival notes')

    // 5. Transparent /lf/projects/media streams archived image for Lightbox
    const mediaRes = await runtime.rpc.fetch(
      new Request(`http://127.0.0.1/lf/projects/media?projectId=${project.id}&relPath=${encodeURIComponent('renders/hero.jpg')}`),
    )
    expect(mediaRes.status).toBe(200)
    expect(await mediaRes.text()).toBe('FAKE-HERO-IMAGE-CONTENT')

    // Rebuild just one missing thumbnail directly from the archive.
    const thumbDir = path.join(projDir, '.folio-meta', 'thumbs', 'renders')
    const oldThumb = (await fsp.readdir(thumbDir)).find(name => name.startsWith('alt.jpg__'))
    expect(oldThumb).toBeTruthy()
    await fsp.unlink(path.join(thumbDir, oldThumb!))
    const entry = (await projectsHost.service.readProjectSnapshot(project.id))?.files
      .find(file => file.relPath === 'renders/alt.jpg')
    const thumbUrl = `http://127.0.0.1/lf/projects/thumb?projectId=${project.id}&relPath=renders%2Falt.jpg&tk=${entry!.thumbKey}`
    expect((await runtime.rpc.fetch(new Request(thumbUrl))).status).toBe(204)
    const rebuilder = await runtime.executeAction<{ task: TaskSnapshot }>('archive.project.rebuildThumbs', {
      projectId: project.id, relPaths: [entry!.relPath, entry!.relPath],
    })
    await waitForTasksDone(runtime, 'projects')
    expect(tasksHost.service.getTask(rebuilder.task.id)).toMatchObject({
      status: 'completed',
      progress: { current: 1, total: 1, detail: { succeeded: 1, failed: 0 } },
    })
    expect((await runtime.rpc.fetch(new Request(thumbUrl))).status).toBe(200)
    await expect(fsp.stat(path.join(projDir, entry!.relPath))).rejects.toThrow()
    await expect(fsp.readdir(path.join(dataDir, 'plugins', 'feature-archive-host', 'cache', 'thumb-sources')))
      .resolves.toEqual([])

    // 6. Swap cover while archived uses cached 360px thumb with zero decompression
    const metaSwapRes = await runtime.executeAction<ProjectDetailResult>('projects.meta.update', {
      projectId: project.id,
      coverRelPath: 'renders/alt.jpg',
    })
    expect(metaSwapRes.summary.coverRelPath).toBe('renders/alt.jpg')

    // 7. Extract single file to user-selected folder
    const extractToRes = await runtime.executeAction<{ cancelled: boolean; extractedPath: string }>(
      'archive.file.extractTo',
      {
        projectId: project.id,
        relPath: 'renders/alt.jpg',
        destDir: exportDir,
        reveal: false,
      },
    )
    expect(extractToRes.cancelled).toBe(false)
    expect(await fsp.readFile(extractToRes.extractedPath, 'utf8')).toBe('FAKE-ALT-IMAGE-CONTENT')

    // 8. Export whole .zpaq archive file to destination folder
    const exportArchiveRes = await runtime.executeAction<{ cancelled: boolean; exportedPath: string }>(
      'archive.project.exportArchive',
      {
        projectId: project.id,
        destDir: exportDir,
        reveal: false,
      },
    )
    expect(exportArchiveRes.cancelled).toBe(false)
    expect(path.basename(exportArchiveRes.exportedPath)).toBe('Archive Demo.zpaq')
    await expect(fsp.stat(exportArchiveRes.exportedPath)).resolves.toBeTruthy()

    // 9. Extract all while keeping archive -> records clean extracted & allows one-click cleanup
    await runtime.executeAction('archive.project.restore', {
      projectId: project.id,
      mode: 'extract_all_keep_archive',
    })
    await waitForTasksDone(runtime, 'projects')

    expect(await fsp.readFile(path.join(projDir, 'notes.txt'), 'utf8')).toBe('Project archival notes')
    await expect(fsp.stat(path.join(projDir, 'Archive Demo.zpaq'))).resolves.toBeTruthy()
    const checkAfterExtractAll = await runtime.executeAction<ProjectCheckResult>(
      'projects.checkChanges',
      { projectId: project.id },
    )
    expect(checkAfterExtractAll.hasChanges).toBe(false)
    expect(checkAfterExtractAll.extractedUnmodified).toBe(3)

    const cleanAllRes = await runtime.executeAction<{ removedCount: number }>(
      'archive.project.cleanExtracted',
      { projectId: project.id },
    )
    expect(cleanAllRes.removedCount).toBe(3)
    await expect(fsp.stat(path.join(projDir, 'notes.txt'))).rejects.toThrow()

    // 10. Full restore (default mode) extracts all files AND recycles .zpaq so no duplicate remains
    await runtime.executeAction('archive.project.restore', {
      projectId: project.id,
    })
    await waitForTasksDone(runtime, 'projects')

    expect(await fsp.readFile(path.join(projDir, 'notes.txt'), 'utf8')).toBe('Project archival notes')
    await expect(fsp.stat(path.join(projDir, 'Archive Demo.zpaq'))).rejects.toThrow()
    const idxRestored = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    expect(idxRestored.projects[0]?.archived).toBe(false)

    // 11. Leftover .zpaq detection & cleanup in an unarchived project
    await fsp.writeFile(path.join(projDir, 'Archive Demo.zpaq'), Buffer.from('leftover-zpaq'))
    const leftoverInspect = await runtime.executeAction<{
      archived: boolean
      leftoverArchiveFiles: Array<{ name: string; size: number }>
    }>('archive.project.inspectLive', { projectId: project.id })
    expect(leftoverInspect.archived).toBe(false)
    expect(leftoverInspect.leftoverArchiveFiles.map(f => f.name)).toEqual(['Archive Demo.zpaq'])

    await runtime.executeAction('archive.project.removeLeftoverArchive', {
      projectId: project.id,
      archiveFileName: 'Archive Demo.zpaq',
    })
    await expect(fsp.stat(path.join(projDir, 'Archive Demo.zpaq'))).rejects.toThrow()

    archiveHost.dispose()
    projectsHost.dispose()
    thumbs.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })

  it('never touches source files if zpaqfranz integrity verification fails', async () => {
    const dataDir = await makeTempDir()
    const libRoot = await makeTempDir()
    const fakeToolDir = await makeTempDir()
    const fakeExe = path.join(fakeToolDir, 'zpaqfranz.exe')
    await fsp.writeFile(fakeExe, Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(50 * 1024)]))

    const projDir = path.join(libRoot, 'Verify Fail Safe')
    await fsp.mkdir(projDir, { recursive: true })
    await fsp.writeFile(path.join(projDir, 'important.txt'), 'Must stay intact')

    const calls = { opened: [] as string[], revealed: [] as string[], recycled: [] as string[] }
    const native = createMockNative(calls)
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({ storage, admit: () => true, trustedOrigins: [] })
    const tasksHost = registerBaseTasksHost({ runtime })
    const thumbs = createFolioThumbsService({ native, tasks: tasksHost.service })
    const projectsHost = createWorkspaceProjectsHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      native,
      thumbs,
      workerPath: null,
    })
    const archiveHost = registerFeatureArchiveHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      native,
      projectsHost: projectsHost.service,
      runner: createFakeZpaqRunner(true),
    })

    await runtime.executeAction('projects.libraries.add', { rootPath: libRoot })
    await waitForTasksDone(runtime, 'projects')
    await runtime.executeAction('archive.tool.pickLocal', { filePath: fakeExe })

    const idx = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    const project = idx.projects[0]!

    await runtime.executeAction('archive.project.pack', {
      projectId: project.id,
      sourceDisposal: 'recycle',
    })
    await waitForTasksDone(runtime, 'projects')

    expect(calls.recycled).toHaveLength(0)
    expect(await fsp.readFile(path.join(projDir, 'important.txt'), 'utf8')).toBe('Must stay intact')
    const idxAfter = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    expect(idxAfter.projects[0]?.archived).toBe(false)

    archiveHost.dispose()
    projectsHost.dispose()
    thumbs.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })

  it('extracts in-place without false change alerts, cleans unmodified extracted files, and appends new/edited files cleanly', async () => {
    const dataDir = await makeTempDir()
    const libRoot = await makeTempDir()
    const fakeToolDir = await makeTempDir()
    const fakeExe = path.join(fakeToolDir, 'zpaqfranz.exe')
    await fsp.writeFile(fakeExe, Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(50 * 1024)]))

    const projDir = path.join(libRoot, 'Append Workflow')
    await fsp.mkdir(path.join(projDir, 'renders'), { recursive: true })
    await fsp.writeFile(path.join(projDir, 'renders', 'hero.jpg'), Buffer.from('HERO-V1'))
    await fsp.writeFile(path.join(projDir, 'notes.txt'), 'Initial notes v1')

    const calls = { opened: [] as string[], revealed: [] as string[], recycled: [] as string[] }
    const native = createMockNative(calls)
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({ storage, admit: () => true, trustedOrigins: [] })
    const tasksHost = registerBaseTasksHost({ runtime })
    const thumbs = createFolioThumbsService({ native, tasks: tasksHost.service })
    const projectsHost = createWorkspaceProjectsHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      native,
      thumbs,
      workerPath: null,
    })

    // Append-aware runner mock: preserves previously archived keys while adding/updating delta entries
    const appendRunner: ArchiveCliRunner = {
      async add({ projectPath, archiveFileName, entries }) {
        const archiveAbs = path.join(projectPath, archiveFileName)
        let existing: Record<string, string> = {}
        try {
          existing = JSON.parse(await fsp.readFile(archiveAbs, 'utf8')) as Record<string, string>
        } catch {
          existing = {}
        }
        const collect = async (rel: string): Promise<void> => {
          const abs = path.join(projectPath, rel)
          const st = await fsp.stat(abs)
          if (st.isDirectory()) {
            for (const name of await fsp.readdir(abs)) {
              await collect(path.join(rel, name))
            }
          } else if (st.isFile()) {
            const posix = rel.split(path.sep).join('/')
            existing[posix] = (await fsp.readFile(abs)).toString('base64')
          }
        }
        for (const entry of entries) {
          await collect(entry)
        }
        await fsp.writeFile(archiveAbs, JSON.stringify(existing), 'utf8')
      },
      async test() {},
      async extractFile({ archiveAbsPath, relPath, destFilePath }) {
        const map = JSON.parse(await fsp.readFile(archiveAbsPath, 'utf8')) as Record<string, string>
        const b64 = map[relPath]
        if (!b64) throw new Error(`missing: ${relPath}`)
        await fsp.mkdir(path.dirname(destFilePath), { recursive: true })
        await fsp.writeFile(destFilePath, Buffer.from(b64, 'base64'))
      },
      async extractAll({ projectPath, archiveFileName }) {
        const map = JSON.parse(
          await fsp.readFile(path.join(projectPath, archiveFileName), 'utf8'),
        ) as Record<string, string>
        for (const [relPath, b64] of Object.entries(map)) {
          const target = path.join(projectPath, ...relPath.split('/'))
          await fsp.mkdir(path.dirname(target), { recursive: true })
          await fsp.writeFile(target, Buffer.from(b64, 'base64'))
        }
      },
    }

    const archiveHost = registerFeatureArchiveHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      native,
      projectsHost: projectsHost.service,
      runner: appendRunner,
    })

    await runtime.executeAction('projects.libraries.add', { rootPath: libRoot })
    await waitForTasksDone(runtime, 'projects')
    await runtime.executeAction('archive.tool.pickLocal', { filePath: fakeExe })

    const idx = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    const project = idx.projects[0]!

    // Initial pack
    await runtime.executeAction('archive.project.pack', {
      projectId: project.id,
      sourceDisposal: 'recycle',
    })
    await waitForTasksDone(runtime, 'projects')

    // 1. Extract renders/hero.jpg directly back to its original in-project location
    const inPlaceRes = await runtime.executeAction<{
      extractedPath: string
      alreadyOnDisk: boolean
    }>('archive.file.extractInPlace', {
      projectId: project.id,
      relPath: 'renders/hero.jpg',
      reveal: false,
    })
    expect(inPlaceRes.alreadyOnDisk).toBe(false)
    expect(path.normalize(inPlaceRes.extractedPath)).toBe(
      path.normalize(path.join(projDir, 'renders', 'hero.jpg')),
    )
    expect(await fsp.readFile(inPlaceRes.extractedPath, 'utf8')).toBe('HERO-V1')

    // 2. checkChanges MUST treat unmodified extracted file as clean (NOT incremental change!)
    const checkAfterExtract = await runtime.executeAction<ProjectCheckResult>(
      'projects.checkChanges',
      { projectId: project.id },
    )
    expect(checkAfterExtract.hasChanges).toBe(false)
    expect(checkAfterExtract.changeSummary).toEqual({ added: 0, modified: 0, removed: 0 })
    expect(checkAfterExtract.extractedUnmodified).toBe(1)

    const inspect1 = await runtime.executeAction<{
      cleanExtracted: Array<{ relPath: string }>
      modifiedExtracted: Array<{ relPath: string }>
      addedFiles: Array<{ relPath: string }>
    }>('archive.project.inspectLive', { projectId: project.id })
    expect(inspect1.cleanExtracted.map(f => f.relPath)).toEqual(['renders/hero.jpg'])
    expect(inspect1.modifiedExtracted).toEqual([])
    expect(inspect1.addedFiles).toEqual([])

    // 3. One-click clean removes unmodified extracted file AND prunes empty renders/ dir
    const cleanRes = await runtime.executeAction<{
      removedCount: number
      removedRelPaths: string[]
    }>('archive.project.cleanExtracted', { projectId: project.id })
    expect(cleanRes.removedCount).toBe(1)
    await expect(fsp.stat(path.join(projDir, 'renders', 'hero.jpg'))).rejects.toThrow()
    await expect(fsp.stat(path.join(projDir, 'renders'))).rejects.toThrow()

    // 4. Extract notes.txt in-place, modify it on disk, AND add a brand-new docs/new-spec.md
    await runtime.executeAction('archive.file.extractInPlace', {
      projectId: project.id,
      relPath: 'notes.txt',
      reveal: false,
    })
    await fsp.writeFile(path.join(projDir, 'notes.txt'), 'Initial notes v2 - EDITED')
    await fsp.mkdir(path.join(projDir, 'docs'), { recursive: true })
    await fsp.writeFile(path.join(projDir, 'docs', 'new-spec.md'), '# Incremental Spec')

    const checkDelta = await runtime.executeAction<ProjectCheckResult>('projects.checkChanges', {
      projectId: project.id,
    })
    expect(checkDelta.hasChanges).toBe(true)
    expect(checkDelta.changeSummary).toEqual({ added: 1, modified: 1, removed: 0 })
    expect(checkDelta.extractedUnmodified).toBe(0)

    // cleanExtracted refuses to delete modified notes.txt
    const cleanSafeRes = await runtime.executeAction<{
      removedCount: number
      skippedModifiedCount: number
    }>('archive.project.cleanExtracted', { projectId: project.id })
    expect(cleanSafeRes.removedCount).toBe(0)
    expect(cleanSafeRes.skippedModifiedCount).toBe(1)
    await expect(fsp.stat(path.join(projDir, 'notes.txt'))).resolves.toBeTruthy()

    // 5. Incremental append archives delta into .zpaq v2, preserves previously archived hero.jpg, and cleans live delta
    await runtime.executeAction('archive.project.append', {
      projectId: project.id,
      sourceDisposal: 'recycle',
    })
    await waitForTasksDone(runtime, 'projects')

    await expect(fsp.stat(path.join(projDir, 'notes.txt'))).rejects.toThrow()
    await expect(fsp.stat(path.join(projDir, 'docs'))).rejects.toThrow()

    const detailV2 = await runtime.executeAction<ProjectDetailResult>('projects.detail.get', {
      projectId: project.id,
    })
    expect(detailV2.manifest.archive?.versions).toBe(2)
    const allRelPaths = detailV2.manifest.groups.flatMap(g => g.files).map(f => f.relPath)
    expect(allRelPaths).toContain('renders/hero.jpg')
    expect(allRelPaths).toContain('notes.txt')
    expect(allRelPaths).toContain('docs/new-spec.md')

    // Opening updated & newly appended files seamlessly extracts their v2 content
    const openNew = await runtime.executeAction<{ openedPath: string }>('projects.file.open', {
      projectId: project.id,
      relPath: 'docs/new-spec.md',
    })
    expect(await fsp.readFile(openNew.openedPath, 'utf8')).toBe('# Incremental Spec')

    const openUpdated = await runtime.executeAction<{ openedPath: string }>('projects.file.open', {
      projectId: project.id,
      relPath: 'notes.txt',
    })
    expect(await fsp.readFile(openUpdated.openedPath, 'utf8')).toBe('Initial notes v2 - EDITED')

    archiveHost.dispose()
    projectsHost.dispose()
    thumbs.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })

  it('packs using backup-chunk multi-volume layout, ignores all volume artifacts in scanner, supports export/recover/mount/unmount and cleans all volumes on restore', async () => {
    const dataDir = await makeTempDir()
    const libRoot = await makeTempDir()
    const exportDir = await makeTempDir()
    const fakeToolDir = await makeTempDir()

    const fakeExe = path.join(fakeToolDir, 'zpaqfranz-full.exe')
    await fsp.writeFile(fakeExe, Buffer.concat([Buffer.from([0x4d, 0x5a]), Buffer.alloc(50 * 1024)]))

    const projDir = path.join(libRoot, 'Chunked Project')
    await fsp.mkdir(path.join(projDir, 'scenes'), { recursive: true })
    await fsp.writeFile(path.join(projDir, 'scenes', 'shot01.txt'), 'scene-01-data')
    await fsp.writeFile(path.join(projDir, 'readme.md'), '# Chunked Archive Test')

    const nativeCalls = { opened: [] as string[], revealed: [] as string[], recycled: [] as string[] }
    const native = createMockNative(nativeCalls)
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const tasksHost = registerBaseTasksHost({ runtime })
    const thumbs = createFolioThumbsService({ native, tasks: tasksHost.service })
    const projectsHost = createWorkspaceProjectsHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      native,
      thumbs,
      workerPath: null,
    })

    const observedAddCalls: Array<{
      layout?: string
      chunkSizeGb?: number
      compressionMethod?: string
    }> = []
    const observedExtractAllCalls: Array<{ sequential?: boolean; recover?: boolean }> = []
    let unmountedCount = 0
    const bundles = new Map<string, Record<string, string>>()

    const chunkRunner: ArchiveCliRunner = {
      async add({ projectPath, archiveFileName, entries, layout, chunkSizeGb, compressionMethod }) {
        observedAddCalls.push({ layout, chunkSizeGb, compressionMethod })
        const stem = archiveFileName.replace(/\.zpaq$/i, '')
        const map: Record<string, string> = { ...(bundles.get(path.join(projectPath, archiveFileName)) ?? {}) }
        const walk = async (dir: string): Promise<void> => {
          const items = await fsp.readdir(dir, { withFileTypes: true })
          for (const item of items) {
            const full = path.join(dir, item.name)
            const rel = path.relative(projectPath, full).split(path.sep).join('/')
            if (!entries.includes(rel.split('/')[0]!) && !entries.includes(rel)) continue
            if (item.isDirectory()) await walk(full)
            else if (item.isFile()) map[rel] = (await fsp.readFile(full)).toString('base64')
          }
        }
        await walk(projectPath)
        bundles.set(path.join(projectPath, archiveFileName), map)
        // Simulate real zpaqfranz backup -chunk files: 2 numbered volumes + _00000000_backup.index + _00000000_backup.txt
        await fsp.writeFile(path.join(projectPath, `${stem}_00000001.zpaq`), 'vol1-bytes', 'utf8')
        await fsp.writeFile(path.join(projectPath, `${stem}_00000002.zpaq`), 'vol2-bytes-longer', 'utf8')
        await fsp.writeFile(path.join(projectPath, `${stem}_00000000_backup.index`), 'idx', 'utf8')
        await fsp.writeFile(path.join(projectPath, `${stem}_00000000_backup.txt`), 'hashes\n', 'utf8')
      },
      async test() {},
      async extractFile({ archiveAbsPath, relPath, destFilePath }) {
        const raw = bundles.get(archiveAbsPath)
        if (!raw?.[relPath]) throw new Error(`missing ${relPath}`)
        await fsp.mkdir(path.dirname(destFilePath), { recursive: true })
        await fsp.writeFile(destFilePath, Buffer.from(raw[relPath]!, 'base64'))
      },
      async extractAll({ projectPath, archiveFileName, sequential, recover }) {
        observedExtractAllCalls.push({ sequential, recover })
        const raw = bundles.get(path.join(projectPath, archiveFileName)) ?? {}
        for (const [relPath, b64] of Object.entries(raw)) {
          const target = path.join(projectPath, ...relPath.split('/'))
          await fsp.mkdir(path.dirname(target), { recursive: true })
          await fsp.writeFile(target, Buffer.from(b64, 'base64'))
        }
      },
      async mount({ allVersions }) {
        let resolveExit: () => void = () => {}
        const onExit = new Promise<void>(res => {
          resolveExit = res
        })
        return {
          mountPoint: allVersions ? 'Y:\\' : 'Z:\\',
          pid: 4242,
          onExit,
          async unmount() {
            unmountedCount += 1
            resolveExit()
          },
        }
      },
    }

    const archiveHost = registerFeatureArchiveHost({
      runtime,
      storage,
      tasks: tasksHost.service,
      native,
      projectsHost: projectsHost.service,
      runner: chunkRunner,
    })

    await runtime.executeAction('archive.tool.pickLocal', { filePath: fakeExe })
    const updatedStatus = await runtime.executeAction<ArchiveToolStatus>('archive.settings.update', {
      chunkSizeGb: 4,
      compressionMethod: 'm9',
      useSequentialExtract: true,
    })
    expect(updatedStatus.settings.chunkSizeGb).toBe(4)
    expect(updatedStatus.settings.compressionMethod).toBe('m9')
    expect(updatedStatus.settings.useSequentialExtract).toBe(true)

    await runtime.executeAction('projects.libraries.add', { rootPath: libRoot, name: 'ChunkLib' })
    await waitForTasksDone(runtime, 'projects')
    const libIndex = await runtime.executeAction<LibraryIndex>('projects.libraries.list', {})
    const project = libIndex.projects[0]!

    // 1. Pack as backup-chunk
    await runtime.executeAction('archive.project.pack', {
      projectId: project.id,
      sourceDisposal: 'recycle',
    })
    await waitForTasksDone(runtime, 'projects')

    expect(observedAddCalls[0]).toEqual({
      layout: 'backup-chunk',
      chunkSizeGb: 4,
      compressionMethod: 'm9',
    })

    const detail = await runtime.executeAction<ProjectDetailResult>('projects.detail.get', {
      projectId: project.id,
    })
    expect(detail.manifest.archive?.archiveLayout).toBe('backup-chunk')
    expect(detail.manifest.archive?.chunkSizeGb).toBe(4)
    expect(detail.manifest.archive?.volumeCount).toBe(2)
    expect(detail.manifest.archive?.compressionMethod).toBe('m9')
    // Total bytes = 10 + 17 + 3 + 7 = 37
    expect(detail.manifest.archive?.archiveBytes).toBe(37)

    // 2. Scanner must ignore all 4 backup-chunk artifacts (_00000001.zpaq, _00000002.zpaq, _00000000_backup.index, _00000000_backup.txt)
    expect(await resolveArchiveReadFileName(projDir, 'Chunked Project.zpaq')).toBe(
      'Chunked Project_????????.zpaq',
    )
    const checkAfterPack = await runtime.executeAction<ProjectCheckResult>('projects.checkChanges', {
      projectId: project.id,
    })
    expect(checkAfterPack.missing).toBe(false)
    expect(checkAfterPack.hasChanges).toBe(false)

    // 3. Multi-volume export copies all 4 artifacts
    const exported = await runtime.executeAction<{
      cancelled: boolean
      exportedPath: string
      exportedFiles: string[]
    }>('archive.project.exportArchive', {
      projectId: project.id,
      destDir: exportDir,
      reveal: false,
    })
    expect(exported.cancelled).toBe(false)
    expect(exported.exportedFiles.length).toBe(4)

    // 4. Mount (-all) and unmount virtual drive
    const mountRes = await runtime.executeAction<{
      mount: { mountPoint: string | null; allVersions: boolean }
      alreadyMounted: boolean
    }>('archive.project.mount', {
      projectId: project.id,
      allVersions: true,
      openInExplorer: true,
    })
    expect(mountRes.alreadyMounted).toBe(false)
    expect(mountRes.mount.mountPoint).toBe('Y:\\')
    expect(mountRes.mount.allVersions).toBe(true)
    expect(nativeCalls.opened).toContain('Y:\\')

    const statusWhileMounted = await runtime.executeAction<ArchiveToolStatus>('archive.tool.status', {})
    expect(statusWhileMounted.activeMounts).toHaveLength(1)
    expect(statusWhileMounted.activeMounts[0]?.mountPoint).toBe('Y:\\')

    const unmountRes = await runtime.executeAction<{ unmounted: boolean }>('archive.project.unmount', {
      projectId: project.id,
    })
    expect(unmountRes.unmounted).toBe(true)
    expect(unmountedCount).toBe(1)

    // 5. Recover mode uses x -recover and keeps archive intact
    await runtime.executeAction('archive.project.restore', {
      projectId: project.id,
      mode: 'recover_keep_archive',
      recover: true,
    })
    await waitForTasksDone(runtime, 'projects')
    expect(observedExtractAllCalls[0]).toEqual({ sequential: true, recover: true })
    await expect(fsp.stat(path.join(projDir, 'scenes', 'shot01.txt'))).resolves.toBeTruthy()
    await expect(fsp.stat(path.join(projDir, 'Chunked Project_00000001.zpaq'))).resolves.toBeTruthy()

    // 6. Full restore (remove archive) uses sequential xx and recycles all 4 volume/index/txt files
    await runtime.executeAction('archive.project.restore', {
      projectId: project.id,
      mode: 'restore_and_remove_archive',
      removeArchive: true,
    })
    await waitForTasksDone(runtime, 'projects')
    expect(observedExtractAllCalls[1]).toEqual({ sequential: true, recover: false })
    await expect(fsp.stat(path.join(projDir, 'Chunked Project_00000001.zpaq'))).rejects.toThrow()
    await expect(fsp.stat(path.join(projDir, 'Chunked Project_00000002.zpaq'))).rejects.toThrow()
    await expect(fsp.stat(path.join(projDir, 'Chunked Project_00000000_backup.index'))).rejects.toThrow()
    await expect(fsp.stat(path.join(projDir, 'Chunked Project_00000000_backup.txt'))).rejects.toThrow()

    archiveHost.dispose()
    projectsHost.dispose()
    thumbs.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })

  it('prefers zpaqfranz-full.exe in release picker and validates minimum version 65.11', () => {
    const picked = pickBestWindowsAsset([
      {
        tag_name: '65.22',
        assets: [
          { name: 'zpaqfranz.exe', browser_download_url: 'https://example.com/zpaqfranz.exe' },
          { name: 'zpaqfranz-full.exe', browser_download_url: 'https://example.com/zpaqfranz-full.exe' },
          { name: 'zpaqfranz64.exe', browser_download_url: 'https://example.com/zpaqfranz64.exe' },
        ],
      },
    ])
    expect(picked?.asset.name).toBe('zpaqfranz-full.exe')
    expect(isZpaqfranzVersionAtLeast('65.10', 65, 11)).toBe(false)
    expect(isZpaqfranzVersionAtLeast('65.11', 65, 11)).toBe(true)
    expect(isZpaqfranzVersionAtLeast('65.22o', 65, 11)).toBe(true)
    expect(isZpaqfranzVersionAtLeast('installed', 65, 11)).toBe(true)
    expect(isZpaqfranzVersionAtLeast(null, 65, 11)).toBe(false)
  })
})
