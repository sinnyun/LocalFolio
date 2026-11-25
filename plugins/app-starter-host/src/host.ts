import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { defineAction } from '@folio/lib-shared-contract'

const StarterStateSchema = z.object({
  lastPingAt: z.number().nullable(),
  pingCount: z.number().int().nonnegative(),
})

export const name = 'app-starter-host'
export const inject = ['folioRuntime', 'folioStorage'] as const

export function apply(ctx: Context): void {
  // Each plugin claims its own isolated folder: %LOCALAPPDATA%/LocalFolio/plugins/app-starter-host/
  const pluginStorage = ctx.folioStorage.forPlugin('app-starter-host')
  const stateStore = pluginStorage.jsonStore('state.json', StarterStateSchema, () => ({
    lastPingAt: null,
    pingCount: 0,
  }))

  ctx.effect(() => {
    const disposePing = ctx.folioRuntime.registerAction(
      defineAction({
        id: 'starter.ping',
        title: '样板插件连通与私有存储检查',
        description: '验证独立业务 Host 插件的私有存储目录与 RPC 通信',
        tier: 'modify',
        input: z.object({ echo: z.string().default('pong') }).default({ echo: 'pong' }),
        run: async input => {
          const next = await stateStore.update(curr => ({
            lastPingAt: Date.now(),
            pingCount: curr.pingCount + 1,
          }))
          return {
            echo: input.echo,
            pluginId: pluginStorage.pluginId,
            pluginDataDir: pluginStorage.dataDir,
            pingCount: next.pingCount,
            lastPingAt: next.lastPingAt,
          }
        },
      }),
    )

    const disposeStatus = ctx.folioRuntime.registerAction(
      defineAction({
        id: 'starter.status',
        title: '读取样板插件存储状态',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => {
          const state = await stateStore.read()
          return {
            pluginId: pluginStorage.pluginId,
            pluginDataDir: pluginStorage.dataDir,
            pluginCacheDir: pluginStorage.cacheDir,
            ...state,
          }
        },
      }),
    )

    return () => {
      disposeStatus()
      disposePing()
    }
  }, 'app-starter-host: register actions')
}
