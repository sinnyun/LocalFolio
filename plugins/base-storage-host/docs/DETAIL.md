# @folio/base-storage-host · 基础存储能力

工作台通用基础能力。它为每个 `@folio` 插件分配互不可见的持久化目录（`%LOCALAPPDATA%\LocalFolio\plugins\<插件>\{data,cache}`），并提供带 Zod 校验的 JSON Store；插件自身存储直接使用本机原子写（`local-node-fs`），不受 DSH 会话沙箱（`workspace-write` / `read-only`）策略限制，同时保留 `createFsSeam(ctx)` 适配器供需要接入 DSH `ctx.fs` 的场景调用。它注册 Host 侧 Cordis 服务 `ctx.folioStorage`，没有 Client 侧产物（`package.json` 中无 `dsh.client`）。

数据只落在 LocalFolio 自己的根目录下，绝不写 DSH 的 `~/.dsh/storages/workspace.json` 或会话目录。

## 它做什么

- 解析并创建存储根目录；`shared/` 与 `plugins/` 在服务创建时就被 `mkdir -p` 建好。
- 按插件标识分配命名空间：`plugins/<id>/data`（持久数据）与 `plugins/<id>/cache`（可丢缓存），同一 `id` 重复索取返回同一个冻结对象。
- 提供两种受约束的 JSON 持久化入口：`PluginStorageNamespace.jsonStore`（插件私有）与 `FolioStorageService.sharedJsonStore`（跨插件共享）。
- 统一落盘缝 `FsSeam`：五个原子操作覆盖读写、存在性、列目录、删除，插件不直接 `import node:fs`。

| 能力 | DSH 原生提供 | 本插件增量 |
|---|---|---|
| 文件读写 | `ctx.fs`（`readText` / `writeText` / 目录列举） | 探测 `ctx.get('fs')` 并适配成 `FsSeam`；缺失时用本机原子写兜底 |
| 目录隔离 | 无 | `plugins/<id>/{data,cache}`，含路径越界防护 |
| JSON 持久化 | 无 | Zod 校验 + 格式化写入 + 串行更新队列 |

## 服务接口

签名与 `libs/base-contract/src/storage.ts` 一致：

```ts
export interface DirEntryInfo {
  readonly name: string
  readonly path: string
  readonly isDirectory: boolean
}

/** Filesystem Seam Definition. */
export interface FsSeam {
  readonly provider: 'dsh-ctx-fs' | 'local-node-fs'
  readText(filePath: string): Promise<string | null>
  writeText(filePath: string, content: string): Promise<void>
  exists(filePath: string): Promise<boolean>
  listDir(dirPath: string): Promise<readonly DirEntryInfo[]>
  remove(filePath: string): Promise<void>
}

export interface JsonStore<T> {
  readonly filePath: string
  read(): Promise<T>
  write(data: T): Promise<T>
  update(updater: (current: T) => T): Promise<T>
}

export interface PluginStorageNamespace {
  readonly pluginId: string
  readonly rootDir: string
  readonly dataDir: string
  readonly cacheDir: string
  readonly fs: FsSeam
  dataPath(...segments: string[]): string
  cachePath(...segments: string[]): string
  jsonStore<T>(
    relativeFile: string,
    schema: z.ZodType<T>,
    defaultValue: () => T,
  ): JsonStore<T>
}

export interface FolioStorageService {
  readonly rootDir: string
  readonly sharedDir: string
  readonly pluginsDir: string
  readonly fs: FsSeam
  sharedPath(...segments: string[]): string
  sharedJsonStore<T>(
    relativeFile: string,
    schema: z.ZodType<T>,
    defaultValue: () => T,
  ): JsonStore<T>
  forPlugin(pluginId: string): PluginStorageNamespace
  listRegisteredPlugins(): readonly string[]
}
```

额外导出（`src/host.ts`）：`createFolioStorageService(options?: { dataDir?: string; ctx?: unknown })`、`createFsSeam`、`createLocalFsSeam`、`createJsonStore`、`resolveFolioDataRoot`、`normalizePluginId`。

## 接入

Host 插件声明依赖后直接取自己的命名空间；命名空间与目录不需要手动释放，需要随插件卸载清理的定时器/监听器照常放进 `ctx.effect`：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'

export const inject = ['folioStorage'] as const

