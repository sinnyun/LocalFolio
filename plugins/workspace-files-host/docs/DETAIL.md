# @folio/workspace-files-host · 文件浏览器后端

文件浏览器工作区的 Host 侧能力。它**不画任何界面**：`@folio/workspace-files-ui` 负责四区布局、栏位、工具栏与交互，本插件负责所有要接触磁盘和 Windows Shell 的部分——列目录、驱动器容量、文件分类与详情、系统缩略图、媒体流、标签 / 收藏持久化、资源管理器定位。

## 1. 它做什么

| 能力 | 落在哪个文件 | 对外形态 |
|---|---|---|
| 列目录、懒加载子目录、文件树 | `fs-ops.ts` | `files.list` / `files.tree` |
| 文件详情、图片尺寸、文本片段、预览 URL | `fs-ops.ts` + `classify.ts` | `files.inspect` |
| 驱动器枚举与容量、标准快捷文件夹 | `drives.ts` | `files.roots` |
| 文件夹收藏夹与分组 | `favorites.ts` | `files.favorites.*` |
| 文件星级 / 标签 / 备注索引 | `metadata.ts` | `files.meta.*` / `files.tags.*` |
| Windows 系统缩略图（`IShellItemImageFactory`） | `win-thumb.ts` | `GET /lf/files/thumb` |
| 媒体流（Range）与整文件下载 | `media-route.ts` | `GET /lf/files/media`、`/lf/files/download` |
| 在系统资源管理器中定位 | `fs-ops.ts` | `files.reveal` |

Host **不写文件内容、不做缩略图缓存**：缩略图与图标缓存全部交给 Windows Shell 自己维护。

## 2. 注册

```ts
export const inject = ['folioRuntime', 'folioStorage'] as const

export function apply(ctx: Context): void {
  ctx.effect(
    () => registerWorkspaceFilesHost({ runtime: ctx.folioRuntime, storage: ctx.folioStorage }),
    'workspace-files-host: actions + thumb/media routes',
  )
}
```

`registerWorkspaceFilesHost({ runtime, storage, thumbProvider? })` 返回总 disposer：按注册逆序注销 21 个动作与 3 条路由，并在自己创建了缩略图提供者时一并 `dispose()`。`thumbProvider` 可注入（测试用的桩实现），传入后调用方持有其生命周期。

## 3. 动作与路由

动作一律以 `POST /lf/rpc/<actionId>` 调用（`/lf` 为 `folioRuntime.routePrefix` 默认值）；路由以 `GET` 注册，`HEAD` 请求由运行时回落到同名 `GET`。

| 方法 | 路径 | 用途 | 分级 |
|---|---|---|---|
| POST | `/lf/rpc/files.roots` | 快捷文件夹 + 驱动器 + `homePath` / `platform` / `pinnedFolders` | read |
| POST | `/lf/rpc/files.list` | 列目录（`path?`、`showHidden?`、`includeSubdirChildren?`） | read |
| POST | `/lf/rpc/files.tree` | 单层子目录树（`path` 必填，含 `hasSubdirs`） | read |
| POST | `/lf/rpc/files.inspect` | 文件 / 目录详情、图片尺寸、文本片段、`mediaUrl` / `thumbUrl` | read |
| POST | `/lf/rpc/files.reveal` | 在资源管理器中打开或选中 | read |
| POST | `/lf/rpc/files.prefs.pin` | 固定快捷文件夹 | modify |
| POST | `/lf/rpc/files.prefs.unpin` | 取消固定快捷文件夹 | modify |
| POST | `/lf/rpc/files.favorites.get` | 读取收藏夹与分组 | read |
| POST | `/lf/rpc/files.favorites.add` | 加入收藏（`path`、`name?`、`groupId?`） | modify |
| POST | `/lf/rpc/files.favorites.update` | 改名 / 移动分组 / 排序 | modify |
| POST | `/lf/rpc/files.favorites.remove` | 按 `id` 或 `path` 移除 | delete |
| POST | `/lf/rpc/files.favorites.group.create` | 新建分组（`name`、`color?`） | modify |
| POST | `/lf/rpc/files.favorites.group.update` | 分组改名 / 改色 / 排序 | modify |
| POST | `/lf/rpc/files.favorites.group.delete` | 删分组（`mode`: `move-to-default` \| `delete-items`） | delete |
| POST | `/lf/rpc/files.meta.get` | 标签、文件记录与 `tagCounts` 快照 | read |
| POST | `/lf/rpc/files.meta.set` | 设置 `rating` / `tagIds` / `note` | modify |
| POST | `/lf/rpc/files.meta.pruneMissing` | 批量清理失效记录（`paths`） | delete |
| POST | `/lf/rpc/files.tags.create` | 新建标签（重名 409） | modify |
| POST | `/lf/rpc/files.tags.update` | 改标签名 / 色 / 描述 | modify |
| POST | `/lf/rpc/files.tags.delete` | 删标签并级联清理记录 | delete |
| POST | `/lf/rpc/files.tags.files` | 聚合标签下的现存文件与 `missingPaths` | read |
| GET | `/lf/files/thumb?path=&size=&fallback=` | Windows 系统缩略图（PNG 或 204 / 304） | read |
| GET | `/lf/files/media?path=` | 图片 / 音视频流，支持 `Range` | read |
| GET | `/lf/files/download?path=` | 整文件下载（附件头） | read |

