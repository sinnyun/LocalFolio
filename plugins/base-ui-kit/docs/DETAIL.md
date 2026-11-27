# @folio/base-ui-kit · 基础 UI 组件库

工作台通用基础能力。它为所有工作台界面插件提供运行期单实例共享的 UI 基础组件（Radix UI + `lucide-react`）、统一主题样式、受管 Portal 弹层容器与 Toast 通知服务 `ctx.folioUi`。整条工作台链路里只有它打包 Radix UI 与这套通用组件，其余 UI 插件通过 `dsh.client.external` 复用它导出的同一份实例，客户端产物体积不重复；专属图标仍可在各自插件里直接 `import { ... } from 'lucide-react'`，由 esbuild 按图标 tree-shake。

## 它做什么

- 提供 `ctx.folioUi`：`toast` / `dismissToast` / `clearToasts` / `getPortalContainer`。
- 在 DSH `shell.overlay` 槽位挂一个宿主（`id: 'folio.ui.host'`，`order: 3`），由它统一负责三件事：
  1. 注入整份作用域样式（`<style data-lf-ui-styles>`，`.lf-*` 规则 + 编译后的 Tailwind）；
  2. 提供 Radix 弹层要用的 Portal 根节点（`<div data-lf-portal-root>`），弹窗、菜单、下拉、Tooltip、Lightbox 都挂在这里；
  3. 渲染共享 Toast 栈（`FolioToaster`）。
- 导出一套带 LocalFolio 前缀的封装组件（`FolioButton`、`FolioTag`、`FolioInput`、`FolioDialog` 等）与全量 shadcn 原语（`Button`、`Sidebar`、`Table`、`Sheet` 等），以及 22 个 `lucide-react` 图标再导出。

## 服务接口

签名与 `libs/base-contract/src/ui-service.ts` 一致：

```ts
export type FolioToastTone = 'neutral' | 'info' | 'success' | 'danger'

export interface FolioToastInput {
  readonly id?: string
  readonly title: string
  readonly description?: string
  readonly tone?: FolioToastTone
  /** 自动关闭延时；传 0 表示常驻，默认 3600ms。 */
  readonly durationMs?: number
}

export interface FolioToastRecord {
  readonly id: string
  readonly title: string
  readonly description?: string
  readonly tone: FolioToastTone
  readonly durationMs: number
  readonly createdAt: number
}

export interface FolioUiService {
  toast(input: FolioToastInput | string): string
  dismissToast(id: string): void
  clearToasts(): void
  getPortalContainer(): HTMLElement | null
}
```

`toast()` 返回生成的 id（`lf-toast-<n>`，可自带 `id`）；同一 `id` 再次入队会替换旧记录并重置计时器；最多同时存在 5 条，超出时淘汰最早的一条。

## 接入

消费方（工作区、功能插件、测试界面）在 `package.json` 里声明复用并 import 客户端入口：

```jsonc
{
  "dsh": {
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": ["@folio/base-ui-kit", "@folio/base-shell-ui"],
      "external": ["@folio/base-ui-kit"]
    }
  }
}
```

```tsx
import { FolioButton, FolioCard, FolioTag, FolioIconLayers } from '@folio/base-ui-kit/client'
import type { Context } from '@deepseek-ai/cordis'

export const inject = ['folioUi'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    ctx.folioUi.toast({ title: '已保存', tone: 'success' })
    return () => {}
  }, 'feature-notes-ui: demo toast')
}
```

`@folio/base-ui-kit` 自身的 `dsh.client` 只有 `platform: 'web'`、`immediately: true`、`inject: ['@deepseek-ai/dsh-client-ui-layout']`，**没有** `external` 字段——它是被复用的一方；`external` 只写在消费方。构建期 `scripts/build.mjs` 会把 `react`、`react-dom`、`@deepseek-ai/*`、`zod`、`@tanstack/react-virtual` 与声明的 `external` 一并设为 esbuild external，因此这些模块在浏览器里由 DSH 模块加载器提供单实例。

## 受管 Portal 与 Toast

- Portal 容器是页面级单例（`portal.ts`，经 `page-singleton.ts` 挂在全局符号注册表上）：`FolioUiHost` 挂载时 `setPortalContainer(el)`，卸载时置 `null`；React 侧用 `useSyncExternalStore` 订阅，容器为 `null` 时 Radix 回落默认行为（挂 `document.body`），所以「宿主未就绪」不会让弹窗报错。
- 宿主外层是 `position: absolute; inset: 0; pointer-events: none; z-index: 80`，只有具体弹层与 Toast 自己开 `pointer-events: auto`，不会挡住工作台点击。
- Toast 栈是 `position: fixed; right: 16px; bottom: 36px; z-index: 950`；弹窗遮罩/内容为 900/910，菜单与下拉 920，Tooltip 930。
- 卸载顺序由 `ctx.effect` 清理函数保证：`clearToasts()` → `setPortalContainer(null)` → 注销槽位 → 注销服务。

