# CHANGELOG

LocalFolio 的能力演进记录。可安装的归档与发布说明见 [GitHub Releases](https://github.com/sinnyun/LocalFolio/releases)。

最新在前。

---

## 0.3.0-alpha.10

- 修复本地构建后热重载时，文件浏览器 / 画板 / 物料工作区左侧面板显示「区域渲染异常」并报 `useSidebar must be used within a SidebarProvider.` 的问题：`@folio/base-ui-kit` 的侧栏 Context、受管 Portal 容器与 Toast 队列改为**页面级单例**（`Symbol.for` 全局符号注册表，见 `page-singleton.ts`），不再随单个插件行被热替换而分叉；`SidebarMenuButton` 的 tooltip 自带 Radix Provider，不再依赖框架那一行的实例；构建脚本对内容未变的产物不再重写，避免一次 `pnpm run build` 因 mtime 变化把每个插件行都热重载一遍。新增回归测试 `plugins/base-ui-kit/src/__tests__/hmr-identity.test.tsx`。
- 项目库（`@folio/workspace-projects-ui`）新增**项目卡片总览**：默认先以虚拟化卡片网格展示全部库的项目，点击卡片进入项目文件视图并可随时返回；左侧栏在总览时切换为库列表（全部项目 / 单库范围、添加、重新扫描、移除），进入项目后切换为该库的项目列表。总览与项目列表共用搜索、标签/变更筛选、排序、卡片缩放、多选批量管理以及既有 AI / 归档 / 缩略图扩展入口。
- 将根包与工作台套件版本同步到 `0.3.0-alpha.10`，确保发布 tag 与归档版本一致。

## 0.3.0-alpha.8

- 将根包与工作台套件版本同步到 `0.3.0-alpha.8`，确保发布 tag 与归档版本一致。

## 0.3.0-alpha.6

- 修复 `zpaqfranz backup -chunk` 生成的编号配套文件（`<stem>_00000000_backup.index` 与 `<stem>_00000000_backup.txt`）被扫描器误判为增量新增文件的问题。
- 修复分卷归档读操作路径解析：校验（`t`）、单文件提取（`x`）、整包顺序还原/抢救（`xx` / `x -recover`）与虚拟盘挂载（`mount`）统一自动解析为 `<stem>_????????.zpaq` 通配分卷目标，兼容既有分卷包（即使 `_00000000_backup.index` 缺失也可正常提取与还原）。

## 0.3.0-alpha.5

- 升级项目库归档插件（`@folio/feature-archive-host` + `@folio/feature-archive-ui`）与扫描器（`@folio/workspace-projects-host`）：新归档全面切换为 `zpaqfranz backup -chunk` 固定大小分卷模式（默认 `8GB`/卷，可在设置中调整，保留跨卷去重与 `.tmp` 中断安全，同时向后兼容既有单文件 `.zpaq`）。
- 归档引擎支持可选 Zstd 压缩等级（默认平衡 / `-m9` / `-m7`）、机械硬盘顺序写入解压（`xx`）以及损坏归档抢救还原（`x -recover`）。
- 一键下载优先托管内置 WinFsp 支持的 `zpaqfranz-full.exe`，并新增只读虚拟盘挂载（`mount` / `mount -all`）与自动卸载生命周期管理。

## 0.3.0-alpha.4

- 升级 `@folio/base-thumbs-host` 缩略图引擎至 v3 架构（方案 B 极致轻量主包）：引入 L0 持久化状态机（优先内置 `node:sqlite` + JSON Store 自动降级与中央 LRU 缓存）、杂项黑名单、三队列并发隔离（`thumbs-fast` / `thumbs-heavy` / `thumbs-eagle`）、L1a/L1b 去白名单化 Try-First 试探与 `>200MB` 重型 PSD/PSB/TIF 避让，以及 L2 ImageMagick 7（内置 `sRGB.icc` + `[0]` 抽层）与 FFmpeg 专项降级。
- 文件浏览器（`@folio/workspace-files-host`）缩略图路由收口至 `ctx.folioThumbs` + `ctx.folioNative`，消除重复进程池；项目库（`@folio/workspace-projects-host`）移除静态后缀白名单，自动通吃 `.cdr`、`.blend`、`.max` 等本机已装软件格式。
- 新增 `@folio/feature-thumbs-eagle-host` 与 `@folio/feature-thumbs-eagle-ui`：提供 `manualOnly: true` 硬隔离的 L3 Eagle 本地 API 手动兜底通道（500ms 探活、专用缓存库切换与自动切回、空间熔断），以及项目库「无缩略图」按后缀分组筛选视图、大文件拷贝二次确认与 `FAILED_EAGLE` 手动重试。

## 0.3.0-alpha.3

- 修复 DSH 在默认 `workspace-write` 沙箱模式下启用工作台时，`base-storage-host` 经由 `ctx.fs` 写入 `%LOCALAPPDATA%\LocalFolio\...` 被拒绝（`file access denied under workspace-write mode`）的问题：插件自有存储统一使用本机原子写（`local-node-fs`），不再受会话 Agent 沙箱策略限制。

## 0.3.0-alpha.2

- GitHub Actions 随版本标签构建、校验并发布 `localfolio-workbench.tgz`。已验证 Windows DSH `0.2.2-rc.5` 能从 GitHub 附件地址安装并启动工作台。[发布记录](https://github.com/sinnyun/LocalFolio/releases/tag/v0.3.0-alpha.2)
- 修复干净克隆缺失的 UI Kit 源文件，以及 Tailwind 构建对 `cmd.exe` 的依赖。
- 修复启用工作台时，存储适配层向 DSH 文件接口传递路径字符串导致的桌面 Host 崩溃。
- 修复 Ubuntu 上解析 Windows Eagle `.info` 路径的兼容性问题。

## 0.3.0-alpha.0

### 新增

- **文件浏览器工作区** `@folio/workspace-files-host` + `@folio/workspace-files-ui`（首个正式产品工作区，形态 A）：快捷文件夹与驱动器容量、懒加载文件树、双栏浏览与可编辑面包屑、Windows 系统缩略图、音视频区间流播放、文本/代码预览、文件检查器。
- **画板工作区** `@folio/workspace-canvas-host` + `@folio/workspace-canvas-ui`（形态 A）：tldraw 无限画布；图片只存本地文件链接；分层 LOD 代理渲染（256/512/1024/2048）；浏览器拖入自动导入托管；断链检测与批量重定位；并向功能插件开放 `ctx.folioCanvas` 链接扩展服务。（[ADR-0005](docs/adr/0005-canvas-stores-file-links-with-layered-lod-proxies.md)）
- **画板 Eagle 链接功能插件** `@folio/feature-canvas-eagle-host` + `@folio/feature-canvas-eagle-ui`：从 Eagle 拖入 `.info` 原图或 `eagle://item/{id}` 深链接时经本地 Eagle Web API 解析原图与来源元数据（条目 ID、名称、所属文件夹、原图路径/URI、缩略图路径、API 地址）并持久化到画板资产，在「图片链接管理」面板展示 Eagle 详情并支持一键在 Eagle 中打开定位。
- **物料工作区** `@folio/workspace-materials-host` + `@folio/workspace-materials-ui`（形态 A）：关联 A3 横版 `.vectorcraft` 文件；页面多选导出单图/多页 PDF；幻灯片式拖拽排序；物料信息头与 VectorCraft 前台双向同步；默认/项目两套物料数据表。（[ADR-0007](docs/adr/0007-vectorcraft-files-stay-the-single-source-of-truth.md)）
- **基础后台任务能力** `@folio/base-tasks-host`（`ctx.folioTasks`）：提供有界并发队列、`node:worker_threads` 执行封装、可暂停/恢复/取消的任务状态机，以及 200ms 节流 SSE `topic` 事件推送。
- **基础桌面原生能力** `@folio/base-native-host`（`ctx.folioNative`）：提供共享 Windows Shell/WIC 缩略图与图像下采样 Worker 池、原生文件/目录选择框、资源管理器定位、默认程序打开与隐藏属性设置。
- **项目库工作区** `@folio/workspace-projects-host` + `@folio/workspace-projects-ui`（形态 A）：Worker 线程非阻塞目录遍历、`.folio-meta/` 就地元数据与按需双尺寸（120/360px）磁盘缩略图缓存、轻量 `size+mtimeMs` 变更检测与增量同步、全局轻量索引首屏秒开、虚拟滚动项目列表与可折叠文件夹分组虚拟卡片网格，并已接入 DSH `ctx.llm` / `ctx.agentDefaultModel` 轻量采样提取、独立 `projects-ai` 后台批量队列、多选批量标签/同步与项目/文件双右键菜单。
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
| `localfolio-monorepo`（根）、`@folio/workbench-suite` | `0.3.0-alpha.10` |
| `@folio/base-storage-host`、`base-runtime-host`、`base-settings-ui`、`test-overview-host` | `0.2.0-alpha.0` |
| 其余包（含 `@folio/test-suite`） | `0.3.0-alpha.0` |
