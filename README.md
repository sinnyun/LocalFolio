# LocalFolio

**基于 DeepSeek Harness (DSH) 原生体系持续增量演进的个人工作台。**

> **核心理念**：LocalFolio 不是“盖在 DSH 外面、通过 Shadow DOM 隔离重构的独立软件”，而是**在 DSH 现有能力基础上不断追加新功能的增量插件集合**。
> 凡是 DSH 已提供的能力（主题令牌、槽位、快捷键、底层文件能力、设置框架、单实例平台库），一律直接复用；只有 DSH 尚未提供或不满足工作台场景的能力，才拆成细粒度的标准 DSH 插件按需叠加，最后由工作台套件合装成一个整体。DSH 官方规范要求插件不加载其 Client 组件包（导出随时会变、抛错会空白整个槽位），因此基础控件与图标由独立插件 `@folio/base-ui-kit`（基于 Radix UI + `lucide-react` + `.lf-*` 样式）按 `--dsw-*` 令牌实现，并通过 `dsh.client.external` 单实例共享给所有 UI 插件。

术语以 [`GLOSSARY.md`](GLOSSARY.md) 为准，架构取舍见 [`docs/adr/`](docs/adr/)。

---

## 一、三层结构

| 层 | 是什么 | 例子 |
|---|---|---|
| **工作台** | 整个 LocalFolio 软件包：覆盖在 DSH 原生界面之上、可随时退回的全屏工作面板 | 工作台套件装好后的那个界面 |
| **工作区** | 工作台顶部工作区栏里的一项完整功能，由若干功能插件拼成 | 画板工作区、笔记工作区 |
| **功能插件** | 只在一个工作区内部贡献一块功能，不单独出现在工作区栏 | 图层管理、markdown 编辑 |

三者之外是**工作台通用基础能力**：存储、运行时、UI 组件库、外壳、布局框架、设置页。它们不属于任何工作区，所有工作区共用。

## 二、设计原则（一切基于 DSH）

1. **零隔离墙、原生融合**：不套 Shadow DOM，所有 UI 插件直接运行在 DSH 主文档中，使用 `--dsw-alias-*` / `--dsw-font-family` 等宿主主题令牌，并复用平台表内置的单实例 `react`、`zod`、`@tanstack/react-virtual`（全部走 `external`，0 字节重复打包）。按钮、标签、表单、弹层、图标等基础控件由 `@folio/base-ui-kit`（Radix UI + `lucide-react` + `.lf-*` 样式）统一提供，工作台插件通过 `dsh.client.external` 零重复打包复用，**不 require `@deepseek-ai/dsh-client-ui-*`**。
2. **插件间零直接 `import`**：每个功能都是独立 DSH 插件，通过 DSH 原生 **Cordis Service（`ctx.provide` 注册 / `inject` 依赖）** 与 **Slot 树（`ctx.slots`）** 松耦合协作，支持单插件独立启停与局部热重载（HMR）。跨插件共享界面时通过服务暴露组件（例如 `ctx.folioFrame.View`），不跨包 import。
3. **双形态承载新面板**：
   - **全屏可退回工作台**：挂在 DSH `shell.overlay`（`order: 1`）。Windows 桌面版（`html[data-windows-titlebar]`）把这套控件搬进 DSH 标题栏、「应用 / 编辑」之后：一个按钮在「工作台 ⇄ 返回 DSH」之间切换，工作区切换与左右面板开关同排，外壳自身不再画顶栏（无品牌标识）；Web 与 macOS 桌面保持外壳内顶栏（标识 + 返回 DSH + 切换 + 面板开关）不变。按 `Esc` 同样无损回到原生 DSH 界面；
   - **自由悬浮面板**：挂在 DSH `shell.overlay`（`order: 2`），任何插件只需调用 `ctx.folioShell.registerFloatingPanel(...)` 即可获得**自由拖拽、八向缩放、一键最大化/还原、多窗置顶与位置记忆**，可悬浮在工作台或原生 DSH 之上。
