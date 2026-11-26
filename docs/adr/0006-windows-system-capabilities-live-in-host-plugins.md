# Windows 系统能力统一在 Host 侧调用，界面只消费 URL 与结果

文件浏览器要显示 4K 视频的缩略图、按字节区间流式播放音视频、弹系统文件夹选择框、在资源管理器里定位文件；画板要按目标尺寸解码超大图；物料要调本地程序。这些能力在浏览器侧根本拿不到——要么需要 Node 的 `fs`，要么需要 Win32 COM，要么需要进程。

如果每个工作区各自解决，`win-thumb.ts` 会被复制三份，路径校验各写一套，降级行为各不相同。因此定下一条边界：**凡是需要 Node / Win32 / 子进程的系统能力，一律做成对应 Host 插件的动作或路由；界面侧只拿 URL、句柄和纯数据。**

已落地的分工：

| 系统能力 | 落点 | 界面怎么用 |
|---|---|---|
| Shell 缩略图（`IShellItemImageFactory`） | `workspace-files-host` / `win-thumb.ts` | 拿代理 URL |
| 按目标尺寸解码（WIC `DecodePixelWidth`） | `workspace-canvas-host` / `image-proxy.ts` | 拿带 `tier` 参数的代理 URL |
| 字节区间媒体流（`Range` → 206） | `workspace-files-host` / `media-route.ts` | 直接作为 `<audio>` / `<video>` 的 src |
| 驱动器枚举与容量 | `workspace-files-host` / `drives.ts` | 动作返回值 |
| 系统文件/文件夹选择框 | 各 Host 自己注册 | 动作返回值 |
| 在资源管理器中定位 | `workspace-files-host` | 动作调用 |

## Consequences

- 路径校验只有一处：每个 Host 在动作入口校验绝对路径、拒绝非法字符与越权根目录，界面传什么都要过这道闸。界面侧不做「看起来像路径就行」的乐观校验。
- 每个能力都必须能在拿不到系统组件时退化：缩略图提供者返回 `null` 时界面显示类型图标，不抛错、不空白。工作是「有更好，没有也能用」。
- Host 侧依赖只允许出现在 Host 插件里；Client 产物里出现 `node:` 前缀的 import 就是这条边界被绕开的信号。
- 媒体流走 `Range` 而不是整文件读取，是大文件可播放的前提：换实现时先看 206 与 `content-range` 还在不在。
- 这些能力都是只读或幂等的：系统能力层不做写入、不做删除，写操作归各自业务动作，避免「顺手改文件」散落在代理层。
