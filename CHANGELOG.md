# CHANGELOG

LocalFolio 的能力演进记录。

> **这不是正式发布日志**：仓库没有打 tag，也没有按版本维护的发布记录。下面的分组只依据两件可验证的事实——`package.json` 里的当前版本号，和 `git log` 的提交顺序。它区分的是「`0.3.0-alpha.0` 这一轮新增了什么」与「这一轮没有改动、仍停在 `0.2.0-alpha.0` 的基座」，**不构成任何兼容性承诺**。

最新在前。

---

## 0.3.0-alpha.0（当前工作版本）

### 新增

- **文件浏览器工作区** `@folio/workspace-files-host` + `@folio/workspace-files-ui`（首个正式产品工作区，形态 A）：快捷文件夹与驱动器容量、懒加载文件树、双栏浏览与可编辑面包屑、Windows 系统缩略图、音视频区间流播放、文本/代码预览、文件检查器。
- **画板工作区** `@folio/workspace-canvas-host` + `@folio/workspace-canvas-ui`（形态 A）：tldraw 无限画布；图片只存本地文件链接；分层 LOD 代理渲染（256/512/1024/2048）；浏览器拖入自动导入托管；断链检测与批量重定位。（[ADR-0005](docs/adr/0005-canvas-stores-file-links-with-layered-lod-proxies.md)）
- **物料工作区** `@folio/workspace-materials-host` + `@folio/workspace-materials-ui`（形态 A）：关联 A3 横版 `.vectorcraft` 文件；页面多选导出单图/多页 PDF；幻灯片式拖拽排序；物料信息头与 VectorCraft 前台双向同步；默认/项目两套物料数据表。（[ADR-0007](docs/adr/0007-vectorcraft-files-stay-the-single-source-of-truth.md)）
- **DSH 交互桥接** `@folio/bridge-dsh-interactions-ui`（`ctx.folioInteractions`）：把 DSH 原生右键菜单、文件拖拽、下载/另存为桥接给各工作区，缺原生服务时自动降级。（[ADR-0008](docs/adr/0008-native-desktop-interactions-go-through-a-bridge-service.md)）
- **内部扩展登记**：`tldraw` 作为 `@folio/workspace-canvas-ui` 的内嵌引擎进入插件清单，在设置页与工作台插件分开展示。
- **Studio Admin 移植** `@folio/test-studio-admin-ui`：四套主题预设、三种侧栏形态与折叠模式、内容宽度与导航栏行为偏好、`⌘J` 命令搜索、指标卡与面积/折线图；上游 25+ 页面保留导航入口并渲染「排队移植」占位。
- **共享数据表原语**进入 `@folio/base-ui-kit`，供后台类界面复用（搜索 / 分面筛选 / 列显隐 / 排序 / 分页 / 行选择与批量删除）。

### 变更

- **套件的产品边界收紧**：六个 `test-*` 移出产品套件，单独成 `@folio/test-suite`；`@folio/workbench-suite` 只带基础能力、桥接与正式工作区。（[ADR-0004](docs/adr/0004-test-surfaces-ship-as-a-separate-suite.md)）
- **外壳与布局框架职责拆分**：外壳收成「一条顶部条 + 一整块内容区」，不再画左右栏与底栏；四区几何完全归 `@folio/base-frame-ui`。`WorkspaceUiContribution` 去掉 `HeaderSlot` / `LeftPanel` / `RightPanel` / `StatusSlot` / `hideStatusBar`，只留 `MainView`；几何持久化从百分比双套收敛为像素一套（`folio.frame.v1`），外壳持久化键升到 `folio.shell.overlay.v3`。（[ADR-0003](docs/adr/0003-shell-owns-window-and-workspace-frame-owns-app-regions.md)）
- **Windows 桌面版标题栏承载工作区切换**：`html[data-windows-titlebar]` 下不画外壳顶部条，把「工作台 ⇄ 返回 DSH」与工作区切换搬进 DSH 标题栏；左右面板开关改为外壳开放的 `registerCaptionAction` 注册点，由框架注册。
- **三类命名落地**：包名前缀与清单分类统一为 `base-* / workspace-* / feature-* / test-* / bridge-*`，对应 `libs/base-contract/src/manifest.ts` 的 `DshPluginCategory` 枚举。
- **系统能力集中到 Host 侧**：缩略图、按目标尺寸解码、区间流、驱动器枚举、文件对话框、资源管理器定位都由对应 Host 插件承担，界面只消费 URL 与结果。（[ADR-0006](docs/adr/0006-windows-system-capabilities-live-in-host-plugins.md)）

### 移除

- 外壳的三栏渲染代码、`react-resizable-panels` 依赖、顶部与标题条上的两个面板开关、`footer` 与 `StatusSlot`、`hideStatusBar`、底栏的「按 Esc 返回 DSH」提示行。

---

## 0.3.0 之前已存在、本轮未改动（版本仍是 `0.2.0-alpha.0`）

- **`@folio/base-contract`**：契约库，声明 `folioStorage` / `folioRuntime` / `folioUi` / `folioShell` / `folioFrame` / `folioInteractions` 六个 Cordis 服务、RPC hooks、动作与清单 schema。
- **`@folio/base-storage-host`**（`ctx.folioStorage`）：按插件隔离的 `plugins/<id>/{data,cache}`、带 Zod 校验的 JSON Store、`dsh-ctx-fs` 与本地原子写两条落盘缝。
- **`@folio/base-runtime-host`**（`ctx.folioRuntime`）：`/lf/*` RPC 与 SSE 网关、动作注册表（read / modify / delete 分级）、插件清单服务与 `createDefaultPluginManifest()`。
- **`@folio/base-settings-ui`**：DSH 设置里的「我的插件」分页。
- **`@folio/test-overview-host`**：独立 Host 插件的最小样板（私有存储 + 动作注册）。

这一轮改动了它们之外的包，因此版本号差异反映的是「这次没碰」，不是「需要先升级才能协同」。

---

## 基座能力（与 `0.2.0-alpha.0` 同时存在，随本轮一起演进到 `0.3.0-alpha.0`）

- `@folio/base-ui-kit`（`ctx.folioUi`）：Radix UI + `lucide-react` + `.lf-*` 样式、受管 Portal 与 Toast、`dsh.client.external` 单实例共享。
- `@folio/base-shell-ui`（`ctx.folioShell`）：工作台外壳、工作区栏、悬浮面板、标题栏动作注册点。
- `@folio/base-frame-ui`（`ctx.folioFrame`）：四区布局框架，自身不画界面、不注册工作区。
- 六个 `test-*` 验证界面与 `@folio/test-suite`。
- 构建链：`scripts/build.mjs`（扫描全部 `plugins/*` 独立构建 host / client 双产物）、`sync-ui-kit.mjs`、`add-ui.mjs`、`check-artifacts.mjs`、`lfdev.ps1`、`shot.mjs`。
- 治理约定：`GLOSSARY.md` 术语表、`docs/adr/` 决策记录、`docs/agents/` 协作约定。

---

## 版本对照（当前）

| 包 | 版本 |
|---|---|
| `localfolio-monorepo`（根） | `0.3.0-alpha.0` |
| `@folio/base-storage-host`、`base-runtime-host`、`base-settings-ui`、`test-overview-host` | `0.2.0-alpha.0` |
| 其余全部（`base-ui-kit`、`base-shell-ui`、`base-frame-ui`、`bridge-*`、`workspace-*`、`test-*-ui`、两个套件） | `0.3.0-alpha.0` |
