# @folio/base-runtime-host · 基础运行时能力

工作台通用基础能力。它把 Host 侧的「动作注册表 + `/lf/*` HTTP 网关」合成一个 Cordis 服务 `ctx.folioRuntime`，让浏览器侧插件通过 RPC 调用 Host 能力，并通过 SSE 收到失效通知；插件清单也由它落盘与读写。它是 Host-only 插件（`package.json` 中无 `dsh.client`），网关挂在 DSH 自己的 `webServer` 上，不额外起端口。

## 它做什么

- **动作注册表**：`registerAction(defineAction({...}))` 登记 `id`、`title`、`tier`、Zod `input` 与 `run`，返回 disposer；重复 `id` 直接抛 `duplicate_action`（409）。
- **RPC 网关**：`POST /lf/rpc/<actionId>` 做 JSON 输入校验、执行、错误归一化，统一返回 `{ ok, data | error }` 信封。
- **事件通道**：`GET /lf/events` 是一条 SSE 长连接，`events.emitInvalidate(scope, target?)` 会把 `invalidate` 事件推给所有订阅者。
- **自定义只读路由**：`registerRoute('GET' | 'HEAD', subPath, handler)` 挂静态资源/文件流一类端点，同样受准入校验保护。
- **插件清单服务**：内置 `system.info`、`plugins.manifest.get`、`plugins.manifest.save` 三个动作，清单持久化在 `shared/plugins-manifest.json`。
- **命名空间预留**：构造时替自己调用 `storage.forPlugin('base-runtime-host')`，保证运行时自己的目录存在。

## 服务接口

签名与 `libs/base-contract/src/runtime.ts` 一致：

```ts
export type FolioRouteMethod = 'GET' | 'HEAD'
export type FolioRouteHandler = (request: Request) => Response | Promise<Response>

export interface FolioRuntimeService {
  readonly routePrefix: string
  readonly storage: FolioStorageService
  readonly events: EventBus
  readonly rpc: { readonly fetch: (request: Request) => Response | Promise<Response> }
  registerAction<TInput extends z.ZodType, TOutput>(
    action: ActionDef<TInput, TOutput>,
  ): () => void
  registerRoute(method: FolioRouteMethod, subPath: string, handler: FolioRouteHandler): () => void
  getAction(id: string): AnyActionDef | undefined
  listActions(): readonly AnyActionDef[]
  executeAction<T = unknown>(
    id: string,
    rawInput: unknown,
    options?: { source?: ActionSource; signal?: AbortSignal },
  ): Promise<T>
}
```

动作对象来自 `libs/base-contract/src/action.ts`：

```ts
export type ActionTier = 'read' | 'modify' | 'delete'
export type ActionSource = 'rpc' | 'ai' | 'internal'

export interface ActionRunContext {
  readonly runtime: FolioRuntimeService
  readonly source: ActionSource
  readonly signal?: AbortSignal
}

export interface ActionDefinition<TInput extends z.ZodType, TOutput> {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly tier: ActionTier
  readonly exposeToDsh?: boolean
  readonly input: TInput
  readonly run: (input: z.infer<TInput>, ctx: ActionRunContext) => TOutput | Promise<TOutput>
}
```

`defineAction` 补齐 `parseInput` 与 `toJsonSchema`（`z.toJSONSchema`），并把 `exposeToDsh` 默认为 `false`。本插件另外导出 `createEventBus`、`createRpcApp`、`hasSameOrigin`、`buildDshAdmission` 与类型 `AdmissionCheck`、`FolioRpc`、`ManagedEventBus`。

## 接入

Host 侧（`inject` 同时声明存储与运行时）：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { defineAction } from '@folio/base-contract'

export const inject = ['folioRuntime', 'folioStorage'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () =>
      ctx.folioRuntime.registerAction(
        defineAction({
          id: 'files.roots',
          title: '获取快捷文件夹与驱动器列表',
          tier: 'read',
          input: z.object({}).default({}),
          run: async () => ({ roots: [] }),
        }),
      ),
    'workspace-files-host: register actions',
  )
}
```

Client 侧用 `@folio/base-contract/rpc`（`pnpm` 解析到 `libs/base-contract/src/rpc-client.ts`）：

```ts
import { rpcCall, useActionQuery, useFolioEvents } from '@folio/base-contract/rpc'

