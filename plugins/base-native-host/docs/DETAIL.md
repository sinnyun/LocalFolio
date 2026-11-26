# `@folio/base-native-host`

提供 `ctx.folioNative` Cordis 服务，把所有 Windows 系统原生能力收敛到单一基础能力插件中（遵循 [ADR-0006](../../docs/adr/0006-windows-system-capabilities-live-in-host-plugins.md)）。

## 核心能力

1. **共享缩略图与图像下采样 Worker 池**：全工作台共享最多 4 个常驻 PowerShell STA Worker，统一限制原生 COM/WIC 并发，输出 JPEG (q=82) 或透明 PNG。
   - `getThumbnail(filePath, size, options)`：Windows Shell `IShellItemImageFactory`（支持视频、PDF、Office、PSD、图片及文件夹）。
   - `renderImageProxy(filePath, maxDim, options)`：WPF WIC `DecodePixelWidth` / `DecodePixelHeight` 按目标尺寸直接解码大图，失败时自动回退 Shell 缩略图。
2. **原生弹窗与系统集成**：
   - `pickFolder(options)` / `pickFiles(options)`：Windows 原生选目录/选文件弹窗（UTF-8 Base64 安全传参）。
   - `revealPath(targetPath)`：在资源管理器中定位文件或打开文件夹。
   - `openPath(targetPath)`：使用系统默认关联程序打开本地文件。
   - `setHiddenAttribute(targetPath)`：为 `.folio-meta` 等目录设置 Windows `+h` 隐藏属性。
