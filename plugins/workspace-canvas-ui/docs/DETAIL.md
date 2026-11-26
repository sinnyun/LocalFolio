# @folio/workspace-canvas-ui · 画板

无限画板工作区的**界面层**，形态 A：它把 `@folio/base-frame-ui` 的四区框架当作自己的 `MainView`，但只声明三个区域（左栏、主区、底栏），把整个主区让给内置的 `tldraw`。画布里的图片**不是图片文件**，只是一条本地绝对路径链接；所有落盘、链接检查、代理图渲染与导入都由 `@folio/workspace-canvas-host` 负责（见 `plugins/workspace-canvas-host/docs/DETAIL.md`）。

```text
┌ Left ──────────────┬ Main ──────────────────────────────────────────┐
│ 画板列表（n 图）   │ tldraw 画布（自托管资源 · zh-cn）              │
│ ＋ 新建 / 搜索     │ 顶栏胶囊：链接图片 · 图片链接(n)               │
│ 双击重命名         │ 链接面板：重选 / 批量重定位 / 缓存             │
│ … 复制 / 删除      │ 拖入 · 粘贴 · 文件浏览器拖拽 → 文件链接        │
│ 断链角标 ⚠ n       │ 800ms 防抖自动保存 · 断链占位图                │
├────────────────────┴────────────────────────────────────────────────┤
│ Status：画板名 · 保存状态 · 链接 n · 失效 n · LOD ≤2048px           │
└─────────────────────────────────────────────────────────────────────┘
```

没有 `Right` 区，所以框架不画右栏、不画右栏分隔条与折叠按钮，`Ctrl+Alt+R` 在这里也没有作用。

## 它做什么

个人无限画板的界面与状态机：左侧选画板，中间直接是 `tldraw` 编辑器，顶栏一颗胶囊负责「链接本地图片」和「图片链接管理」。它自己维护画板文档的读取/保存时序、链接有效性状态、导入链路与 LOD 请求档位；不解析图片、不生成缩略图、不写用户目录。

## 四区声明

`createCanvasApp()` 返回的 `FrameAppDefinition`：

| 区域 | 组件（`src/components/`） | 职责 |
|---|---|---|
| 左 `Left` | `CanvasSidebar` | 画板列表、新建、按标题搜索、行内重命名、复制/删除、图片数与断链角标 |
| 中 `Main` | `CanvasMainSlot` | 取 `CanvasStageComponent`（测试可注入）或默认 `CanvasStage`，渲染 `tldraw` |
| 右 `Right` | — | 未声明；完整画布由主区独占 |
| 底 `Status` | `CanvasStatus` | 画板名、保存状态、链接数量、失效入口、渲染策略摘要 |
| `Provider` | `CanvasProvider`（`src/context.tsx`） | 画板列表、当前文档、保存状态、链接状态、缓存统计 |

```ts
id: 'canvas.boards', workspaceId: 'canvas', order: 1,
title: '画板', subtitle: 'tldraw 链接画板', leftCollapse: 'icon',
defaultLayout: { leftWidth: 248, leftCollapsed: false },
```

工作区贡献是 `id: 'canvas'`、`order: 3`、`MainView: ctx.folioFrame.WorkspaceHost`；它没有声明 `fileExtensions`，所以外壳按扩展名认领文件时不会把图片路由到这个工作区。

## 画布与 tldraw 集成

- 每块画板一个独立 `TLStore`（`createTLStore` + `defaultShapeUtils` / `defaultBindingUtils`），只有 `activeDoc.id === activeBoardId` 且 `document.store` 非空时才 `loadSnapshot`，解析失败就从空白开始，不会带着半份快照崩溃。
- `<Tldraw key={activeBoardId}>` 以画板 id 作为 `key`：切画板即整体重挂，撤销栈与摄像机不跨画板。
- 资源全部自托管：`assetUrls` 由 `getAssetUrls()` 改写到 `/lf/canvas/tldraw-asset?f=<相对路径>`，字体、图标与 `translations/zh-cn.json` 都来自本机，不请求 CDN。
- 挂载时 `updateUserPreferences({ locale: 'zh-cn', colorScheme })`，并起一个 `MutationObserver` 盯 `documentElement` 的 `class` / `data-theme`，深浅主题跟随外壳切换。tldraw 的 CSS 以 `<style data-lf-canvas-tldraw-css>` 注入并加作用域规则。
- 两处 UI 覆盖：`TopPanel` 换成顶栏胶囊组件，`actions['insert-media']` 换成本地图片链接流程（不触发 tldraw 自带的文件上传）。`assets` 换成 `createFolioAssetStore(...)`，把 tldraw 的 `upload` / `resolve` 接到链接与代理图上。
- 画布容器是 `[data-lf-canvas-stage]`，文档加载中显示「正在载入画板...」；`LinkedImagesPanel` 与 `LocalImagePickerDialog` 作为兄弟节点叠在上面。

## 主要交互

