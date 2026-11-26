# LocalFolio 测试界面套件

## 组成

六个只为验证界面与集成方式而存在的插件，包名统一以 `test-` 开头：

| 插件 | 验证什么 |
|---|---|
| `@folio/test-overview-host` | 独立 Host 插件的私有存储目录与动作注册 |
| `@folio/test-overview-ui` | 形态 A：把 `folioFrame.WorkspaceHost` 当主视图、四区声明（左/中/底）与悬浮面板 |
| `@folio/test-gallery-ui` | 形态 B：瀑布流画廊、灯箱、受管 Portal |
| `@folio/test-sidebar-ui` | 形态 B：shadcn sidebar-07 图标轨折叠与 Tooltip |
| `@folio/test-shadcn-admin-ui` | 形态 B：完整后台移植（8 个页面 + 侧栏 + 命令面板），验证组件覆盖度 |
| `@folio/test-studio-admin-ui` | 形态 B：多主题预设与布局控制，产物最大的一个（约 1.2 MB） |

## 为什么不进产品套件

`@folio/workbench-suite` 是产品安装入口，只带基础能力与桥接插件。这六个界面的作用是「证明基础能力撑得起复杂界面」，不是给人日常使用的功能；把它们塞进默认安装会让每个用户都为 1.6 MB 的验证代码付出启动代价。

## 安装

先装工作台套件，再装本套件：

```powershell
pwsh -File scripts/lfdev.ps1 install            # 两个套件都装（开发默认）
```

只装本套件（基础能力已就位时）：

```powershell
dsh plugin --profile <name> add link:F:\AI\geren\LocalFolio\bundles\test-suite
```

缺少 `folioShell` / `folioFrame` / `folioRuntime` 时，对应插件会保持 pending——这不是安装失败，而是前置套件没装。

## 退场

它们最终会被删除或并入真实工作区（见 `GLOSSARY.md` 的「Test Surface」）。删除时把 `plugins/test-*` 目录与 `cordis.patch.yml` 里对应的行一起去掉即可，基础能力不受影响。
