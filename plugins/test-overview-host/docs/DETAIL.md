# @folio/test-overview-host · 测试概览后端

独立 Host 插件的最小样板，也是测试界面（Test Surface）里唯一的 Host 侧样本。它只注入 `folioRuntime` 与 `folioStorage` 两个服务，就把「插件私有存储目录 + 插件自注册动作」这条链路跑通了。它验证的是 Host 插件的最小接入面，不承载任何业务；最终会随测试套件一起删除，或把其中的 `forPlugin` / `registerAction` 写法并入真实工作区。

## 它验证什么

- 独立 Host 插件只靠 `inject: ['folioRuntime', 'folioStorage']` 就能启动，不需要 `ctx.fs`、`ctx.tools` 或任何 DSH 内部模块。
- `ctx.folioStorage.forPlugin('test-overview-host')` 能按插件名切出互不干扰的 `data/` 与 `cache/`，同一名字重复调用返回同一个命名空间。
- `defineAction` + `registerAction` 的完整形状：Zod 输入、`tier` 分级、返回值即 RPC 响应体。
- `jsonStore` 的状态落盘与并发安全：`update()` 走内部串行队列，读改写不会互相覆盖。
- `ctx.effect(fn, label)` 注册的动作在卸载时被摘干净，热重载不会撞 `duplicate_action`。

## 接入方式

`package.json` 声明 `main: ./lib/index.js`、`type: module`，`peerDependencies` 只留 `@deepseek-ai/cordis`，并补 `engines.dsh`。`src/host.ts` 导出 `name` / `inject` / `apply` 三个符号，不做默认导出：

```ts
export const name = 'test-overview-host'
export const inject = ['folioRuntime', 'folioStorage'] as const

export function apply(ctx: Context): void {
  const pluginStorage = ctx.folioStorage.forPlugin('test-overview-host')
  const stateStore = pluginStorage.jsonStore('state.json', StarterStateSchema, () => ({
    lastPingAt: null,
    pingCount: 0,
  }))

  const ping = defineAction({
    id: 'starter.ping',
    title: '样板插件连通与私有存储检查',
    tier: 'modify',
    input: z.object({ echo: z.string().default('pong') }).default({ echo: 'pong' }),
    run: async input => {
      const next = await stateStore.update(curr => ({
        lastPingAt: Date.now(),
        pingCount: curr.pingCount + 1,
      }))
      return { echo: input.echo, pluginId: pluginStorage.pluginId, pingCount: next.pingCount }
    },
  })

  const status = defineAction({
    id: 'starter.status',
    title: '读取样板插件存储状态',
    tier: 'read',
    input: z.object({}).default({}),
    run: async () => ({
      pluginId: pluginStorage.pluginId,
      pluginCacheDir: pluginStorage.cacheDir,
      ...(await stateStore.read()),
    }),
  })

  ctx.effect(() => {
    const disposePing = ctx.folioRuntime.registerAction(ping)
    const disposeStatus = ctx.folioRuntime.registerAction(status)
    return () => {
      disposeStatus()
      disposePing()
    }
  }, 'test-overview-host: register actions')
}
```

客户端不直连这些代码：`@folio/base-contract/rpc` 的 `useActionQuery` / `useActionMutation` 打 `POST /lf/rpc/<actionId>`，Host 侧由 `@folio/base-runtime-host` 统一分发。

## 两个动作

| id | tier | 输入 | 返回 |
|---|---|---|---|
| `starter.ping` | `modify` | `{ echo: string }`，默认 `{ echo: 'pong' }` | `echo`、`pluginId`、`pluginDataDir`、`pingCount`、`lastPingAt` |
| `starter.status` | `read` | `{}` | `pluginId`、`pluginDataDir`、`pluginCacheDir` 加整份 `state.json` |

输入校验完全由 `defineAction` 的 Zod schema 决定。`z.object({ echo: z.string().default('pong') }).default({ echo: 'pong' })` 让 `undefined`、`{}`、`{ echo: 'x' }` 三种入参都能通过；类型不对时抛 `ZodError`，`normalizeError` 把它翻成 `400 / invalid_input`，`message` 是 `path: message` 拼接，`details` 带原始 `issues`。

`tier` 是必填元数据（`read` / `modify` / `delete`），用来声明动作会不会改状态：写 `state.json` 的 `starter.ping` 是 `modify`，只读的 `starter.status` 是 `read`，本插件没有 `delete`。`exposeToDsh` 没写，`defineAction` 默认补 `false`——动作只走 LocalFolio 的 RPC，不注册成 DSH 工具。

## 数据

插件目录在 `%LOCALAPPDATA%/LocalFolio/plugins/test-overview-host/`，`data/` 与 `cache/` 由 `forPlugin` 首次调用时创建，`state.json` 落在 `data/` 下，结构由 `StarterStateSchema` 固定：

```json
{ "lastPingAt": 1763000000000, "pingCount": 3 }
```

`jsonStore` 的语义值得记住：

- 文件不存在或内容为空 → 返回 `defaultValue()` 经 `schema.parse` 的副本，不写盘。
- `update(updater)` 进内部串行队列，先读后写，并发请求不会丢计数；写入是 `JSON.stringify(..., null, 2)` 加结尾换行。
- 解析失败抛 `FolioError('json_store_corrupt', ..., 500)`，坏文件不会被静默覆盖。
- 写入前再跑一次 `schema.parse`，`pingCount` 的 `int().nonnegative()` 在落盘时同样生效。
- `update()` 返回更新后的完整状态，`starter.ping` 直接把它回给 UI，不需要二次读取。

## 清理

两个 `registerAction` 的 disposer 挂在同一个 `ctx.effect` 里，卸载时按注册的逆序调用。这不是形式主义：`@folio/base-runtime-host` 对重复 id 直接抛 `FolioError('duplicate_action', ..., 409)`，任何漏掉清理的插件在热重载后第二次 `apply` 都会失败。

## 退场

删除 `plugins/test-overview-host` 与 `bundles/test-suite/cordis.patch.yml` 里的 `test-overview-host` 一行。配套的 `@folio/test-overview-ui` 会因此少一张「私有存储验证」卡片，属预期结果；`@folio/base-storage-host` / `@folio/base-runtime-host` 不受影响。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```
