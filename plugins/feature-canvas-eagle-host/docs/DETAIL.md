# @folio/feature-canvas-eagle-host · 画板 Eagle 链接后端

画板工作区 Eagle 链接能力的 Host 侧功能插件（对应参考项目 `fileatlas-plugin-eagle-links`）。它不画界面、不复制图片，也不修改 Eagle 资源库，只通过本地 Eagle Web API 与系统 URL 协议完成两件事：

1. 将从 Eagle 拖入的 `.info` 原图路径或 `eagle://item/{id}` 深链接解析为可交给画板使用的本地原图路径及 Eagle 来源元数据（条目 ID、名称、所属文件夹、原图路径 / `file://` URI、缩略图路径、Web API 地址）；
2. 将画板链接面板中的「在 Eagle 中打开」请求派发给系统注册的 `eagle://item/{id}` 协议处理器。

## 动作列表

| 方法 | 路径 | 用途 | 分级 |
|---|---|---|---|
| POST | `/lf/rpc/canvas.eagle.resolveFromPaths` | 批量识别拖入路径是否属于 Eagle `.info` 原图并读取来源元数据 | read |
| POST | `/lf/rpc/canvas.eagle.resolveById` | 通过条目 ID 或 `eagle://item/{id}` 查询 Eagle 本地原图与元数据 | read |
| POST | `/lf/rpc/canvas.eagle.openItem` | 校验字母数字 ID 并调用系统 `eagle://item/{id}` 打开条目 | read |

## 依赖与限制

- 依赖本地 Eagle 运行并开启 Web API（默认 `http://127.0.0.1:41595`，需支持 V2 `item/get`、`folder/get` 与 V1 `item/thumbnail`）。
- 拖入非 `.info` 目录的普通图片时直接返回 `source: null`，不发起 HTTP 请求。
- 识别到 `.info` 目录但缩略图本身被拖入时返回 `source: null`；若 Eagle 未运行，逐条返回 `{ source: null, error }` 而不阻塞画板建链。