## 热重载下的单实例身份

`dsh.client.external` 的「单实例」只在页面首次加载时成立。DSH 的浏览器模块系统按**行**做热替换：`entries.reload` 只清掉被重编包自己的模块记录并重新求值，其它插件继续持有它们各自工厂运行时抓到的旧导出。于是模块作用域里的东西会分叉，两侧互相看不见。

本插件里必须跨插件共享的三样东西因此都放在 `page-singleton.ts`（`Symbol.for` 全局符号注册表，模块被重新求值也不会被清空），第一个创建者写入、之后所有副本复用：

| 状态 | 键 | 为什么会分叉 |
|---|---|---|
| `SidebarProvider` 的 React Context | `@folio/base-ui-kit/sidebar-context` | 框架插件装 Provider，工作区插件渲染 `SidebarMenuButton` / `Sidebar*`；只重载一侧就会让 Provider 与消费方各自持有不同的 Context 对象，`useSidebar()` 抛 `useSidebar must be used within a SidebarProvider.` |
| Portal 容器 | `@folio/base-ui-kit/portal-container` | 宿主由本插件那一行挂载，弹层由业务插件那一行渲染 |
| Toast 队列 | `@folio/base-ui-kit/toast-store` | 业务插件入队，`FolioToaster` 在宿主那一行订阅 |

另外两处配套约定：

- `SidebarMenuButton` 的 tooltip 自带一个 `TooltipProvider`。Radix 同样按 Context 对象身份匹配 Provider，消费方副本无法复用框架那一行的 Provider；嵌套 Provider 是 Radix 支持的用法。
- `scripts/build.mjs` 的 `writeAtomic` 在内容字节相同时不写文件。DSH 依据 `mtimeMs` / `ctimeMs` / size 推导每一行的 HMR revision，内容未变的产物若被重写，会让整个页面把每个插件行都重载一遍（状态全丢，且把新旧实例混在同一棵树里）。

回归测试：`src/__tests__/hmr-identity.test.tsx` 用两个独立的模块副本模拟「Provider 一侧被替换、消费方一侧没被替换」，覆盖 Context、Portal、Toast 与注册表本身。

## 样式体系

- `FOLIO_UI_STYLES`（`src/styles.ts`）是一整份字符串样式表：**零全局 reset**（没有 `*`、`body`、裸标签选择器），每个选择器都以 `.lf-` 开头；所有颜色、圆角、阴影、字体读 `--dsw-*` 令牌并带兜底值，例如 `--lf-fg: var(--dsw-alias-label-primary, #1b1b1c)`、`--lf-border: var(--dsw-alias-border-l3, rgba(15, 23, 42, 0.14))`、`--lf-radius-md: var(--dsw-radius-md, 10px)`，因此深浅主题自动跟随 DSH。
- Tailwind v4 只引入 `tailwindcss/theme.css` 与 `tailwindcss/utilities.css`，**故意不引 preflight**；`@theme inline` 把 shadcn 变量映射成工具类颜色。变量与最小化 reset 只作用在 `[data-lf-shell]`、`[data-lf-floating-host]`、`[data-lf-ui-host]`、`[data-lf-my-plugins-section]` 四个容器内（分别由外壳、悬浮面板、UI 宿主、设置页分节提供这些属性）。
- `@source "./"` 扫本插件源码，`@source "../../"` 指向 `plugins/` 目录，所以**任何 UI 插件里写的 Tailwind 工具类都会被编译进这一份共享样式表**；新增插件目录无需改配置，但把源码放到 `plugins/` 之外就要同步改 `@source`。
- 编译由 `pnpm run build`/`build:watch` 驱动：`scripts/build.mjs` 调 `tailwindcss -i src/tailwind.css -o src/tailwind.generated.css --minify`，再以 `loader: { '.css': 'text' }` 把结果当字符串内联进 `lib/client.js`；`build:watch` 下任一 UI 插件重建后会触发这份样式表重编译。

## 组件与图标导出

