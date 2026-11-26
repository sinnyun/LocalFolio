# LocalFolio

**基于 DeepSeek Harness (DSH) 原生体系持续增量演进的个人工作台插件库。**

> **核心理念**：LocalFolio 不是“盖在 DSH 外面、通过 Shadow DOM 隔离重构的独立软件”，而是**在 DSH 现有能力基础上不断追加新功能的增量插件集合**。  
> 凡是 DSH 已提供的能力（主题令牌、槽位、快捷键、只读文件浏览、设置框架、单实例平台库），一律直接复用；只有 DSH 尚未提供或不满足工作台场景的能力，才拆成细粒度的标准 DSH 插件按需叠加，最后通过聚合元包合装成一个整体使用。DSH 官方规范要求插件不加载其 Client 组件包（导出随时会变、抛错会空白整个槽位），因此基础控件与图标由独立插件 `@folio/core-ui-kit`（基于 Radix UI + `lucide-react` + `.lf-*` 样式）按 `--dsw-*` 令牌实现，并通过 `dsh.client.external` 单实例共享给所有 UI 插件。

---

## 一、设计原则（一切基于 DSH）

1. **零隔离墙、原生融合**：不套 Shadow DOM，所有 UI 插件直接运行在 DSH 主文档中，使用 `--dsw-alias-*` / `--dsw-font-family` 等宿主主题令牌，并复用平台表内置的单实例 `react`、`zod`、`@tanstack/react-virtual`（全部走 `external`，0 字节重复打包）。按钮、标签、表单、弹层、图标等基础控件由独立插件 `@folio/core-ui-kit`（Radix UI + `lucide-react` + `.lf-*` 样式）统一提供，业务插件通过 `dsh.client.external` 零重复打包复用，**不 require `@deepseek-ai/dsh-client-ui-*`**。
2. **插件间零直接 `import`**：每个功能都是独立 DSH 插件，通过 DSH 原生 **Cordis Service（`ctx.provide` 注册 / `inject` 依赖）** 与 **Slot 树（`ctx.slots`）** 松耦合协作，支持单插件独立启停与局部热重载（HMR）。
3. **双形态承载新面板**：
   - **全屏可退回工作台**：挂在 DSH `shell.overlay`（`order: 1`），点击顶栏 `LocalFolio` 进入，按 `Esc` 或点「返回 DSH」无损回到原生 DSH 界面；
   - **自由悬浮面板**：挂在 DSH `shell.overlay`（`order: 2`），任何新插件只需调用 `ctx.folioShell.registerFloatingPanel(...)` 即可获得**自由拖拽、八向缩放、一键最大化/还原、多窗置顶与位置记忆**，可悬浮在工作台或原生 DSH 之上。