**画板列表**：单击切换（切换前若有未保存改动先存盘）；双击标题行内重命名（左栏折叠为图标轨时不响应双击）；输入框 `Enter` 提交、`Esc` 取消、失焦按当前值提交；右侧「…」菜单是重命名 / 复制画板 / 删除画板。列表项显示相对时间、`n 图` 与断链角标；搜索只匹配标题。

**顶栏胶囊**（tldraw 原生 TopPanel 位置）：

| 控件 | 行为 |
|---|---|
| 链接图片 | 先试原生图片选择框（可多选），不支持时退回内置文件夹选择器 |
| 文件夹图标 | 直接打开内置选择器（用于原生对话框不可用的环境） |
| 图片链接 (n) / n 张图片已移动 · 重新链接 | 开关右侧链接面板；有失效链接时自动把面板筛到「已失效」 |
| 重新选择此图片 | 仅当画布上**只选中一张失效图片**时出现，等于该条目的「重新选择」 |

**快捷键与 Esc 分层**：画布内 `Esc` 按顺序判断——内置选择器打开时让给弹窗；链接面板开着就关面板；否则只在「有选中形状 / 当前工具不是选择工具 / 正在编辑形状 / tldraw 菜单打开」时 `preventDefault`，挡住会连带关闭工作台的事件，本身不取消选中。没有这些状态时 `Esc` 冒泡给外壳的分层 Esc 处理。左栏 `Ctrl+B` 图标轨折叠由框架提供。

## 拖入、粘贴与导入

画布注册了两个 tldraw 外部内容处理器（`files` / `text`），加上容器对 `FOLIO_DRAG_MIME` 的捕获，共三条真实入口，外加一条兜底：

| 入口 | 能拿到磁盘路径时 | 拿不到路径时 |
|---|---|---|
| 从系统/Explorer 拖入文件 | `File.path` 或 DSH 桌面桥 `__DSH_HOST_PATHS__.pathFor(file)` → `canvas.links.inspect` 后直接建链接 | 图片文件按 **≤1 MiB 分块**（`importBegin` / `importChunk` / `importFinish`，失败 `importAbort`）送到 Host 托管目录，再用返回的真实路径建链接 |
| 在画布上粘贴文本 | 逐行解析 `C:\…`、`\\server\…`、`file:///…` 且扩展名像图片的行，批量建链接 | 走 tldraw 默认文本处理（变成文本形状） |
| 从「文件浏览器」工作区拖入 | 读 `FOLIO_DRAG_MIME` 载荷里的路径，过滤图片后按落点插入 | — |
| 都不满足 | 弹「未能自动转换为链接图片」提示，并打开内置选择器兜底 | — |

- 一张都没导入成功时只提示，不会留下空资产。
- 插入位置：落点（`screenToPage`）或视口中心；多张图按 28px 阶梯错开并自动选中新形状。
- 尺寸策略：资产长边封顶 `2048`，初始形状长边封顶 `640`、最短边不小于 `48`；图片只存路径，不复制原图。

## 纯链接不变量与 LOD

- 每个链接资产的 `src` 是 `asset:folio-link/v1/<linkId>`（兼容旧的 `folio-link://v1/`），真实信息在同一条 asset 的 `meta` 里：`localPath`、`fileName`、`fileSize`、`mtimeMs`、`naturalWidth/Height`、`mime`、`relinkRev`、`linkId`。画板快照里**没有图片字节**。
- 客户端保存前会跑一次 `stripInlineImagesFromSnapshot()`：把任何 `data:` 开头的 `props.src` 清空再发 RPC；Host 侧还有一层 `sanitizeBoardSnapshot` 兜底（见 Host 文档「纯链接不变量」）。
- 渲染走 `/lf/canvas/proxy?path=&tier=&v=<mtime>&rev=<relinkRev>`：档位由 `chooseLodTier()` 决定——先算资产长边，再乘「画布缩放比例 × DPR」（`shouldResolveToOriginal` 时缩放按 2 倍算，所以复制/导出也不会突破 2048），夹到 `64–2048` 后向上取最近的 `256 / 512 / 1024 / 2048`。
- 链接失效时 `resolve` 返回一张**内存里拼出来的** SVG 占位图（文件名 + 末尾路径 + 「请在图片链接面板重选」），它只存在于这次渲染，绝不进快照。
- 断链判定调一次轻量的 `canvas.links.check`（批量与并发在 Host 侧）；结果同时维护在 React state 与一个 tldraw `atom` 里，画布渲染直接读 atom，避免整树重渲染。

## 链接管理面板

顶栏胶囊打开的悬浮面板（宽 `368px`、右上角 `top-14`、`z-600`、点击与滚轮都不透传给画布）：