- 封装层：`FolioButton`（`variant: primary | outline | ghost | danger`、`size: sm | md | icon`、`icon`）、`FolioTag` / `FolioBadge`（`tone: neutral | info | success | danger`）、`FolioInput` / `FolioTextarea`、`FolioCard` / `FolioSeparator` / `FolioEmptyState`、`FolioSwitch`、`FolioTabs*`、`FolioDialog*`、`FolioDropdownMenu*`、`FolioSelect`、`FolioTooltip*`、`Lightbox*`（灯箱：点击缩放、拖拽平移、方向键切换、RTL 感知、缩略图条）。
- 通用原语：`src/ui-exports.generated.ts` 自动汇总 `components/ui/*` 与 `hooks/*`——`avatar`、`badge`、`breadcrumb`、`button`、`card`、`collapsible`、`dialog`、`dropdown-menu`、`empty`、`input`、`select`、`separator`、`sheet`、`sidebar`、`skeleton`、`table`、`tabs`、`tooltip`，以及 `use-controllable-state`、`use-mobile`。
- 图标：`icons.tsx` 用 `wrapLucide` 统一包装（默认 `size: 14`、`strokeWidth: 1.75`、`aria-hidden`、`focusable="false"`），导出 `FolioIconLayers`、`FolioIconPlugin`、`FolioIconSearch` 等 22 个。
- 工具：`cn(...inputs)`（`clsx` + `tailwind-merge`），可直接用于覆盖原语类名。

## 维护流程

```powershell
# 新增一个 shadcn 原语（内部会跑 sync，自动修 import / 去全局 CSS / 更新桶文件）
pnpm run ui:add dialog

# 只跑同步（也可单独执行，构建前会自动跑一次）
pnpm run ui:sync
```

`scripts/sync-ui-kit.mjs` 做四件事：把 `components/ui/*` 里的 `from "cn"` 改写成 `from "@/lib/utils"`；裁掉 shadcn CLI 追加到 `tailwind.css` 的全局 `:root` / `.dark` 块（以 `/*\n ---break---\n */\n:root` 为标记）；把误装进 `dependencies` 的包挪到 `devDependencies`（全部打进 bundle，运行期无依赖）；按文件名重生成 `src/ui-exports.generated.ts`。

## 为什么禁止 require `@deepseek-ai/dsh-client-ui-*`

`dsh-client-ui-primitives` 这类包在冻结的平台模块表里，技术上 `require` 得到，但它们是 DSH 内部客户端库，导出不稳定；一旦某个组件抛错，整个槽位条目会整块空白（`slot entry crashed in '<slot>'`），且不同 bundle 之间无法共享 React Context 与主题状态。所以约定是：控件照 `.tsx` + `--dsw-alias-*` 令牌抄一份并加自己的类名前缀，通用件统一由本插件提供（见 `docs/DSH-PLUGIN-REFERENCE.md` 中「政策口径」与 §11.6 的迁移记录）。

## 限制与边界

- 宿主挂在 `shell.overlay`，`order: 3`；同槽位还有外壳（1）与悬浮面板（2），三者顺序由各自的 `slots.register` 决定，改动会直接改变叠放次序。
- Portal 容器为 `null` 时 Radix 会挂到 `document.body`：SSR/测试环境或宿主尚未挂载时，弹层不在受管容器内。
- 样式只对带 `data-lf-*` 属性的容器生效：插件在自己的根节点上补 `data-lf-shell` / `data-lf-floating-host` / `data-lf-ui-host` / `data-lf-my-plugins-section` 之一，否则 Tailwind 变量与作用域 reset 不生效。
- 只提供视觉与弹层基础件，不含数据请求、路由、状态管理；也不得 import 其它功能插件（插件之间只走 Cordis Service 与 Slot）。
- Toast 队列是页面级内存状态（刷新即清空）；单条文案只支持 `title` + 一段 `description`。
- 图标按需 tree-shake，但组件库整体由本插件一份 bundle 承担；不要把业务组件塞进本包。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```

`src/__tests__/ui-kit.test.tsx` 覆盖：`.lf-*` 类名与 `data-variant` / `data-tone` 属性、Radix `Switch` 与 `Tabs` 交互、`Dialog` 渲染进受管 Portal 而非 `document.body`、`toast()` 上屏、以及 `apply()` 注册 `folioUi` 与 `shell.overlay` 宿主并在清理后把 Portal 容器置空。

`src/__tests__/hmr-identity.test.tsx` 覆盖热替换下的一致性（见上一节）。`components/ui/sidebar.tsx` 是有本地补丁的 shadcn 文件（`pageSingleton` 上下文 + 每个 `SidebarMenuButton` 自带的 `TooltipProvider`）：正常改代码不需要碰它，但 `pnpm run ui:add sidebar --overwrite` 会用上游版本覆盖，覆盖后这组测试会立刻失败——按测试恢复补丁即可，不要改测试。
