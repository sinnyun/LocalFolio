# @folio/workspace-materials-host · 物料工作区后端

物料工作区的 Host 侧能力。它**不画任何界面**：`@folio/workspace-materials-ui` 负责项目栏、页面管理、幻灯片式编辑与数据表格，本插件负责与本地 VectorCraft 双通道通信（后台 CLI + 前台 `vectorcraft --control`）、`.vectorcraft` 解析与写回、A3 横版物料信息头的双向同步、单图 / 多页 PDF 导出、文件监听、预览渲染以及默认 / 项目物料数据的持久化。

## 1. 它做什么

| 能力 | 落在哪个文件 | 对外形态 |
|---|---|---|
| CLI 发现、批处理、导出、前台控制信道 | `vectorcraft-bridge.ts` | `materials.vc.*`、`materials.export`、`materials.status` |
| `.vectorcraft` 解析、信息头命令生成 | `vectorcraft-parser.ts` | 被上面各处复用 |
| 项目 / 页面 sidecar / 物料目录 / 设置 | `store.ts` | `materials.projects.*`、`materials.catalog.*` |
| 文件监听与前台轮询 | `watcher.ts` | 只发 `emitInvalidate('materials', …)` |
| 画板 PNG 预览与缓存 | `preview-route.ts` | `GET /lf/materials/preview` |
| 原生对话框、资源管理器定位 | `dialogs.ts` | `materials.dialog.*`、`materials.files.reveal` |
| 默认物料种子数据 | `defaults.ts` | `createDefaultCatalog()` |

## 2. 注册

```ts
export const inject = ['folioRuntime', 'folioStorage'] as const
```

`registerWorkspaceMaterialsHost({ runtime, storage, bridge?, dialogProvider?, disableAutoSync? })` 返回总 disposer：先 `syncManager.dispose()`，再逆序注销 33 个动作与 1 条路由，最后在自己创建 bridge 时 `dispose()`。

bridge 构造时传入 `onBeforeWrite` 钩子，每次写文件前调 `syncManager.markSelfWrite(path)`，让文件监听忽略自己造成的变更；`disableAutoSync` 为真时只创建监听器而不 `start()`（测试用）。

## 3. 动作与路由

动作走 `POST /lf/rpc/<actionId>`。

