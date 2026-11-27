import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFolioNativeService } from '../host.js'
import { createNoopNativeMediaPool } from '../win-media-pool.js'
import { normalizeLocalPath } from '../win-shell.js'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lf-native-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(dir => fsp.rm(dir, { recursive: true, force: true })),
  )
})

describe('@folio/base-native-host', () => {
  it('normalizes local paths and rejects NUL or empty inputs', () => {
    expect(normalizeLocalPath('')).toBe('')
    expect(normalizeLocalPath('   ')).toBe('')
    expect(normalizeLocalPath('C:\\foo\0bar')).toBe('')
    if (process.platform === 'win32') {
      expect(normalizeLocalPath('c:')).toBe('C:\\')
      expect(normalizeLocalPath('d:\\work\\demo\\..')).toBe('D:\\work')
    }
  })

  it('provides noop media fallback and rejects missing paths on open/reveal', async () => {
    const service = createFolioNativeService({
      mediaPool: createNoopNativeMediaPool(),
    })

    expect(await service.getThumbnail('missing.png', 120)).toBeNull()
    expect(await service.renderImageProxy('missing.png', 360)).toBeNull()

    const missing = path.join(os.tmpdir(), `definitely-missing-${Date.now()}.txt`)
    await expect(service.revealPath(missing)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    })
    await expect(service.openPath(missing)).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    })

    if (process.platform !== 'win32') {
      expect(await service.pickSaveFile?.({ defaultName: 'test.vectorcraft' })).toEqual({
        supported: false,
        cancelled: false,
        filePath: null,
      })
    }

    service.dispose()
  })

  it('can set Windows hidden attribute on a directory without throwing', async () => {
    const dir = await makeTempDir()
    const hiddenDir = path.join(dir, '.folio-meta')
    await fsp.mkdir(hiddenDir)

    const service = createFolioNativeService({
      mediaPool: createNoopNativeMediaPool(),
    })
    const ok = await service.setHiddenAttribute(hiddenDir)
    expect(typeof ok).toBe('boolean')
    if (process.platform === 'win32') {
      expect(ok).toBe(true)
    }
    service.dispose()
  })
})
