# @folio/bridge-frame-test-ui · 测试框架工作区

桥接插件。基础布局框架（`@folio/base-frame-ui`）只提供 `ctx.folioFrame` 能力、不画任何界面；这个插件把框架挂进工作台顶部的工作区栏，方便随时查看和调整四区布局。

## 它做什么

1. 向 `ctx.folioShell.registerWorkspace` 注册一个工作区 `测试框架工作区`（`frame-test`），它的 `MainView` 直接写 `ctx.folioFrame.WorkspaceHost`。
2. `WorkspaceHost` 渲染框架本身，并在挂载时自行调用 `attachHostWorkspace('frame-test')`，于是 `folioFrame.openApp()` 能把工作台切回这里。框架组件仍住在 `@folio/base-frame-ui` 里，桥接层不复制它的任何代码，也不再自己管认领。
3. 登记一个示例应用 `测试框架示例`（四区 + 底部信息栏），用于实际拖拽、折叠、调宽。

## 什么时候移除它

真实工作区（画板、笔记等）开始各自用 `framework.WorkspaceHost` 承载布局后，这个测试工作区就不再需要，删除本包并从 `bundles/workbench-suite` 里去掉一行即可，`@folio/base-frame-ui` 不受影响。