| 方法 | 路径 | 用途 | 分级 |
|---|---|---|---|
| POST | `/lf/rpc/materials.status` | CLI / 程序路径、版本、控制端口、前台文档列表 | read |
| POST | `/lf/rpc/materials.settings.update` | 改 `cliPath` / `appPath` / `controlPort` / 自动监听 / 自动轮询 / 导出目录 | modify |
| POST | `/lf/rpc/materials.projects.list` | 项目列表与 `activeProjectId` | read |
| POST | `/lf/rpc/materials.projects.create` | 新建项目（`name`、`description?`）并设为当前 | modify |
| POST | `/lf/rpc/materials.projects.update` | 改名 / 改描述 / `setActive` | modify |
| POST | `/lf/rpc/materials.projects.delete` | 删项目并清掉其项目级物料数据 | delete |
| POST | `/lf/rpc/materials.files.add` | 把现有 `.vectorcraft` 加入项目（`paths`） | modify |
| POST | `/lf/rpc/materials.files.create` | 调 CLI 新建 A3 横版文件（`title?`、`artboardCount` 1–50）后加入项目 | modify |
| POST | `/lf/rpc/materials.files.remove` | 移除文件引用（不删磁盘文件） | delete |
| POST | `/lf/rpc/materials.files.inspect` | 解析单个文件的画板与物料字段 | read |
| POST | `/lf/rpc/materials.project.inspect` | 解析整个项目 + 前台连接状态 | read |
| POST | `/lf/rpc/materials.pages.updateHeader` | 写入单页信息头并同步到文件（`fields`、`renameArtboard`） | modify |
| POST | `/lf/rpc/materials.pages.add` | 追加一个 A3 横版画板并写入信息头 | modify |
| POST | `/lf/rpc/materials.pages.duplicate` | 复制画板后整文件重排、重编号、重绘信息头 | modify |
| POST | `/lf/rpc/materials.pages.delete` | 删画板（至少保留一个）后重排重编号 | delete |
| POST | `/lf/rpc/materials.pages.reorder` | `fromIndex` → `toIndex` 重排并同步全部序号 | modify |
| POST | `/lf/rpc/materials.pages.normalizeA3` | 把画板尺寸统一为 A3 横版 | modify |
| POST | `/lf/rpc/materials.pages.syncAllHeaders` | 重绘文件内全部画板信息头 | modify |
| POST | `/lf/rpc/materials.vc.open` | 在前台 VectorCraft 打开（可定位画板） | read |
| POST | `/lf/rpc/materials.vc.syncNow` | 立即探测前台状态并重解析 | read |
| POST | `/lf/rpc/materials.export` | 单图 / 多页 PDF 导出 | modify |
| POST | `/lf/rpc/materials.catalog.get` | 默认数据 + 当前项目数据 | read |
| POST | `/lf/rpc/materials.catalog.option.upsert` | 新增 / 编辑快捷字段选项 | modify |
| POST | `/lf/rpc/materials.catalog.option.delete` | 批量删除选项（`ids`） | delete |
| POST | `/lf/rpc/materials.catalog.option.copy` | 默认 ↔ 项目之间复制选项 | modify |
| POST | `/lf/rpc/materials.catalog.template.upsert` | 新增 / 编辑物料模板 | modify |
| POST | `/lf/rpc/materials.catalog.template.delete` | 批量删除模板 | delete |
| POST | `/lf/rpc/materials.catalog.template.copy` | 默认 ↔ 项目之间复制模板 | modify |
| POST | `/lf/rpc/materials.catalog.resetDefaults` | 重置默认选项与模板（不动项目数据） | modify |
| POST | `/lf/rpc/materials.dialog.pickFiles` | 选择 `.vectorcraft` 文件 | read |
| POST | `/lf/rpc/materials.dialog.pickSaveFile` | 选择新建文件保存位置 | read |
| POST | `/lf/rpc/materials.dialog.pickFolder` | 选择导出文件夹 | read |
| POST | `/lf/rpc/materials.files.reveal` | 在资源管理器中定位 | read |
| GET | `/lf/materials/preview?path=&artboard=&ppi=` | 画板 PNG 预览（走缓存） | read |

## 4. 与 VectorCraft 的双通道

**可执行文件发现顺序**（CLI 与程序各一套）：`settings.cliPath` / `settings.appPath` → 环境变量 `VECTORCRAFT_CLI_PATH` / `VECTORCRAFT_APP_PATH` → 固定候选 `C:\Program Files\VectorCraft\vectorcraft-cli.exe`、`C:\Program Files (x86)\VectorCraft\vectorcraft-cli.exe`（app 为同目录下的 `vectorcraft.exe`）→ `where.exe vectorcraft-cli`（非 Windows 用 `which`）。全部落空时，需要 CLI 的动作抛 `404 vectorcraft_cli_not_found`、需要前台程序的动作抛 `404 vectorcraft_app_not_found`；`materials.status` 只是回报 `cliFound: false` / `appFound: false`。

**后台 CLI**（`spawn`，`windowsHide`，整体超时 `60 s` → `504 vectorcraft_timeout`，退出码非 0 → `500 vectorcraft_cli_error` 带 stderr）：

| 场景 | 命令行 |
|---|---|
| 新建文档 | `run --commands -`，stdin 传 `[{command:'file.new',params:{title,width,height,units:'Points',backgroundContents:'white',artboards,artboardLayout:{layout:'row',spacing:20}}},{command:'document.save',params:{path}}]` |
| 批处理 | `run --in <file> --commands -`，stdin 传命令数组，末尾追加 `document.save { path }` |
| 单画板 PNG | `convert <in> <out> --artboard <n> --ppi <36–300>` |
| 单页导出 | `convert <in> <out> --artboard <n>`，栅格格式再加 `--ppi <36–600>` |
| 合并 PDF | `convert <in> <out> --range <1-based 区间串>` |
| 版本 | `--version`（3 s 超时，按路径缓存一次） |

**前台控制通道**：TCP `127.0.0.1:<controlPort>`，默认端口 `7979`；换行分隔的 JSON，请求 `{ id, method, params }`、响应 `{ id, ok, result }` 或 `{ id, ok: false, error }`。

