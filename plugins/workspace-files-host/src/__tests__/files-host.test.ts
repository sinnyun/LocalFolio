import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFolioRuntimeService, type ManagedFolioRuntime } from '../../../base-runtime-host/src/host.js'
import { createFolioStorageService } from '../../../base-storage-host/src/host.js'
import { buildBreadcrumbs, classifyFile, getParentPath, parseImageDimensionsFromBuffer } from '../classify.js'
import { registerWorkspaceFilesHost, type ShellThumbProvider } from '../host.js'
import type { FileInspectResult, ListDirectoryResult, TreeNodeInfo } from '../types.js'

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
})