const info = await rpcCall<{ rootDir: string }>('system.info', {})
```

`rpcCall` 以 `POST <prefix>/rpc/<encodeURIComponent(actionId)>`、`credentials: 'same-origin'` 发起请求，失败抛 `RpcError`（带 `code` / `status` / `details`）。`useActionQuery` 不做轮询，而是监听 `window` 上的 `folio:invalidate` 事件，作用域取动作 id 第一个点之前的部分（`system.info` → `system`），`*` 与 `all` 匹配全部；`useFolioEvents` 建立 `EventSource` 并按 1500ms 起、最多 15s 的指数退避重连。`base-shell-ui` 的 `FolioShell` 已用 `FolioQueryProvider` 挂了这条 SSE 桥。

## 路由与协议

| 方法 | 路径 | 行为 |
|---|---|---|
| `GET` | `/lf/health` | 返回 `{ ok: true, data: { status: 'ok', ts } }` |
| `POST` | `/lf/rpc/<actionId>` | 执行动作；成功 `{ ok: true, data }`，失败 `{ ok: false, error: { code, message, details? } }` |
| `GET` | `/lf/events` | SSE：先发 `event: ready`，每 25s 一条 `: ping` 心跳，失效时 `event: invalidate` + `InvalidateEvent` JSON |
| `GET` / `HEAD` | `/lf/<自定义子路径>` | 命中 `registerRoute` 注册的处理器；`HEAD` 自动回落到同名 `GET` |

网关错误码：`untrusted_origin`（403，跨站）、`unauthorized` / `forbidden`（401/403，准入未通过）、`action_not_found`（404）、`payload_too_large`（413，请求体上限 2 MiB）、`invalid_json`（400）、`invalid_input`（400，Zod 校验失败，`details` 为 issue 数组）、`internal_error`（500）、`route_not_found`（404，自定义路由未命中）。注册期错误：`duplicate_action`（409）、`duplicate_route`（409）、`reserved_route`（400，`/health`、`/events`、`/rpc`、`/rpc/*` 被保留）、`invalid_route`（400，子路径为空）。

## 请求放行策略

每个 `/lf/*` 请求先过两道闸，任一失败都不进入业务代码：

1. **同源校验** `hasSameOrigin`：`sec-fetch-site: cross-site` 直接拒绝；有 `origin` 比 `origin`，否则比 `referer`，与 `host` 或可信来源（`webServer.getOrigin()`、`webApp.getAdvertisedUrl()` 解析出的 origin）不同即拒绝；两者都缺时放行（同源导航/非浏览器客户端）。
2. **DSH 连接身份** `buildDshAdmission`：取 `ctx.get('connection')`，优先调用 `connection.admit(rawNodeRequest)`——返回对象含 `rejection` 时按数值状态码拒绝，否则要求含 `peer`；没有 `admit` 时用 `connection.requestRejection`（`undefined` 表示放行）；两者都缺失或抛错即**默认拒绝**（fail-closed）。

网关先把 Node 的 `IncomingMessage` 包成 Web `Request`，并保留原始请求供准入读取（`WeakMap<Request, IncomingMessage>`）；`apply` 里没有配置可达的连接服务时，所有 `/lf/*` 请求都会 403。

## 数据结构与目录

- 清单文件：`%LOCALAPPDATA%\LocalFolio\shared\plugins-manifest.json`，经 `ctx.folioStorage.sharedJsonStore` 用 `PluginManifestSchema`（`version: 2` + `dshPlugins[]` + `internalExtensions[]`）校验。
- 内置动作：`system.info`（read，返回 `rootDir` / `pluginsDir` / `fsProvider` / `registeredStoragePlugins` / `actionIds` / `sseSubscribers`）、`plugins.manifest.get`（read）、`plugins.manifest.save`（modify，整份替换并 `emitInvalidate('plugins')`）。
- 清单读取失败（含旧 core/shell/app 分类写下的文件过不了 v2 schema）时，`plugins.manifest.get` 会用默认清单覆盖重写，而不是把错误抛给界面。

## 行为与规则

- `executeAction` 先 `parseInput`（Zod）再 `run`，`run` 收到 `{ runtime, source, signal }`；直接调用时 `source` 默认 `'internal'`，HTTP 调用固定为 `'rpc'`。
- `tier`（`read` / `modify` / `delete`）与 `exposeToDsh` 目前只是声明式元数据：运行时不做按级鉴权，也不把动作自动暴露给 DSH 工具层。
- 事件总线是进程内广播：订阅者抛错会被自动移出；`dispose()` 清空订阅者；SSE 连接关闭、请求 abort、`dispose()` 都会解绑对应订阅。
- `registerRoute` 的路径会被规整（自动补前导 `/`、去掉尾部 `/`），命中顺序是先精确方法后 `HEAD → GET`；处理器异常按同一套 `normalizeError` 归一化。
- disposer 可安全重复调用；路由额外比对处理器身份，热替换后旧 disposer 不会误删新处理器。动作 id 在注册期间重复即 409，不会出现同名并存。
- `runtime.dispose()` 依次注销内置动作、清空路由、关闭所有活动 SSE 流；插件卸载时由 `ctx.effect` 触发。

## 限制与边界

- 只支持 `GET` / `HEAD` 自定义路由；需要其他方法就注册成动作走 `POST /lf/rpc`。
- 请求体上限 2 MiB（`content-length` 与实读文本各判一次），大文件走自定义路由自己流式返回。
- 没有鉴权模型、限流、审计日志：放行完全依赖「同源 + DSH 连接身份」两道闸，动作本身不做用户级授权。
- SSE 为单向推送且不落盘，进程重启后历史失效事件不补发；重连后由客户端按 `*` 作用域整体重取。
- 清单是单文件整份读写，没有并发合并与字段级迁移；写入方必须提交完整合法清单。
- 运行时不自带 HTTP 服务器：`webServer` 服务不存在时 `/lf/*` 完全不挂载，仅服务对象可用。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```

`src/__tests__/runtime.test.ts` 覆盖：无 `admit` 时 fail-closed（403）、准入返回 401、跨站 origin 被拒、正常 RPC 返回 `system.info`、清单持久化并推送 `"scope":"plugins"` 的 SSE 事件、`FolioError` 状态码透传、自定义路由在准入保护下工作且 disposer 后变 404。