4. **每插件独立存储**：所有插件持久化数据统一落盘在 `%LOCALAPPDATA%\LocalFolio\plugins\<pluginId>\{data,cache}\`（底层优先经由 DSH `ctx.fs` Seam），严禁写入 DSH 自身的 `~/.dsh/storages/workspace.json` 或会话目录。

---

## 二、DSH 原生复用 vs LocalFolio 增量底座

| 能力域 | DSH 原生提供（直接消费，不重造） | LocalFolio 增量插件（仅补差额） |
|---|---|---|
| **UI 组件与主题** | `--dsw-alias-*` 主题令牌、布局节奏、Slot/设置框架（`dsh-client-ui-theme`、`dsh-client-ui-settings*`） | `@folio/core-ui-kit`（`ctx.folioUi`）：运行期单实例共享的 Radix UI 控件、`lucide-react` 图标、`.lf-*` 样式、`shell.overlay` Portal/Toast 宿主 |
| **公共运行时库** | 平台表内置单实例：`react`、`zod`、`@tanstack/react-virtual`；Host 侧 `@deepseek-ai/cordis` | 构建期统一 `external`，零重复打包 |
| **槽位 / 菜单 / 快捷键 / 设置** | 通过 `ctx` 使用宿主扩展点：`ctx.slots`、`ctx.shortcuts`、`settings.section`（不 import 其组件包） | `@folio/shell-overlay-ui`（工作台视图与自由悬浮面板宿主）、`@folio/shell-settings-ui`（设置页「我的插件」分页） |
| **文件系统与存储** | `ctx.fs`、`dsh-api-workspace-files`（目录列表、只读预览、搜索、变更流） | `@folio/core-host-storage`（每插件隔离目录 + Zod 校验 JSON Store）、`@folio/core-host-runtime`（`/lf/*` 写操作 RPC + SSE 网关） |
| **业务新能力** | — | 未来按需叠加：`@folio/app-files-*`、`@folio/app-projects-*`、`@folio/app-canvas-*`（内置 LeaferJS）等 |

---

## 三、三段式命名与 Monorepo 目录结构

包名采用 **`@folio/<大类层>-<功能域>-<细分职责>`**（例如 `@folio/app-canvas-ui`、`@folio/app-canvas-storage`），一眼定位层级与归属：

- `bundle-*`：聚合元包（把整套独立插件合并为一键可装的 DSH 发行套件）
- `core-*`：Host 基础设施增量插件（存储空间分配、RPC/SSE 网关）
- `shell-*`：覆盖层外壳、自由悬浮面板宿主、DSH 设置分页
- `app-*`：具体业务插件（可按 `host` / `storage` / `ui` 进一步细分）
- `bridge-*` / `ext-*`：桥接 DSH 工具（`ctx.tools`）或扩展 DSH 现有能力的薄插件
- `lib-*`：纯编译期共享契约（非 DSH 插件）

```text
F:\AI\geren\LocalFolio\
├── bundles/
│   └── bundle-suite-all/          @folio/bundle-suite-all    聚合元包（一份 cordis.patch.yml 拉起整套插件）
├── plugins/                       独立 DSH 插件目录（每包独立构建 lib/index.js & lib/client.js）
│   ├── core-host-storage/         @folio/core-host-storage   提供 ctx.folioStorage
│   ├── core-host-runtime/         @folio/core-host-runtime   提供 ctx.folioRuntime (/lf/* RPC + SSE)
│   ├── core-ui-kit/               @folio/core-ui-kit         提供 ctx.folioUi、shadcn/Radix 通用组件、无 Preflight Tailwind v4 共享样式、Portal/Toast 宿主
│   ├── shell-overlay-ui/          @folio/shell-overlay-ui    提供 ctx.folioShell（全屏工作台 + 自由悬浮面板）
│   ├── shell-settings-ui/         @folio/shell-settings-ui   DSH 设置页「我的插件」双层治理面板
│   ├── app-starter-host/          @folio/app-starter-host    独立 Host 业务插件样板
│   ├── app-starter-ui/            @folio/app-starter-ui      独立 Client 业务插件样板（含工作区 + 悬浮面板示例）
│   ├── app-gallery-ui/            @folio/app-gallery-ui      独立测试插件：瀑布流图片画廊 + Lightbox（纯消费 core-ui-kit）
│   ├── app-sidebar-ui/            @folio/app-sidebar-ui      独立测试插件：sidebar-07 图标折叠侧栏 + 面包屑（纯消费 core-ui-kit）
│   ├── app-admin-ui/              @folio/app-admin-ui        shadcn-admin 移植：仪表盘/任务/用户/应用/聊天/设置/错误页
│   └── app-studio-ui/             @folio/app-studio-ui       Studio Admin 移植：多主题预设 + 布局控制 + 仪表盘图表/数据表
├── libs/
│   └── lib-shared-contract/       @folio/lib-shared-contract 协议类型与跨 bundle 无单例 RPC Hooks
└── scripts/
    ├── build.mjs                  自动扫描构建全部 plugins/*（--watch 模式下业务 UI 变更自动联动刷新 core-ui-kit 共享样式）
    ├── sync-ui-kit.mjs            自动同步 core-ui-kit 导出表、清理 shadcn 全局 CSS 与 cn 裸导入
    ├── add-ui.mjs                 一键向 core-ui-kit 安装 shadcn 通用原语并自动 sync（pnpm run ui:add）
    ├── check-artifacts.mjs        对所有构建产物执行 node --check
    ├── lfdev.ps1                  隔离 profile（lfdev，端口 3081）安装/重启/校验脚本
    └── shot.mjs                   零依赖 CDP 截图脚本
```

---

## 四、使用指南

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

### 3. 安装到 DSH 隔离环境实测（不碰你的日常 `desktop`）

```powershell
# 1) 以 link: 方式把聚合元包 @folio/bundle-suite-all 装入独立 profile `lfdev`
pwsh -File scripts/lfdev.ps1 install

# 2) 启动隔离 DSH 实例（端口 3081）
pwsh -File scripts/lfdev.ps1 restart

# 3) 获取访问地址并校验所有独立 client 插件均已进入 boot payload
$u = pwsh -File scripts/lfdev.ps1 url
pwsh -File scripts/lfdev.ps1 verify

# 4) 停掉隔离实例
pwsh -File scripts/lfdev.ps1 stop
```

> 当确认稳定后，只需把 `bundles/bundle-suite-all` 用同样方式装进你日常使用的 DSH profile 即可整套启用，并可在 DSH 插件管理页中单独启停任意子插件。

### 4. 如何新增一个新功能插件

以新增「画板」功能为例：

1. **建 Host / 存储子插件** `plugins/app-canvas-storage/`：
   - 声明 `export const inject = ['folioRuntime', 'folioStorage'] as const`；
   - 通过 `ctx.folioStorage.forPlugin('app-canvas-storage')` 获取自己的 `%LOCALAPPDATA%\LocalFolio\plugins\app-canvas-storage\` 目录；
   - 通过 `ctx.folioRuntime.registerAction(defineAction(...))` 注册画板读写动作，所有注册包在 `ctx.effect` 返回清理函数。
2. **建 Client 界面子插件** `plugins/app-canvas-ui/`：
   - 声明 `dsh.client.inject: ['@folio/core-ui-kit', '@folio/shell-overlay-ui']`、`dsh.client.external: ['@folio/core-ui-kit']` 与 `export const inject = ['folioShell'] as const`；
   - 直接从 `@folio/core-ui-kit/client` 引入通用 shadcn/Radix 控件与图标，并可直接使用 Tailwind 工具类（由 `@folio/core-ui-kit` 的 `@source "../../";` 统一编译进单份无 Preflight 样式表，`build:watch` 自动联动刷新），不 import 任何 `@deepseek-ai/dsh-client-ui-*`；
   - 业务插件专属图标可直接 `import { ... } from 'lucide-react'`（esbuild 按图标 tree-shake，约 300B/个，无需回头改 `core-ui-kit`）；
   - 如需给底座补充通用 shadcn 原语：直接运行 `pnpm run ui:add <组件名或URL>`（自动拉取 + 修正 `cn` + 清理全局 CSS + 更新 `ui-exports.generated.ts`；带浮层的原语把 `<Portal>` 接到 `usePortalContainer()`，被 `asChild` 包裹的自定义触发器保持 `forwardRef` 兼容 React 18）；
   - 要挂入全屏工作台 → 调用 `ctx.folioShell.registerWorkspace(...)`；
   - 要做独立可拖拽/缩放/最大化面板 → 调用 `ctx.folioShell.registerFloatingPanel(...)`。
3. **补齐显示与安装元信息**：`package.json` 加 `engines.dsh`（如 `^0.2.2-rc.5`）、`exports["./locale/*.json"]`、`exports["./icon"]`，`files` 带上 `locale` 与 `icon.svg`；写 `locale/zh.json` 与 `locale/en.json` 的 `meta.title`/`meta.description`（可选 `meta.detail` 指向 `docs/DETAIL.md`），并保留包内静态 `icon.svg`（供 DSH 插件管理页离线展示，与 `@folio/core-ui-kit` 的界面内图标各司其职）。
4. **加入聚合元包**：在 `bundles/bundle-suite-all/package.json` 和 `cordis.patch.yml` 各加一行。
5. 运行 `pnpm install --offline && pnpm run verify`，重启 Host 或等 Client HMR 生效即可。

---

## 五、运行时数据目录

默认路径：`%LOCALAPPDATA%\LocalFolio\`（可通过环境变量 `LOCALFOLIO_DATA_DIR` 覆盖，非 Windows 下为 `$XDG_DATA_HOME/LocalFolio`）：

```text
%LOCALAPPDATA%\LocalFolio\
├── shared\
│   └── plugins-manifest.json          # 双层插件治理清单（DSH 层插件 + 内部生态扩展）
└── plugins\
    ├── core-host-runtime\{data,cache}\
    └── app-starter-host\
        ├── data\state.json            # 每个插件独占自己的 data/ 与 cache/
        └── cache\
```
