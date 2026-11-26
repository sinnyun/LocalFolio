# @folio/test-overview-ui · 测试概览 UI

形态 A（四区工作区）的样板，也是测试界面（Test Surface）里唯一同时验证「四区」和「悬浮面板」两条接入路径的插件。它把 `ctx.folioFrame.WorkspaceHost` 当作自己的 `MainView`，再给框架一个 `FrameAppDefinition` 说明左 / 中 / 底放什么；同一个 `apply` 里又向 `ctx.folioShell` 注册了一个自由悬浮面板。最终会被删除，或作为真实工作区的起点被改写。

## 它验证什么

- 形态 A 的最小闭环：工作区只声明 `MainView: frame.WorkspaceHost`，四区、分隔条、折叠、几何持久化、逐区 Suspense 与错误隔离全由 `@folio/base-frame-ui` 托管，插件不碰布局。
- 「声明了才有」是否成立：`FrameAppDefinition` 只给 `Left` / `Main` / `Status`，右侧面板、右分隔条与右栏折叠按钮都不出现。
- 悬浮面板与工作区正交：`registerFloatingPanel` 注册的窗口跨工作区切换存活，拖拽、八向缩放、最大化、Esc 关窗由外壳提供。
- `Provider` 能让左 / 中 / 底共享一个 React context。
- RPC 查询与变更的写法：`useActionQuery` 拉 `system.info` / `starter.status`，`useActionMutation` 打 `starter.ping`。
- `@folio/base-ui-kit` 的 `FolioButton` / `FolioTag` / `FolioIcon*` / `toast` 与 `--dsw-*` 令牌在 DSH 原生 DOM 里直接用，不隔 Shadow DOM。

## 接入方式

`package.json` 的 `dsh.client` 是关键：`platform: "web"`、`immediately: true`、`inject: ['@folio/base-ui-kit', '@folio/base-shell-ui']`，并用 `external: ['@folio/base-ui-kit']` 保证与宿主共用同一份组件实例。Cordis 侧只注入两个 UI 服务：

```tsx
export const name = 'test-overview-ui'
export const inject = ['folioShell', 'folioFrame'] as const

export function apply(ctx: Context): void {
  const shell = ctx.folioShell
  const frame = ctx.folioFrame
  // ...
}
```

`lib/index.js` 是 Host 侧空壳（`export function apply() {}`），真正的界面在 `lib/client.js`，由 `dsh.client` 加载。

## 四区

工作区贡献只有三项：`id: 'starter'`、`title: '测试概览'`、`MainView: frame.WorkspaceHost`。四区内容在 `FrameAppDefinition` 里：

```tsx
const starterApp: FrameAppDefinition = {
  id: APP_ID,                       // 'starter.workbench'，也是布局持久化的 key
  title: '测试概览',
  pluginId: '@folio/test-overview-ui',
  order: 1,
  icon: FolioIconData,
  Left: StarterLeft,                // 已注册工作区列表 + 打开悬浮面板
  Main: StarterMain,                // 两张状态卡 + 顶部三个按钮
  Status: StarterStatus,            // 底部信息栏一行文本
  Provider: StarterProvider,        // 把 shell 塞进 context
  leftCollapse: 'icon',
}
```

没有 `Right` 与 `rightTitle`，所以右栏不渲染；`Main` 是唯一必填区域。折叠左栏（`Ctrl+B`）、拖宽、切应用都由框架负责，`Left` 只读 `shell.listWorkspaces()`、调 `shell.navigateTo(id)`，再加一个打开悬浮面板的按钮。

## 悬浮面板

```tsx
const disposePanel = shell.registerFloatingPanel({
  id: INSPECTOR_PANEL_ID,           // 'starter.inspector'
  title: '底座实时检视浮窗',
  pluginId: '@folio/test-overview-ui',
  defaultWidth: 520,
  defaultHeight: 340,
  minWidth: 340,
  minHeight: 220,
  Component: StarterFloatingInspector,
})
```

`Component` 收到 `FloatingPanelRenderProps`：`panelId`、`maximized`、`toggleMaximize()`、`close()`。窗口 chrome（标题栏、八向缩放、置顶、位置记忆）由 `@folio/base-shell-ui` 绘制，插件只管内容。左栏按钮和 `Main` 顶部的「打开悬浮面板」都调 `shell.openFloatingPanel(INSPECTOR_PANEL_ID)`，共用同一份注册。

## 数据

三个动作全部经 RPC 往返，页面本身不持有业务状态：

| 动作 | 来源 | 用途 |
|---|---|---|
| `system.info` | `@folio/base-runtime-host` 内建 | 根目录、插件目录、`fsProvider`、已分配存储的插件、已注册动作、SSE 订阅数 |
| `starter.status` | `@folio/test-overview-host` | 插件专属 `data/` / `cache/` 路径与 `state.json` 的 `pingCount` |
| `starter.ping` | 同上 | 写一次 `state.json`，`onSuccess` 里 `void status.refetch()` 并弹 `toast` |

`useActionQuery` 的返回是 `{ data, error, isLoading, refetch }`，所以两张卡片都是 `isLoading → 正在连接` / `error → 读取失败` / `data → <dl>` 三态。注意 `starter.ping` 没有调 `ctx.folioRuntime.events.emitInvalidate`，这里必须手动 `refetch`，不能指望 SSE 自动刷新。

## 退场

删除本包，并从 `bundles/test-suite/cordis.patch.yml` 去掉 `test-overview-ui` 一行。四区与悬浮面板都是基础能力，删掉样板不损失任何东西；真实工作区接手时把 `starterApp` 与 `starterWorkspace` 的 id 换成自己的即可。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```
