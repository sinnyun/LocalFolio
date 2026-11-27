import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFolioFsService } from '../../../base-fs-host/src/host.js'
import { createFolioRuntimeService, type ManagedFolioRuntime } from '../../../base-runtime-host/src/host.js'
import { createFolioStorageService } from '../../../base-storage-host/src/host.js'
import { buildBreadcrumbs, classifyFile, getParentPath, parseImageDimensionsFromBuffer } from '../classify.js'
import { registerWorkspaceFilesHost, type ShellThumbProvider } from '../host.js'
import type {
  FavoritesState,
  FileInspectResult,
  ListDirectoryResult,
  MetadataSnapshot,
  TagDef,
  TagFilesResult,
  TreeNodeInfo,
} from '../types.js'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAYAAAC56t6BAAAAD0lEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
  'base64',
)

describe('@folio/workspace-files-host', () => {
  let tmpDir: string
  let sampleRoot: string
  let runtime: ManagedFolioRuntime
  let disposeFiles: () => void
  let thumbCalls: Array<{ filePath: string; size: number }>

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'folio-files-host-'))
    const dataDir = path.join(tmpDir, 'appdata')
    sampleRoot = path.join(tmpDir, 'sample')
    await fsp.mkdir(path.join(sampleRoot, 'alpha-dir', 'nested'), { recursive: true })
    await fsp.mkdir(path.join(sampleRoot, '.hidden-dir'), { recursive: true })
    await fsp.writeFile(path.join(sampleRoot, 'photo.png'), TINY_PNG)
    await fsp.writeFile(path.join(sampleRoot, 'notes.md'), '# Hello LocalFolio\nLine 2\n', 'utf8')
    await fsp.writeFile(path.join(sampleRoot, 'icon.svg'), '<svg viewBox="0 0 64 48"></svg>', 'utf8')
    await fsp.writeFile(path.join(sampleRoot, 'alpha-dir', 'inside.txt'), 'inside child', 'utf8')
    await fsp.writeFile(path.join(sampleRoot, '.secret.txt'), 'hidden', 'utf8')

    thumbCalls = []
    const stubThumbProvider: ShellThumbProvider = {
      async getThumbnail(filePath, size) {
        thumbCalls.push({ filePath, size })
        if (filePath.endsWith('photo.png')) {
          return TINY_PNG
        }
        return null
      },
      dispose() {},
    }

    const storage = createFolioStorageService({ dataDir })
    runtime = createFolioRuntimeService({
      storage,
      admit: req => req.headers['x-test-auth'] === 'ok' || 401,
    })
    disposeFiles = registerWorkspaceFilesHost({
      runtime,
      storage,
      fs: createFolioFsService(),
      thumbProvider: stubThumbProvider,
    })
  })

  afterEach(async () => {
    disposeFiles()
    runtime.dispose()
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  it('classifies files, parses image headers, and builds breadcrumbs', () => {
    expect(classifyFile('demo.png', false)).toMatchObject({
      ext: '.png',
      category: 'image',
      mime: 'image/png',
      thumbSupported: true,
    })
    expect(classifyFile('folder', true)).toMatchObject({
      category: 'folder',
      thumbSupported: true,
    })
    expect(parseImageDimensionsFromBuffer(TINY_PNG, '.png')).toEqual({ width: 2, height: 3 })

    const crumbs = buildBreadcrumbs(path.join(sampleRoot, 'alpha-dir'))
    expect(crumbs.length).toBeGreaterThanOrEqual(2)
    expect(crumbs[crumbs.length - 1]?.name).toBe('alpha-dir')
    expect(getParentPath(path.join(sampleRoot, 'alpha-dir'))).toBe(path.resolve(sampleRoot))
  })

  it('lists directories, parent-child groups, tree children, and pins folders', async () => {
    const flat = await runtime.executeAction<ListDirectoryResult>('files.list', {
      path: sampleRoot,
      showHidden: false,
      includeSubdirChildren: false,
    })
    const names = flat.entries.map(e => e.name)
    expect(names).toContain('alpha-dir')
    expect(names).toContain('photo.png')
    expect(names).not.toContain('.secret.txt')
    expect(names).not.toContain('.hidden-dir')
    expect(flat.childGroups).toEqual([])

    const withHiddenAndGroups = await runtime.executeAction<ListDirectoryResult>('files.list', {
      path: sampleRoot,
      showHidden: true,
      includeSubdirChildren: true,
    })
    expect(withHiddenAndGroups.entries.map(e => e.name)).toContain('.secret.txt')
    const alphaGroup = withHiddenAndGroups.childGroups.find(g => g.folderName === 'alpha-dir')
    expect(alphaGroup).toBeDefined()
    expect(alphaGroup?.entries.map(e => e.name)).toContain('inside.txt')

    const tree = await runtime.executeAction<{ path: string; children: TreeNodeInfo[] }>('files.tree', {
      path: sampleRoot,
      showHidden: false,
    })
    expect(tree.children).toEqual([
      {
        name: 'alpha-dir',
        path: path.resolve(sampleRoot, 'alpha-dir'),
        hasSubdirs: true,
      },
    ])

    await runtime.executeAction('files.prefs.pin', { path: path.join(sampleRoot, 'alpha-dir') })
    const roots = await runtime.executeAction<{
      quickFolders: Array<{ path: string; pinned: boolean }>
      drives: Array<{ path: string; totalBytes: number }>
    }>('files.roots', {})
    expect(roots.drives.length).toBeGreaterThan(0)
    expect(
      roots.quickFolders.some(
        q => q.pinned && q.path.toLowerCase() === path.resolve(sampleRoot, 'alpha-dir').toLowerCase(),
      ),
    ).toBe(true)

    await runtime.executeAction('files.prefs.unpin', { path: path.join(sampleRoot, 'alpha-dir') })
    const rootsAfter = await runtime.executeAction<{
      quickFolders: Array<{ path: string; pinned: boolean }>
    }>('files.roots', {})
    expect(rootsAfter.quickFolders.some(q => q.pinned)).toBe(false)
  })

  it('inspects files and serves Windows shell thumbnails and range media behind auth', async () => {
    const imgInspect = await runtime.executeAction<FileInspectResult>('files.inspect', {
      path: path.join(sampleRoot, 'photo.png'),
    })
    expect(imgInspect.imageDimensions).toEqual({ width: 2, height: 3 })
    expect(imgInspect.mediaUrl).toContain('/lf/files/media?path=')
    expect(imgInspect.thumbUrl).toContain('/lf/files/thumb?path=')

    const mdInspect = await runtime.executeAction<FileInspectResult>('files.inspect', {
      path: path.join(sampleRoot, 'notes.md'),
    })
    expect(mdInspect.textPreview).toContain('# Hello LocalFolio')

    const dirInspect = await runtime.executeAction<FileInspectResult>('files.inspect', {
      path: path.join(sampleRoot, 'alpha-dir'),
    })
    expect(dirInspect.childCount).toBe(2)
    expect(dirInspect.folderChildCount).toBe(1)
    expect(dirInspect.fileChildCount).toBe(1)

    const unauthThumb = await runtime.rpc.fetch(
      new Request(
        `http://127.0.0.1:3081/lf/files/thumb?path=${encodeURIComponent(path.join(sampleRoot, 'photo.png'))}&size=180`,
        { headers: { host: '127.0.0.1:3081' } },
      ),
    )
    expect(unauthThumb.status).toBe(401)

    const thumbRes = await runtime.rpc.fetch(
      new Request(
        `http://127.0.0.1:3081/lf/files/thumb?path=${encodeURIComponent(path.join(sampleRoot, 'photo.png'))}&size=180`,
        { headers: { host: '127.0.0.1:3081', 'x-test-auth': 'ok' } },
      ),
    )
    expect(thumbRes.status).toBe(200)
    expect(thumbRes.headers.get('content-type')).toBe('image/png')
    expect(thumbCalls[0]?.size).toBe(256)
    const etag = thumbRes.headers.get('etag')!
    expect(etag).toBeTruthy()

    const thumb304 = await runtime.rpc.fetch(
      new Request(
        `http://127.0.0.1:3081/lf/files/thumb?path=${encodeURIComponent(path.join(sampleRoot, 'photo.png'))}&size=180`,
        {
          headers: {
            host: '127.0.0.1:3081',
            'x-test-auth': 'ok',
            'if-none-match': etag,
          },
        },
      ),
    )
    expect(thumb304.status).toBe(304)

    const noThumb = await runtime.rpc.fetch(
      new Request(
        `http://127.0.0.1:3081/lf/files/thumb?path=${encodeURIComponent(path.join(sampleRoot, 'notes.md'))}&size=160`,
        { headers: { host: '127.0.0.1:3081', 'x-test-auth': 'ok' } },
      ),
    )
    expect(noThumb.status).toBe(204)

    const svgMedia = await runtime.rpc.fetch(
      new Request(
        `http://127.0.0.1:3081/lf/files/media?path=${encodeURIComponent(path.join(sampleRoot, 'icon.svg'))}`,
        { headers: { host: '127.0.0.1:3081', 'x-test-auth': 'ok' } },
      ),
    )
    expect(svgMedia.status).toBe(200)
    expect(svgMedia.headers.get('content-security-policy')).toBe('sandbox')

    const rangeMedia = await runtime.rpc.fetch(
      new Request(
        `http://127.0.0.1:3081/lf/files/media?path=${encodeURIComponent(path.join(sampleRoot, 'photo.png'))}`,
        {
          headers: {
            host: '127.0.0.1:3081',
            'x-test-auth': 'ok',
            range: 'bytes=0-7',
          },
        },
      ),
    )
    expect(rangeMedia.status).toBe(206)
    expect(rangeMedia.headers.get('content-range')).toBe(`bytes 0-7/${TINY_PNG.length}`)
    const bytes = Buffer.from(await rangeMedia.arrayBuffer())
    expect(bytes.equals(TINY_PNG.subarray(0, 8))).toBe(true)
  })

  it('manages grouped folder favorites and protects the default group', async () => {
    const initial = await runtime.executeAction<FavoritesState>('files.favorites.get', {})
    expect(initial.groups.map(g => g.id)).toEqual(['default'])
    expect(initial.items).toEqual([])

    const withGroup = await runtime.executeAction<FavoritesState>('files.favorites.group.create', {
      name: '工作项目',
      color: '#10b981',
    })
    const workGroup = withGroup.groups.find(g => g.name === '工作项目')!
    expect(workGroup).toBeDefined()

    const added = await runtime.executeAction<FavoritesState>('files.favorites.add', {
      path: path.join(sampleRoot, 'alpha-dir'),
      name: 'Alpha 素材',
      groupId: workGroup.id,
    })
    expect(added.items).toHaveLength(1)
    expect(added.items[0]).toMatchObject({
      name: 'Alpha 素材',
      groupId: workGroup.id,
      path: path.resolve(sampleRoot, 'alpha-dir'),
    })

    const renamedGroup = await runtime.executeAction<FavoritesState>('files.favorites.group.update', {
      id: workGroup.id,
      name: '设计项目',
      color: '#f59e0b',
    })
    expect(renamedGroup.groups.find(g => g.id === workGroup.id)?.name).toBe('设计项目')

    await expect(
      runtime.executeAction('files.favorites.group.delete', { id: 'default' }),
    ).rejects.toThrow()

    const afterDeleteGroup = await runtime.executeAction<FavoritesState>(
      'files.favorites.group.delete',
      { id: workGroup.id, mode: 'move-to-default' },
    )
    expect(afterDeleteGroup.groups.some(g => g.id === workGroup.id)).toBe(false)
    expect(afterDeleteGroup.items[0]?.groupId).toBe('default')

    const afterRemove = await runtime.executeAction<FavoritesState>('files.favorites.remove', {
      path: path.join(sampleRoot, 'alpha-dir'),
    })
    expect(afterRemove.items).toHaveLength(0)
  })

  it('manages file tags, ratings, notes, tag aggregation, and missing-record pruning', async () => {
    const created = await runtime.executeAction<{
      tag: TagDef
      tags: TagDef[]
      tagCounts: Record<string, number>
    }>('files.tags.create', {
      name: '精选原图',
      color: '#ec4899',
      description: '高质量图片',
    })
    expect(created.tag.name).toBe('精选原图')

    await expect(
      runtime.executeAction('files.tags.create', { name: '精选原图' }),
    ).rejects.toThrow()

    const photoPath = path.join(sampleRoot, 'photo.png')
    const ghostPath = path.join(sampleRoot, 'deleted-file.png')
    await fsp.writeFile(ghostPath, TINY_PNG)

    await runtime.executeAction('files.meta.set', {
      path: photoPath,
      rating: 5,
      tagIds: [created.tag.id],
      note: '首页头图素材',
    })
    await runtime.executeAction('files.meta.set', {
      path: ghostPath,
      rating: 3,
      tagIds: [created.tag.id],
    })

    // Delete ghost file on disk to test missingPaths reporting & pruning
    await fsp.unlink(ghostPath)

    const agg = await runtime.executeAction<TagFilesResult>('files.tags.files', {
      tagId: created.tag.id,
    })
    expect(agg.entries.map(e => e.name)).toEqual(['photo.png'])
    expect(agg.missingPaths).toEqual([path.resolve(ghostPath)])

    const pruned = await runtime.executeAction<{ removedCount: number }>('files.meta.pruneMissing', {
      paths: agg.missingPaths,
    })
    expect(pruned.removedCount).toBe(1)

    // Clearing rating/tags/note removes record automatically
    await runtime.executeAction('files.meta.set', {
      path: photoPath,
      rating: 0,
      tagIds: [],
      note: '',
    })
    const metaEmpty = await runtime.executeAction<MetadataSnapshot>('files.meta.get', {})
    expect(Object.keys(metaEmpty.files)).toHaveLength(0)

    // Re-attach and delete tag to test cascade removal
    await runtime.executeAction('files.meta.set', {
      path: photoPath,
      tagIds: [created.tag.id],
    })
    const afterTagDelete = await runtime.executeAction<MetadataSnapshot>('files.tags.delete', {
      id: created.tag.id,
    })
    expect(afterTagDelete.tags).toHaveLength(0)
    expect(Object.keys(afterTagDelete.files)).toHaveLength(0)
  })

  it('serves arbitrary files via /lf/files/download behind auth with ETag and Content-Disposition', async () => {
    const mdPath = path.join(sampleRoot, 'notes.md')
    const noAuth = await runtime.rpc.fetch(
      new Request(`http://127.0.0.1:3081/lf/files/download?path=${encodeURIComponent(mdPath)}`, {
        headers: { host: '127.0.0.1:3081' },
      }),
    )
    expect(noAuth.status).toBe(401)

    const dirRes = await runtime.rpc.fetch(
      new Request(
        `http://127.0.0.1:3081/lf/files/download?path=${encodeURIComponent(path.join(sampleRoot, 'alpha-dir'))}`,
        { headers: { host: '127.0.0.1:3081', 'x-test-auth': 'ok' } },
      ),
    )
    expect(dirRes.status).toBe(400)

    const okRes = await runtime.rpc.fetch(
      new Request(`http://127.0.0.1:3081/lf/files/download?path=${encodeURIComponent(mdPath)}`, {
        headers: { host: '127.0.0.1:3081', 'x-test-auth': 'ok' },
      }),
    )
    expect(okRes.status).toBe(200)
    expect(okRes.headers.get('content-disposition')).toContain('notes.md')
    expect(okRes.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await okRes.text()).toContain('# Hello LocalFolio')

    const etag = okRes.headers.get('etag')!
    const notMod = await runtime.rpc.fetch(
      new Request(`http://127.0.0.1:3081/lf/files/download?path=${encodeURIComponent(mdPath)}`, {
        headers: {
          host: '127.0.0.1:3081',
          'x-test-auth': 'ok',
          'if-none-match': etag,
        },
      }),
    )
    expect(notMod.status).toBe(304)
  })
})
