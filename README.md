最新构建包地址：`https://github.com/sinnyun/LocalFolio/releases/download/v0.3.0-alpha.4/localfolio-workbench.tgz`

# LocalFolio

**基于 DeepSeek Harness (DSH) 原生体系持续增量演进的个人工作台。**

[安装与升级](#daily-use) · [本地开发](#local-development) · [打包与发布](#release-workflow)

> **核心理念**：LocalFolio 不是「盖在 DSH 外面、通过 Shadow DOM 隔离重构的独立软件」，而是**在 DSH 现有能力基础上不断追加新功能的增量插件集合**。
> 凡是 DSH 已提供的能力（主题令牌、槽位、快捷键、底层文件能力、设置框架、单实例平台库），一律直接复用；只有 DSH 尚未提供或不满足工作台场景的能力，才拆成细粒度的标准 DSH 插件按需叠加，最后由工作台套件合装成一个整体。DSH 官方规范要求插件不加载其 Client 组件包（导出随时会变、抛错会空白整个槽位），因此基础控件与图标由独立插件 `@folio/base-ui-kit`（基于 Radix UI + `lucide-react` + `.lf-*` 样式）按 `--dsw-*` 令牌实现，并通过 `dsh.client.external` 单实例共享给所有 UI 插件。

## 文档索引

| 文档 | 内容 |
|---|---|
| [`GLOSSARY.md`](GLOSSARY.md) | 术语表，本书所有专有名词以它为准 |
| [`docs/local-development.md`](docs/local-development.md) | 本地构建、链接挂载与启动报错对照（改完代码跑不起来先看这里） |
| [`docs/adr/`](docs/adr/) | 架构决策记录：为什么这样切分外壳、框架、工作区 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本演进与能力新增记录 |
| [`docs/agents/`](docs/agents/) | 协作约定：issue 追踪、triage 标签、领域文档消费方式 |
| 各插件 `docs/DETAIL.md` | 单个插件的服务接口、接入方式与限制（由插件页「详情」直达） |

---

## 一、三层结构

| 层 | 是什么 | 例子 |
|---|---|---|
| **工作台** | 整个 LocalFolio 软件包：覆盖在 DSH 原生界面之上、可随时退回的全屏工作面板 | 工作台套件装好后的那个界面 |
| **工作区** | 工作台顶部工作区栏里的一项完整功能，由若干功能插件拼成 | 文件浏览器、画板、物料 |
| **功能插件** | 只在一个工作区内部贡献一块功能，不单独出现在工作区栏 | 图层管理、markdown 编辑 |

三者之外是**工作台通用基础能力**：存储、运行时、UI 组件库、外壳、布局框架、设置页。它们不属于任何工作区，所有工作区共用。

## 二、设计原则（一切基于 DSH）

1. **零隔离墙、原生融合**：不套 Shadow DOM，所有 UI 插件直接运行在 DSH 主文档中，使用 `--dsw-alias-*` / `--dsw-font-family` 等宿主主题令牌，并复用平台表内置的单实例 `react`、`zod`、`@tanstack/react-virtual`（全部走 `external`，0 字节重复打包）。按钮、标签、表单、弹层、图标等基础控件由 `@folio/base-ui-kit`（Radix UI + `lucide-react` + `.lf-*` 样式）统一提供，工作台插件通过 `dsh.client.external` 零重复打包复用，**不 require `@deepseek-ai/dsh-client-ui-*`**。
2. **插件间零直接 `import`**：每个功能都是独立 DSH 插件，通过 DSH 原生 **Cordis Service（`ctx.provide` 注册 / `inject` 依赖）** 与 **Slot 树（`ctx.slots`）** 松耦合协作，支持单插件独立启停与局部热重载（HMR）。跨插件共享界面时通过服务暴露组件（例如 `ctx.folioFrame.WorkspaceHost`），不跨包 import。
3. **双形态承载新面板**：
   - **全屏可退回工作台**：挂在 DSH `shell.overlay`（`order: 1`），结构只有两层——一条顶部条加它下面一整块内容区。Windows 桌面版（`html[data-windows-titlebar]`）不画这条顶部条，而是把控件搬进 DSH 标题栏、「应用 / 编辑」之后（一个按钮在「工作台 ⇄ 返回 DSH」之间切换，工作区切换同排，外壳自身无品牌标识）；Web 与 macOS 桌面保持外壳内顶部条（标识 + 返回 DSH + 工作区切换）。两侧面板开关由 `ctx.folioShell.registerCaptionAction` 注册、由布局框架提供，外壳只提供位置与样式。内容区完全归工作区，外壳不画底栏。按 `Esc` 同样无损回到原生 DSH 界面；
   - **自由悬浮面板**：挂在 DSH `shell.overlay`（`order: 2`），任何插件只需调用 `ctx.folioShell.registerFloatingPanel(...)` 即可获得**自由拖拽、八向缩放、一键最大化/还原、多窗置顶与位置记忆**，可悬浮在工作台或原生 DSH 之上。
4. **每插件独立存储**：所有插件持久化数据统一落盘在 `%LOCALAPPDATA%\LocalFolio\plugins\<pluginId>\{data,cache}\`（底层优先经由 DSH `ctx.fs` 落盘缝），严禁写入 DSH 自身的 `~/.dsh/storages/workspace.json` 或会话目录。
5. **统一布局框架**：需要四区的工作区把 `ctx.folioFrame.WorkspaceHost` 当作自己的 `MainView`，框架在挂载时自行认领宿主；工作区内部的功能插件向框架登记应用，只声明「左侧面板 / 中间内容 / 右侧面板 / 底部信息栏」显示什么。宽度调节、折叠、分隔条交互、布局持久化、应用切换、逐区错误隔离全部由框架统一托管。页面自带骨架的工作区（画板画布、后台界面）直接渲染自己的全屏内容——**框架缺席是合法形态**，外壳不会因此多画任何东西。
6. **宿主集成走桥接层**：DSH 原生的右键菜单、文件拖拽、文件下载/另存为不直接在工作区里调用，统一经 `@folio/bridge-dsh-interactions-ui` 暴露的 `ctx.folioInteractions` 消费；该服务在纯浏览器环境自动降级为工作台内置菜单与浏览器下载，因此工作区代码里没有「桌面端特有分支」。

---

## 三、DSH 原生复用 vs LocalFolio 增量能力

| 能力域 | DSH 原生提供（直接消费，不重造） | LocalFolio 增量插件（仅补差额） |
|---|---|---|
| **UI 组件与主题** | `--dsw-alias-*` 主题令牌、布局节奏、Slot/设置框架（`dsh-client-ui-theme`、`dsh-client-ui-settings*`） | `@folio/base-ui-kit`（`ctx.folioUi`）：运行期单实例共享的 Radix UI 控件、`lucide-react` 图标、`.lf-*` 样式、`shell.overlay` Portal/Toast 宿主 |
| **公共运行时库** | 平台表内置单实例：`react`、`zod`、`@tanstack/react-virtual`；Host 侧 `@deepseek-ai/cordis` | 构建期统一 `external`，零重复打包 |
| **槽位 / 菜单 / 快捷键 / 设置** | 通过 `ctx` 使用宿主扩展点：`ctx.slots`、`ctx.shortcuts`、`settings.section`（不 import 其组件包） | `@folio/base-shell-ui`（工作台外壳与悬浮面板宿主）、`@folio/base-frame-ui`（左/中/右/底四区布局框架）、`@folio/base-settings-ui`（设置页「我的插件」分页） |
| **文件系统与存储** | `ctx.fs` 与 `dsh-api-workspace-files` 的底层文件能力（目录列表、只读预览、搜索、变更流）；只复用底层操作，**不接入 DSH 工作区模型**（见 [ADR-0001](docs/adr/0001-reuse-dsh-file-capabilities-without-dsh-workspace-model.md)） | `@folio/base-storage-host`（每插件隔离目录 + Zod 校验 JSON Store）、`@folio/base-runtime-host`（`/lf/*` RPC + SSE 网关） |
| **桌面端原生交互** | Electron 侧 `contextMenus`、`fileDrag`、`fileActions` 服务 | `@folio/bridge-dsh-interactions-ui`（`ctx.folioInteractions`）：右键菜单、原生文件拖出、下载/另存为，均带浏览器降级 |
| **业务新能力** | — | `@folio/workspace-files-ui`（本地文件浏览器 + Windows 系统缩略图）、`@folio/workspace-canvas-ui`（tldraw 画板 + 分层 LOD 代理）、`@folio/workspace-materials-ui`（VectorCraft 物料排版） |

### 现有工作区

| 工作区 | 形态 | 能力概述 |
|---|---|---|
| **文件浏览器** | 形态 A（四区） | 快捷文件夹、驱动器容量、懒加载文件树、双栏浏览与可编辑面包屑、Windows 系统缩略图、音视频与文本预览、文件检查器（[DETAIL](plugins/workspace-files-ui/docs/DETAIL.md)） |
| **画板** | 形态 A（四区） | tldraw 无限画布；图片只存本地文件链接，分层 LOD 代理渲染（256/512/1024/2048），浏览器拖入图片自动导入托管目录，断链检测与批量重定位（[DETAIL](plugins/workspace-canvas-ui/docs/DETAIL.md)） |
| **物料** | 形态 A（四区） | 关联 A3 横版 `.vectorcraft` 文件；页面多选导出单图/多页 PDF；幻灯片式拖拽排序；物料信息头与 VectorCraft 前台双向同步；默认/项目两套物料数据表（[DETAIL](plugins/workspace-materials-ui/docs/DETAIL.md)） |
| **项目库** | 形态 A（四区） | 多归档根目录管理、Worker 线程非阻塞扫描、`.folio-meta` 就地元数据与按需双尺寸缩略图缓存、`size+mtimeMs` 增量变更检测、DSH `ctx.llm` 目录采样与 AI 标签/摘要提取、多选批量管理、项目卡片总览（全部库/单库切换）→ 项目文件分组卡片网格的两级浏览与左侧栏随层级切换（[DETAIL](plugins/workspace-projects-ui/docs/DETAIL.md)） |
| **任务监控** | 形态 A（中心视图）与跨工作区浮窗 | 按工作区、项目与状态查看当前运行实例的后台任务、子项进度和失败详情。标题栏入口使用可拖动、可缩放悬浮面板。 |

### 内部扩展

内嵌在宿主插件里、随宿主一起启停、不可独立安装的第三方能力，在插件清单里单独登记：

| 扩展 | 宿主插件 | 用途 |
|---|---|---|
| `tldraw` | `@folio/workspace-canvas-ui` | 无限画布引擎（`@tldraw/assets` 由 Host 本地托管，无 CDN 请求） |

---

## 四、命名与 Monorepo 目录结构

包名采用 **`@folio/<角色>-<功能>-<形态>`**：

- `base-*`：工作台通用基础能力（`base-storage-host`、`base-runtime-host`、`base-ui-kit`、`base-shell-ui`、`base-frame-ui`、`base-settings-ui`）
- `workspace-*`：工作区（顶部工作区栏的一项完整功能）
- `feature-*`：功能插件（只在一个工作区内部贡献功能）
- `test-*`：测试界面（只为验证界面与集成方式存在，最终删除或并入工作区；**只进 `test-suite`，不进产品套件**）
- `bridge-*`：桥接插件（把某项基础能力接进外壳、工具链或测试场景）
- `workbench-suite`：产品安装入口（基础能力 + 桥接 + 正式工作区，不含 test-*）
- `test-suite`：测试界面套件（只装 test-*，需要先装 workbench-suite）
- `base-contract`：纯编译期共享契约（不是插件）

形态后缀按需使用：`-host`（Host 侧能力）、`-ui`（Client 界面）、`-kit`（组件库）。

```text
LocalFolio/
├── bundles/
│   ├── workbench-suite/            @folio/workbench-suite    产品安装入口：6 基础能力 + 2 桥接 + 3 工作区（不含 test-*）
│   └── test-suite/                 @folio/test-suite         测试界面套件：六个 test-* 验证界面，按需另装
├── plugins/                        独立 DSH 插件目录（每包独立构建 lib/index.js & lib/client.js）
│   │  ── 基础能力 ──
│   ├── base-storage-host/          @folio/base-storage-host   基础存储：ctx.folioStorage（按插件隔离目录 + JSON Store）
│   ├── base-runtime-host/          @folio/base-runtime-host   基础运行时：ctx.folioRuntime（/lf/* RPC + SSE、动作表、清单）
│   ├── base-tasks-host/            @folio/base-tasks-host     基础后台任务：ctx.folioTasks（有界并发队列、Worker 线程、SSE 进度）
│   ├── base-native-host/           @folio/base-native-host    基础桌面能力：ctx.folioNative（共享 Shell/WIC 缩略图池、原生弹窗/打开）
│   ├── base-fs-host/               @folio/base-fs-host        基础文件系统：ctx.folioFs（路径规范化、分类、驱动器/目录枚举、Range 媒体流、缓存清理、原子写）
│   ├── base-eagle-host/            @folio/base-eagle-host     基础 Eagle 集成：ctx.folioEagle（本地 Web API 客户端、缩略图查询、eagle:// 深链接）
│   ├── base-ui-kit/                @folio/base-ui-kit         基础 UI 组件库：ctx.folioUi、Radix/lucide、.lf-* 样式、Portal/Toast
│   ├── base-collection-ui/         @folio/base-collection-ui  基础集合视图：虚拟列表、吸顶分组卡片网格、灯箱状态机、本地文件选择弹窗
│   ├── base-tasks-ui/              @folio/base-tasks-ui       基础后台任务 UI：多 scope SSE 进度订阅与通用状态栏进度条
│   ├── base-metadata-ui/           @folio/base-metadata-ui    基础元数据编辑 UI：剪贴板复制、星级评分、标签芯片、自动保存备注
│   ├── base-shell-ui/              @folio/base-shell-ui       基础外壳：ctx.folioShell（两层工作台 + 工作区栏 + 悬浮面板）
│   ├── base-frame-ui/              @folio/base-frame-ui       基础布局框架：ctx.folioFrame（四区布局，自身不画界面）
│   ├── base-settings-ui/           @folio/base-settings-ui    基础设置页：DSH 设置「我的插件」
│   │  ── 桥接 ──
│   ├── bridge-dsh-interactions-ui/ @folio/bridge-dsh-interactions-ui  DSH 交互桥接：ctx.folioInteractions（右键菜单/拖拽/下载）
│   ├── bridge-frame-test-ui/       @folio/bridge-frame-test-ui       测试框架工作区（把布局框架挂进工作区栏）
│   │  ── 工作区 ──
│   ├── workspace-files-host/       @folio/workspace-files-host        文件浏览器后端
│   ├── workspace-files-ui/         @folio/workspace-files-ui          文件浏览器工作区
│   ├── workspace-canvas-host/      @folio/workspace-canvas-host       画板后端（LOD 代理、图片导入、tldraw 资源）
│   ├── workspace-canvas-ui/        @folio/workspace-canvas-ui         画板工作区（内置 tldraw）
│   ├── workspace-materials-host/   @folio/workspace-materials-host    物料后端（VectorCraft 桥接、导出、文件监听）
│   ├── workspace-materials-ui/     @folio/workspace-materials-ui      物料工作区
│   ├── workspace-projects-host/    @folio/workspace-projects-host     项目库后端（Worker 扫描、.folio-meta、按需缩略图、变更检测）
│   ├── workspace-projects-ui/      @folio/workspace-projects-ui       项目库工作区（项目卡片总览 + 项目内虚拟化文件网格）
│   │  ── 测试界面（只进 test-suite）──
│   ├── test-overview-host/         @folio/test-overview-host  测试概览后端                      ┐
│   ├── test-overview-ui/           @folio/test-overview-ui    测试概览 UI（形态 A + 悬浮面板）  │
│   ├── test-gallery-ui/            @folio/test-gallery-ui     测试图片画廊 UI（形态 B）         ├ 只在 test-suite
│   ├── test-sidebar-ui/            @folio/test-sidebar-ui     测试侧栏示例 UI（形态 B）         │
│   ├── test-shadcn-admin-ui/       @folio/test-shadcn-admin-ui 测试 Shadcn Admin UI（形态 B）   │
│   └── test-studio-admin-ui/       @folio/test-studio-admin-ui 测试 Studio Admin UI（形态 B）   ┘
├── libs/
│   └── base-contract/              @folio/base-contract       协议类型、Cordis 服务声明与 RPC Hooks
└── scripts/
    ├── build.mjs                   自动扫描构建全部 plugins/*（--watch 模式下界面变更自动联动刷新 base-ui-kit 共享样式）
    ├── sync-ui-kit.mjs             自动同步 base-ui-kit 导出表、清理 shadcn 全局 CSS 与 cn 裸导入
    ├── add-ui.mjs                  一键向 base-ui-kit 安装 shadcn 通用原语并自动 sync（pnpm run ui:add）
    ├── check-artifacts.mjs         对所有构建产物执行 node --check
    ├── lfdev.ps1                   隔离 profile（lfdev，端口 3081）安装/重启/校验脚本
    └── shot.mjs                    零依赖 CDP 截图脚本
```

---

## 五、使用指南

<a id="daily-use"></a>

### 1. 安装、使用与升级

已在 Windows 上用 DSH `0.2.2-rc.5` 验证。打开 DSH 的「插件 → 添加插件」，把 [GitHub Releases](https://github.com/sinnyun/LocalFolio/releases) 中所选版本的 `localfolio-workbench.tgz` 下载地址粘贴到「包名或地址」。已验证的预发布版本：

```text
https://github.com/sinnyun/LocalFolio/releases/download/v0.3.0-alpha.4/localfolio-workbench.tgz
```

安装后，在插件页启用 `@folio/workbench-suite`，按 DSH 提示重启。点「工作台」进入，顶部可切换文件浏览器、画板、物料和项目库。点「返回 DSH」或按 `Esc` 回到 DSH。

升级时，从 Releases 复制新版本的 `.tgz` 地址，在同一入口安装。若 DSH 提示已安装，先在插件页卸载 `@folio/workbench-suite`，再安装新地址。需要回退时，同样可以安装旧版本的地址。网络下载失败时，也可从 Releases 下载 `.tgz`，在「包名或地址」中填入文件的绝对路径。工作台的本地数据位置见[运行时数据目录](#runtime-data)。

<a id="local-development"></a>

### 2. Windows 本地开发

使用 PowerShell 7，构建环境与 CI 对齐为 Node.js 24 和 pnpm 10.28.0。在仓库根目录执行：

```powershell
pnpm install --offline --frozen-lockfile --trust-lockfile
pnpm run verify
```

本机 `pnpm install` 会在供应链校验那一步逐个回源 `registry.npmmirror.com` 而长时间卡住，`--trust-lockfile`
跳过该校验、`--offline` 只用本地 store。构建或启动报错时先查
[`docs/local-development.md`](docs/local-development.md)：那里按症状列了 TS2307 成片缺模块、
`pnpm install` 卡死、工作台入口不出现等常见故障的成因与修复命令。

`verify` 依次运行类型检查、构建、产物语法检查和单元测试。日常调试用独立的 `lfdev` profile。把下面的 `$dshRoot` 换成自己的 DSH 安装目录，确保端口 `3081` 可用，也可给每条命令统一传 `-Port <空闲端口>`。

```powershell
$dshRoot = 'D:\DSH'
$env:DSH_EXE = Join-Path $dshRoot 'DeepSeek Harness.exe'
$env:DSH_BIN = Join-Path $dshRoot 'resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js'

pwsh -File scripts/lfdev.ps1 install
pwsh -File scripts/lfdev.ps1 restart
pwsh -File scripts/lfdev.ps1 url
pwsh -File scripts/lfdev.ps1 verify
```

`install` 用 `link:` 安装产品和测试两个套件。打开 `url` 打印的本地地址，再另开终端运行 `pnpm run build:watch`。Client 改动会重新构建，在 DSH 启用 HMR 时可热加载。Host、套件清单或补丁改动后，用 `restart` 重启开发实例。调试结束运行 `pwsh -File scripts/lfdev.ps1 stop`。新增工作区或子插件时，按下方[新增工作区](#add-workspace)的清单更新套件。

<a id="release-workflow"></a>

### 3. 本地打包与 GitHub 发布

本地验证发布包时，在仓库根目录运行：

```powershell
pnpm run verify
pnpm run pack:workbench
```

打包使用系统的 `tar`。生成的 `dist/localfolio-workbench.tgz` 可直接在 DSH 中按绝对路径试装。它包含产品工作台、子插件、Worker 和画板静态资源。`@folio/test-suite` 通过开发链接单独安装。归档随附 [tldraw 5.6.2 许可证](bundles/workbench-suite/docs/licenses/tldraw-5.6.2.md)。面向最终用户部署画板前，请确认你的 tldraw 授权覆盖该场景。

准备发布时，先把根 `package.json` 和 `bundles/workbench-suite/package.json` 的 `version` 改成同一个新版本，完成校验并提交。先推送提交，再推送与套件版本对应的 `v<版本>` 标签：

```powershell
git push origin main
$tag = 'v' + (node -p 'require("./bundles/workbench-suite/package.json").version')
git tag $tag HEAD
git push origin "refs/tags/$tag"
```

[发布工作流](.github/workflows/release-workbench.yml) 由标签推送触发。它在 Ubuntu 上按锁文件安装依赖、构建并测试、在临时 DSH profile 试装，成功后把 `localfolio-workbench.tgz` 上传到该标签的 Release。到 [Actions](https://github.com/sinnyun/LocalFolio/actions) 确认结果，再从 Release 复制附件地址，放进一个干净的 DSH profile 验证安装和启动。每次发布使用新的版本号和标签。

<a id="add-workspace"></a>

### 4. 如何新增一个工作区

以「笔记工作区」为例（Host 能力 + 工作区界面）：

1. **建 Host 子插件** `plugins/feature-notes-host/`：
   - 声明 `export const inject = ['folioRuntime', 'folioStorage'] as const`；
   - 通过 `ctx.folioStorage.forPlugin('feature-notes-host')` 获取自己的 `%LOCALAPPDATA%\LocalFolio\plugins\feature-notes-host\` 目录；
   - 通过 `ctx.folioRuntime.registerAction(defineAction(...))` 注册笔记读写动作，所有注册包在 `ctx.effect` 返回清理函数。
2. **建工作区界面插件** `plugins/workspace-notes-ui/`：
   - 声明 `dsh.client.inject: ['@folio/base-ui-kit', '@folio/base-shell-ui', '@folio/base-frame-ui']`、`dsh.client.external: ['@folio/base-ui-kit']` 与 `export const inject = ['folioFrame', 'folioShell'] as const`；
   - 需要 DSH 原生右键菜单/文件拖拽时再加 `'@folio/bridge-dsh-interactions-ui'`，并 `inject: ['folioInteractions']`（该服务在账户表里是可选的，缺失时它会自行降级）；
   - 向 `ctx.folioShell.registerWorkspace(...)` 注册工作区，`MainView` 直接写 `ctx.folioFrame.WorkspaceHost`（认领宿主由它在挂载时自己完成；外壳不画底栏，也没有 `hideStatusBar` 要设）；
   - 工作区内的各个「功能插件」只 `inject: ['folioFrame']`，用 `registerApp` 声明四区内容，彼此不 import；
   - 直接从 `@folio/base-ui-kit/client` 引入通用 shadcn/Radix 控件与图标，并可直接使用 Tailwind 工具类（由 `@folio/base-ui-kit` 的 `@source "../../";` 统一编译进单份无 Preflight 样式表，`build:watch` 自动联动刷新）；
   - 专属图标可直接 `import { ... } from 'lucide-react'`（esbuild 按图标 tree-shake，约 300B/个）；
   - 如需给基础能力补充通用 shadcn 原语：直接运行 `pnpm run ui:add <组件名或URL>`。
3. **补齐显示与安装元信息**：参考同类插件的 `package.json`，声明 `engines.dsh`、构建后的 Host 和 Client 入口、图标和语言文件的导出。`files` 列出要随归档发布的 `lib`、`locale`、`icon.svg` 和实际存在的文档目录。写好 `locale/zh.json` 和 `locale/en.json` 的 `meta.title` 与 `meta.description`。
4. **加入套件**：产品工作区加进 `bundles/workbench-suite/{package.json,cordis.patch.yml}`；验证用的临时界面加进 `bundles/test-suite` 的同名两处，不要进产品套件。
5. **登记到插件清单**：在 `plugins/base-runtime-host/src/host.ts` 的 `createDefaultPluginManifest()` 里补一条 `category: 'workspace'` 的记录（内嵌第三方引擎另登记到 `internalExtensions`），否则设置页「我的插件」里看不到它。
6. **同步验证名单**：`scripts/lfdev.ps1` 的 `$ExpectedClientPlugins` 加上新的 client 插件包名，`lfdev.ps1 verify` 才会校验它确实进入 boot payload。
7. 新增 workspace 包或改动依赖后，运行 `pnpm install` 并提交更新后的 `pnpm-lock.yaml`。运行 `pnpm run verify`，再重启开发实例验证加载。

### 4.1 工作区内部的功能插件：只声明四个区域

```tsx
export const inject = ['folioFrame'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () =>
      ctx.folioFrame.registerApp({
        id: 'notes.editor',
        title: '笔记',
        Main: NotesMain,        // 中间内容（必填）
        Left: NotesSidebar,     // 左侧面板
        Right: NotesInspector,  // 右侧面板（可折叠、可拖拽调宽）
        Status: NotesStatus,    // 底部信息栏左侧
      }),
    'notes: register frame app',
  )
}
```

框架自动提供：左栏宽度拖拽与 `Ctrl+B` 图标轨折叠、右栏折叠/调宽与 `Ctrl+Alt+R`、分隔条键盘微调与双击复位、每应用布局持久化（`localStorage['folio.frame.v1']`）、四区共享 `Provider`、逐区 Suspense/错误隔离、应用切换器与统一底部信息栏。契约见 [`plugins/base-frame-ui/docs/DETAIL.md`](plugins/base-frame-ui/docs/DETAIL.md)。

### 4.2 需要 DSH 原生桌面能力时

```tsx
export const inject = ['folioInteractions'] as const

// 1) 结果式反馈：桌面端走 DSH 原生通知，浏览器端退化成 toast（失败为 danger 色）
ctx.folioInteractions.notify('已复制 3 个文件', true)

// 2) 右键菜单：返回值只描述「有哪些项」，交互由桥接层统一渲染
ctx.effect(
  () => ctx.folioInteractions.registerContextMenu({
    id: 'files.context',
    target: 'files.entry',
    order: 10,
    resolve: entry => [
      { id: 'open', label: '打开', run: () => open(entry.path) },
      { id: 'reveal', label: '在资源管理器中显示', run: () => reveal(entry.path) },
    ],
  }),
  'files: context menu',
)

// 3) 把文件拖出到系统（桌面端原生拖拽接管时 start() 返回 false）
const session = ctx.folioInteractions.createFileDragSession({ kind: 'url', url, name })
```

没有 DSH 原生服务时 `hasNativeContextMenu()` / `hasNativeFileDrag()` / `canSaveAs()` 返回 `false`，桥接层自动退到工作台内置菜单与浏览器下载，工作区代码不需要分支。契约见 [`plugins/bridge-dsh-interactions-ui/docs/DETAIL.md`](plugins/bridge-dsh-interactions-ui/docs/DETAIL.md)。

---

<a id="runtime-data"></a>

## 六、运行时数据目录

默认路径：`%LOCALAPPDATA%\LocalFolio\`（可通过环境变量 `LOCALFOLIO_DATA_DIR` 覆盖，非 Windows 下为 `$XDG_DATA_HOME/LocalFolio`）：

```text
%LOCALAPPDATA%\LocalFolio\
├── shared\
│   └── plugins-manifest.json          # 插件清单 v2（工作台插件 + 内嵌扩展）
└── plugins\
    ├── base-runtime-host\{data,cache}\
    ├── workspace-files-host\
    │   └── data\
    │       ├── preferences.json       # 固定的快捷文件夹
    │       ├── favorites.json         # 收藏夹
    │       └── metadata.json          # 标签与逐文件元数据
    ├── workspace-canvas-host\
    │   ├── data\
    │   │   ├── boards\<id>.json       # 画板文档（只存本地文件链接与像素元信息）
    │   │   └── imports\               # 浏览器拖入/粘贴后托管的图片
    │   └── cache\
    │       └── lod\                   # 分层 LOD 代理图（256/512/1024/2048，上限 256 MB / 1500 个）
    ├── workspace-materials-host\
    │   ├── data\
    │   │   ├── projects.json          # 项目与关联的 .vectorcraft 文件
    │   │   ├── catalog.json           # 默认/项目物料数据
    │   │   ├── page-meta.json         # 逐页物料信息头
    │   │   └── settings.json          # CLI/应用路径、控制端口、监听开关
    │   └── cache\
    └── test-overview-host\
        ├── data\state.json            # 每个插件独占自己的 data/ 与 cache/
        └── cache\
```

浏览器侧另有 `localStorage` 键，都是**UI 偏好缓存**（业务数据一律落在上面的 `%LOCALAPPDATA%` 目录）：`folio.shell.overlay.v3`（工作台开关状态、当前工作区、悬浮窗位置尺寸）、`folio.frame.v1`（框架内各应用的宽度/折叠/当前应用）与插件自有键（如 `lf.studio.settings.v1`）。