| method | 用途 |
|---|---|
| `ui.inspect` | 探测前台是否在线并列出打开文档（超时 1.2 s） |
| `engine.execute` | 执行单条符号命令，参数 `{ command, params }` |
| `document.activate` / `document.open` / `document.save` / `document.json` | 切文档 / 打开 / 保存 / 读当前文档 JSON |
| `view.goToArtboard` | 定位到指定画板 |

批处理默认 `preferLive: true`：目标文件若已在前台打开就走 TCP 逐条执行（`captureAs` 的 id 从 `result.id` 捕获，`$ref:` 占位符就地还原），否则回落到 CLI；单次 TCP 批处理超时 `15 s`。同一路径的写操作用 `withFileLock`（按小写路径）串行化。

`materials.vc.open`：前台在线就 `document.activate` 或 `document.open`；不在线则 `spawn vectorcraft.exe --control <port> <file>`（detached），然后在 4 s 内每 400 ms 轮询一次以补发 `view.goToArtboard`。

## 5. `.vectorcraft` 解析与写回（`vectorcraft-parser.ts`）

文件是「JSON 文档 + `VCBLOBS` 二进制块」的拼接：`extractVectorCraftJson` 截断到 `VCBLOBS` 标记之前，再取最后一个 `}` 为止解析 JSON。

读取用到的真实字段：

```
document.title                                  → 文档标题
document.artboards[]  { id, name, rect{x0,y0,x1,y1} }
document.layers[]     { id, name, kind{ type, children[] } }
  kind.children[].name                              → 节点名（信息头识别靠它）
  kind.children[].kind.type === 'text' + runs[{text}] → 文本内容
  kind.children[].kind.xf / live.xf / path.subpaths  → 求包围盒（用于判断属于哪个画板）
```

- 信息头图层名：`LF Material Header`（`HEADER_LAYER_NAME`），兼容旧名 `WorkCrate header`。
- 信息头分组名：`LF_MATERIAL_HEADER_<n>`，兼容 `MEDSH_MATERIAL_HEADER_`；在信息头图层内任何 `group` 也视为候选。
- 文本节点名：`LF_PAGE_TITLE` / `LF_PROJECT_NAME` / `LF_MATERIAL_SPEC`，兼容 `MEDSH_PAGE_TITLE` / `MEDSH_PROJECT_NAME` / `MEDSH_FIELDS`。
- 分组归属按「包围盒中心点落在画板矩形内」判定；一个画板内的主分组优先级为 `LF_*` > `MEDSH_*` > 第一个。
- 物料规格行格式：`材质 | 工艺 | 尺寸 | 数量 | 备注`（`formatSpecLine` 用 ` | ` 连接非空项）；反解析 `parseSpecLine` 允许带 `材质:` / `工艺:` / `尺寸:` / `规格:` / `数量:` / `备注:` 前缀并剥离。
- 画板尺寸用 `rect` 差值，`ptToMm` 换算（`72/25.4`）保留一位小数；`isA3LandscapeSize` 容差 `2.5 pt`，即 `1190.55 × 841.89 pt`（420 × 297 mm）。

写回不直接改 JSON，而是生成 VectorCraft 符号命令交给 CLI / 控制通道：`layer.new` 或 `layer.setCurrent`、`shape.rectangle`、`paint.setFill`、`paint.setStroke`、`stroke.set`、`text.create`、`object.setProps`、`object.group`、`edit.clear`、`artboard.new/rename/setProps/duplicate/reorder/rearrange/delete`。`object.group` 的 `id` 用 `$ref:<tag>` 引用前序命令结果，CLI 侧展开为 `$<step>.id`。

## 6. A3 信息头双向同步

`buildHeaderCommandsForArtboard` 的版面（全部相对画板左上角，字体 `Microsoft YaHei`）：