export function apply(ctx: Context): void {
  // plugins\feature-notes-host\{data,cache} 在 forPlugin 这一行就已创建
  const storage = ctx.folioStorage.forPlugin('feature-notes-host')
  const settings = storage.jsonStore('settings.json', z.object({ snap: z.boolean() }), () => ({
    snap: true,
  }))

  ctx.effect(() => {
    // settings.filePath            → ...\plugins\feature-notes-host\data\settings.json
    // await settings.read()        → 文件缺失时返回 { snap: true }；其余按 schema 校验
    // await settings.write({...})  → 校验后格式化落盘
    // await settings.update(fn)    → 读-改-写串行执行
    return () => {}
  }, 'feature-notes-host: storage')
}
```

跨插件共享的数据（例如运行时写的插件清单 `shared/plugins-manifest.json`）走 `ctx.folioStorage.sharedJsonStore(...)`；`sharedPath(...segments)` 用于非 JSON 的共享文件。`base-runtime-host` 在启动时还会替自己调用一次 `forPlugin('base-runtime-host')`，所以该目录总会被创建。

## 数据结构与目录

根目录解析顺序（`resolveFolioDataRoot`）：

1. `createFolioStorageService({ dataDir })` 显式传入的 `dataDir`；
2. 环境变量 `LOCALFOLIO_DATA_DIR`；
3. Windows：`%LOCALAPPDATA%\LocalFolio`（`LOCALAPPDATA` 缺失时退到 `~/AppData/Local/LocalFolio`）；
4. 其他平台：`$XDG_DATA_HOME/LocalFolio`（缺失时退到 `~/.local/share/LocalFolio`）。

实际布局：

```text
%LOCALAPPDATA%\LocalFolio\
├── shared\
│   ├── plugins-manifest.json      # base-runtime-host 写入的插件与内嵌扩展清单
│   └── ...                        # 其他跨插件共享文件
└── plugins\
    ├── base-runtime-host\
    │   ├── data\
    │   └── cache\
    └── <normalizePluginId 后的 id>\
        ├── data\                  # jsonStore 相对路径的落点
        └── cache\                 # 可由调用方随时清理
```

`normalizePluginId` 去掉 `@scope/` 前缀（`@folio/feature-notes-host` → `feature-notes-host`），再要求匹配 `^[a-z0-9][a-z0-9._-]{1,80}$`（大小写不敏感，总长 2–81 字符），否则抛 `FolioError('invalid_plugin_id', ..., 400)`。

## 行为与规则

- **越界防护**：`dataPath` / `cachePath` / `jsonStore` 的每一段都经 `resolveSafeChildPath`；解析结果落在基目录之外时抛 `FolioError('path_escape', ..., 400)`，例如 `dataPath('..', 'escape.json')`。
- **命名空间缓存**：`forPlugin` 用 `Map` 缓存并 `Object.freeze` 返回对象，`listRegisteredPlugins()` 返回按字典序排序的已分配 id（是“被分配过”而不是“磁盘上存在”）。
- **`FsSeam` 的两条实现**：`createFsSeam(ctx)` 先探测 `ctx.get('fs')`（兼容 Cordis Proxy 上抛错的属性访问），拿到同时具备 `readText` 与 `writeText` 的对象就用 `dsh-ctx-fs`；`listDir` 依次尝试 `listDir` / `readDir`，`remove` 依次尝试 `remove` / `unlink`，缺项时回落到本机实现。探测失败即整体退回 `local-node-fs`。
- **本机实现是原子写**：先写到同目录的 `<file>.<12位随机hex>.tmp`，`rename` 覆盖目标，失败时清掉临时文件再抛出错误。
- **`jsonStore.read()`**：文件不存在或内容全空白时返回 `schema.parse(defaultValue())`（不落盘）；JSON 解析失败抛 `FolioError('json_store_corrupt', ..., 500)`；其余情况先 `schema.parse` 再返回，因此磁盘上的旧结构会在这里被校验拦下。
- **`jsonStore.write(data)`**：先 `schema.parse` 校验，再以 `JSON.stringify(parsed, null, 2)` 加结尾换行格式化写入，返回校验后的值。
- **`jsonStore.update(updater)`**：读取 → 变换 → 写入串成一条 Promise 队列，同一 store 的并发更新按调用顺序串行执行；某次失败不会卡死后续调用。

## 限制与边界

- 队列只在单进程内生效：同一文件的并发写来自多个进程时不加锁，后写覆盖先写。
- 只有 `local-node-fs` 保证“临时文件 + rename”的原子性；`dsh-ctx-fs` 的写入语义完全由 DSH 的 `ctx.fs` 决定。
- 没有 schema 迁移、备份或版本号：结构变更要靠 `defaultValue()` + 调用方兼容旧字段，或自行重写文件。
- 不提供订阅/变更通知，也不做大小配额与清理策略；`cache/` 的清理由使用方负责。
- 不在启动时扫描 `plugins/` 目录，`listRegisteredPlugins()` 只反映进程内已分配的命名空间。
- 目录创建是同步的（`ensureDirSync`），在服务构造与首次 `forPlugin` 时发生，不做懒创建。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```

`src/__tests__/storage.test.ts` 覆盖：按插件分配独立 `data`/`cache`、`listRegisteredPlugins` 排序、`jsonStore` 读写往返、`dataPath('..', ...)` 越界报错，以及在 Cordis Proxy 上安全探测 `ctx.get('fs')`。
