import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFolioFsService } from '../host.js'

describe('@folio/base-fs-host', () => {
  const fsService = createFolioFsService()
  let tempDir = ''

  beforeEach(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lf-base-fs-'))
  })

  afterEach(async () => {
    if (tempDir) {
      await fsp.rm(tempDir, { recursive: true, force: true })
    }
  })

  it('normalizes paths, checks containment, and builds breadcrumbs', () => {
    expect(fsService.normalizePath('  ')).toBe('')
    expect(fsService.normalizePath('bad\0path')).toBe('')
    expect(fsService.normalizePath('"C:"')).toBe('C:\\')

    const child = path.join(tempDir, 'sub', 'file.png')
    expect(fsService.isPathInside(tempDir, child)).toBe(true)
    expect(fsService.isPathInside(tempDir, tempDir)).toBe(false)
    expect(fsService.isPathInside(tempDir, path.join(tempDir, '..', 'escape'))).toBe(false)

    const crumbs = fsService.buildBreadcrumbs(tempDir)
    expect(crumbs.length).toBeGreaterThan(0)
    expect(crumbs[crumbs.length - 1]?.path).toBe(fsService.normalizePath(tempDir))
  })

  it('classifies files and parses PNG dimensions & MIME magic bytes', () => {
    const img = fsService.classifyFile('photo.PNG', false)
    expect(img.category).toBe('image')
    expect(img.mime).toBe('image/png')
    expect(img.isImage).toBe(true)
    expect(img.isStreamableMedia).toBe(true)

    const psdDefault = fsService.classifyFile('art.psd', false)
    expect(psdDefault.category).toBe('image')
    const psdDesign = fsService.classifyFile('art.psd', false, { includeDesignCategory: true })
    expect(psdDesign.category).toBe('design')

    // Minimal valid PNG header with 320x240 IHDR
    const png = Buffer.alloc(24)
    png[0] = 0x89
    png[1] = 0x50
    png[2] = 0x4e
    png[3] = 0x47
    png[4] = 0x0d
    png[5] = 0x0a
    png[6] = 0x1a
    png[7] = 0x0a
    png.writeUInt32BE(320, 16)
    png.writeUInt32BE(240, 20)
    expect(fsService.parseImageDimensionsFromBuffer(png, '.png')).toEqual({
      width: 320,
      height: 240,
    })
    expect(fsService.sniffImageMime(png)).toBe('image/png')
  })

  it('lists directories with extension filtering and serves Range media responses', async () => {
    const mp4Path = path.join(tempDir, 'clip.mp4')
    await fsp.writeFile(mp4Path, Buffer.from('0123456789abcdef'))
    await fsp.writeFile(path.join(tempDir, 'note.txt'), 'hello')
    await fsp.mkdir(path.join(tempDir, 'sub'))

    const listed = await fsService.listDirectory({ path: tempDir, extensions: ['.mp4'] })
    expect(listed.entries.map(e => e.name)).toEqual(['sub', 'clip.mp4'])

    const req = new Request('http://127.0.0.1/media?path=' + encodeURIComponent(mp4Path), {
      headers: { range: 'bytes=2-5' },
    })
    const res = await fsService.serveMediaFile(req, mp4Path)
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 2-5/16')
    expect(await res.text()).toBe('2345')
  })

  it('prunes cache directories by mtimeMs LRU', async () => {
    const f1 = path.join(tempDir, 'a.png')
    const f2 = path.join(tempDir, 'b.png')
    const f3 = path.join(tempDir, 'c.png')
    await fsp.writeFile(f1, Buffer.alloc(100))
    await fsp.writeFile(f2, Buffer.alloc(100))
    await fsp.writeFile(f3, Buffer.alloc(100))
    await fsp.utimes(f1, 1000, 1000)
    await fsp.utimes(f2, 2000, 2000)
    await fsp.utimes(f3, 3000, 3000)

    const pruned = await fsService.pruneCacheDir(tempDir, {
      maxFiles: 2,
      maxBytes: 250,
      extFilter: '.png',
    })
    expect(pruned.removedFiles).toBe(1)
    expect(pruned.remainingFiles).toBe(2)
    expect(pruned.remainingBytes).toBe(200)
  })

  it('writes files atomically and creates missing parent directories', async () => {
    const nestedTarget = path.join(tempDir, 'nested', 'dir', 'state.json')
    await fsService.writeAtomicFile(nestedTarget, JSON.stringify({ ok: true }))
    expect(await fsp.readFile(nestedTarget, 'utf8')).toBe('{"ok":true}')

    const binTarget = path.join(tempDir, 'nested', 'bin.dat')
    await fsService.writeAtomicFile(binTarget, Buffer.from([1, 2, 3, 4]))
    expect(await fsp.readFile(binTarget)).toEqual(Buffer.from([1, 2, 3, 4]))
  })
})