- 头部：总数、失效数、关闭；筛选「全部 / 已失效」。
- 工具条：`检测`（重跑 `canvas.links.check`）、`批量重定位`（仅有失效项时出现）、`链接`（插入新图片）。
- 每条：`256px` 代理缩略图、文件名、`宽×高 · 大小`、完整路径、`正常 / 已移动/缺失` 徽标，以及 `重新选择`（单张重选）、`定位`（选中该形状并 `zoomToSelection` 动画 240ms）、`在资源管理器中显示`（仅在链接有效时）。
- 底部：`LOD 缓存：n 个 · 大小（上限 2048px）` 与 `清理缓存`（`canvas.cache.clear`，成功后刷新统计并提示）。
- `批量重定位` 会读当前所有失效项，把 `{ linkId, fileName, expectedSize }` 交给 `canvas.links.relocateInFolder`，按文件名（同名时优先大小匹配）在所选目录及两级子目录里找，命中就逐条重链接，最后提示「已自动重新链接 x / y 张图片」并附扫描文件数。

## 数据与状态

| 动作 | 界面侧用途 |
|---|---|
| `canvas.boards.list` / `get` / `create` / `rename` / `duplicate` / `delete` | 左侧列表与切画板、行内重命名、复制、删除 |
| `canvas.boards.save` | 防抖自动保存，附带 `brokenCount` 写进索引 |
| `canvas.links.inspect` | 建链接与重链接前拿尺寸/MIME/存在性 |
| `canvas.links.check` | 批量断链检测（挂载、窗口重新获得焦点、面板「检测」、每次插入/重链接后） |
| `canvas.links.relocateInFolder` | 按文件夹批量重定位 |
| `canvas.links.reveal` | 面板里的「在资源管理器中显示」 |
| `canvas.links.import*` | 浏览器拖入/粘贴图片的分块导入 |
| `canvas.dialog.pickImages` / `pickFolder` | 原生选择框；返回 `supported: false` 才退回内置选择器 |
| `canvas.fs.roots` / `canvas.fs.list` | 内置选择器的常用目录/驱动器与逐层浏览 |
| `canvas.cache.stats` / `clear` | 面板底部缓存统计与清理 |

- 保存：文档变更（`store.listen` 的 `document` + `source: 'user'` 作用域）触发 800ms 防抖存盘，状态在 `已保存 / 未保存 / 正在保存 / 保存失败` 之间切换；切画板、复制画板、卸载组件前若仍是脏的会先 `saveNow()`。保存失败只置错误状态，没有自动重试。
- 断链状态：挂载时检测一次、窗口重新获得焦点时检测、插入或重链接后检测。画布上的断链占位与面板状态都来自同一次检测结果。
- 持久化：只有 `localStorage['folio.canvas.activeBoard']` 记住当前画板 id；其余（面板开关、筛选、选中、断链结果、保存状态）都是内存态，刷新后重新检测。
- 失效事件：`useFolioEvents` 收到 `canvas` 或 `*` 作用域的失效时只重取画板列表，不重载当前文档（避免打断正在编辑的画布）。

## 与 Host 的分工

- 界面负责：画板列表与切换时序、tldraw 挂载与 UI 覆盖、链接资产的创建/重链接、链接面板与内置选择器、导入链路的前端分块、保存防抖。
- Host 负责：画板索引与文档落盘、快照净化、链接检查与批量重定位、LOD 代理图渲染与缓存、tldraw 静态资源托管、原生对话框、导入落盘。渲染与缓存细节见 Host 文档，这里不复述。
- 一句话边界：**界面从不读写用户图片字节**（浏览器拖入的除外，那也是交给 Host 落盘后再变成普通链接）。

## 限制与边界

- 画板里只有本地绝对路径：原图被移动或删除时界面只能报失效并重选，不会去猜新位置（`批量重定位` 是显式操作）。
- 断链检测是显式时机触发的，不是实时监听：链接在应用打开期间失效时，要等焦点回到窗口、点「检测」或下一次插入/重链接才会亮起。
- 左栏角标来自**上一次保存写进索引**的 `brokenCount`，顶栏胶囊与底栏是当前检测结果；两者在「检测后未保存」这段时间内可能不一致。
- 浏览器环境（无磁盘路径）下拖入的图片会被复制进 Host 托管目录；桌面端能直接读到原路径时不复制。
- 粘贴文本只认绝对路径（`C:\`、UNC、`file://`）且扩展名像图片的行，相对路径与纯文件名会被忽略并落到 tldraw 默认文本处理。
- 内置选择器是原生对话框不可用时的退路：它只有「常用目录 + 驱动器 + 可编辑路径 + 筛选 + 平铺缩略图」，没有新建文件夹，也不支持多级多选。
- 保存失败没有重试按钮，只显示「保存失败」，下一次文档变更会重新排一次保存。
- 画板至少保留一块：删掉最后一块时 Host 会补一块「默认画板」，界面跟随列表切换。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```

`src/__tests__/canvas-ui.test.tsx` 覆盖两层：纯函数层（几何封顶与 `256/512/1024/2048` 档位、路径无关的浏览器图片导入与断链 SVG 占位、`data:` 清理、`File.path` 与桌面桥的路径解析、插入后的 store 能通过 tldraw schema 校验）；集成层（拖入图片按 RPC 尺寸分块上传、自动导入后变成链接图片、左侧列表 + 完整右侧画布 + 断链检测与小面板重链接、按文件夹批量重定位）。
