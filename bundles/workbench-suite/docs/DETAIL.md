# LocalFolio 工作台套件

产品安装入口。带基础能力、桥接插件与三个正式工作区，**不含任何 `test-*` 验证界面**（那些在 `@folio/test-suite`）。

## 组成

| 分类 | 插件 |
|---|---|
| **基础能力**（工作台通用） | 基础存储能力、基础运行时能力、基础 UI 组件库（`@folio/base-ui-kit`）、基础外壳能力（工作台与悬浮面板）、基础布局框架（`@folio/base-frame-ui`）、基础设置页 |
| **桥接** | DSH 交互桥接（`@folio/bridge-dsh-interactions-ui`，提供 `ctx.folioInteractions`）、测试框架工作区（`@folio/bridge-frame-test-ui`，把基础布局框架挂进顶部工作区栏） |
| **工作区** | 文件浏览器（`workspace-files-host` + `workspace-files-ui`）、画板（`workspace-canvas-host` + `workspace-canvas-ui`）、物料（`workspace-materials-host` + `workspace-materials-ui`） |

`@folio/bridge-frame-test-ui` 是形态 A 的最小样板；三个正式工作区接入框架后即可按 [ADR-0002](../../../docs/adr/0002-frame-stays-a-capability-rendered-by-its-host-workspace.md) 移除它。

## 使用

1. 安装本套件后，在会话头或对话区顶部出现 `LocalFolio` 入口按钮。
2. 点击进入工作台：一条顶部条（品牌、返回 DSH、工作区切换）加下面一整块内容区；Windows 桌面版不画这条顶部条，控件嵌进 DSH 原生标题栏。
3. 内容区完全归工作区。四区工作区把 `ctx.folioFrame.WorkspaceHost` 当 `MainView`，框架提供左侧应用切换器与面板、中间内容、可折叠可调宽的右侧面板、底部信息栏；页面自带骨架的工作区直接渲染自己的全屏内容。
4. 新增工作区时 `MainView` 写 `folioFrame.WorkspaceHost` 即完成接入（认领宿主由它自己完成）；只贡献一块功能的功能插件向所在工作区登记。独立悬浮窗口用 `ctx.folioShell.registerFloatingPanel(...)`，与工作区正交。
5. 按 `Esc` 或点「返回 DSH」回到原生界面；工作台的打开状态、悬浮窗位置与框架内各应用的宽度/折叠状态都会被记住。

## 限制

- 工作台只覆盖在 DSH 原生界面之上，不替换、不改写 DSH 自身的布局与会话视图，也不接入 DSH 工作区模型（[ADR-0001](../../../docs/adr/0001-reuse-dsh-file-capabilities-without-dsh-workspace-model.md)）。
- **桌面系统能力有前置依赖**：文件浏览器的系统缩略图、画板的按尺寸解码、物料的导出与写回都调用 Windows 侧组件（Shell / WIC / VectorCraft CLI）。这些能力在纯浏览器或非 Windows 环境下会退化：缩略图回退为类型图标，物料工作区可浏览但无法导出。
- 悬浮面板的位置记忆保存在浏览器本地存储；换机器或清空站点数据后回到默认位置。
- 设置页的「我的插件」是**只读展示**：按分类列出清单里的插件与内嵌扩展，启停仍以 DSH 插件页为准。
