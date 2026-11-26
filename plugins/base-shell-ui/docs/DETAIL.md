# @folio/base-shell-ui · 基础外壳能力

工作台外壳的客户端实现：一个可退回的全屏 `shell.overlay`、一条标题条（caption 条）、它下面一整块内容区，外加一层与工作区正交的悬浮面板。**外壳只画两层**——标题条 + 内容区；内容区完全归属当前工作区的 `MainView`，外壳不画左右栏、不画底栏，也不碰工作区内部的区域几何（那是 `@folio/base-frame-ui` / `ctx.folioFrame` 的事，见 ADR-0003）。

```text
┌─ DSH 原生窗口 ───────────────────────────────────────────────────┐
│  应用 编辑 │ 工作台 │ 工作区A 工作区B │ 尾部控件 ─ □ ✕           │ ← Windows 桌面版：固定定位在原生标题条
│  LocalFolio │ 返回 DSH │ 工作区A 工作区B │ 尾部控件              │ ← Web / macOS：壳内顶部条
│                                                                  │
│  内容区：整块交给当前工作区的 MainView                           │
│    形态 A → 四区框架（folioFrame.WorkspaceHost）                 │
│    形态 B → 自绘全屏，外壳不进入内容区                           │
│                                                                  │
│  悬浮面板层：独立于工作台开关与当前工作区                        │
└──────────────────────────────────────────────────────────────────┘
```

整块界面直接渲染在 DSH 原生 DOM 里（没有 Shadow DOM 墙），颜色与字体全部走 `--dsw-*` 令牌。

## 1. 服务接口

插件执行 `ctx.provide('folioShell', controller)` 提供 `FolioShellService`（契约见 `libs/base-contract/src/shell.ts`）：

| 成员 | 用途 |
|---|---|
| `isOpen()` / `open()` / `close()` / `toggle()` | 全屏工作台的开关状态 |
| `registerWorkspace(contribution)` | 注册工作区，返回 disposer；重复 `id` 视为热替换 |
| `listWorkspaces()` | 按 `order` 升序的快照 |
| `registerCaptionAction(action)` / `listCaptionActions()` | 向标题条尾部贡献控件，按 `order` 升序（默认 `100`） |
| `registerFloatingPanel(contribution)` / `listFloatingPanels()` | 注册悬浮面板，disposer 会顺带关闭面板 |
| `openFloatingPanel(id, defaults?)` / `closeFloatingPanel(id)` / `toggleFloatingPanel(id, defaults?)` / `focusFloatingPanel(id)` | 悬浮面板开关与置顶 |
| `navigateTo(workspaceId, target?)` | 切工作区；给了 `target` 就同时写入待消费目标 |
| `openFile(filePath)` | 按 `fileExtensions` 认领文件并打开工作台 |

`registerWorkspace` 的贡献形状（`WorkspaceUiContribution`，8 个字段）：

```ts
interface WorkspaceUiContribution {
  id: string
  title: string
  order: number
  pluginId?: string
  icon?: React.ComponentType<{ size?: number }>
  shortcutScope?: string
  fileExtensions?: readonly string[]
  MainView?: WorkspaceMainViewComponent   // 可省略：那时显示「尚未安装任何工作区插件」空态
}
```

控制器的 `subscribeOpen` / `subscribeWorkspaces` / `subscribeCaptionActions` / `subscribeFloatingPanels` 只在包内自用（`ShellController` 类型），**不属于** `FolioShellService`，插件不要依赖。

## 2. 两层结构

- **标题条**：品牌 + 「返回 DSH」+ 工作区切换 tab + 尾部动作区（`[data-lf-row-actions]`）。高 `42px`，`flexShrink: 0`。
- **内容区**：`[data-lf-content]`，`flex: 1; minHeight: 0; overflow: hidden`，整块只渲染当前工作区的 `MainView`。没注册任何工作区时给一段空态文案。
- 每个工作区各自包一层错误边界与 `Suspense`（fallback 为「正在加载工作区...」），一个工作区崩溃不会带走标题条。
- 内容区外面套 `FolioQueryProvider`，由构造选项 `enableEvents`（默认 `true`）控制是否订阅 RPC 事件。

