import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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

function createMockNative(): FolioNativeService {
  const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
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
  it('supports built-in SVG/WIC/Shell providers and dynamic custom format providers', async () => {
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
      native: createMockNative(),
      tasks: tasksHost.service,
    })

    const svgPath = path.join(sampleDir, 'logo.svg')
    await fsp.writeFile(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    const svgRes = await thumbsHost.service.generate({ filePath: svgPath, maxDim: 360 })
    expect(svgRes?.providerId).toBe('svg-direct')
    expect(svgRes?.mime).toBe('image/svg+xml')

    const jpgPath = path.join(sampleDir, 'photo.jpg')
    await fsp.writeFile(jpgPath, Buffer.from('fake-jpg'))
    const jpgRes = await thumbsHost.service.generate({ filePath: jpgPath, maxDim: 360 })
    expect(jpgRes?.providerId).toBe('win-wic-image')
    expect(jpgRes?.mime).toBe('image/jpeg')

    // Unsupported custom extension until dynamically registered
    const blendPath = path.join(sampleDir, 'scene.blend')
    await fsp.writeFile(blendPath, Buffer.from('BLENDER-v305'))
    expect(thumbsHost.service.isSupported(blendPath)).toBe(false)
    expect(await thumbsHost.service.generate({ filePath: blendPath, maxDim: 360 })).toBeNull()

    // Register high-priority custom .blend provider that falls through if null, plus concrete .blend provider
    const fakePng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const disposeNoop = thumbsHost.service.registerProvider({
      id: 'blend-noop',
      priority: 1,
      extensions: ['.blend'],
      async generate() {
        return null
      },
    })
    const disposeBlend = thumbsHost.service.registerProvider({
      id: 'blend-preview',
      title: 'Blender 缩略图扩展',
      priority: 5,
      extensions: ['blend'],
      async generate() {
        return { buffer: fakePng, mime: 'image/png' }
      },
    })

    expect(thumbsHost.service.isSupported(blendPath)).toBe(true)
    expect(thumbsHost.service.listSupportedExtensions()).toContain('.blend')
    const blendRes = await thumbsHost.service.generate({ filePath: blendPath, maxDim: 360 })
    expect(blendRes?.providerId).toBe('blend-preview')
    expect(blendRes?.mime).toBe('image/png')

    const listRes = await runtime.executeAction<{
      providers: Array<{ id: string }>
      extensions: string[]
    }>('thumbs.providers.list', {})
    expect(listRes.providers.some(p => p.id === 'blend-preview')).toBe(true)
    expect(listRes.extensions).toContain('.blend')

    disposeNoop()
    disposeBlend()
    expect(thumbsHost.service.isSupported(blendPath)).toBe(false)

    thumbsHost.dispose()
    tasksHost.dispose()
    runtime.dispose()
  })
})