| 元素 | 位置 / 尺寸 | 样式 | 节点名 |
|---|---|---|---|
| 底板 | `x+16, y+16`，宽 `max(120, width-32)`，高 `52`，圆角 6 | 填充 `#EEF4FD`，描边 `#D8E5F4`，线宽 0.75 | `LF_MATERIAL_BAND` |
| 页码徽标 | `x+26, y+28`，`32 × 28`，圆角 4 | 填充 `#FFFFFF`，描边 `#CBD5E1` | `LF_NUMBER_BADGE` |
| 页码 | `x+42, y+46` | 12 pt Bold，居中，`#0F172A` | `LF_PAGE_NUMBER` |
| 标题 | `x+70, y+48` | 18 pt Bold，左对齐，`#0F172A` | `LF_PAGE_TITLE` |
| 项目名（可选） | 标题右侧 `估算字宽 + 12`，`y+47` | 12 pt Regular，文本 `- <项目名>` | `LF_PROJECT_NAME` |
| 规格行 | `x+width-28, y+46` | 13 pt Regular，右对齐 | `LF_MATERIAL_SPEC` |

所有成员最后 `object.group` 成一个分组，命名为 `LF_MATERIAL_HEADER_<画板索引 + 1>` 并 `locked: true`。重绘前先把已有的同画板分组解锁并 `edit.clear`（清空内容后重建），所以重复同步不会叠加图层。

**两向状态判定**（`syncSource`）：

| 值 | 含义 |
|---|---|
| `header` | 文件里的信息头与 sidecar 记录的 `lastRenderedSpecText` / `lastRenderedTitle` 一致 |
| `live-edited` | 信息头存在，但规格行与 sidecar 记录不一致 → 判定为用户在前台 VectorCraft 里改过，字段以文件为准 |
| `sidecar` | 文件里没有信息头，用 sidecar 里存的上次渲染值兜底 |
| `empty` | 都没有，返回空字段与画板名 |

冲突处理即「文件优先」：只要信息头里有文本，`material/craft/size/quantity/note` 一律由 `parseSpecLine` 从文件内容反解；`showProjectName` 与 `projectNameOverride` 先看信息头里的 `- 项目名` 文本，没有才回退 sidecar。写入方向则相反——`pages.updateHeader` 先按当前文件状态算出命令，再 `bridge.runBatchOnFile(..., { save: true })`，最后用同一份 `fields` 覆盖 sidecar（`lastRenderedSpecText` / `lastRenderedTitle` / `updatedAt`），保证下一次解析落在 `header` 分支。

序号统一由 `formatPageNumber(index)` 生成：`Math.max(0, index) + 1` 后 `padStart(2, '0')`，即 `01`、`02`…；`duplicate` / `delete` / `reorder` / `normalizeA3` 之后都会调 `syncAllHeadersInFile` 重排并重绘，因此页码跟着画板顺序自动更新。

## 7. 导出（`materials.export`）

请求 `ExportRequestSchema`：`projectId`、`items[{ fileId, artboardIndex }]`、`format`（`png` / `jpg` / `webp` / `svg` / `pdf-merged` / `pdf-separate`）、`outputDir`、`ppi`（默认 `150`，36–600）、`mergedPdfFileName`、`revealAfterExport`（默认 `true`）。

- 逐项校验文件存在与画板索引有效，否则 `404`。
- `pdf-merged`：按源文件分组，索引升序去重后压成 `1-3,5` 形式的 `--range`；文件名默认 `<源文件名>_物料合并.pdf`，给了 `mergedPdfFileName` 则用它（多文件时追加 `_<源文件名>`）。
- 其它格式：每页一个文件，名 `[<源文件名>_]<页码>_<标题>.ext`；文件名清洗去掉 `<>:"/\|?*` 与控制字符、空白折叠、截到 64 字符；同名已存在则追加 `-2`、`-3`。
- 成功后回写 `settings.defaultExportDir = outputDir`，并在 `revealAfterExport` 为真时定位第一个产物。

## 8. 文件监听与预览

`watcher.ts` 的两条链路：

- **文件监听**：按「文件所在目录」建 `fs.watch`（对 `realpath` 后的目录），只关心被跟踪文件名的变化；命中后 `300 ms` 防抖再 `emitInvalidate('materials', <path>)`。自写保护窗口 `1800 ms`（`markSelfWrite`），避免 CLI / 控制通道写盘被当成外部修改。
- **前台轮询**：每 `2500 ms` 调一次 `probeLiveControl()`，把 `connected` / `activePath` / 每个文档的 `path,dirty,title` 序列化成摘要；摘要变化（且不是首轮）时 `emitInvalidate('materials', activePath)`。

