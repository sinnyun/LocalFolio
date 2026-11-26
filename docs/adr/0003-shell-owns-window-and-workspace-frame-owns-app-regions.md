# 外壳只管两层，布局框架管一个 app 内部的区域几何

工作台里有两层容器：外壳（全屏面板、工作区切换、悬浮面板）和一个工作区内部的四区布局。两者最初各自实现过一遍「左 / 中 / 右三栏 + 折叠 + 拖宽 + 持久化 + 每区错误隔离 + 底部信息栏」：外壳用 `ShellLayout`（百分比几何、`react-resizable-panels`、按工作区存 `folio.shell.overlay.v2`），框架用 `FrameWorkbench`（像素几何、手写分隔条、按 app 存 `folio.frame.v1`）。两份区域声明也各有一套字段，`HeaderSlot / LeftPanel / MainView / RightPanel / StatusSlot` 与 `Left / Main / Right / Status` 是同一件事的两种说法。实际只有 `test-overview-ui` 还在用外壳那套，其余四个测试工作区只提供 `MainView`。

因此外壳收成**两层**：一条顶部栏，和它下面一整块内容区。顶部栏放品牌、返回 DSH、工作区切换（Windows 桌面版不画这条，而是把控件嵌进 DSH 原生标题栏，内容区从原生标题栏下沿 `--dsh-frame-top-clearance` 起占满）。**内容区完全属于工作区**，外壳不画任何区域布局，也不再画底部信息栏 —— 底边归渲染内容的那一方：形态 A 由框架的 `FrameStatusBar` 提供，形态 B 由页面自己决定。

工作区内容随之只有两个合法形态：

- **形态 A（四区）**：`MainView: frame.WorkspaceHost`，配一个 `FrameAppDefinition` 声明「左 / 中 / 右 / 底」放什么。布局框架拥有四区、折叠、拖宽、几何持久化、逐区 Loading 与错误隔离、多 app 切换。
- **形态 B（自绘全屏）**：`MainView: 自己的组件`。适合页面自带骨架的工作区（画廊、后台、画布）。它只能用 `@folio/base-ui-kit` 的控件与 `--dsw-*` 令牌，自己的布局只管这一页怎么摆，不碰窗口、工作区切换或悬浮面板。

不把框架并进外壳，是因为合并消不掉那个可选性：五个工作区里有四个不要四区，框架一旦焊进外壳，外壳就必须知道「这个工作区用不用内部布局」，最后退化成一个个标志位。框架独立时这份可选性天然表达为「渲染不渲染 `View`」，是声明式的。删除测试对两边都成立 —— 删掉任何一个，复杂度都会分摊到每个插件 —— 所以这里要选的是 seam 放在哪，不是消除一个 pass-through。合并还会把外壳的 interface 从 12 个成员推到 23 个，并且框架无法再被第二处复用。

`folioShell` 的三条边界：外壳拥有窗口级与工作区级的一切（全屏开关、Esc 退回、焦点归还、快捷键隔离、工作区注册与切换、文件路由、Windows 标题栏那一排控件）；框架拥有一个 app 内部的区域几何；**悬浮面板与两者都正交** —— 它注册在服务上、渲染在 `shell.overlay` 的第二层，跨工作区、甚至跨工作台开关存活，chrome（标题栏、八向缩放、最大化、置顶、位置记忆）由外壳提供，内容由注册它的插件提供。

工作区接入方式随之收窄：`WorkspaceUiContribution` 去掉 `HeaderSlot / LeftPanel / RightPanel / StatusSlot / hideStatusBar`，只留 `MainView`；`MainView` 写 `frame.WorkspaceHost`，认领宿主由它在挂载时完成。四区定义不变，不新增第五区：头部条属于工作区自己的内容，直接渲染在 `Main` 里。Windows 标题栏的左右栏开关不留在外壳的判断里：外壳开一个尾部动作注册点（`registerCaptionAction`），由框架注册，方向仍是框架依赖外壳。

## Consequences

- 几何只剩像素一套（`folio.frame.v1`）；`folio.shell.overlay.v2` 的 `paneLayouts` 切片删除，持久化 key 升到 `v3`。
- 外壳的客户端产物不再包含 `react-resizable-panels`；三栏渲染代码、`PaneLayoutState`、`getPaneLayoutFor`、顶部条与标题条上的两个面板开关、`footer` 与 `StatusSlot` 全部删除。
- `hideStatusBar` 删除：外壳没有底边可躲，`WorkspaceUiContribution` 降到 8 个字段（`id / title / order / pluginId / icon / shortcutScope / fileExtensions / MainView`）。ADR-0002 里「工作区必须自己设置 `hideStatusBar: true`」这条失效，其结论（框架不注册工作区）不变。
- 底栏那行「按 Esc 关闭悬浮面板 / 返回 DSH」与工作区计数一并删除；Esc 行为不变，发现性靠顶部栏 / 标题条上的「返回 DSH」按钮，框架的 `FrameStatusBar` 仍保留自己的 Esc 提示。
- 新增工作区的形状降为 `registerWorkspace({ id, title, MainView: frame.WorkspaceHost })` 加一个 `FrameAppDefinition`。
- 不用四区的工作区继续直接渲染自己的全屏内容，不需要任何标志位。
- 边界的违反信号：外壳里再出现「左 / 中 / 右栏」或底栏，框架里出现「工作区切换 / 窗口开关」，都说明这次划分被绕开了。