写操作后统一 `runtime.events.emitInvalidate('files', <路径或 id>)`；失效作用域取动作 id 第一个点之前的部分（`files`），因此界面侧的 `files.*` 查询会自动重取。

## 4. 列目录、树与详情

`files.list` 未给 `path` 时用 `os.homedir()`。入口先 `stat` 判目录，再 `readdir(withFileTypes)`，随后按 **32 个一批**（`STAT_BATCH_SIZE`）并发 `lstat` 组装条目：

- 隐藏判定只看文件名是否以 `.` 开头（`isHiddenName`），`showHidden=false` 时在 `readdir` 之后过滤。
- 符号链接先 `lstat` 再 `stat`：能解析就采用目标的 `isDir` / `size` / `mtime`，断链则保留链接自身信息。
- 目录 `size` 归零；`mtimeMs` 用 `mtime`，`ctimeMs` 取 `birthtimeMs || ctimeMs`。
- 单目录上限 `MAX_DIR_ENTRIES = 5000`，超出时截断并置 `truncated: true`，`totalEntries` 仍是过滤后的真实数量。
- `includeSubdirChildren` 时按名称自然序取前 `MAX_SUBDIR_GROUPS = 40` 个子目录，每个最多 `MAX_SUBDIR_CHILDREN = 100` 条子项装进 `childGroups`，供界面「父子文件夹」分组直接用。
- 返回值还带 `parentPath`（到盘根为 `null`）与 `breadcrumbs`（盘根显示为 `C:`）。

`files.tree` 只返回子目录节点，`hasSubdirs` 由 `opendir` 提前探测（命中首个可见子目录即返回），界面据此决定是否显示展开箭头，避免一次拉全树。

`files.inspect` 在条目基础上补：`realpath` 解析结果、`W_OK` 探测出的 `readonly`、目录的子项 / 子目录 / 文件计数（扫描上限 `INSPECT_DIR_SCAN_CAP = 10000`）、图片像素尺寸、前 `TEXT_PREVIEW_BYTES = 8192` 字节文本片段（含 `\0` 即判定为二进制而放弃），并生成带版本号的预览 URL：

```
/lf/files/media?path=<encoded>&v=<mtime 取整>
/lf/files/thumb?path=<encoded>&size=512&v=<mtime 取整>
```

## 5. 文件分类规则（`classify.ts`）

分类是纯扩展名查表（`EXT_MAP`，小写扩展名），不看文件头：

| 类别 | 扩展名 |
|---|---|
| `image` | `.png .jpg .jpeg .jfif .webp .gif .bmp .ico .avif .svg .tif .tiff .heic .heif .psd` |
| `video` | `.mp4 .m4v .webm .mov .mkv .avi .wmv .flv` |
| `audio` | `.mp3 .wav .ogg .flac .m4a .aac .wma` |
| `document` | `.pdf .doc .docx .xls .xlsx .ppt .pptx .txt .md .mdx .rtf .csv .log` |
| `code` | `.ts .tsx .js .jsx .mjs .cjs .json .jsonc .yaml .yml .toml .xml .html .htm .css .scss .py .rs .go .java .c .cpp .h .cs .sh .ps1 .sql .ini .env` |
| `archive` | `.zip .rar .7z .tar .gz .bz2 .xz` |