工作区内容的两个合法形态：

```tsx
// 形态 A：四区，布局框架拥有内部几何
const fourRegion: WorkspaceUiContribution = {
  id: 'notes',
  title: '笔记',
  order: 20,
  MainView: ctx.folioFrame.WorkspaceHost,
}

// 形态 B：自绘全屏，外壳不注入任何区域
const fullBleed: WorkspaceUiContribution = {
  id: 'gallery',
  title: '画廊',
  order: 60,
  fileExtensions: ['.png', '.jpg', '.webp'],
  MainView: GalleryPage,
}
```

## 3. 接入

```tsx
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceUiContribution } from '@folio/base-contract'

export const inject = ['folioShell'] as const

export function apply(ctx: Context): void {
  const workspace: WorkspaceUiContribution = {
    id: 'notes',
    title: '笔记',
    order: 20,
    fileExtensions: ['.md', '.markdown'],
    MainView: NotesPage,
  }
  ctx.effect(() => ctx.folioShell.registerWorkspace(workspace), 'notes: register workspace')
}
```

`MainView` 收到的 props（`WorkspaceViewProps`）是外壳给的导航上下文：

```ts
interface WorkspaceViewProps {
  workspaceId: string
  workspaces: readonly WorkspaceUiContribution[]
  pendingTarget?: unknown
  consumePendingTarget: () => unknown
  navigateTo: (workspaceId: string, target?: unknown) => void
  openFile: (filePath: string) => void
  openFloatingPanel: (id: string, defaults?: FloatingPanelDefaults) => void
  closeFloatingPanel: (id: string) => void
}
```

`pendingTarget` 只在 `pendingTarget.workspaceId === 当前工作区` 时出现，`consumePendingTarget()` 读一次即清空。注意两个 `openFile` 的差异：**服务上的** `ctx.folioShell.openFile()` 找不到认领者就什么都不做，命中时还会顺手 `open()` 工作台；**props 里的** `openFile()` 找不到认领者则退回当前工作区，且不改变开关状态。

## 4. 平台差异

| 平台 | 判定 | 顶部条 | 内容区起点 |
|---|---|---|---|
| Web / macOS 桌面版 | `html` 上没有 `data-windows-titlebar` | 壳内 `<header data-lf-topbar>` | 顶部条下沿 |
| Windows 桌面版 | `html[data-windows-titlebar]` 存在 | 不画；改由 `shell.overlay` 第 0 层 `CaptionBar` 固定定位嵌进原生标题栏 | `--dsh-frame-top-clearance` |

Windows 标题条的位置不写死，由 `useWindowsCaptionMetrics()` 量出来：左边界 = `[data-windows-menu]` 右边缘 + `CAPTION_GAP`（8px，菜单未挂载时退到 `--dsh-windows-menu-start` + 110），右边界 = `windowControlsOverlay` 量出的原生按钮占位（量不到退到 180），高度取 `--dsh-windows-titlebar-height`（量不到 40）。菜单栏宽度、`--dsh-windows-menu-start`、页面缩放都会触发重算。切换到 Windows 形态时，DSH 会话头上的入口按钮（`conversation.header.leading` / `conversation.session.header.actions` 二选一，先挂载者胜）**不渲染**，入口改成标题条上的「工作台 / 返回 DSH」按钮。

## 5. 悬浮面板

```ts
const dispose = ctx.folioShell.registerFloatingPanel({
  id: 'notes.inspector',
  title: '属性',
  pluginId: '@folio/feature-notes-ui',
  defaultWidth: 480,
  defaultHeight: 320,
  minWidth: 320,
  minHeight: 220,
  Component: ({ panelId, maximized, close, toggleMaximize }) => (
    <Inspector
      panelId={panelId}
      maximized={maximized}
      onClose={close}
      onToggleMaximize={toggleMaximize}
    />
  ),
})
```

渲染在 `shell.overlay` 的**第二层**（`FloatingPanelHost`），与外层工作台开关无关：工作台关掉、切到别的工作区，面板都还在。

