# 原生桌面交互经桥接服务消费，缺失时降级而不是在业务里分支

工作区需要右键菜单、把文件拖出到系统、另存为。桌面版 DSH 有 Electron 侧的 `contextMenus` / `fileDrag` / `fileActions` 服务，浏览器里没有。

在工作区里写 `if (desktop) { … } else { … }` 会让每个工作区各自复制一遍能力探测和降级界面，而且降级出来的是三套风格不同的菜单。因此把这件事收进一个桥接插件：`@folio/bridge-dsh-interactions-ui` 提供 `ctx.folioInteractions`，**三种能力各有自己的探测方法**（`hasNativeContextMenu()` / `hasNativeFileDrag()` / `canSaveAs()`），业务只调用统一接口，不知道自己在哪一端。

几个刻意的接口形状：

- **菜单是声明式的**：`registerContextMenu` 注册「对哪类目标（`target`）返回哪些项」，项由 `FolioContextMenuAction` 描述（`label` / `disabled` / `danger` / `separatorBefore` / `children` / `failureLabel`），交互统一由桥接层渲染。有原生菜单就用原生的，没有就用工作台内置菜单，业务代码零分支。
- **异步解析可取消**：`resolve(value, signal)` 收到 `AbortSignal`，菜单关掉即中止，避免用户已经关掉菜单、异步结果还在弹 toast。
- **拖拽的接管契约显式**：`session.start(transfer, source)` 返回 `true` 表示交给浏览器拖拽，返回 `false` 表示桌面原生拖拽已接管、调用方必须 `event.preventDefault()`。这个布尔值就是「谁在拖」的唯一信号，不做隐式约定。
- **跨工作区拖拽有独立载荷**：`FOLIO_DRM_MIME`… 即 `FOLIO_DRAG_MIME` + `encodeFolioDragPayload`，只传路径列表与来源工作区，不传文件内容。

## Consequences

- `ctx.folioInteractions` 在契约里是可选服务（`folioInteractions?`）。消费方 `inject: ['folioInteractions']`，但必须处理「拿到的是 undefined 或者能力探测全 false」的情况——这是合法状态，不是配置错误。
- 因此它必须是独立的 `bridge-*` 插件而不是并进外壳：不用桌面交互的插件完全不必装它；没有它时工作区整体退化成纯浏览器行为，而不是加载失败。
- `notify(text, success)` 是「结果式反馈」的唯一入口：桌面端走 DSH 原生通知，浏览器端走 toast，调用方不关心 tone 映射。
- 违反信号：业务代码里出现 `window.electronAPI`、`process.platform`，或自己渲染一套右键菜单来「配合」原生菜单。