开关状态来自设置：`autoWatchFiles` 关掉即关闭全部 watcher，`autoPollLiveControl` 关掉即跳过轮询。`refreshWatches()` 在项目 / 文件 / 设置变化后重建监听表。

`/lf/materials/preview?path=&artboard=&ppi=`：`ppi` 先夹到 `48–200`（缺省 `72`），缓存键 `sha256(<小写路径>|<size>|<mtime>|<artboard>|<ppi>)`，文件在 `cache/previews/<hash>.png`；渲染并发上限 `2`，同一键共享 in-flight 任务，落盘走「临时文件 → `rename`」；ETag 为 `"vc-prev-<size>-<mtime>-<artboard>-<ppi>"`。淘汰延迟 `3 s` 合并执行，按 `mtime` 从旧到新删到 `500` 个文件 / `150 MB` 以内。渲染失败返回 `500 preview_render_failed`。

## 9. 数据与目录

根为 `%LOCALAPPDATA%\LocalFolio\plugins\workspace-materials-host\`（可用 `LOCALFOLIO_DATA_DIR` 重定向）：

| 文件 | schema | 说明 |
|---|---|---|
| `data/settings.json` | `MaterialsSettingsSchema` | `cliPath` / `appPath` / `controlPort`（默认 7979）/ `autoWatchFiles` / `autoPollLiveControl` / `defaultExportDir` |
| `data/projects.json` | `ProjectsStateSchema` | `{ version: 1, activeProjectId, projects[] }`，每个项目含 `files[{ id, path, name, addedAt }]` |
| `data/catalog.json` | `CatalogStateSchema` | `defaultOptions[]` / `defaultTemplates[]` / `projectData: Record<projectId, { options, templates }>` |
| `data/page-meta.json` | `PageMetaStateSchema` | `files: Record<小写路径, Record<artboardKey, PageSidecarEntry>>` |
| `cache/previews/` | — | 画板预览 PNG 缓存 |

- id 前缀：项目 `proj-`、文件引用 `vcfile-`、默认选项 `opt-`、项目选项 `popt-`、默认模板 `tpl-`、项目模板 `ptpl-`，均接 8 位 UUID 片段。
- sidecar 的 `artboardKey` 为 `id:<画板 id>`（缺失 `id` 时用序号 + 1），每项存 `fields`、`lastRenderedSpecText`、`lastRenderedTitle`、`updatedAt`。
- 选项按 `(category, value)` 天然去重（未给 `id` 时按这两列匹配后原地更新），`sortOrder` 缺省追加到末尾；改 `scope` 与 `projectId` 的组合决定写进哪一侧，`project` 作用域缺 `projectId` 直接 `400 project_required`。
- 内置种子数据：50 条默认选项（标题 8、材质 10、工艺 8、尺寸 9、数量 8、备注 7）+ 8 个默认模板，`createdAt/updatedAt` 固定为 `1760000000000`；`resetDefaults` 只还原这两张表，项目数据原样保留。

## 10. 限制与边界

- 全部能力依赖本地已安装的 VectorCraft；CLI 与前台程序都找不到时，只有读取类动作能工作（预览与写回都会 `404`）。
- 信息头识别依赖节点命名约定（`LF Material Header` 图层、`LF_MATERIAL_HEADER_*` 分组、`LF_*` 文本名）。用户在前台改名后该画板会被当作「没有信息头」，走 `sidecar` 兜底。
- 控制端口以设置里的 `controlPort` 为准：已经跑起来的前台程序仍监听旧端口，改完设置要么重启它，要么让 `materials.vc.open` 用新端口重新拉起。
- `.vectorcraft` 里的 `VCBLOBS` 后段不解析；写回一律经由 VectorCraft 自己保存，Host 不直接改写该文件的字节。
- 预览渲染串行度为 2，批量导出走 CLI 也是逐个执行；大文件多页导出耗时正比于页数。
- 三个文件 / 文件夹选择框仅 Windows 生效，其它平台返回 `{ supported: false }`；资源管理器定位跨平台（Windows `explorer.exe`、macOS `open -R`、Linux `xdg-open`）。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```
