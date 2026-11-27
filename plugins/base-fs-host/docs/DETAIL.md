# `@folio/base-fs-host`

工作台基础文件系统与媒体流服务插件，通过 Cordis 注册 `ctx.folioFs`（`FolioFsService`）。

## 提供能力

- **路径规范化与安全校验**：`normalizePath`（兼容 `file://`、引号、盘符大小写、空字节拒绝）、`isPathInside`、`getParentPath`、`buildBreadcrumbs`。
- **文件分类与元数据**：`classifyFile`、`isStreamableMediaExt`、`isTextPreviewable`、`isHiddenName`、`parseImageDimensionsFromBuffer`、`readImageDimensions`、`sniffImageMime`。
- **驱动器与目录枚举**：`listDrives`（含 Windows `Win32_LogicalDisk` 卷标与容量探测）、`listQuickFolders`、`listRoots`、`listDirectory`。
- **HTTP Range 媒体流与下载**：`serveMediaFile`（支持 `ETag` / `304`、`HEAD`、`Range` 206 分片、SVG `sandbox` CSP）、`serveDownloadFile`。
- **缓存目录 LRU 清理**：`pruneCacheDir`（按 `mtimeMs` 淘汰至 `maxFiles` / `maxBytes` 以下）。
