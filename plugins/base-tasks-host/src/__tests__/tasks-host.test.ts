import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFolioTasksService } from '../task-manager.js'
import { createFolioRuntimeService } from '../../../base-runtime-host/src/host.js'
import { createFolioStorageService } from '../../../base-storage-host/src/host.js'
import { registerBaseTasksHost } from '../host.js'
import { createBoundedQueue } from '../queue.js'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lf-tasks-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map(dir => fsp.rm(dir, { recursive: true, force: true })),
  )
})

describe('@folio/base-tasks-host', () => {
  it('combines overlapping preview work and exposes partial failures without changing operation results', async () => {
    const tasks = createFolioTasksService({
      runtime: { events: { emitEvent() {} } } as unknown as Parameters<typeof createFolioTasksService>[0]['runtime'],
    })
    try {
      let finish: (value: string) => void = () => {}
      const options = { scope: 'files', key: 'thumbs', title: '文件缩略图' }
      const first = tasks.observe(options, () => new Promise<string>(resolve => { finish = resolve }))
      const second = tasks.observe({ ...options, isSuccessful: Boolean }, async () => null)
      expect(tasks.listTasks()).toHaveLength(1)
      expect(tasks.listTasks()[0]).toMatchObject({ status: 'running', progress: { current: 0, total: 2 } })
      await expect(second).resolves.toBeNull()
      finish('jpeg')
      await expect(first).resolves.toBe('jpeg')
      await new Promise(resolve => setTimeout(resolve, 340))
      expect(tasks.listTasks()[0]).toMatchObject({
        status: 'completed',
        progress: { current: 2, total: 2, detail: { succeeded: 1, failed: 1, cancelled: 0 } },
      })
    } finally {
      tasks.dispose()
    }
  })

  it('enforces bounded concurrency and supports signal abort while queued', async () => {
    const queue = createBoundedQueue({ name: 'test', concurrency: 2 })
    let running = 0
    let maxRunning = 0

    const makeWork = (ms: number, val: number) =>
      queue.enqueue(async () => {
        running += 1
        maxRunning = Math.max(maxRunning, running)
        await new Promise(r => setTimeout(r, ms))
        running -= 1
        return val
      })

    const ac = new AbortController()
    const p1 = makeWork(30, 1)
    const p2 = makeWork(30, 2)
    const p3 = queue.enqueue(async () => 3, ac.signal)
    ac.abort()
    const p4 = makeWork(20, 4)

    await expect(p3).rejects.toMatchObject({ name: 'AbortError' })
    const results = await Promise.all([p1, p2, p4])
    expect(results).toEqual([1, 2, 4])
    expect(maxRunning).toBe(2)
    queue.dispose()
  })

  it('throttles SSE progress events and supports pause/resume/cancel via RPC actions', async () => {
    const dataDir = await makeTempDir()
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const { service, dispose } = registerBaseTasksHost({ runtime, throttleMs: 80 })

    const emitted: Array<{ topic: string; status: string; current: number }> = []
    const unsubscribe = runtime.events.subscribe(chunk => {
      if (!chunk.startsWith('event: topic\n')) return
      const dataLine = chunk.split('\n').find(l => l.startsWith('data: '))
      if (!dataLine) return
      const parsed = JSON.parse(dataLine.slice(6)) as {
        topic: string
        payload: { status?: string; progress?: { current: number } }
      }
      if (parsed.topic === 'tasks:demo') {
        emitted.push({
          topic: parsed.topic,
          status: parsed.payload.status ?? '',
          current: parsed.payload.progress?.current ?? 0,
        })
      }
    })

    const handle = service.enqueue({
      scope: 'demo',
      title: '测试扫描任务',
      run: async helpers => {
        for (let i = 1; i <= 10; i += 1) {
          helpers.throwIfAborted()
          await helpers.waitIfPaused()
          helpers.reportProgress({ current: i, total: 10, message: `步骤 ${i}` })
          await new Promise(r => setTimeout(r, 12))
        }
        return 'ok'
      },
    })

    await new Promise(r => setTimeout(r, 30))
    await runtime.executeAction('tasks.pause', { id: handle.id })
    expect(service.getTask(handle.id)?.status).toBe('paused')

    await runtime.executeAction('tasks.resume', { id: handle.id })
    const out = await handle.done
    expect(out).toBe('ok')
    expect(service.getTask(handle.id)?.status).toBe('completed')

    // Throttling should keep emitted running updates strictly fewer than all 10 iterations
    const runningUpdates = emitted.filter(e => e.status === 'running')
    expect(runningUpdates.length).toBeLessThan(10)
    expect(emitted.some(e => e.status === 'paused')).toBe(true)
    expect(emitted.some(e => e.status === 'completed')).toBe(true)

    const listRes = await runtime.executeAction<{ tasks: Array<{ id: string }> }>('tasks.list', {
      scope: 'demo',
    })
    expect(listRes.tasks).toHaveLength(1)

    const clearRes = await runtime.executeAction<{ cleared: number }>('tasks.clear', {
      scope: 'demo',
    })
    expect(clearRes.cleared).toBe(1)

    unsubscribe()
    dispose()
    runtime.dispose()
  })

  it('cancels a paused task immediately', async () => {
    const dataDir = await makeTempDir()
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const { service, dispose } = registerBaseTasksHost({ runtime })

    const handle = service.enqueue({
      scope: 'demo',
      title: '可取消任务',
      run: async helpers => {
        await helpers.waitIfPaused()
        await new Promise(r => setTimeout(r, 500))
        helpers.throwIfAborted()
        return 'done'
      },
    })

    await new Promise(r => setTimeout(r, 20))
    service.pauseTask(handle.id)
    service.cancelTask(handle.id)

    await expect(handle.done).rejects.toMatchObject({ name: 'AbortError' })
    expect(service.getTask(handle.id)?.status).toBe('cancelled')

    dispose()
    runtime.dispose()
  })

  it('executes a Node worker_threads file with progress and result', async () => {
    const dir = await makeTempDir()
    const workerFile = path.join(dir, 'echo.worker.mjs')
    await fsp.writeFile(
      workerFile,
      [
        "import { parentPort, workerData } from 'node:worker_threads';",
        "parentPort?.postMessage({ type: 'progress', payload: { step: 1 } });",
        "parentPort?.postMessage({ type: 'result', data: { echoed: workerData.value * 2 } });",
      ].join('\n'),
      'utf8',
    )

    const storage = createFolioStorageService({ dataDir: dir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })
    const { service, dispose } = registerBaseTasksHost({ runtime })

    const progressEvents: unknown[] = []
    const res = await service.runWorker<{ echoed: number }, { value: number }>({
      workerPath: workerFile,
      input: { value: 21 },
      onProgress: payload => progressEvents.push(payload),
    })

    expect(res).toEqual({ echoed: 42 })
    expect(progressEvents).toEqual([{ step: 1 }])

    dispose()
    runtime.dispose()
  })
})
