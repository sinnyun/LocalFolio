import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createFolioTasksService } from '../task-manager.js'
import { createTaskLedger } from '../task-ledger.js'
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

  it('tracks item-level results for observe activities', async () => {
    const tasks = createFolioTasksService({
      runtime: { events: { emitEvent() {} } } as unknown as Parameters<typeof createFolioTasksService>[0]['runtime'],
    })
    try {
      await tasks.observe(
        { scope: 'demo', key: 'activity', title: '活动', item: 'a.jpg', isSuccessful: Boolean },
        async () => true,
      )
      await tasks.observe(
        {
          scope: 'demo',
          key: 'activity',
          title: '活动',
          item: 'b.jpg',
          isSuccessful: Boolean,
          retry: { kind: 'activity-retry' },
        },
        async () => null,
      )
      await new Promise(resolve => setTimeout(resolve, 340))
      const snap = tasks.listTasks('demo')[0]!
      expect(snap.items).toMatchObject({ total: 2, succeeded: 1, failed: 1 })
      expect(tasks.listTaskItems(snap.id, { status: 'failed' }).items.map(item => item.key)).toEqual([
        'b.jpg',
      ])
    } finally {
      tasks.dispose()
    }
  })

  it('tracks per-item results and retries selected failed items through the registered handler', async () => {
    const tasks = createFolioTasksService({
      runtime: { events: { emitEvent() {} } } as unknown as Parameters<typeof createFolioTasksService>[0]['runtime'],
    })
    const requested: string[][] = []
    const disposeHandler = tasks.registerRetryHandler({
      kind: 'demo-retry',
      retry: ({ task, items }) => {
        requested.push(items.map(item => item.key))
        const retry = tasks.enqueue({
          scope: 'demo',
          title: '重试失败项',
          retryOf: task.id,
          retry: { kind: 'demo-retry' },
          run: async () => 'retried',
        })
        return retry.snapshot()
      },
    })
    try {
      const handle = tasks.enqueue({
        scope: 'demo',
        title: '批量处理',
        retry: { kind: 'demo-retry' },
        run: async helpers => {
          helpers.items.define([
            { key: 'a', label: 'A' },
            { key: 'b', label: 'B' },
            { key: 'c', label: 'C' },
          ])
          for (const [key, ok] of [['a', true], ['b', false], ['c', false]] as const) {
            await helpers.items.checkpoint()
            helpers.items.begin(key)
            if (ok) helpers.items.succeed(key)
            else helpers.items.fail(key, '生成失败')
          }
          return 'done'
        },
      })
      await handle.done

      expect(tasks.getTask(handle.id)).toMatchObject({
        status: 'completed',
        items: { total: 3, succeeded: 1, failed: 2, pending: 0 },
        retryable: true,
      })
      expect(tasks.listTaskItems(handle.id, { status: 'failed' }).items.map(item => item.key)).toEqual([
        'b',
        'c',
      ])

      const result = await tasks.retryTaskItems(handle.id, ['b'])
      expect(result.retried).toBe(1)
      expect(result.task?.title).toBe('重试失败项')
      expect(requested).toEqual([['b']])
      expect(
        tasks.listTaskItems(handle.id).items.find(item => item.key === 'b')?.retriedBy,
      ).toBe(result.task?.id)
      expect(
        tasks.listTaskItems(handle.id).items.find(item => item.key === 'c')?.retriedBy,
      ).toBeUndefined()
    } finally {
      disposeHandler()
      tasks.dispose()
    }
  })

  it('stops a batch with unfinished items and continues them through a retry task', async () => {
    const tasks = createFolioTasksService({
      runtime: { events: { emitEvent() {} } } as unknown as Parameters<typeof createFolioTasksService>[0]['runtime'],
    })
    const disposeHandler = tasks.registerRetryHandler({
      kind: 'stop-resume',
      retry: ({ task, items }) => {
        expect(items.map(item => item.key)).toEqual(['b', 'c', 'd'])
        const retry = tasks.enqueue({
          scope: 'demo',
          title: '继续处理',
          retryOf: task.id,
          retry: { kind: 'stop-resume' },
          run: async () => 'ok',
        })
        return retry.snapshot()
      },
    })
    try {
      const handle = tasks.enqueue({
        scope: 'demo',
        title: '可停止批处理',
        retry: { kind: 'stop-resume' },
        run: async helpers => {
          helpers.items.define([
            { key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' },
          ])
          for (const key of ['a', 'b', 'c', 'd']) {
            await helpers.items.checkpoint()
            helpers.items.begin(key)
            await new Promise(resolve => setTimeout(resolve, 100))
            helpers.items.succeed(key)
          }
          return 'done'
        },
      })

      for (let i = 0; i < 100; i += 1) {
        if (tasks.getTask(handle.id)?.items?.succeeded === 1) break
        await new Promise(resolve => setTimeout(resolve, 5))
      }
      const stopped = tasks.stopTask(handle.id)
      expect(stopped.status).toBe('stopped')
      expect(stopped.items).toMatchObject({ succeeded: 1, pending: 3 })
      await expect(handle.done).rejects.toMatchObject({ name: 'AbortError' })
      // History cleanup must not discard a stopped task that can still continue.
      expect(tasks.clearFinished('demo')).toBe(0)

      const resumed = await tasks.resumeTask(handle.id)
      expect(resumed.status).toBe('stopped')
      const sourceItems = tasks.listTaskItems(handle.id).items
      expect(sourceItems.filter(item => item.retriedBy).length).toBeGreaterThan(0)
    } finally {
      disposeHandler()
      tasks.dispose()
    }
  })

  it('persists task history and converts unfinished tasks to interrupted on restart', async () => {
    const dataDir = await makeTempDir()
    const storage = createFolioStorageService({ dataDir })
    const runtime = createFolioRuntimeService({
      storage,
      admit: () => true,
      trustedOrigins: [],
    })

    const first = createFolioTasksService({
      runtime,
      ledger: createTaskLedger(storage),
      persistDebounceMs: 100,
    })
    await first.hydrate()
    const finished = first.enqueue({
      scope: 'persist',
      title: '已完成批处理',
      retry: { kind: 'persist-retry' },
      run: async helpers => {
        helpers.items.define([{ key: 'ok' }, { key: 'bad' }])
        helpers.items.begin('ok')
        helpers.items.succeed('ok')
        helpers.items.begin('bad')
        helpers.items.fail('bad', '坏了')
        return 'done'
      },
    })
    await finished.done

    let release: () => void = () => {}
    const running = first.enqueue({
      scope: 'persist',
      title: '未完成任务',
      run: async () => {
        await new Promise<void>(resolve => {
          release = resolve
        })
        return 'late'
      },
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    await first.flush()
    const runningId = running.id
    first.dispose()
    release()

    const second = createFolioTasksService({
      runtime,
      ledger: createTaskLedger(storage),
      persistDebounceMs: 100,
    })
    try {
      await second.hydrate()
      const finishedSnap = second.getTask(finished.id)
      expect(finishedSnap).toMatchObject({
        status: 'completed',
        items: { total: 2, succeeded: 1, failed: 1 },
      })
      expect(second.listTaskItems(finished.id, { status: 'failed' }).items[0]?.key).toBe('bad')

      const interrupted = second.getTask(runningId)
      expect(interrupted).toMatchObject({ status: 'interrupted' })
      expect(interrupted?.error).toContain('应用退出')
    } finally {
      second.dispose()
      runtime.dispose()
    }
  })
})
