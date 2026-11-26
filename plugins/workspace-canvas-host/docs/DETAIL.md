# @folio/workspace-canvas-host · 画板工作区后端

无限画板工作区的 Host 侧能力。它**不画任何界面**：`@folio/workspace-canvas-ui` 负责四区布局、tldraw 画布、缩放与链接管理面板，本插件负责画板文档落盘、本地图片链接的检查与重定位、分层 LOD 代理图渲染与缓存、浏览器拖入图片的分块导入、原生文件对话框，以及 `@tldraw/assets` 的本地托管（全程无 CDN）。

## 1. 它做什么

| 能力 | 落在哪个文件 | 对外形态 |
|---|---|---|
| 画板索引与文档持久化 | `boards.ts` | `canvas.boards.*` |
| 图片链接检查、批量重定位、链接信息 | `image-meta.ts` | `canvas.links.inspect` / `check` / `relocateInFolder` |
| 浏览器拖入 / 粘贴图片分块导入 | `drop-import.ts` | `canvas.links.import*` |
| 四档 LOD 代理渲染 + 磁盘缓存 | `image-proxy.ts` | `GET /lf/canvas/proxy`、`canvas.cache.*` |
| tldraw 字体 / 图标 / 语言包托管 | `tldraw-assets-route.ts` | `GET /lf/canvas/tldraw-asset` |
| 原生文件 / 文件夹对话框与本地浏览 | `win-dialog.ts` | `canvas.dialog.*` / `canvas.fs.*` |

## 2. 注册

```ts
export const inject = ['folioRuntime', 'folioStorage'] as const
```

`registerWorkspaceCanvasHost({ runtime, storage, proxyProvider?, dialogProvider?, tldrawAssetsRoot? })` 返回总 disposer：注销 21 个动作与 2 条路由、`dropImports.dispose()`、并在自建代理提供者时 `dispose()`。三个依赖均可注入（测试用桩），`tldrawAssetsRoot` 不传时用 `require.resolve('@tldraw/assets/package.json')` 的目录。

## 3. 动作与路由

动作走 `POST /lf/rpc/<actionId>`，路由以 `GET` 注册（`HEAD` 由运行时回落到 `GET`）。

| 方法 | 路径 | 用途 | 分级 |
|---|---|---|---|
| POST | `/lf/rpc/canvas.boards.list` | 画板列表（按 `updatedAt` 倒序） | read |
| POST | `/lf/rpc/canvas.boards.get` | 读取画板快照（`id`） | read |
| POST | `/lf/rpc/canvas.boards.create` | 新建画板（`title?`） | modify |
| POST | `/lf/rpc/canvas.boards.rename` | 重命名（`id`、`title`） | modify |
| POST | `/lf/rpc/canvas.boards.duplicate` | 复制画板（`id`） | modify |
| POST | `/lf/rpc/canvas.boards.delete` | 删除画板（`id`） | delete |
| POST | `/lf/rpc/canvas.boards.save` | 保存快照（`id`、`snapshot`、`brokenCount?`） | modify |
| POST | `/lf/rpc/canvas.links.inspect` | 批量读取链接图（`paths`）尺寸与链接信息 | read |
| POST | `/lf/rpc/canvas.links.check` | 轻量检查存在性 / 大小 / mtime（`paths`） | read |
| POST | `/lf/rpc/canvas.links.relocateInFolder` | 在文件夹内按文件名 + 大小匹配已移动图片 | read |
| POST | `/lf/rpc/canvas.links.reveal` | 在资源管理器中定位链接图片 | read |
| POST | `/lf/rpc/canvas.links.importBegin` | 开启导入会话（`fileName`、`mime?`、`size?`） | modify |
| POST | `/lf/rpc/canvas.links.importChunk` | 追加 base64 分片（`importId`、`data` ≤ 1 500 000 字符） | modify |
| POST | `/lf/rpc/canvas.links.importFinish` | 落盘并返回可建链接的图片信息 | modify |
| POST | `/lf/rpc/canvas.links.importAbort` | 取消导入并删除临时文件 | modify |
| POST | `/lf/rpc/canvas.dialog.pickImages` | 系统图片选择框（`multi?`、`initialDir?`） | read |
| POST | `/lf/rpc/canvas.dialog.pickFolder` | 系统文件夹选择框（`initialDir?`） | read |
| POST | `/lf/rpc/canvas.fs.roots` | 快捷文件夹 + 驱动器 | read |
| POST | `/lf/rpc/canvas.fs.list` | 列子目录与图片（`path?`、`showHidden?`） | read |
| POST | `/lf/rpc/canvas.cache.stats` | LOD 缓存统计 | read |
| POST | `/lf/rpc/canvas.cache.clear` | 清空 LOD 缓存（重建空目录） | delete |
| GET | `/lf/canvas/proxy?path=&tier=` | 分层 LOD 代理图（404 表示链接失效） | read |
| GET | `/lf/canvas/tldraw-asset?f=` | 本地静态资源 | read |

