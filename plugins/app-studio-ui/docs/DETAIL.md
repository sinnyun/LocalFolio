# Studio Admin（@folio/app-studio-ui）

把 [arhamkhnz/next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard)（MIT，Studio Admin）移植成 LocalFolio 工作台插件，注册为工作区 `Studio Admin`。

## 这是什么

- **不是**把原仓库当作依赖安装：它是 Next.js 16 App Router 应用，带 `cookies()` / server actions / `next/font`，没有可被 DSH 加载的包入口；DSH Client 插件要求单模块、React 18 单实例、不得新增 app root。
- 因此做的是**移植**：导航结构、主题预设（Default / Tangerine / Neo Brutalism / Soft Pop）、布局偏好（sidebar 形态、折叠模式、内容宽度、导航栏行为）、指标卡、图表与表格的视觉与交互取自原仓库；页面代码基于 `@folio/core-ui-kit` 的 shadcn 原语重写，图表用 `recharts` 直接实现（模板同款）。

## 已实现

- **外壳**：可折叠图标侧栏（`sidebar` / `floating` / `inset` 三种形态，`icon` / `offcanvas` / `none` 三种折叠模式）、侧栏分组与徽标（new / updated / soon）、Quick Create、Support 卡、用户菜单、侧栏 Rail 拖拽。
- **顶栏**：`⌘J` / `Ctrl+J` 命令搜索（覆盖全部导航）、布局偏好面板（主题预设、明暗、内容宽度、导航栏 sticky/scroll、侧栏形态与折叠方式、恢复默认）、明暗循环切换、上游仓库菜单、账户切换。
- **主题**：四套预设的 light/dark 变量全部内置为插件内联 CSS 变量，`dark` class 只落在插件子树；预设阴影尺度由插件内 `<style>` 按 `[data-lf-studio]` 前缀限定作用域。
- **页面**：Default 仪表盘（4 张指标卡、Customer Activity 面积+双折线图、18,426 Customers 数据表：搜索 / 状态 / 账单 / 排序 / 行选择 / 分页）。
- **未移植**：其余 25+ 页面（CRM、Finance、Analytics、Productivity、E-commerce、Academy、Logistics、Infrastructure、File Manager、Patient Monitoring、Crypto、HR、Products、Mail、Chat、Calendar、Kanban、Tasks、Invoice、Profile、Users、Roles、Auth v1/v2、Legacy V1）在导航中保留入口，点击渲染「排队移植」占位卡，占位卡会说明页面用途并链接上游仓库。

## 与原模板的差异（有意取舍）

| 原模板 | 本插件 |
| --- | --- |
| TanStack Router / Next.js 文件路由 | 工作区内 `StudioRoute` 状态机 |
| zustand + cookie 持久化偏好 | 组件内 state + `localStorage['lf.studio.settings.v1']`（UI 偏好缓存；不写 cookie、不碰宿主主题；业务数据仍归 `%LOCALAPPDATA%\LocalFolio`） |
| `next-themes` 全局主题 | 仅作用于插件子树的内联主题变量与 `dark` class |
| `cmdk` 命令面板 | Dialog + 受控输入 + 分组结果（不新增依赖） |
| `@tanstack/react-table` v9 | 自写轻量表格（搜索/筛选/排序/分页/行选择） |
| 上游 JSON 固件 | 固定种子 PRNG 生成，刷新不变 |
| `popover` 布局偏好面板 | Dialog 面板（core-ui-kit 尚未提供 popover） |
| shadcn sidebar 用 `position: fixed` / `h-svh` 贴视口 | 插件内 `<style>` 把 `[data-slot="sidebar-container"]` 重锚为 `position: absolute`，否则会盖住 `shell.overlay` 自己的页签条 |

## 依赖与约束

- 仅 `dsh.client.external` 共享 `@folio/core-ui-kit`；`recharts`、`lucide-react` 随插件打包（client 产物约 1.2 MB）。
- 所有弹层、下拉、Select 走 core-ui-kit 的受管 Portal（`shell.overlay`），不写 `document.body`。
- 不读取宿主 DOM、不注册全局样式；不 import 任何 `@deepseek-ai/dsh-client-*`。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
pwsh -File scripts/lfdev.ps1 install
pwsh -File scripts/lfdev.ps1 restart
pwsh -File scripts/lfdev.ps1 verify
```

`lfdev` 是隔离 profile（端口 3081），安装聚合元包 `@folio/bundle-suite-all` 后即可从顶栏 `LocalFolio` 工作台打开 `Studio Admin`。
