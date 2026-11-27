# @folio/base-settings-ui · 基础设置页

工作台通用基础能力。它在 DSH 设置面板里注册一个分节「我的插件」（`settings.section` 槽位，`order: 60`），把 LocalFolio 的插件清单分两层展示：一层是经 Cordis Service / Slots 增量扩展 DSH 的工作台插件，按 `base` / `workspace` / `feature` / `test` / `bridge` 分组；另一层是随宿主插件静态打包的内嵌扩展。数据全部来自 `plugins.manifest.get`，本插件不持有自己的持久化文件。

## 它做什么

- 注册设置分节：`id: 'folio-my-plugins'`、`label: '我的插件'`、`order: 60`。
- 打开设置页时拉取一次清单，渲染「概要统计 + 分类筛选/搜索 + 分组卡片 + 内嵌扩展 + 命名空间脚注」，含失败提示与加载态。
- 提供纯视图层的分类筛选、关键词搜索与分组折叠，便于在 29 条登记里定位插件。
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

一屏自上而下四段：概要 → 工具条 → 工作台插件分组 → 内嵌扩展与命名空间脚注。

1. **概要**：标题 + `LocalFolio` 徽标 + 一句「本页只读，启停仍以 DSH 插件页为准」；三张统计卡分别给出工作台插件总数、已启用数（附停用个数）、内嵌扩展数。
2. **工具条**：「全部 29」+ 五个分类筛选胶囊（带分类色点、当前条数、`aria-pressed`），下方是搜索框，命中范围覆盖 `name` / `id` / `loaderId` / `description` / `services` / `slots`。
3. **工作台插件**：分组顺序固定为 `base` → `workspace` → `feature` → `test` → `bridge`：

   | `category` | 分组标题 | 包名前缀 |
   |---|---|---|
   | `base` | 基础能力 | `base-*` |
   | `workspace` | 工作区 | `workspace-*` |
   | `feature` | 功能插件 | `feature-*` |
   | `test` | 测试界面 | `test-*` |
   | `bridge` | 桥接插件 | `bridge-*` |

   每组是一张卡片：左侧分类色条 + 标题 + 包名前缀 + 条数徽标 + 右侧启用状态（全启用显示「全部启用」，否则「已启用 n/m」）+ 折叠箭头。组内插件以 `auto-fit` 网格铺开，窄容器自动降为单列；每张插件卡显示名称、`loaderId`（等宽）、两行截断的描述，以及底部 chips：`ctx.<service>`（等宽）、`↳ <slot>`、`N 依赖`；名称右侧用「后端 / 界面」标出 `-host` / `-ui` 后缀角色，停用项追加「已停用」标签并使用虚线边框。分组为空时显示「暂未登记」。
4. **内嵌扩展**：与分类组同款卡片（标题 + 「静态打包」前缀 + 条数 + 「不可独立启停」），逐条显示名称、`ecosystem`、来源（`official` / `community` / `custom` → 官方 / 社区 / 自建）、宿主插件 id 与描述；为空时提示宿主插件内嵌第三方引擎时登记在此（默认清单里是画板工作区的 `tldraw`）。最后若有运行时命名空间，追加一行 `DSH 运行时配置命名空间（N）：a, b, ...`。

DOM 钩子：根节点 `data-lf-my-plugins-section`、两层 `data-lf-plugins-layer="dsh" | "internal"`、每组 `data-lf-plugin-group="<category>"`（附带 `data-open`）、每张插件卡 `data-lf-plugin-card="<id>"`（附带 `data-enabled`）、统计卡 `data-lf-plugins-stat="total" | "enabled" | "extensions"`、筛选胶囊 `data-lf-filter="all" | <category>`、内嵌扩展条目 `data-lf-internal-extension="<id>"`、命名空间行 `data-lf-runtime-namespaces`。

## 行为与规则

- **单次拉取**：挂载时请求一次清单（依赖 `loadManifest` / `resolveSettings` 引用变化才重取）。页面停留期间收到的 `plugins` 失效事件不会让本页自动刷新，重新挂载该分节（重开设置页）后才读到最新落盘结果。
- **筛选与搜索只改视图**：分类胶囊、搜索框、分组折叠都是组件内 `useState`，不写清单、不发 RPC；搜索态下命中组强制展开且无命中的组不渲染，全局无命中时提示「没有匹配「…」的插件」。
- **折叠**：点击分组标题折叠/展开该组（`aria-expanded` + `aria-controls`），「全部收起 / 全部展开」一次切换所有分类；内嵌扩展卡片标题是静态行、不可折叠。
- **失败可见**：拉取失败渲染 `role="alert"` 的「清单加载失败：<message>」，不清空已有内容、也不抛给 DSH。
- **加载态**：既无清单也无错误时显示「正在加载插件清单...」。
- **可选探测**：`resolveSettings()` 缺失、`ctx.get` 不可用或 `describe()` 抛错都被 `try/catch` 吞掉，只是不显示那一行。
- **样式**：组件自带 `.lf-mp-*` 作用域样式表（`src/my-plugins-styles.ts`，随组件以 `<style data-lf-my-plugins-styles>` 注入），全部颜色/圆角/字体读 `--dsw-alias-*` 与 `--ds-font-family-code` 令牌并带浅色兜底；`.lf-mp-` 前缀保证不碰 DSH 设置页自身的选择器。只有「已停用」标签复用 `@folio/base-ui-kit` 的 `FolioTag`（`tone="neutral"`）。

## 限制与边界

- **本页只有展示，没有启停开关**：`enabled` 只有一个「已停用」标签与分组计数，点击不可切换。要改启用状态必须外部调用 `plugins.manifest.save` 提交完整合法清单。
- **清单不是 DSH 加载器的真相**：`plugins-manifest.json` 是 LocalFolio 自己的登记表，写它不会装载、卸载或禁用任何 DSH 插件；实际启停仍走 DSH 插件管理页，清单里的 `enabled` 只表示 LocalFolio 侧的登记状态。
- 不做安装入口：增删插件要改 `package.json` / 套件依赖并重启或热重载。
- 不允许自由编辑：没有表单、没有校验提示；提交非法清单会被 `PluginManifestSchema` 在 Host 侧拒绝（`invalid_input`）。
- 未知 `category` 不会显示（schema 只允许五个值）；组内顺序沿用清单里的登记顺序，不按名称或 `order` 重排。
- 内嵌扩展不可独立启停或安装；`slots` / `services` 仅作文本展示，不校验是否真的注册过。
- 「后端 / 界面」角色由包名后缀推断（`-host` / `-ui`），只是阅读辅助，不是契约字段。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```

`src/__tests__/settings.test.tsx` 用注入的 `loadManifest` 与 `resolveSettings` 覆盖：概要统计、两层容器与分类分组、插件卡的服务 chips 与停用标签、内嵌扩展、命名空间行（`general, plugins`），以及分类筛选、搜索命中（`folioStorage` / `workspace.panel` / 无命中提示）、分组折叠与展开。

