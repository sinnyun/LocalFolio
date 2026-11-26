# @folio/base-settings-ui · 基础设置页

工作台通用基础能力。它在 DSH 设置面板里注册一个分节「我的插件」（`settings.section` 槽位，`order: 60`），把 LocalFolio 的插件清单分两层展示：一层是经 Cordis Service / Slots 增量扩展 DSH 的工作台插件，按 `base` / `workspace` / `feature` / `test` / `bridge` 分组；另一层是随宿主插件静态打包的内嵌扩展。数据全部来自 `plugins.manifest.get`，本插件不持有自己的持久化文件。

## 它做什么

- 注册设置分节：`id: 'folio-my-plugins'`、`label: '我的插件'`、`order: 60`。
- 打开设置页时拉取一次清单，渲染两级视图 + 失败提示 + 加载态。
- 可选地读 DSH 的 `ctx.settings.describe()`，在底部补一行「DSH 运行时配置命名空间」。
- 只读展示：不装插件、不改清单、不碰 DSH 配置。

## 接入

`package.json` 里声明客户端形态与单实例复用：

```jsonc
{
  "dsh": {
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": [
        "@folio/base-ui-kit",
        "@deepseek-ai/dsh-client-ui-settings-general"
      ],
      "external": ["@folio/base-ui-kit"]
    }
  }
}
```

`inject` 里的 `@deepseek-ai/dsh-client-ui-settings-general` 是设置界面的宿主插件，用于保证设置页先就绪再激活本分节（`inject` 只影响激活排序），`@folio/base-ui-kit` 提供 `FolioTag`。客户端入口只做槽位注册：

```ts
export const name = 'base-settings-ui'
export const inject = ['slots'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const dispose = slots.inject('settings.section', () =>
      slots.register(
        { name: 'settings.section', id: 'folio-my-plugins', order: 60, label: '我的插件' },
        Section,
      ),
    )
    return () => dispose()
  }, 'base-settings-ui: settings.section')
}
```

`MyPluginsSection` 本身是可独立渲染的组件，测试或嵌入式场景可以绕开 RPC：

```ts
export interface MyPluginsSectionProps {
  readonly resolveSettings?: () => DshSettingsServiceLike | undefined
  readonly loadManifest?: () => Promise<PluginManifest>
}
```

`loadManifest` 缺省即 `rpcCall<PluginManifest>('plugins.manifest.get', {})`。

## 数据来源与读写路径

| 方向 | 路径 | 说明 |
|---|---|---|
| 读 | `POST /lf/rpc/plugins.manifest.get` | 由 `@folio/base-runtime-host` 提供，读 `%LOCALAPPDATA%\LocalFolio\shared\plugins-manifest.json`（`PluginManifestSchema`，`version: 2`） |
| 写 | `POST /lf/rpc/plugins.manifest.save` | 动作分级 `modify`，整份替换清单并 `emitInvalidate('plugins')`，SSE 推给所有已连接客户端 |
| 可选读 | `ctx.get('settings').describe()` | DSH 自身服务；只取命名空间名（数组元素或对象的 key），失败静默忽略 |

清单结构（`libs/base-contract/src/manifest.ts`）：`dshPlugins[]` 每项含 `id`、`name`、`loaderId`、`category`、`slots[]`、`services[]`、`description`、`enabled`、`dependsOn[]`；`internalExtensions[]` 每项含 `id`、`name`、`hostPluginId`、`ecosystem`、`source`（`official | community | custom`）、`description`、`enabled`。

## 展示结构

一级分组顺序固定为 `base` → `workspace` → `feature` → `test` → `bridge`，标题文案：

| `category` | 分组标题 |
|---|---|
| `base` | 工作台通用基础能力（base-*） |
| `workspace` | 工作区（workspace-*） |
| `feature` | 功能插件（feature-*） |
| `test` | 测试界面（test-*） |
| `bridge` | 桥接插件（bridge-*） |

每个插件条目显示 `name` + `<code>loaderId</code>`、`description`、`提供服务：...`、`挂接槽位：...`，右侧一个 `FolioTag` 标 `已启用` / `已停用`（`tone` 分别为 `info` / `neutral`）；分组为空时显示「暂未登记」，并始终带 `（N）` 计数。

第二层「插件内嵌扩展（静态打包，如 tldraw 画板引擎）」逐条显示 `name` 与形如 `<ecosystem> · <source> · <hostPluginId>` 的标签、以及 `description`；列表为空时提示宿主插件内嵌第三方引擎时登记在此（默认清单里登记的是画板工作区的 `tldraw`）。底部若有运行时命名空间，追加一行 `DSH 运行时配置命名空间（N）：a, b, ...`。

DOM 钩子：根节点 `data-lf-my-plugins-section`（同时是 Tailwind 变量作用域容器）、两层 `data-lf-plugins-layer="dsh" | "internal"`、每组 `data-lf-plugin-group="<category>"`、命名空间行 `data-lf-runtime-namespaces`。

## 行为与规则

- **单次拉取**：挂载时请求一次清单（依赖 `loadManifest` / `resolveSettings` 引用变化才重取）。页面停留期间收到的 `plugins` 失效事件不会让本页自动刷新，重新挂载该分节（重开设置页）后才读到最新落盘结果。
- **失败可见**：拉取失败渲染 `role="alert"` 的「清单加载失败：<message>」，不清空已有内容、也不抛给 DSH。
- **加载态**：既无清单也无错误时显示「正在加载插件清单...」。
- **可选探测**：`resolveSettings()` 缺失、`ctx.get` 不可用或 `describe()` 抛错都被 `try/catch` 吞掉，只是不显示那一行。
- **样式**：主体用内联样式 + `--dsw-alias-*` 令牌（`label-primary`、`label-tertiary`、`border-l3`、`bg-layer-1`、`state-error-primary`），只在启用/停用标签上复用 UI 组件库。

## 限制与边界

- **本页只有展示，没有启停开关**：`enabled` 只是一个 `FolioTag` 文案，点击不可切换。要改启用状态必须外部调用 `plugins.manifest.save` 提交完整合法清单。
- **清单不是 DSH 加载器的真相**：`plugins-manifest.json` 是 LocalFolio 自己的登记表，写它不会装载、卸载或禁用任何 DSH 插件；实际启停仍走 DSH 插件管理页，清单里的 `enabled` 只表示 LocalFolio 侧的登记状态。
- 不做安装入口：增删插件要改 `package.json` / 套件依赖并重启或热重载。
- 不允许自由编辑：没有表单、没有校验提示；提交非法清单会被 `PluginManifestSchema` 在 Host 侧拒绝（`invalid_input`）。
- 未知 `category` 不会显示（schema 只允许五个值）；归组顺序写死，不按 `order` 或名称排序。
- 内嵌扩展不可独立启停或安装；`slots` / `services` 仅作文本展示，不校验是否真的注册过。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```

`src/__tests__/settings.test.tsx` 用注入的 `loadManifest` 与 `resolveSettings` 覆盖：`base` / `workspace` 分组渲染到正确容器、`loaderId` 出现在对应组内、内嵌扩展单独成层、命名空间行内容为 `general, plugins`。