画板的增删改与重命名后 `emitInvalidate('canvas', <boardId>)`；`canvas.boards.save`、链接检查、导入与缓存类动作不发失效事件，由调用方自行刷新。

## 4. 画板文档持久化（`boards.ts`）

- 索引：`data/boards.json`，`BoardIndexStateSchema` = `{ version: 1, boards: BoardMeta[] }`；`BoardMeta` = `{ id, title, createdAt, updatedAt, imageCount, brokenCount }`。
- 文档：`data/boards/<boardId>.json`，`BoardDocumentSchema` = `{ version: 1, id, snapshot, updatedAt }`，写入时 `JSON.stringify(doc, null, 2)` 并重新过 schema。
- `boardId` 必须匹配 `^[a-zA-Z0-9_-]+$`，否则抛 `400 invalid_board_id`（挡掉 `..` 与路径分隔符），新建 id 为 `board-<12 hex>`。
- 空快照结构与 tldraw 5.x 一致：`document.store = {}`、`document.schema = { schemaVersion: 2, sequences: {} }`、`session` 含 `currentPageId: 'page:page'`、`pageStates[0]`（`camera {x:0,y:0,z:1}`、`selectedShapeIds: []`、`focusedGroupId: null`）。
- `list()` / `get()` / `create()` / `duplicate()` / `remove()` 前都先 `ensureAtLeastOneBoard()`：索引为空时自动写入「默认画板」并把文档落盘，所以永远至少一块画板。
- `create` 未给标题时命名 `未命名画板 <n+1>`；`duplicate` 复制文档快照并命名 `<原标题> 副本`；`remove` 删文档文件（失败忽略）后重写索引并再次 `ensureAtLeastOneBoard()`。
- `save` 返回 `{ meta, updatedAt, strippedInlineCount }`；`brokenCount` 未传时沿用旧值。

## 5. 纯链接不变量

`save` 与 `get` 都会跑 `sanitizeBoardSnapshot`：遍历 `document.store` 与顶层 `store` 中所有 `typeName === 'asset' && type === 'image'` 的记录——

- `props.src` 以 `data:` 开头 → 置空并计入 `strippedInlineCount`（base64 永不落盘）；
- `props.src` 以 `folio-link://v1/` 开头 → 改写为 `asset:folio-link/v1/...`（tldraw 资源协议）；
- `meta.folioLink` 存在或 `src` 带 `asset:folio-link/` / `folio-link://` 前缀的计为一张链接图，汇总成索引里的 `imageCount`。

## 6. 链接检查与批量重定位（`image-meta.ts`）

