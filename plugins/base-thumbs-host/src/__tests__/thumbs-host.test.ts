import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FolioNativeService, NativeImageProxyResult } from '@folio/base-contract'
import { createFolioRuntimeService } from '../../../base-runtime-host/src/host.js'
import { createFolioStorageService } from '../../../base-storage-host/src/host.js'
import { registerBaseTasksHost } from '../../../base-tasks-host/src/host.js'
import { registerBaseThumbsHost } from '../host.js'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lf-thumbs-host-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(dir => fsp.rm(dir, { recursive: true, force: true })),
  )
})

function createMockNative(options?: {
  readonly shellExts?: ReadonlySet<string>
  readonly wicCalls?: string[]
  readonly shellCalls?: string[]
}): FolioNativeService {
  const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
  const shellExts = options?.shellExts ?? new Set(['.cdr', '.mp4', '.pdf'])
  return {
    async getThumbnail(filePath): Promise<NativeImageProxyResult | null> {
      options?.shellCalls?.push(filePath)
      const ext = path.extname(filePath).toLowerCase()
      if (!shellExts.has(ext)) return null
      return { buffer: fakeJpeg, mime: 'image/jpeg' }
    },
    async renderImageProxy(filePath): Promise<NativeImageProxyResult | null> {
      options?.wicCalls?.push(filePath)
      return { buffer: fakeJpeg, mime: 'image/jpeg' }
    },
    async pickFolder() {
      return { supported: true, cancelled: true, folderPath: null }
    },
    async pickFiles() {
      return { supported: true, cancelled: true, paths: [] }
    },
    async revealPath(targetPath) {
      return { revealedPath: targetPath }
    },
    async openPath(targetPath) {
      return { openedPath: targetPath }
    },
    async setHiddenAttribute() {
      return true
    },
  }
}

