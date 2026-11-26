# @folio/feature-canvas-eagle-ui · 画板 Eagle 链接

画板工作区 Eagle 链接能力的界面功能插件。它通过 `ctx.folioCanvas` 服务向 `@folio/workspace-canvas-ui` 注册 `CanvasLinkSourceProvider`，与画板工作区零直接 `import`、可独立启停：

1. **拖入/插入路径解析**：检测到 Eagle `<itemId>.info` 目录内的文件时，调用 `canvas.eagle.resolveFromPaths`，确认拖入文件为原图后保留原图路径作画板链接，并将 Eagle 元数据（条目 ID、名称、所属文件夹、原图路径 / `file://` URI、缩略图路径、Web API 地址）写入图片资产 `meta.eagle` 随画板文档持久化。
2. **深链接转换**：拖入或粘贴 `eagle://item/{id}` 时，调用 `canvas.eagle.resolveById` 找到本机原图并转换成画板链接资产。
3. **链接面板扩展**：在「图片链接管理」面板中为关联 Eagle 来源的图片展示所属条目与文件夹摘要、可展开复制的 6 项完整元数据，以及「在 Eagle 中打开」按钮（调用 `canvas.eagle.openItem`）。
4. **重选清理**：当图片被重选为非 Eagle 普通图片时，清理 `meta.eagle` 字段，避免残留过期来源。