- `normalizeLocalPath` 会去掉首尾引号、把 `file://` URL 还原成磁盘路径、`C:` 补 `\\`、盘符大写。
- 支持的图片扩展名（`IMAGE_EXT_MAP`）：`.png .jpg .jpeg .jfif .webp .gif .bmp .ico .avif .svg .tif .tiff .heic .heif .psd`。
- `inspectLinkedImage` 返回 `{ path, exists, fileName, ext, mime, size, mtimeMs, naturalWidth, naturalHeight, isImage }`；像素尺寸靠读文件头（同 `classify.ts` 的 PNG / JPEG / GIF / WebP / BMP / SVG 解析）。
- `checkLinkedImages` 先去重再按 32 个一批并发 `stat`，只回 `{ path, exists, size, mtimeMs }`。
- `relocateMissingImagesInFolder(folderPath, missingItems)`：BFS 扫描最多两层子目录、累计 `5000` 个文件、跳过 `.` 开头条目；以「小写文件名」建索引，同名的多个候选里优先 `size === expectedSize` 的那个，命中即回 `{ linkId, inspected }`。

## 7. 分层 LOD 代理（`image-proxy.ts`）

| 项 | 值 |
|---|---|
| 档位 `LOD_TIERS` | `256 / 512 / 1024 / 2048` |
| `snapLodTier` | 先夹到 `64–2048`，向上取最近档位 |
| 首选解码 | Windows WIC `BitmapDecoder` + `BitmapImage`，按目标尺寸直接解码：长边 ≥ 短边时设 `DecodePixelWidth = min(tier, 原始长边)`，否则 `DecodePixelHeight` |
| 编码 | 默认 JPEG `QualityLevel = 85`；源为 `.png/.webp/.gif/.ico/.svg`（`ALPHA_EXTS`）时改用 PNG 保透明 |
| 回退 | WIC 解不了就调 `IShellItemImageFactory.GetImage`，`flags = 9`（`SIIGBF_BIGGERSIZEOK` 加 `SIIGBF_THUMBNAILONLY`），尺寸夹到 `64–512` |
| 工作进程 | `powershell.exe -STA -EncodedCommand`，池 `2` 个，单请求超时 `12 s`，空闲 `60 s` 回收；连续 2 次「启动即退出」后清空队列并返回失败 |

路由行为：`tier` 缺省 `512`；ETag 为 `"lod-<size>-<mtime>-<tier>"`（`If-None-Match` 命中 → `304`），成功响应带 `x-folio-lod-tier` 与 `x-folio-link-status: ok`。文件不存在时**不抛错**，返回 `404` + JSON `{ ok: false, error: { code: 'link_missing', ... } }` 与 `x-folio-link-status: missing`，界面据此渲染断链占位图。≤ `2 MB` 的 `.svg` 直接原文输出并附 `Content-Security-Policy: sandbox`；非图片扩展名 `415`，非文件 `400`。

## 8. 缓存

- 目录：`cache/lod/`；键 = `sha256(<小写路径>|<size>|<截断 mtime>|<tier>)`，文件名 `<hash>.jpg` 或 `<hash>.png`。
- 命中顺序先 `.jpg` 再 `.png`；未命中时同一 hash 的并发请求共享一个 in-flight Promise，避免重复解码。
- 落盘走「临时文件 → `rename`」，临时名带 `process.pid` 与时间戳；写失败只删临时文件，不影响本次响应。
- 淘汰：`MAX_CACHE_FILES = 1500` 或 `MAX_CACHE_BYTES = 256 MB` 任一超标即触发，延迟 `500 ms` 合并执行，按 `atimeMs`（缺失时退回 `mtimeMs`）从旧到新删除，直到双指标都不超。
- 所有 200 / 304 响应都是 `private, max-age=31536000, immutable`；`canvas.cache.stats` 读回 `{ fileCount, totalBytes, maxBytes, maxFiles, tiers }`，`canvas.cache.clear` 删除整目录后重建并返回统计。

## 9. 浏览器拖入 / 粘贴导入（`drop-import.ts`）

浏览器 `drop` / `paste` 拿不到磁盘路径，所以由界面把字节分块送进来：