describe('@folio/base-thumbs-host', () => {
  it.each([['psd', 1], ['psb', 2]] as const)(
    'reads an embedded JPEG from a %s before invoking the Windows provider',
    async (ext, version) => {
      const dir = await makeTempDir()
      const filePath = path.join(dir, `large.${ext}`)
      const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex')
      const header = Buffer.alloc(34)
      header.write('8BPS')
      header.writeUInt16BE(version, 4)
      const block = Buffer.alloc(12 + 28 + jpeg.length + (jpeg.length % 2))
      block.write('8BIM')
      block.writeUInt16BE(1036, 4)
      block.writeUInt32BE(28 + jpeg.length, 8)
      block.writeUInt32BE(1, 12)
      block.writeUInt32BE(64, 16)
      block.writeUInt32BE(64, 20)
      block.writeUInt32BE(jpeg.length, 32)
      block.writeUInt16BE(24, 36)
      block.writeUInt16BE(1, 38)
      jpeg.copy(block, 40)
      header.writeUInt32BE(block.length, 30)
      await fsp.writeFile(filePath, Buffer.concat([header, block]))
      await fsp.truncate(filePath, 201 * 1024 * 1024)

      const storage = createFolioStorageService({ dataDir: dir })
      const runtime = createFolioRuntimeService({ storage, admit: () => true, trustedOrigins: [] })
      const tasks = registerBaseTasksHost({ runtime })
      const shellCalls: string[] = []
      const host = registerBaseThumbsHost({
        runtime, storage, tasks: tasks.service,
        native: createMockNative({ shellExts: new Set([ext === 'psd' ? '.psd' : '.psb']), shellCalls }),
      })
      try {
        expect(await host.service.generate({ filePath })).toMatchObject({
          providerId: 'psd-embedded-jpeg',
          mime: 'image/jpeg',
          buffer: jpeg,
        })
        expect(shellCalls).toEqual([])
      } finally {
        host.dispose()
        tasks.dispose()
        runtime.dispose()
      }
    },
  )

  it('retries an older miss and asks Windows Shell for a large PSD', async () => {
    const dir = await makeTempDir()
    const storage = createFolioStorageService({ dataDir: dir })
    const runtime = createFolioRuntimeService({ storage, admit: () => true, trustedOrigins: [] })
    const tasks = registerBaseTasksHost({ runtime })
    const shellExts = new Set<string>()
    const native = createMockNative({ shellExts })
    const host = registerBaseThumbsHost({ runtime, storage, native, tasks: tasks.service })
    const filePath = path.join(dir, 'large.psd')
    const clock = vi.spyOn(Date, 'now')
    try {
      await fsp.writeFile(filePath, '')
      await fsp.truncate(filePath, 201 * 1024 * 1024)
      const enteredAt = Date.now()
      clock.mockReturnValue(enteredAt - 10 * 60_000)
      expect(await host.service.generate({ filePath })).toBeNull()
      clock.mockReturnValue(enteredAt)
      shellExts.add('.psd')
      expect(await host.service.generate({ filePath })).toMatchObject({ mime: 'image/jpeg' })
    } finally {
      clock.mockRestore()
      host.dispose()
      tasks.dispose()
      runtime.dispose()
    }
  })

  it('supports L0 blacklist, Try-First L1a/L1b catch-all (.cdr), and dynamic custom format providers', async () => {
    const dataDir = await makeTempDir()
    const sampleDir = await makeTempDir()
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const tasksHost = registerBaseTasksHost({ runtime })
    const wicCalls: string[] = []
    const shellCalls: string[] = []
    const thumbsHost = registerBaseThumbsHost({
      runtime,
      storage,
      native: createMockNative({ wicCalls, shellCalls }),
      tasks: tasksHost.service,
    })

    // L0 misc blacklist -> IGNORED
    const txtPath = path.join(sampleDir, 'readme.txt')
    await fsp.writeFile(txtPath, 'hello')
    expect(thumbsHost.service.isIgnored(txtPath)).toBe(true)
    expect(thumbsHost.service.isSupported(txtPath)).toBe(false)
    expect(await thumbsHost.service.generate({ filePath: txtPath, maxDim: 360 })).toBeNull()

    // L1a SVG direct
    const svgPath = path.join(sampleDir, 'logo.svg')
    await fsp.writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    const svgRes = await thumbsHost.service.generate({ filePath: svgPath, maxDim: 360 })
    expect(svgRes?.providerId).toBe('svg-direct')
    expect(svgRes?.mime).toBe('image/svg+xml')

    // L1a WIC image
    const jpgPath = path.join(sampleDir, 'photo.jpg')
    await fsp.writeFile(jpgPath, Buffer.from('fake-jpg'))
    const jpgRes = await thumbsHost.service.generate({ filePath: jpgPath, maxDim: 360 })
    expect(jpgRes?.providerId).toBe('win-wic-image')
    expect(jpgRes?.mime).toBe('image/jpeg')

    // L0 cache hit on repeated call (wicCalls should NOT increase)
    const wicCountBefore = wicCalls.length
    const jpgCached = await thumbsHost.service.generate({ filePath: jpgPath, maxDim: 360 })
    expect(jpgCached?.providerId).toBe('win-wic-image')
    expect(wicCalls.length).toBe(wicCountBefore)

    // L1b Windows Shell catch-all automatically handles .cdr without whitelist
    const cdrPath = path.join(sampleDir, 'design.cdr')
    await fsp.writeFile(cdrPath, Buffer.from('CDR-BINARY'))
    expect(thumbsHost.service.isSupported(cdrPath)).toBe(true)
    const cdrRes = await thumbsHost.service.generate({ filePath: cdrPath, maxDim: 360 })
    expect(cdrRes?.providerId).toBe('win-shell-media')
    expect(shellCalls).toContain(cdrPath)

    // Unsupported by Shell (.blend) -> MISSING until dynamic custom provider registered
    const blendPath = path.join(sampleDir, 'scene.blend')
    await fsp.writeFile(blendPath, Buffer.from('BLENDER-v305'))
    expect(await thumbsHost.service.generate({ filePath: blendPath, maxDim: 360 })).toBeNull()
    const [blendStatus] = await thumbsHost.service.queryStatus([blendPath])
    expect(blendStatus?.status).toBe('MISSING')

    // Dynamic custom provider overrides via priority
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const disposeBlend = thumbsHost.service.registerProvider({
      id: 'blend-preview',
      title: 'Blender 缩略图扩展',
      priority: 5,
      extensions: ['blend'],
      async generate() {
        return { buffer: fakePng, mime: 'image/png' }
      },
    })

    const blendRes = await thumbsHost.service.generate({
      filePath: blendPath,
      maxDim: 360,
      force: true,
    })
    expect(blendRes?.providerId).toBe('blend-preview')
    expect(blendRes?.mime).toBe('image/png')

    const listRes = await runtime.executeAction<{
      providers: Array<{ id: string; manualOnly: boolean; queueType: string }>
      ignoredExtensions: string[]
    }>('thumbs.providers.list', {})
    expect(listRes.providers.some(p => p.id === 'blend-preview')).toBe(true)
    expect(listRes.ignoredExtensions).toContain('.txt')

    disposeBlend()
    thumbsHost.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })

  it('strictly isolates manualOnly Eagle provider and resets deleted Eagle cache to MISSING without auto-triggering', async () => {
    const dataDir = await makeTempDir()
    const sampleDir = await makeTempDir()
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const tasksHost = registerBaseTasksHost({ runtime })
    const thumbsHost = registerBaseThumbsHost({
      runtime,
      storage,
      native: createMockNative({ shellExts: new Set() }),
      tasks: tasksHost.service,
    })

    let eagleCalls = 0
    const fakeWebp = Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ')
    thumbsHost.service.registerProvider({
      id: 'eagle',
      title: 'Eagle 手动兜底',
      priority: 200,
      queueType: 'eagle',
      manualOnly: true,
      extensions: ['*'],
      async generate(req) {
        eagleCalls += 1
        if (req.filePath.endsWith('.broken')) return null
        return { buffer: fakeWebp, mime: 'image/webp' }
      },
    })

    const c4dPath = path.join(sampleDir, 'hero.c4d')
    const brokenPath = path.join(sampleDir, 'corrupt.broken')
    const logPath = path.join(sampleDir, 'debug.log')
    await Promise.all([
      fsp.writeFile(c4dPath, Buffer.from('C4D')),
      fsp.writeFile(brokenPath, Buffer.from('BROKEN')),
      fsp.writeFile(logPath, 'log'),
    ])

    // Entry A: auto batch NEVER invokes manualOnly Eagle
    const batch = await thumbsHost.service.generateAutoBatch([c4dPath, brokenPath, logPath])
    expect(eagleCalls).toBe(0)
    expect(batch.ignored.map(i => i.filePath)).toContain(path.resolve(logPath))
    expect(batch.missing.map(i => i.filePath)).toContain(path.resolve(c4dPath))
    expect(batch.missing.map(i => i.filePath)).toContain(path.resolve(brokenPath))

    // Entry B: manual run invokes Eagle serially; success -> READY, failure -> FAILED_EAGLE
    const manualRes = await thumbsHost.service.generateManual({
      providerId: 'eagle',
      filePaths: [c4dPath, brokenPath],
    })
    expect(eagleCalls).toBe(2)
    const c4dEntry = manualRes.find(r => r.filePath === path.resolve(c4dPath))
    const brokenEntry = manualRes.find(r => r.filePath === path.resolve(brokenPath))
    expect(c4dEntry?.status).toBe('READY')
    expect(c4dEntry?.providerId).toBe('eagle')
    expect(c4dEntry?.cachePath).toBeTruthy()
    expect(brokenEntry?.status).toBe('FAILED_EAGLE')

    // Delete Eagle cache file on disk -> auto generate MUST reset to MISSING and NEVER auto-invoke Eagle
    await fsp.unlink(c4dEntry!.cachePath!)
    const afterDelete = await thumbsHost.service.generate({ filePath: c4dPath })
    expect(afterDelete).toBeNull()
    expect(eagleCalls).toBe(2)
    const [resetStatus] = await thumbsHost.service.queryStatus([c4dPath])
    expect(resetStatus?.status).toBe('MISSING')

    // Cache stats and clear actions
    const stats = await thumbsHost.service.getCacheStats()
    expect(stats.entryCount).toBeGreaterThanOrEqual(3)
    const cleared = await thumbsHost.service.clearCache()
    expect(cleared.clearedEntries).toBeGreaterThanOrEqual(3)

    thumbsHost.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })
})