- chrome 由外壳提供：标题栏拖拽移动、双击或 □ 按钮最大化/还原、八向缩放（`minWidth` 默认 `320`、`minHeight` 默认 `220`）、点一下置顶、关闭按钮、标题栏右侧显示 `pluginId`。
- 首次打开的默认位置按窗口居中并加 `(已开面板数 % 5) * 28` 的错位；面板拖到屏幕外时 `clampFloatingRect` 保证标题栏至少露出 `120×36px`。
- 每个面板自己包错误边界与拖放边界，面板内可以直接接文件拖入（工作台关着也一样）。

## 6. 快捷键与 Esc

`useShortcutIsolation` 在打开期间做两件事：

1. 通过 `ctx.get('shortcuts')` 调 `recording(true)` 挂起 DSH 全局快捷键，关闭/卸载时**无条件** `recording(false)`；宿主没这个服务就静默降级。
2. 分层 Esc：`[data-modal-layer]` / 打开中的 `role="dialog"` / `role="alertdialog"` / `role="menu"` / `role="listbox"` 存在时让给 DSH 原生弹层 → 否则先关最上层悬浮面板（`closeTopFloatingPanel()` 按 `zIndex` 找最高）→ 否则退出工作台。

焦点归还：打开时记住 `document.activeElement` 并把 `[data-lf-overlay]` 自己 `focus()`，关闭时把焦点还给那个元素（通常是 DSH 会话头的入口按钮）。工作台本身是 `role="dialog" aria-modal="true"`。

拖放隔离：工作台打开期间，在 `document.documentElement` 冒泡阶段拦 `dragenter/dragover/dragleave/drop`。带 `Files` 或 `application/x-dsh-file-drag` 的拖拽会在边界处 `preventDefault()`（`dragover` 再置 `dropEffect = 'none'`），并用 `stopPropagation()` 挡住 DSH 在 `document` 上的附件投放监听；非文件拖拽只做 `stopPropagation()`。工作区内部的 React 拖拽处理器先跑完，所以工作区自己的投放区照常可用。

## 7. 持久化

`shell-store.ts`（zustand）写入 `localStorage['folio.shell.overlay.v3']`，`partialize` 只存两项：

```ts
{
  activeWorkspaceId: string,
  floatingPanelRects: Record<string, { x, y, width, height, zIndex }>,
}
```

**不持久化**：`openFloatingPanels`、`maximizedPanels`、`topZIndex`、`pendingTarget`。刷新后面板全部关着，但下次打开会沿用记住的矩形。存储走一层安全包装：`localStorage` 不可用（隐私模式、抛错）时退到内存 Map。v2 的 `paneLayouts` 已删除，旧键的残留字段不会被合并进来。

## 8. 限制与边界

- 外壳拥有**窗口级与工作区级**的一切：开关、Esc、焦点归还、快捷键隔离、工作区注册与切换、文件路由、Windows 标题条那排控件。
- 外壳**不拥有**工作区内部的区域几何：出现左/中/右栏或底栏，就是越界（ADR-0003 的违反信号）。底边归渲染内容的一方：形态 A 用框架的 `FrameStatusBar`，形态 B 自己决定。
- 悬浮面板与两者正交：注册在服务上、渲染在第二层，外壳给 chrome，插件只给内容。
- `WorkspaceUiContribution.shortcutScope` 目前只声明、外壳未读取，现在它没有运行时效果。
- 未挂 `shell.overlay`（`ctx.slots` 缺失）时插件直接 `return`：既不提供 `folioShell`，也不报错。
- 工作台关闭时 `useShortcutIsolation` 不生效，此时 Esc 不会关悬浮面板。

## 9. 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```

`src/__tests__/shell-overlay.test.tsx` 覆盖：原生 DOM 无 Shadow DOM、动态注册工作区与悬浮面板、最大化/还原、分层 Esc（先面板后工作台）与 `recording` 调用序列、焦点归还、Windows 标题条（入口让位、`left: 168px` / `right: 180px`、插件动作只在打开时渲染）、崩溃工作区隔离、`clampFloatingRect`、工作台内外的拖放隔离。