- `IMPORT_CHUNK_BYTES = 1 MB`、`MAX_IMPORT_BYTES = 128 MB`、会话空闲 `10 分钟` 过期。
- `begin`：清洗文件名（保留可识别的图片扩展名，无扩展名时按 MIME 反查；`con/prn/aux/nul/com1-9/lpt1-9` 加 `_` 前缀；控制字符与 `<>:"/\|?*` 换成 `_`；截断到 120 字符），超限 `413`，非图片 `400`，然后在 `data/imports/.staging/<uuid>.part` 建文件并返回 `{ importId, chunkBytes, maxBytes }`。
- `append`：`data` 上限 `chunkBytes` 折算的 base64 长度，超限 `413 chunk_too_large`；写入按会话队列串行，累计超 `maxBytes` 时 `413 file_too_large`。
- `finish`：关闭会话 → `rename` 到 `data/imports/<name>`（同名自动加 ` (2)`、` (3)`…），再 `inspectLinkedImage` 校验；不是图片就删掉并报 `400`。
- `abort` / `dispose` 会关闭句柄并删除 `.part`；启动时清理超过 TTL 的残留 `.part`。
- 桌面端能直接拿到原路径时不走这条链路，不复制文件。

## 10. `@tldraw/assets` 本地托管与对话框

`/lf/canvas/tldraw-asset?f=<相对路径>`：拒绝绝对路径、含 `\0`、含 `..` 或空段的路径，`path.resolve` 后再用 `path.relative(root, full)` 复核一次越界；MIME 表覆盖 `.svg .woff2 .woff .json .png .css`，其余落 `application/octet-stream`，响应 `immutable`。这样字体、图标、`translations/zh-cn.json` 全部走本机，不产生外部 CDN 请求。

`win-dialog.ts` 用 `powershell.exe -STA` 起 WinForms：隐藏的 1×1 owner 窗体置于 `(-32000, -32000)` 并 `TopMost`，避免对话框跑到主窗口后面；图片框过滤器列全部受支持扩展名，选中结果逐条 `normalizeLocalPath`。文件夹框关闭「新建文件夹」按钮（`ShowNewFolderButton = $false`）。非 Windows 一律返回 `{ supported: false, cancelled: false }`。`canvas.fs.roots` 返回 5 个标准目录 + 驱动器（`[System.IO.DriveInfo]::GetDrives()`，3 s 超时，失败回退探测 `C:`–`H:`）；`canvas.fs.list` 只回子目录与图片，上限 `1200` 条，超限置 `truncated`。

## 11. 数据与目录

根为 `%LOCALAPPDATA%\LocalFolio\plugins\workspace-canvas-host\`（可用 `LOCALFOLIO_DATA_DIR` 重定向）：

| 路径 | 内容 |
|---|---|
| `data/boards.json` | 画板索引（`version: 1`） |
| `data/boards/<id>.json` | 单块画板文档（`version: 1`） |
| `data/imports/` | 拖入图片的落盘目录 |
| `data/imports/.staging/` | 分块导入的 `.part` 临时文件 |
| `cache/lod/` | LOD 代理图缓存（`.jpg` / `.png`） |

## 12. 限制与边界

- 画板里**只有本地文件绝对路径**，不托管、不复制用户原图；原图被移动或删除时只能报 `link_missing` 并提供重选。
- LOD 缓存是纯派生数据，删掉只会重新解码；`atimeMs` 在禁用「最后访问时间」的 NTFS 卷上可能不更新，此时淘汰顺序近似 `mtime`。
- WIC / Shell 解码只在 Windows 与 PowerShell 可用时生效；其它平台拿到 no-op 提供者，代理路由返回 `500 proxy_render_failed`。
- 拖入导入有 `128 MB` 上限与 `1 MB` 单块上限，超大图会先被界面拒绝；导入目录不会自动清理成功落盘的文件。
- `canvas.links.*` 与对话框动作会把任意绝对路径交给系统或读其元信息，没有目录白名单，权限取决于 Host 进程账号。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```
