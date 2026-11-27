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
        id: 'base-tasks-host',
        name: '基础后台任务能力',
        loaderId: '@folio/base-tasks-host',
        category: 'base',
        slots: [],
        services: ['folioTasks'],
        description: '提供有界并发队列、Node Worker 线程执行封装、暂停/取消任务状态机与 200ms 节流 SSE 进度推送。',
        enabled: true,
        dependsOn: ['@folio/base-runtime-host'],
      },
      {
        id: 'base-native-host',
        name: '基础桌面原生能力',
        loaderId: '@folio/base-native-host',
        category: 'base',
        slots: [],
        services: ['folioNative'],
        description: '提供共享 Windows Shell/WIC 缩略图池、原生文件/文件夹选择框、资源管理器定位与默认程序打开能力。',
        enabled: true,
        dependsOn: ['@folio/base-runtime-host'],
      },
      {
        id: 'base-thumbs-host',
        name: '基础缩略图生成能力',
        loaderId: '@folio/base-thumbs-host',
        category: 'base',
        slots: [],
        services: ['folioThumbs'],
        description: '提供可扩展的多格式缩略图生成服务，可注册新格式生成器而无需改动具体工作区。',
        enabled: true,
        dependsOn: ['@folio/base-runtime-host', '@folio/base-native-host', '@folio/base-tasks-host'],
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
        description: '提供工作台外壳：可退回的全屏工作台（顶部条 + 工作区内容区）、工作区栏、悬浮面板，以及标题栏动作注册点。',
        enabled: true,
        dependsOn: ['@folio/base-ui-kit', '@deepseek-ai/dsh-client-ui-layout'],
      },
      {
        id: 'bridge-dsh-interactions-ui',
        name: 'DSH 交互桥接',
        loaderId: '@folio/bridge-dsh-interactions-ui',
        category: 'bridge',
        slots: ['shell.overlay'],
        services: ['folioInteractions'],
        description: '桥接 DSH 原生右键菜单（contextMenus）、原生文件拖拽（fileDrag）与文件下载/复制能力（fileActions）。',
        enabled: true,
        dependsOn: ['@folio/base-ui-kit', '@folio/base-shell-ui'],
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
        description: '测试用 Host 插件：演示按插件存储与动作注册。随 @folio/test-suite 另装。',
        enabled: false,
        dependsOn: ['@folio/base-runtime-host', '@folio/base-storage-host'],
      },
      {
        id: 'test-overview-ui',
        name: '测试概览 UI',
        loaderId: '@folio/test-overview-ui',
        category: 'test',
        slots: [],
        services: [],
        description: '测试用 UI 插件：演示形态 A —— 渲染 folioFrame.WorkspaceHost 并声明四区、另注册一个悬浮面板。随 @folio/test-suite 另装。',
        enabled: false,
        dependsOn: ['@folio/base-shell-ui', '@folio/base-frame-ui'],
      },
      {
        id: 'test-gallery-ui',
        name: '测试图片画廊 UI',
        loaderId: '@folio/test-gallery-ui',
        category: 'test',
        slots: [],
        services: [],
        description: '测试用 UI 插件：验证形态 B（自绘全屏）的瀑布流画廊与灯箱交互。随 @folio/test-suite 另装。',
        enabled: false,
        dependsOn: ['@folio/base-shell-ui'],
      },
      {
        id: 'test-sidebar-ui',
        name: '测试侧栏示例 UI',
        loaderId: '@folio/test-sidebar-ui',
        category: 'test',
        slots: [],
        services: [],
        description: '测试用 UI 插件：验证图标折叠侧栏与面包屑。随 @folio/test-suite 另装。',
        enabled: false,
        dependsOn: ['@folio/base-shell-ui'],
      },
      {
        id: 'test-shadcn-admin-ui',
        name: '测试 Shadcn Admin UI',
        loaderId: '@folio/test-shadcn-admin-ui',
        category: 'test',
        slots: [],
        services: [],
        description: '测试用 UI 插件：移植 shadcn-admin 后台界面，验证复杂布局与组件覆盖度。随 @folio/test-suite 另装。',
        enabled: false,
        dependsOn: ['@folio/base-shell-ui'],
      },
      {
        id: 'test-studio-admin-ui',
        name: '测试 Studio Admin UI',
        loaderId: '@folio/test-studio-admin-ui',
        category: 'test',
        slots: [],
        services: [],
        description: '测试用 UI 插件：移植 Studio Admin 后台界面，验证多主题预设与布局控制。随 @folio/test-suite 另装。',
        enabled: false,
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
      {
        id: 'workspace-files-host',
        name: '文件浏览器后端',
        loaderId: '@folio/workspace-files-host',
        category: 'workspace',
        slots: [],
        services: [],
        description: '提供本地目录浏览、驱动器容量、Windows 系统缩略图与媒体流、文件检查及资源管理器定位能力。',
        enabled: true,
        dependsOn: ['@folio/base-runtime-host', '@folio/base-storage-host'],
      },
      {
        id: 'workspace-files-ui',
        name: '文件浏览器',
        loaderId: '@folio/workspace-files-ui',
        category: 'workspace',
        slots: [],
        services: [],
        description: '基于四区布局框架的本地文件浏览器：快捷文件夹、驱动器、文件树、双栏浏览、分组视图与文件检查器。',
        enabled: true,
        dependsOn: [
          '@folio/base-ui-kit',
          '@folio/base-shell-ui',
          '@folio/base-frame-ui',
          '@folio/workspace-files-host',
        ],
      },
      {
        id: 'workspace-canvas-host',
        name: '画板工作区后端',
        loaderId: '@folio/workspace-canvas-host',
        category: 'workspace',
        slots: [],
        services: [],
        description: '提供画板文档持久化、图片链接检查与重定位、WIC 分层 LOD 代理图缓存、原生文件选择框与本地 @tldraw/assets 托管。',
        enabled: true,
        dependsOn: ['@folio/base-runtime-host', '@folio/base-storage-host'],
      },
      {
        id: 'workspace-canvas-ui',
        name: '画板',
        loaderId: '@folio/workspace-canvas-ui',
        category: 'workspace',
        slots: [],
        services: ['folioCanvas'],
        description: '基于 tldraw 的无线画板工作区：左侧画板列表 + 右侧完整画布，纯文件链接管理图片与 LOD 缩放优化。',
        enabled: true,
        dependsOn: [
          '@folio/base-ui-kit',
          '@folio/base-shell-ui',
          '@folio/base-frame-ui',
          '@folio/workspace-canvas-host',
        ],
      },
      {
        id: 'feature-canvas-eagle-host',
        name: '画板 Eagle 链接后端',
        loaderId: '@folio/feature-canvas-eagle-host',
        category: 'feature',
        slots: [],
        services: [],
        description: '解析拖入画板的 Eagle .info 原图与 eagle://item/{id} 链接，读取本地 Eagle Web API 元数据并在 Eagle 中打开条目。',
        enabled: true,
        dependsOn: ['@folio/base-runtime-host'],
      },
      {
        id: 'feature-canvas-eagle-ui',
        name: '画板 Eagle 链接',
        loaderId: '@folio/feature-canvas-eagle-ui',
        category: 'feature',
        slots: [],
        services: [],
        description: '向画板工作区注册 Eagle 来源解析、元数据持久化及链接面板「在 Eagle 中打开」能力。',
        enabled: true,
        dependsOn: [
          '@folio/base-ui-kit',
          '@folio/workspace-canvas-ui',
          '@folio/feature-canvas-eagle-host',
        ],
      },
      {
        id: 'workspace-materials-host',
        name: '物料工作区后端',
        loaderId: '@folio/workspace-materials-host',
        category: 'workspace',
        slots: [],
        services: [],
        description: '提供本地 VectorCraft CLI 与前台实时控制通道桥接、A3 横版物料信息头双向同步、图片与多页 PDF 导出及物料数据管理。',
        enabled: true,
        dependsOn: ['@folio/base-runtime-host', '@folio/base-storage-host'],
      },
      {
        id: 'workspace-materials-ui',
        name: '物料',
        loaderId: '@folio/workspace-materials-ui',
        category: 'workspace',
        slots: [],
        services: [],
        description: '基于 VectorCraft 的物料整理与排版工作区：左侧项目管理、第一层多选导出单图/多页 PDF、第二层幻灯片式拖拽排序与快捷物料信息编辑、以及默认/项目数据表格管理。',
        enabled: true,
        dependsOn: [
          '@folio/base-ui-kit',
          '@folio/base-shell-ui',
          '@folio/base-frame-ui',
          '@folio/workspace-materials-host',
        ],
      },
      {
        id: 'workspace-projects-host',
        name: '项目库后端',
        loaderId: '@folio/workspace-projects-host',
        category: 'workspace',
        slots: [],
        services: ['folioProjectsHost'],
        description: '提供项目库目录扫描、.folio-meta 就地元数据与增量变更检测、可读镜像缩略图管理及全局轻量索引。',
        enabled: true,
        dependsOn: [
          '@folio/base-runtime-host',
          '@folio/base-storage-host',
          '@folio/base-tasks-host',
          '@folio/base-native-host',
          '@folio/base-thumbs-host',
        ],
      },
      {
        id: 'workspace-projects-ui',
        name: '项目库',
        loaderId: '@folio/workspace-projects-ui',
        category: 'workspace',
        slots: [],
        services: ['folioProjects'],
        description: '基于四区布局框架的高性能归档项目库：虚拟滚动项目列表、可折叠文件夹分组虚拟卡片网格、按需缩略图与实时任务进度条。',
        enabled: true,
        dependsOn: [
          '@folio/base-ui-kit',
          '@folio/base-shell-ui',
          '@folio/base-frame-ui',
          '@folio/workspace-projects-host',
        ],
      },
      {
        id: 'feature-archive-host',
        name: 'ZPAQ 归档备份后端',
        loaderId: '@folio/feature-archive-host',
        category: 'feature',
        slots: [],
        services: [],
        description: '提供独立的 zpaqfranz 引擎托管下载、去重打包校验、按需单文件提取与文件/归档包导出能力。',
        enabled: true,
        dependsOn: [
          '@folio/base-runtime-host',
          '@folio/base-storage-host',
          '@folio/base-tasks-host',
          '@folio/base-native-host',
        ],
      },
      {
        id: 'feature-archive-ui',
        name: 'ZPAQ 归档管理扩展',
        loaderId: '@folio/feature-archive-ui',
        category: 'feature',
        slots: [],
        services: [],
        description: '向项目库工作区注册 zpaqfranz 一键下载安装、项目去重归档、完整性校验、单文件提取与归档包导出界面。',
        enabled: true,
        dependsOn: [
          '@folio/base-ui-kit',
          '@folio/workspace-projects-ui',
          '@folio/feature-archive-host',
        ],
      },
      {
        id: 'feature-thumbs-eagle-host',
        name: 'Eagle 缩略图手动补全后端',
        loaderId: '@folio/feature-thumbs-eagle-host',
        category: 'feature',
        slots: [],
        services: [],
        description: '向缩略图引擎注册手动授权专属的 L3 Eagle 本地 API 补全通道，支持专用缓存库隔离、串行队列、自动切回与空间熔断。',
        enabled: true,
        dependsOn: [
          '@folio/base-runtime-host',
          '@folio/base-storage-host',
          '@folio/base-tasks-host',
          '@folio/base-thumbs-host',
          '@folio/workspace-projects-host',
        ],
      },
      {
        id: 'feature-thumbs-eagle-ui',
        name: '无缩略图待办与 Eagle 补全',
        loaderId: '@folio/feature-thumbs-eagle-ui',
        category: 'feature',
        slots: [],
        services: [],
        description: '在项目库提供无缩略图按后缀分组筛选视图、大文件拷贝二次确认弹窗、Eagle 串行补全与失败重试。',
        enabled: true,
        dependsOn: [
          '@folio/base-ui-kit',
          '@folio/workspace-projects-ui',
          '@folio/feature-thumbs-eagle-host',
        ],
      },
    ],
    internalExtensions: [
      {
        id: 'tldraw',
        name: 'tldraw 画板引擎',
        hostPluginId: 'workspace-canvas-ui',
        ecosystem: 'tldraw',
        source: 'official',
        description: '内嵌于画板工作区的无限画布引擎，配合本地文件链接与分层 LOD 代理渲染。',
        enabled: true,
      },
    ],
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
    registerRoute: rpc.registerRoute,
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