4. **每插件独立存储**：所有插件持久化数据统一落盘在 `%LOCALAPPDATA%\LocalFolio\plugins\<pluginId>\{data,cache}\`（底层优先经由 DSH `ctx.fs` 落盘缝），严禁写入 DSH 自身的 `~/.dsh/storages/workspace.json` 或会话目录。
5. **统一布局框架**：工作区不再各自摆布四区布局，而是渲染 `ctx.folioFrame.View` 并认领宿主；工作区内部的功能插件向框架登记应用，只声明「左侧面板 / 中间内容 / 右侧面板 / 底部信息栏」显示什么。宽度调节、折叠、分隔条交互、布局持久化、应用切换、逐区错误隔离全部由框架统一托管。

---

## 三、DSH 原生复用 vs LocalFolio 基础能力

| 能力域 | DSH 原生提供（直接消费，不重造） | LocalFolio 增量插件（仅补差额） |
|---|---|---|
| **UI 组件与主题** | `--dsw-alias-*` 主题令牌、布局节奏、Slot/设置框架（`dsh-client-ui-theme`、`dsh-client-ui-settings*`） | `@folio/base-ui-kit`（`ctx.folioUi`）：运行期单实例共享的 Radix UI 控件、`lucide-react` 图标、`.lf-*` 样式、`shell.overlay` Portal/Toast 宿主 |
| **公共运行时库** | 平台表内置单实例：`react`、`zod`、`@tanstack/react-virtual`；Host 侧 `@deepseek-ai/cordis` | 构建期统一 `external`，零重复打包 |
| **槽位 / 菜单 / 快捷键 / 设置** | 通过 `ctx` 使用宿主扩展点：`ctx.slots`、`ctx.shortcuts`、`settings.section`（不 import 其组件包） | `@folio/base-shell-ui`（工作台外壳与悬浮面板宿主）、`@folio/base-frame-ui`（左/中/右/底四区布局框架）、`@folio/base-settings-ui`（设置页「我的插件」分页） |
| **文件系统与存储** | `ctx.fs` 与 `dsh-api-workspace-files` 的底层文件能力（目录列表、只读预览、搜索、变更流）；只复用底层操作，**不接入 DSH 工作区模型**（见 ADR-0001） | `@folio/base-storage-host`（每插件隔离目录 + Zod 校验 JSON Store）、`@folio/base-runtime-host`（`/lf/*` 写操作 RPC + SSE 网关） |
| **业务新能力** | — | 未来按需叠加：`@folio/workspace-files-ui`、`@folio/workspace-canvas-ui`（内置 LeaferJS）等 |

---

## 四、命名与 Monorepo 目录结构

包名采用 **`@folio/<角色>-<功能>-<形态>`**：

- `base-*`：工作台通用基础能力（`base-storage-host`、`base-runtime-host`、`base-ui-kit`、`base-shell-ui`、`base-frame-ui`、`base-settings-ui`）
- `workspace-*`：工作区（顶部工作区栏的一项完整功能）
- `feature-*`：功能插件（只在一个工作区内部贡献功能）
- `test-*`：测试界面（只为验证界面与集成方式存在，最终删除或并入工作区）
- `bridge-*`：桥接插件（把某项基础能力接进外壳、工具链或测试场景）
- `workbench-suite`：工作台套件（聚合元包）
- `base-contract`：纯编译期共享契约（不是插件）

形态后缀按需使用：`-host`（Host 侧能力）、`-ui`（Client 界面）、`-kit`（组件库）。

```text
F:\AI\geren\LocalFolio\
├── bundles/
│   └── workbench-suite/            @folio/workbench-suite     工作台套件（一份 cordis.patch.yml 拉起整套插件）
├── plugins/                        独立 DSH 插件目录（每包独立构建 lib/index.js & lib/client.js）
│   ├── base-storage-host/          @folio/base-storage-host   基础存储能力：ctx.folioStorage
│   ├── base-runtime-host/          @folio/base-runtime-host   基础运行时能力：ctx.folioRuntime（/lf/* RPC + SSE）
│   ├── base-ui-kit/                @folio/base-ui-kit         基础 UI 组件库：ctx.folioUi、共享 Radix/lucide、.lf-* 样式、Portal/Toast 宿主
│   ├── base-shell-ui/              @folio/base-shell-ui       基础外壳能力：ctx.folioShell（工作台 + 工作区栏 + 悬浮面板）
│   ├── base-frame-ui/              @folio/base-frame-ui       基础布局框架：ctx.folioFrame（四区布局，自身不画界面）
│   ├── base-settings-ui/           @folio/base-settings-ui    基础设置页：DSH 设置「我的插件」
│   ├── bridge-frame-test-ui/       @folio/bridge-frame-test-ui 测试框架工作区（把布局框架挂进工作区栏）
│   ├── test-overview-host/         @folio/test-overview-host  测试概览后端
│   ├── test-overview-ui/           @folio/test-overview-ui    测试概览 UI（工作区 + 悬浮面板）
│   ├── test-gallery-ui/            @folio/test-gallery-ui     测试图片画廊 UI（瀑布流 + Lightbox）
│   ├── test-sidebar-ui/            @folio/test-sidebar-ui     测试侧栏示例 UI（sidebar-07）
│   ├── test-shadcn-admin-ui/       @folio/test-shadcn-admin-ui 测试 Shadcn Admin UI
│   └── test-studio-admin-ui/       @folio/test-studio-admin-ui 测试 Studio Admin UI
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

### 1. 构建与校验

```powershell
cd F:\AI\geren\LocalFolio
pnpm install
pnpm run verify          # 类型检查 + 全插件构建 + 产物语法校验 + 单元测试
```

### 2. 开发期热重载（单插件局部 HMR）

```powershell
pnpm run build:watch     # 修改哪个 plugins/* 就只重编该插件的 lib/client.js，约 1 秒后 DSH 自动局部热替换
```

### 3. 安装到 DSH profile

```powershell
# 1) 以 link: 方式把工作台套件 @folio/workbench-suite 装入 profile（默认 lfdev）
pwsh -File scripts/lfdev.ps1 install

# 其他 profile 也可以，例如给某个隔离环境（desktop 除外，见下）
pwsh -File scripts/lfdev.ps1 install -Profile someprofile

# 2) 启动实例（默认端口 3081）
pwsh -File scripts/lfdev.ps1 restart

# 3) 获取访问地址并校验所有 client 插件均已进入 boot payload
$u = pwsh -File scripts/lfdev.ps1 url
pwsh -File scripts/lfdev.ps1 verify

# 4) 停掉实例
pwsh -File scripts/lfdev.ps1 stop
```

> **桌面版（`desktop` profile）不能用 CLI 安装**：DSH 对 `desktop` 有硬性保护，`dsh plugin --profile desktop …` 会直接报 `managed exclusively by the Electron application`。请在应用内的插件管理里添加依赖，spec 填：
>
> ```text
> link:F:\AI\geren\LocalFolio\bundles\workbench-suite
> ```
>
> 重启应用后生效；套件内的子插件仍可在 DSH 插件管理页单独启停。

### 4. 如何新增一个工作区

以「笔记工作区」为例（Host 能力 + 工作区界面）：

1. **建 Host 子插件** `plugins/feature-notes-host/`：
   - 声明 `export const inject = ['folioRuntime', 'folioStorage'] as const`；
   - 通过 `ctx.folioStorage.forPlugin('feature-notes-host')` 获取自己的 `%LOCALAPPDATA%\LocalFolio\plugins\feature-notes-host\` 目录；
   - 通过 `ctx.folioRuntime.registerAction(defineAction(...))` 注册笔记读写动作，所有注册包在 `ctx.effect` 返回清理函数。
2. **建工作区界面插件** `plugins/workspace-notes-ui/`：
   - 声明 `dsh.client.inject: ['@folio/base-ui-kit', '@folio/base-shell-ui', '@folio/base-frame-ui']`、`dsh.client.external: ['@folio/base-ui-kit']` 与 `export const inject = ['folioFrame', 'folioShell'] as const`；
   - 向 `ctx.folioShell.registerWorkspace(...)` 注册工作区，`MainView` 渲染 `ctx.folioFrame.View`，并调用 `ctx.folioFrame.attachHostWorkspace(workspaceId)`，同时设 `hideStatusBar: true`（底栏由框架画）；
   - 工作区内的各个「功能插件」只 `inject: ['folioFrame']`，用 `registerApp` 声明四区内容，彼此不 import；
   - 直接从 `@folio/base-ui-kit/client` 引入通用 shadcn/Radix 控件与图标，并可直接使用 Tailwind 工具类（由 `@folio/base-ui-kit` 的 `@source "../../";` 统一编译进单份无 Preflight 样式表，`build:watch` 自动联动刷新）；
   - 专属图标可直接 `import { ... } from 'lucide-react'`（esbuild 按图标 tree-shake，约 300B/个）；
   - 如需给基础能力补充通用 shadcn 原语：直接运行 `pnpm run ui:add <组件名或URL>`。
3. **补齐显示与安装元信息**：`package.json` 加 `engines.dsh`（如 `^0.2.2-rc.5`）、`exports["./locale/*.json"]`、`exports["./icon"]`，`files` 带上 `locale` 与 `icon.svg`；写 `locale/zh.json` 与 `locale/en.json` 的 `meta.title`/`meta.description`（可选 `meta.detail` 指向 `docs/DETAIL.md`）。
4. **加入工作台套件**：在 `bundles/workbench-suite/package.json` 和 `cordis.patch.yml` 各加一行。
5. 运行 `pnpm install --offline && pnpm run verify`，重启 Host 或等 Client HMR 生效即可。

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

框架自动提供：左栏宽度拖拽与 `Ctrl+B` 图标轨折叠、右栏折叠/调宽与 `Ctrl+Alt+R`、分隔条键盘微调与双击复位、每应用布局持久化、四区共享 `Provider`、逐区 Suspense/错误隔离、应用切换器与统一底部信息栏。契约见 [`plugins/base-frame-ui/docs/DETAIL.md`](plugins/base-frame-ui/docs/DETAIL.md)。

---

## 六、运行时数据目录

默认路径：`%LOCALAPPDATA%\LocalFolio\`（可通过环境变量 `LOCALFOLIO_DATA_DIR` 覆盖，非 Windows 下为 `$XDG_DATA_HOME/LocalFolio`）：

```text
%LOCALAPPDATA%\LocalFolio\
├── shared\
│   └── plugins-manifest.json          # 插件清单（基础能力 / 工作区 / 功能插件 / 测试界面 / 桥接 + 内嵌扩展）
└── plugins\
    ├── base-runtime-host\{data,cache}\
    └── test-overview-host\
        ├── data\state.json            # 每个插件独占自己的 data/ 与 cache/
        └── cache\
```
