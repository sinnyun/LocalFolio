import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { defineAction, type FolioRuntimeService } from '@folio/base-contract'
import { createFolioTasksService, type ManagedFolioTasksService } from './task-manager.js'

export interface RegisterBaseTasksHostOptions {
  readonly runtime: FolioRuntimeService
  readonly throttleMs?: number
}

export function registerBaseTasksHost(options: RegisterBaseTasksHostOptions): {
  readonly service: ManagedFolioTasksService
  dispose(): void
} {
  const { runtime, throttleMs } = options
  const service = createFolioTasksService({ runtime, throttleMs })

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
        title: '恢复后台任务',
        tier: 'modify',
        input: z.object({
          id: z.string().min(1),
        }),
        run: input => service.resumeTask(input.id),
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
    dispose(): void {
      for (const d of disposers.reverse()) d()
      service.dispose()
    },
  }
}

export const name = 'base-tasks-host'
export const inject = ['folioRuntime'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const { service, dispose } = registerBaseTasksHost({
      runtime: ctx.folioRuntime,
    })
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
export type { ManagedFolioTasksService } from './task-manager.js'
