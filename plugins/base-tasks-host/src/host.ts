import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  defineAction,
  type FolioRuntimeService,
  type FolioStorageService,
} from '@folio/base-contract'
import { createFolioTasksService, type ManagedFolioTasksService } from './task-manager.js'
import { createTaskLedger } from './task-ledger.js'

export interface RegisterBaseTasksHostOptions {
  readonly runtime: FolioRuntimeService
  readonly storage?: FolioStorageService
  readonly throttleMs?: number
  readonly persistDebounceMs?: number
}

export function registerBaseTasksHost(options: RegisterBaseTasksHostOptions): {
  readonly service: ManagedFolioTasksService
  readonly ready: Promise<void>
  dispose(): void
} {
  const { runtime, storage, throttleMs, persistDebounceMs } = options
  const service = createFolioTasksService({
    runtime,
    ...(throttleMs !== undefined ? { throttleMs } : {}),
    ...(persistDebounceMs !== undefined ? { persistDebounceMs } : {}),
    ...(storage ? { ledger: createTaskLedger(storage) } : {}),
  })
  const ready = service.hydrate().catch(() => {})

  const disposers = [
    runtime.registerAction(
      defineAction({
        id: 'tasks.list',
        title: '查询后台任务列表',
        tier: 'read',
        input: z
          .object({
            scope: z.string().optional(),
          })
          .default({}),
        run: input => ({
          tasks: service.listTasks(input.scope),
        }),
      }),
    ),
    runtime.registerAction(
      defineAction({
        id: 'tasks.items',
        title: '查询后台任务的子项明细',
        tier: 'read',
        input: z.object({
          id: z.string().min(1),
          status: z
            .enum(['pending', 'running', 'succeeded', 'failed', 'cancelled', 'skipped', 'unfinished', 'all'])
            .optional(),
          offset: z.number().int().min(0).optional(),
          limit: z.number().int().min(1).max(1000).optional(),
        }),
        run: input =>
          service.listTaskItems(input.id, {
            ...(input.status ? { status: input.status } : {}),
            ...(input.offset !== undefined ? { offset: input.offset } : {}),
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
          }),
      }),
    ),
    runtime.registerAction(
      defineAction({
        id: 'tasks.pause',
        title: '暂停后台任务',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
        }),
        run: input => service.pauseTask(input.id),
      }),
    ),
    runtime.registerAction(
      defineAction({
        id: 'tasks.resume',
        title: '继续后台任务',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
        }),
        run: input => service.resumeTask(input.id),
      }),
    ),
    runtime.registerAction(
      defineAction({
        id: 'tasks.stop',
        title: '停止后台任务并保留未完成项',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
        }),
        run: input => service.stopTask(input.id),
      }),
    ),
    runtime.registerAction(
      defineAction({
        id: 'tasks.cancel',
        title: '取消后台任务',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
        }),
        run: input => service.cancelTask(input.id),
      }),
    ),
    runtime.registerAction(
      defineAction({
        id: 'tasks.retry',
        title: '重试后台任务的选中子项',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
          itemKeys: z.array(z.string().min(1)).optional(),
        }),
        run: input =>
          service.retryTaskItems(input.id, input.itemKeys ? [...input.itemKeys] : undefined),
      }),
    ),
    runtime.registerAction(
      defineAction({
        id: 'tasks.clear',
        title: '清理已完成的后台任务',
        tier: 'delete',
        input: z
          .object({
            scope: z.string().optional(),
          })
          .default({}),
        run: input => ({
          cleared: service.clearFinished(input.scope),
        }),
      }),
    ),
  ]

  return {
    service,
    ready,
    dispose(): void {
      for (const d of disposers.reverse()) d()
      service.dispose()
    },
  }
}

export const name = 'base-tasks-host'
export const inject = ['folioRuntime', 'folioStorage'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const { service, dispose, ready } = registerBaseTasksHost({
      runtime: ctx.folioRuntime,
      storage: ctx.folioStorage,
    })
    void ready
    const disposeProvide = ctx.provide('folioTasks', service)
    return () => {
      disposeProvide()
      dispose()
    }
  }, 'base-tasks-host: provide folioTasks + actions')
}

export default { name, inject, apply }

export { createBoundedQueue } from './queue.js'
export { runNodeWorker } from './worker-runner.js'
export { createFolioTasksService } from './task-manager.js'
export { createTaskLedger } from './task-ledger.js'
export type { ManagedFolioTasksService } from './task-manager.js'
export type { PersistedTaskRecord, PersistedTasksFile, TaskLedger } from './task-ledger.js'
