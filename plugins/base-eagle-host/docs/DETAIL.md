# `@folio/base-eagle-host`

工作台基础 Eagle 通信与深链接服务插件，通过 Cordis 注册 `ctx.folioEagle`（`FolioEagleService`）。

## 依赖注入

- `inject = ['folioRuntime', 'folioFs'] as const`

## 提供能力

- **统一 HTTP 客户端（`src/client.ts`）**：默认连接 `http://127.0.0.1:41595`，内置 `AbortController` 超时控制、外部 `AbortSignal` 联动与 `{ status, data, message }` 信封校验：
  - `requestJson`、`ping`
  - 资源库：`getLibraryInfo`、`switchLibrary`
  - 条目与目录：`getItem`、`getFolder`、`getItemThumbnailPath`（内置百分比安全解码）、`addItemFromPath`、`listItems`、`moveItemsToTrash`
- **深链接与环境清理（`src/deeplink.ts`）**：
  - `extractItemIdFromDeepLink`、`isValidEagleItemId`
  - `buildCleanLaunchEnv`（剥离 `ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS` 等宿主环境变量）
  - `openDeepLink`（Windows PowerShell `Start-Process` / macOS `open` / Linux `xdg-open` 跨平台唤起 `eagle://item/{id}`）

## 非目标

- 不持有 Eagle 专用缩略图缓存库隔离、串行队列与空间熔断逻辑（保留在 `@folio/feature-thumbs-eagle-host`）。
- 不持有画板 `.info` 路径识别与原图/文件夹元数据绑定逻辑（保留在 `@folio/feature-canvas-eagle-host`）。