- 目录恒为 `folder` + `inode/directory`。
- 表外扩展名为 `other` + `application/octet-stream`。
- `thumbSupported` 由独立的 `WINDOWS_THUMB_EXTS` 判定，比 `image` 多：全部 15 个图片扩展名 + 视频容器（`.mp4 .m4v .webm .mov .mkv .avi .wmv`，不含 `.flv`）+ `.pdf` 与 Office 文档 + `.exe` / `.lnk`（后两者仍归 `other`）。音频、代码与压缩包即使有系统图标也返回 `false`。
- 文本预览白名单 `TEXT_PREVIEW_EXTS` 在 `code` + 文本类 `document` 基础上含 `.svg`。
- 可流式播放白名单 `STREAMABLE_MEDIA_EXTS` 不含 `.tif/.heic/.psd/.mkv/.avi` 等浏览器解不了的格式。
- 路径规范化 `normalizeBrowsePath`：`C:` → `C:\`，盘符统一大写，其余走 `path.resolve`。

图片尺寸靠读文件头 64 KB 解析，支持 PNG（IHDR）、JPEG（SOFn）、GIF87a/89a、WebP（VP8 / VP8L / VP8X）、BMP 与 SVG（`width`/`height` 或 `viewBox`），其余格式返回 `null`。

## 6. 驱动器与快捷文件夹（`drives.ts`）

Windows 下并发探测 A–Z 全部盘符，用 `fsp.statfs` 的 `bsize × blocks` / `bsize × bavail` 算总容量与可用容量；卷标来自一次 PowerShell `Get-CimInstance Win32_LogicalDisk`（`-NoProfile -NonInteractive`，2.5 s 超时），结果按 `DeviceID` 缓存 **30 秒**，超时或失败就只用盘符命名。`DriveType` 2 映射 `removable`、4 映射 `network`、其余 `fixed`。非 Windows 平台固定给 `/`（`kind: 'root'`）再加 `/Volumes`（macOS）或 `/mnt`（Linux）下的挂载目录。

标准快捷文件夹按 `home` / `desktop` / `documents` / `downloads` / `pictures` / `videos` / `music` 逐项 `stat` 探测，只保留真实存在的；随后追加 `preferences.json` 里的 `pinnedFolders`（去重、不可访问则跳过），`id` 形如 `pin:<绝对路径>`、`kind: 'pinned'`。

## 7. Windows 系统缩略图（`win-thumb.ts`）

长驻 PowerShell 工作进程池：`powershell.exe -NoProfile -NonInteractive -STA -EncodedCommand <base64(UTF-16LE 脚本)>`，脚本内 `Add-Type` 现场编译 C#，通过 COM 接口 `IShellItemImageFactory`（`{bcc18b79-ba16-442f-80c4-8a59c30c463b}`）的 `GetImage(SIZE, flags, out HBITMAP)` 拿系统缩略图：

```
请求行(JSON) → stdin → GetImage → GDI GetDIBits → System.Drawing.Bitmap → PNG → base64 → stdout
```

- flags：`SIIGBF_BIGGERSIZEOK (0x1)`，默认再并上 `SIIGBF_THUMBNAILONLY (0x8)`；只有请求带 `fallback=icon` 时才放开图标回退。
- 池容量 `MAX_WORKERS = 2`，单请求超时 `REQUEST_TIMEOUT_MS = 6000`（超时即销毁该 worker），空闲 `IDLE_SHUTDOWN_MS = 60000` 自动回收。
- 尺寸在 provider 内夹到 `32–512`；路由再吸附到 `96 / 160 / 256 / 512` 四档桶，保证缓存命中。
- 非 Windows 平台换成 no-op provider，`getThumbnail` 恒返回 `null`。
- 没有任何磁盘缓存：命中与失效都交给 Windows 的缩略图 / 图标缓存。

路由语义：`ETag` 为 `W/"thumb-<size>-<mtime>-<bucket>-<0|1>"`，带 `If-None-Match` 命中返回 `304`；Shell 不给图（如 `.md`）返回 `204 No Content`（`cache-control: private, max-age=60`）；成功返回 `image/png` + `private, max-age=300`。

## 8. 媒体流与下载（`media-route.ts`）

`/lf/files/media` 只服务 `STREAMABLE_MEDIA_EXTS` 内的普通文件（否则 `415`），图片超过 `50 MB` 直接 `413`：

- `Accept-Ranges: bytes`，单段 `Range: bytes=start-end`（也支持开区间）返回 `206` + `Content-Range: bytes s-e/total`；格式非法或越界返回 `416` + `Content-Range: bytes */total`。
- 无 `Range` 返回 `200` 全量流（`fs.createReadStream` 转 Web `ReadableStream`，不整块读进内存）。
- `HEAD` 只回头部。`ETag` 为 `"media-<size>-<mtime>"`，`Cache-Control: private, max-age=300`。
- `.svg` 额外加 `Content-Security-Policy: sandbox`，所有响应带 `X-Content-Type-Options: nosniff`。

`/lf/files/download` 面向任意类型普通文件，上限 `100 MB`，`Content-Disposition: attachment; filename*=UTF-8''<encoded>`，`Cache-Control: private, no-store`，`.svg/.html/.htm` 同样加 `sandbox` CSP。

## 9. 数据与目录

存储用 `folioStorage.forPlugin('workspace-files-host')`，根为 `%LOCALAPPDATA%\LocalFolio\plugins\workspace-files-host\`（Linux/macOS 为 `$XDG_DATA_HOME/LocalFolio/`，可用 `LOCALFOLIO_DATA_DIR` 整体重定向）：

| 文件（`data/` 下） | schema | 默认值 |
|---|---|---|
| `preferences.json` | `FilesPrefsSchema` — `pinnedFolders: string[]` | `{ pinnedFolders: [] }` |
| `favorites.json` | `FavoritesStateSchema` — `version: 1`、`groups[]`、`items[]` | 单个分组 `default` / 「常用收藏」/ `#3b82f6` |
| `metadata.json` | `MetadataStateSchema` — `version: 1`、`tags[]`、`files: Record<key, FileMetaRecord>` | `{ tags: [], files: {} }` |

