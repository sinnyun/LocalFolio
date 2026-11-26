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
} from '@folio/base-contract'
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
    version: 2,
    dshPlugins: [
      {
        id: 'base-storage-host',
        name: '基础存储能力',
        loaderId: '@folio/base-storage-host',
        category: 'base',
        slots: [],
        services: ['folioStorage'],
        description: '提供 ctx.fs 落盘缝与按插件隔离的 %LOCALAPPDATA%/LocalFolio/plugins/<id>/ 存储空间。',
        enabled: true,
        dependsOn: [],
      },
      {
        id: 'base-runtime-host',
        name: '基础运行时能力',
        loaderId: '@folio/base-runtime-host',
        category: 'base',
        slots: [],
        services: ['folioRuntime'],
        description: '提供 /lf/* RPC 与 SSE 网关、动作注册表与插件清单服务。',
        enabled: true,
        dependsOn: ['@folio/base-storage-host'],
      },
      {
        id: 'base-ui-kit',
        name: '基础 UI 组件库',
        loaderId: '@folio/base-ui-kit',
        category: 'base',
        slots: ['shell.overlay'],
        services: ['folioUi'],
        description: '运行期单实例共享 UI 组件（Radix UI + lucide-react）、.lf-* 样式、Portal 弹层宿主与 Toast 服务。',
        enabled: true,
        dependsOn: ['@deepseek-ai/dsh-client-ui-layout'],
      },
      {
        id: 'base-shell-ui',
        name: '基础外壳能力',
        loaderId: '@folio/base-shell-ui',
        category: 'base',
        slots: ['shell.overlay', 'conversation.header.leading'],
        services: ['folioShell'],
        description: '提供工作台外壳：可退回的全屏工作台、工作区栏、悬浮面板与底部信息栏。',
        enabled: true,
        dependsOn: ['@folio/base-ui-kit', '@deepseek-ai/dsh-client-ui-layout'],
      },
      {
        id: 'base-frame-ui',
        name: '基础布局框架',
        loaderId: '@folio/base-frame-ui',
        category: 'base',
        slots: [],
        services: ['folioFrame'],
        description: '左 / 中 / 右 / 底四区布局框架，供各工作区复用；自身不画界面、不注册工作区。',
        enabled: true,
        dependsOn: ['@folio/base-ui-kit', '@folio/base-shell-ui'],
      },
      {
        id: 'base-settings-ui',
        name: '基础设置页',
        loaderId: '@folio/base-settings-ui',
        category: 'base',
        slots: ['settings.section'],
        services: [],
        description: 'DSH 设置面板里的「我的插件」分页，双层展示基础能力与插件内嵌扩展。',
        enabled: true,
        dependsOn: ['@folio/base-runtime-host'],
      },
      {
        id: 'test-overview-host',
        name: '测试概览后端',
        loaderId: '@folio/test-overview-host',
        category: 'test',
        slots: [],
        services: [],
        description: '测试用 Host 插件：演示按插件存储与动作注册。',
        enabled: true,
        dependsOn: ['@folio/base-runtime-host', '@folio/base-storage-host'],
      },
      {
        id: 'test-overview-ui',
        name: '测试概览 UI',
        loaderId: '@folio/test-overview-ui',
        category: 'test',
        slots: [],
        services: [],
        description: '测试用 UI 插件：演示注册一个工作区与一个悬浮面板。',
        enabled: true,
        dependsOn: ['@folio/base-shell-ui'],
      },
      {
        id: 'test-gallery-ui',
        name: '测试图片画廊 UI',
        loaderId: '@folio/test-gallery-ui',
        category: 'test',
        slots: [],
        services: [],
        description: '测试用 UI 插件：验证瀑布流画廊与灯箱交互。',
        enabled: true,
        dependsOn: ['@folio/base-shell-ui'],
      },
      {
        id: 'test-sidebar-ui',
        name: '测试侧栏示例 UI',
        loaderId: '@folio/test-sidebar-ui',
        category: 'test',
        slots: [],
        services: [],
        description: '测试用 UI 插件：验证图标折叠侧栏与面包屑。',
        enabled: true,
        dependsOn: ['@folio/base-shell-ui'],
      },
      {
        id: 'test-shadcn-admin-ui',
        name: '测试 Shadcn Admin UI',
        loaderId: '@folio/test-shadcn-admin-ui',
        category: 'test',
        slots: [],
        services: [],
        description: '测试用 UI 插件：移植 shadcn-admin 后台界面，验证复杂布局与组件覆盖度。',
        enabled: true,
        dependsOn: ['@folio/base-shell-ui'],
      },
      {
        id: 'test-studio-admin-ui',
        name: '测试 Studio Admin UI',
        loaderId: '@folio/test-studio-admin-ui',
        category: 'test',
        slots: [],
        services: [],
        description: '测试用 UI 插件：移植 Studio Admin 后台界面，验证多主题预设与布局控制。',
        enabled: true,
        dependsOn: ['@folio/base-shell-ui'],
      },
      {
        id: 'bridge-frame-test-ui',
        name: '测试框架工作区',
        loaderId: '@folio/bridge-frame-test-ui',
        category: 'bridge',
        slots: [],
        services: [],
        description: '把基础布局框架挂进工作区栏的测试用桥接插件；真实工作区接入后即可移除。',
        enabled: true,
        dependsOn: ['@folio/base-frame-ui', '@folio/base-shell-ui'],
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
  options.storage.forPlugin('base-runtime-host')

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
        run: async () => {
          try {
            return await manifestStore.read()
          } catch {
            // A manifest written by the old core/shell/app taxonomy fails the v2
            // schema; replace it with the current defaults instead of surfacing it.
            return await manifestStore.write(createDefaultPluginManifest())
          }
        },
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

export const name = 'base-runtime-host'
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
  }, 'base-runtime-host: provide folioRuntime')

  hostCtx.inject(['webServer'], scope => {
    if (!scope.webServer) return
    scope.effect(
      () =>
        scope.webServer!.register({
          kind: 'prefix',
          path: runtime.routePrefix,
          handler: runtime.rpc.nodeHandler,
        }),
      'base-runtime-host: webServer /lf route',
    )
  })
}

export { createEventBus, createRpcApp, hasSameOrigin } from './rpc.js'
export type { AdmissionCheck, AdmissionRequestLike, FolioRpc, ManagedEventBus } from './rpc.js'
