import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createFolioStorageService, createFsSeam } from '../host.js'

describe('@folio/base-storage-host', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'folio-storage-'))
  })

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  it('allocates isolated data and cache directories per plugin and prevents path escape', async () => {
    const storage = createFolioStorageService({ dataDir: tmpDir })
    const canvasNs = storage.forPlugin('@folio/app-canvas-storage')
    const filesNs = storage.forPlugin('app-files-tree')

    expect(canvasNs.pluginId).toBe('app-canvas-storage')
    expect(fs.existsSync(canvasNs.dataDir)).toBe(true)
    expect(fs.existsSync(canvasNs.cacheDir)).toBe(true)
    expect(canvasNs.dataDir).not.toBe(filesNs.dataDir)
    expect(storage.listRegisteredPlugins()).toEqual(['app-canvas-storage', 'app-files-tree'])

    const store = canvasNs.jsonStore('settings.json', z.object({ snap: z.boolean() }), () => ({
      snap: true,
    }))
    expect(await store.read()).toEqual({ snap: true })
    await store.write({ snap: false })
    expect(await store.read()).toEqual({ snap: false })

    expect(() => canvasNs.dataPath('..', 'escape.json')).toThrow(/禁止越界/)
  })

  it('safely probes ctx.get("fs") without throwing on Cordis-style Proxy contexts', async () => {
    const files = new Map<string, string>()
    const fakeDshFs = {
      resolve: vi.fn(async (p: string) => ({ targetKey: `opaque:${p}`, displayPath: p })),
      readText: vi.fn(async (target: { targetKey: string }) => {
        expect(target.targetKey).toBeTypeOf('string')
        const text = files.get(target.targetKey)
        if (text === undefined) throw Object.assign(new Error('missing file'), { code: 'FS_NOT_FOUND' })
        return text
      }),
      writeText: vi.fn(async (target: { targetKey: string }, text: string) => {
        expect(target.targetKey).toBeTypeOf('string')
        files.set(target.targetKey, text)
      }),
      stat: vi.fn(async (target: { targetKey: string }) => files.has(target.targetKey) ? {} : undefined),
      listDir: vi.fn(async (target: { displayPath: string }) => {
        expect(target.displayPath).toBe('/virtual')
        return [{ name: 'sub', type: 'directory', target: { displayPath: '/virtual/sub' } }]
      }),
      deleteFile: vi.fn(async (target: { targetKey: string }) => {
        if (!files.delete(target.targetKey)) throw Object.assign(new Error('missing file'), { code: 'FS_STALE_VERSION' })
      }),
    }
    const proxyCtx = new Proxy(
      { get: (name: string) => (name === 'fs' ? fakeDshFs : undefined) },
      {
        get(target, prop) {
          if (prop === 'fs') throw new Error('cannot get property "fs" without inject')
          return (target as Record<PropertyKey, unknown>)[prop]
        },
      },
    )

    const seam = createFsSeam(proxyCtx)
    expect(seam.provider).toBe('dsh-ctx-fs')
    expect(await seam.readText('/virtual/a.json')).toBeNull()
    expect(await seam.exists('/virtual/a.json')).toBe(false)
    await seam.writeText('/virtual/a.json', '{"ok":true}')
    expect(await seam.readText('/virtual/a.json')).toBe('{"ok":true}')
    expect(await seam.exists('/virtual/a.json')).toBe(true)
    expect(await seam.listDir('/virtual')).toEqual([{ name: 'sub', path: '/virtual/sub', isDirectory: true }])
    await seam.remove('/virtual/a.json')
    await expect(seam.remove('/virtual/a.json')).resolves.toBeUndefined()
    expect(await seam.readText('/virtual/a.json')).toBeNull()
  })
})
