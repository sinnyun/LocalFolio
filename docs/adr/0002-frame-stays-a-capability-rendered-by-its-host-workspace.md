# 布局框架不注册工作区，由宿主工作区渲染 `folioFrame.View`

工作台里的每个工作区都要一套「左 / 中 / 右 / 底」四区布局。如果框架自己注册成工作区，它就同时是基础设施和一个界面，任何想用它布局的工作区都得绕开它或复制它的代码。因此 `@folio/base-frame-ui` 只提供 `ctx.folioFrame` 能力与 `View` 组件：工作区渲染 `View` 并调用 `attachHostWorkspace(workspaceId)`，框架自身不画界面、不注册工作区。

测试期由桥接插件 `@folio/bridge-frame-test-ui`（测试框架工作区）临时充当宿主，方便随时查看与调整布局；真实工作区接入后删除该桥接插件即可，框架不受影响。

## Consequences

工作区必须自己设置 `hideStatusBar: true`，否则外壳会再画一条底部信息栏，出现双底栏。`openApp()` 只有在宿主认领后才做导航；没有宿主时它只激活应用。
