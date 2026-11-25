import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createFolioStorageService, createFsSeam } from '../host.js'

describe('@folio/core-host-storage', () => {
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
      readText: vi.fn(async (p: string) => files.get(p) ?? null),
      writeText: vi.fn(async (p: string, text: string) => {
        files.set(p, text)
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
    await seam.writeText('/virtual/a.json', '{"ok":true}')
    expect(await seam.readText('/virtual/a.json')).toBe('{"ok":true}')
  })
})
