import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { FolioError, defineAction, type PluginManifest } from '@folio/lib-shared-contract'
import { createFolioStorageService } from '../../../core-host-storage/src/host.js'
import {
  buildDshAdmission,
  createFolioRuntimeService,
  type ManagedFolioRuntime,
} from '../host.js'

describe('@folio/core-host-runtime', () => {
  let tmpDir: string
  let runtime: ManagedFolioRuntime

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'folio-runtime-'))
    const storage = createFolioStorageService({ dataDir: tmpDir })
    runtime = createFolioRuntimeService({
      storage,
      admit: req => req.headers['x-test-auth'] === 'ok' || 401,
    })
  })

  afterEach(async () => {
    runtime.dispose()
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  it('fails closed without admit, blocks cross-origin, and serves RPC actions', async () => {
    const closedStorage = createFolioStorageService({ dataDir: path.join(tmpDir, 'closed') })
    const closed = createFolioRuntimeService({ storage: closedStorage })
    try {
      const res = await closed.rpc.fetch(
        new Request('http://127.0.0.1:3081/lf/rpc/system.info', {
          method: 'POST',
          headers: { host: '127.0.0.1:3081' },
          body: '{}',
        }),
      )
      expect(res.status).toBe(403)
    } finally {
      closed.dispose()
    }

    const noAuth = await runtime.rpc.fetch(
      new Request('http://127.0.0.1:3081/lf/rpc/system.info', {
        method: 'POST',
        headers: { host: '127.0.0.1:3081' },
        body: '{}',
      }),
    )
    expect(noAuth.status).toBe(401)

    const crossOrigin = await runtime.rpc.fetch(
      new Request('http://127.0.0.1:3081/lf/rpc/system.info', {
        method: 'POST',
        headers: {
          host: '127.0.0.1:3081',
          origin: 'https://evil.example.com',
          'x-test-auth': 'ok',
        },
        body: '{}',
      }),
    )
    expect(crossOrigin.status).toBe(403)

    const okRes = await runtime.rpc.fetch(
      new Request('http://127.0.0.1:3081/lf/rpc/system.info', {
        method: 'POST',
        headers: {
          host: '127.0.0.1:3081',
          origin: 'http://127.0.0.1:3081',
          'x-test-auth': 'ok',
        },
        body: '{}',
      }),
    )
    expect(okRes.status).toBe(200)
    const body = (await okRes.json()) as {
      ok: boolean
      data: { registeredStoragePlugins: string[]; actionIds: string[] }
    }
    expect(body.ok).toBe(true)
    expect(body.data.registeredStoragePlugins).toContain('core-host-runtime')
    expect(body.data.actionIds).toContain('plugins.manifest.get')
  })

  it('persists plugin manifest and emits SSE invalidate events', async () => {
    const controller = new AbortController()
    const sse = await runtime.rpc.fetch(
      new Request('http://127.0.0.1:3081/lf/events', {
        headers: { host: '127.0.0.1:3081', 'x-test-auth': 'ok' },
        signal: controller.signal,
      }),
    )
    const reader = sse.body!.getReader()
    const decoder = new TextDecoder()
    expect(decoder.decode((await reader.read()).value)).toContain('event: ready')

    const manifest = await runtime.executeAction<PluginManifest>('plugins.manifest.get', {})
    expect(manifest.dshPlugins.some(p => p.loaderId === '@folio/shell-overlay-ui')).toBe(true)

    await runtime.executeAction('plugins.manifest.save', {
      ...manifest,
      internalExtensions: [
        {
          id: 'leafer-editor',
          name: '@leafer-in/editor',
          hostPluginId: 'app-canvas-ui',
          ecosystem: 'leaferjs',
          source: 'official',
          description: '画布变换控制点',
          enabled: true,
        },
      ],
    })

    const nextChunk = decoder.decode((await reader.read()).value)
    expect(nextChunk).toContain('event: invalidate')
    expect(nextChunk).toContain('"scope":"plugins"')

    controller.abort()
    await reader.cancel()
  })

  it('maps custom FolioError and probes DSH admission', async () => {
    const off = runtime.registerAction(
      defineAction({
        id: 'demo.fail',
        title: '失败测试',
        tier: 'read',
        input: z.object({}).default({}),
        run: () => {
          throw new FolioError('demo_conflict', '冲突', 409)
        },
      }),
    )
    try {
      const res = await runtime.rpc.fetch(
        new Request('http://127.0.0.1:3081/lf/rpc/demo.fail', {
          method: 'POST',
          headers: { host: '127.0.0.1:3081', 'x-test-auth': 'ok' },
          body: '{}',
        }),
      )
      expect(res.status).toBe(409)
    } finally {
      off()
    }

    const admit = buildDshAdmission({
      get: () => ({ admit: () => ({ peer: 'local' }) }),
      effect: () => {},
      inject: () => {},
    })
    expect(admit({ headers: {} })).toBe(true)
  })
})
