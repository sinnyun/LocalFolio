# `@folio/workspace-projects-host`

项目库工作区的后端插件，基于 `@folio/base-tasks-host`、`@folio/base-native-host`、`@folio/base-storage-host` 与 `@folio/base-runtime-host` 协作。

## 数据分层

- **就地元数据**（单一事实来源）：每个项目文件夹下的 `.folio-meta/manifest.json` 与 `.folio-meta/thumbs/`（若项目目录只读，则自动降级到插件 `cache/fallback-meta/`）。
- **全局轻量索引**：`%LOCALAPPDATA%\LocalFolio\plugins\workspace-projects-host\data\index.json`，用于首屏毫秒级加载左侧项目列表。

## 性能设计

1. **Worker 线程扫描**：`scanner.worker.ts` 运行在独立 `node:worker_threads`，采用 `fs.promises.opendir()` 流式遍历与有界 `stat` 并发，绝不阻塞主进程。
2. **轻量级指纹**：仅组合 `size:mtimeMs` 检测文件增删改，绝不读取超大文件全文计算哈希。
3. **双尺寸按需缩略图**：导入库时仅生成每项目 1 张 `120px` 封面图；进入项目后按文件夹分组按需生成 `360px` 卡片缩略图并持久化到 `.folio-meta/thumbs/`，路由返回 `Cache-Control: public, max-age=31536000, immutable`。
4. **DSH 原生 AI 采样与提取队列**：可选注入 `ctx.llm` 与 `ctx.agentDefaultModel`，仅采样目录树（深度≤3/80行）、前 2 份说明文本前 2000 字与文件分布，经 Zod 校验输出项目类型、标签、摘要与推荐封面，通过 `queue: 'projects-ai'` 串行调度单项目与可暂停/取消的批量提取。
