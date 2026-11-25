import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  FolioError,
  PluginManifestSchema,
  defineAction,
  type ActionDef,
  type ActionSource,
  type AnyActionDef,
  type FolioRuntimeService,
  type FolioStorageService,
  type PluginManifest,
} from '@folio/lib-shared-contract'
import {
  createEventBus,
  createRpcApp,
  type AdmissionCheck,
  type FolioRpc,
  type ManagedEventBus,
} from './rpc.js'

interface ConnectionSeamLike {
  admit?(request: unknown): unknown
  requestRejection?(request: unknown): unknown
}

interface WebServerLike {
  getOrigin?(): string
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

interface WebAppLike {
  getAdvertisedUrl?(): string
}

interface CordisHostLike {
  get?(name: string): unknown
  effect(execute: () => () => void, label?: string): unknown
  inject(
    deps: string[],
    callback: (scope: CordisHostLike & { webServer?: WebServerLike }) => void,
  ): unknown
  webServer?: WebServerLike
}

export function buildDshAdmission(ctx: CordisHostLike): AdmissionCheck {
  return req => {
    const raw = req.rawNodeRequest ?? req
    let connection: ConnectionSeamLike | undefined
    try {
      connection = ctx.get?.('connection') as ConnectionSeamLike | undefined
    } catch {
      return false
    }
    if (!connection) return false

    if (typeof connection.admit === 'function') {
      try {
        const admission = connection.admit(raw)
        if (typeof admission !== 'object' || admission === null) return false
        if ('rejection' in admission) {
          const rejection = (admission as { rejection?: unknown }).rejection
          return typeof rejection === 'number' ? rejection : false
        }
        return 'peer' in admission
      } catch {
        return false
      }
    }

    if (typeof connection.requestRejection === 'function') {
      try {
        const rejection = connection.requestRejection(raw)
        if (rejection === undefined) return true
        return typeof rejection === 'number' ? rejection : false
      } catch {
        return false
      }
    }

    return false
  }
}

function resolveDshOrigins(ctx: CordisHostLike): readonly string[] {
  const origins: string[] = []
  const candidates: Array<() => string | undefined> = [
    () => (ctx.get?.('webServer') as WebServerLike | undefined)?.getOrigin?.(),
    () => (ctx.get?.('webApp') as WebAppLike | undefined)?.getAdvertisedUrl?.(),
  ]
  for (const read of candidates) {
    try {
      const value = read()
      if (!value) continue
      const parsed = new URL(value)
      if (!origins.includes(parsed.origin)) origins.push(parsed.origin)
    } catch {
      // ignore unavailable or malformed origin
    }
  }
  return origins
}

export function createDefaultPluginManifest(): PluginManifest {
  return {
    version: 1,
    dshPlugins: [
      {
        id: 'core-host-storage',
        name: '存储底座',
        loaderId: '@folio/core-host-storage',
        category: 'core',
        slots: [],
        services: ['folioStorage'],
        description: '提供 ctx.fs Seam 与按插件隔离的 %LOCALAPPDATA%/LocalFolio/plugins/<id>/ 存储空间。',
        enabled: true,
        dependsOn: [],
      },
      {
        id: 'core-host-runtime',
        name: '运行时网关',
        loaderId: '@folio/core-host-runtime',
        category: 'core',
        slots: [],
        services: ['folioRuntime'],
        description: '提供 /lf/* RPC 与 SSE 网关、动作注册表与插件清单服务。',
        enabled: true,
        dependsOn: ['core-host-storage'],
      },
      {
        id: 'core-ui-kit',
        name: 'UI 基础组件库',
        loaderId: '@folio/core-ui-kit',
        category: 'core',
        slots: ['shell.overlay'],
        services: ['folioUi'],
        description: '运行期单实例共享 UI 组件库（Radix UI + lucide-react）、.lf-* 样式、Portal 弹层宿主与 Toast 服务。',
        enabled: true,
        dependsOn: ['@deepseek-ai/dsh-client-ui-layout'],
      },
      {
        id: 'shell-overlay-ui',
        name: '覆盖层外壳',
        loaderId: '@folio/shell-overlay-ui',
        category: 'shell',
        slots: ['shell.overlay', 'conversation.header.leading'],
        services: ['folioShell'],
        description: '全屏可关闭工作台覆盖层、自由悬浮面板与跨插件工作区宿主。',
        enabled: true,
        dependsOn: ['core-ui-kit', '@deepseek-ai/dsh-client-ui-layout'],
      },
      {
        id: 'shell-settings-ui',
        name: '我的插件设置页',
        loaderId: '@folio/shell-settings-ui',
        category: 'shell',
        slots: ['settings.section'],
        services: [],
        description: 'DSH 设置面板独立分页，双层展示 DSH 插件与工作区内部生态扩展。',
        enabled: true,
        dependsOn: ['core-host-runtime'],
      },
      {
        id: 'app-starter-host',
        name: '概览后端插件',
        loaderId: '@folio/app-starter-host',
        category: 'app',
        slots: [],
        services: [],
        description: '独立业务 Host 插件样板，演示按插件存储与动作注册。',
        enabled: true,
        dependsOn: ['core-host-runtime', 'core-host-storage'],
      },
      {
        id: 'app-starter-ui',
        name: '概览界面插件',
        loaderId: '@folio/app-starter-ui',
        category: 'app',
        slots: ['folio.shell.workspace'],
        services: [],
        description: '独立业务 UI 插件样板，通过 ctx.folioShell 挂载工作区与样式表。',
        enabled: true,
        dependsOn: ['shell-overlay-ui'],
      },
    ],
    internalExtensions: [],
  }
}

export interface CreateFolioRuntimeOptions {
  readonly storage: FolioStorageService
  readonly routePrefix?: string
  readonly admit?: AdmissionCheck
  readonly trustedOrigins?: readonly string[] | (() => readonly string[])
}

export interface ManagedFolioRuntime extends FolioRuntimeService {
  readonly events: ManagedEventBus
  readonly rpc: FolioRpc
  dispose(): void
}

export function createFolioRuntimeService(options: CreateFolioRuntimeOptions): ManagedFolioRuntime {
  const routePrefix = options.routePrefix ?? '/lf'
  const events = createEventBus()
  const actions = new Map<string, AnyActionDef>()

  // Reserve runtime's own isolated plugin namespace
  options.storage.forPlugin('core-host-runtime')

  const registerAction = <TInput extends z.ZodType, TOutput>(
    action: ActionDef<TInput, TOutput>,
  ): (() => void) => {
    if (actions.has(action.id)) {
      throw new FolioError('duplicate_action', `动作已注册: ${action.id}`, 409)
    }
    actions.set(action.id, action as unknown as AnyActionDef)
    return () => {
      actions.delete(action.id)
    }
  }

  const executeAction = async <T = unknown>(
    id: string,
    rawInput: unknown,
    execOpts?: { source?: ActionSource; signal?: AbortSignal },
  ): Promise<T> => {
    const action = actions.get(id)
    if (!action) throw new FolioError('action_not_found', `未知动作: ${id}`, 404)
    const parsed = action.parseInput(rawInput)
    return (await action.run(parsed, {
      runtime,
      source: execOpts?.source ?? 'internal',
      signal: execOpts?.signal,
    })) as T
  }

  const rpc = createRpcApp({
    routePrefix,
    executeAction,
    hasAction: id => actions.has(id),
    events,
    admit: options.admit,
    trustedOrigins: options.trustedOrigins,
  })

  const runtime: ManagedFolioRuntime = {
    routePrefix,
    storage: options.storage,
    events,
    rpc,
    registerAction,
    getAction: id => actions.get(id),
    listActions: () => Array.from(actions.values()),
    executeAction,
    dispose() {
      disposeBuiltins()
      rpc.dispose()
      events.dispose()
    },
  }

  const manifestStore = options.storage.sharedJsonStore(
    'plugins-manifest.json',
    PluginManifestSchema,
    createDefaultPluginManifest,
  )

  const builtinDisposers = [
    registerAction(
      defineAction({
        id: 'system.info',
        title: '底座运行信息',
        tier: 'read',
        input: z.object({}).default({}),
        run: () => ({
          rootDir: options.storage.rootDir,
          pluginsDir: options.storage.pluginsDir,
          fsProvider: options.storage.fs.provider,
          registeredStoragePlugins: options.storage.listRegisteredPlugins(),
          actionIds: runtime.listActions().map(a => a.id),
          sseSubscribers: events.subscriberCount(),
        }),
      }),
    ),
    registerAction(
      defineAction({
        id: 'plugins.manifest.get',
        title: '读取插件与扩展清单',
        tier: 'read',
        input: z.object({}).default({}),
        run: async () => await manifestStore.read(),
      }),
    ),
    registerAction(
      defineAction({
        id: 'plugins.manifest.save',
        title: '保存插件与扩展清单',
        tier: 'modify',
        input: PluginManifestSchema,
        run: async input => {
          const saved = await manifestStore.write(input)
          events.emitInvalidate('plugins')
          return saved
        },
      }),
    ),
  ]

  const disposeBuiltins = (): void => {
    for (const d of builtinDisposers.reverse()) d()
  }

  return runtime
}

export const name = 'core-host-runtime'
export const inject = ['folioStorage'] as const

export function apply(ctx: Context): void {
  const hostCtx = ctx as unknown as CordisHostLike
  const runtime = createFolioRuntimeService({
    storage: ctx.folioStorage,
    routePrefix: '/lf',
    admit: buildDshAdmission(hostCtx),
    trustedOrigins: () => resolveDshOrigins(hostCtx),
  })

  ctx.effect(() => {
    const disposeProvide = ctx.provide('folioRuntime', runtime)
    return () => {
      runtime.dispose()
      disposeProvide()
    }
  }, 'core-host-runtime: provide folioRuntime')

  hostCtx.inject(['webServer'], scope => {
    if (!scope.webServer) return
    scope.effect(
      () =>
        scope.webServer!.register({
          kind: 'prefix',
          path: runtime.routePrefix,
          handler: runtime.rpc.nodeHandler,
        }),
      'core-host-runtime: webServer /lf route',
    )
  })
}

export { createEventBus, createRpcApp, hasSameOrigin } from './rpc.js'
export type { AdmissionCheck, AdmissionRequestLike, FolioRpc, ManagedEventBus } from './rpc.js'