- 收藏项 id 为 `fav_<12 hex>`，分组 id 为 `grp_<12 hex>`；`default` 分组不可删除，删除其它分组时按 `mode` 把条目迁回 `default` 或一并删除。
- 每次读取都会跑 `normalizeFavoritesState`：补默认分组、把指向失效分组的条目归入 `default`、按 `order` 重排序号。
- 文件记录主键 `toMetaKey()` = 规范化路径再 `toLowerCase()`；`rating`、`tagIds`、`note` 全空时该记录被删除而不是留空。标签 id 为 `tag_<12 hex>`。
- `files.tags.files` 逐条 `stat` 已存路径，读得到进 `entries`，读不到进 `missingPaths`，供界面提示并调用 `files.meta.pruneMissing` 清理。

## 10. 限制与边界

- **没有访问白名单**：路径只做规范化（`path.resolve` + 盘符大写），不限制目录范围，也不存在「工作区根目录」。凡是 Host 进程账号读得到的路径都能列、能流、能下载；相对路径会相对 Host 进程的工作目录解析，因此界面侧始终传绝对路径。
- 缩略图、媒体流、下载三条路由同样不校验路径来源，只依赖底层的进程级访问控制。
- 缩略图仅 Windows 可用；其它平台一律 `204`，界面回退到自己的类型图标。
- 不碰用户文件：所有写操作只落在插件自己的 JSON 存储（`preferences.json` / `favorites.json` / `metadata.json`）；`files.reveal`、`files.list`、`files.inspect` 全程只读，插件不会复制、移动、重命名或删除用户文件。
- 大目录策略是「截断 + 提示」（`truncated`），不是分页；`files.tree` 每次只取一层。
- `files.reveal` 会 `spawn` 外部 `explorer.exe`（macOS `open`、Linux `xdg-open`）并 `detached + unref`，只在 spawn 成功时视为完成。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```
