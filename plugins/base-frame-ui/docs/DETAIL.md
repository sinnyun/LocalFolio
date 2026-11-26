# @folio/base-frame-ui · 基础布局框架

工作台通用基础能力。它把「左侧面板 / 中间内容 / 右侧面板 / 底部信息栏」四区布局、分隔条调宽、面板折叠、宽度持久化、快捷键、Suspense 与错误隔离全部收进框架内部。**框架自身不画任何界面、也不注册工作区**：谁渲染 `folioFrame.View`，谁就是它的宿主。

```
┌──────────────────────────── 工作区 ────────────────────────────┐
│ ┌─────────┬─────────────────────────────┬───────────────────┐ │
│ │ 应用切换 │            Main             │       Right       │ │
│ │  Left   │                             │  （标题/折叠/调宽） │ │
│ └─────────┴─────────────────────────────┴───────────────────┘ │
│ │                  Status（底部信息栏）                        │ │
└───────────────────────────────────────────────────────────────┘
```

## 1. 宿主接入（工作区侧）

每个工作区自己决定何时把框架挂上来：

```tsx
import * as React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceUiContribution } from '@folio/base-contract'

export function createNotesWorkspace(getView: () => React.ComponentType): WorkspaceUiContribution {
  function NotesMain(): React.ReactElement {
    const View = getView()
    return <View />
  }

  return {
    id: 'notes',
    title: '笔记工作区',
    order: 20,
    MainView: NotesMain,
    hideStatusBar: true, // 底部信息栏由框架渲染
  }
}

export const inject = ['folioFrame', 'folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const frame = ctx.folioFrame
    const dispose = ctx.folioShell.registerWorkspace(createNotesWorkspace(() => frame.View))
    const detach = frame.attachHostWorkspace('notes')
    return () => {
      detach()
      dispose()
    }
  }, 'notes: register workspace')
}
```

`attachHostWorkspace` 只做一件事：让 `folioFrame.openApp()` 知道该切回哪个工作区。没有宿主时 `openApp` 仅激活应用，不做导航。

现成的宿主见 `@folio/bridge-frame-test-ui`（测试框架工作区）。

## 2. 注册应用（工作区内部视图）

工作区（或其功能插件）向框架登记一个应用，只声明四个区域里显示什么：

```tsx
import type { FrameAppDefinition, FrameViewProps } from '@folio/base-contract'

function NotesEditorMain({ frame }: FrameViewProps) {
  return <div>中间内容；需要时可读 frame.layout 或调用 frame.toggleRight()</div>
}

const notesApp: FrameAppDefinition = {
  id: 'notes.editor',
  title: '笔记',
  subtitle: '本地知识库',
  pluginId: '@folio/feature-notes-editor-ui',
  icon: NotesIcon,
  order: 20,
  Main: NotesEditorMain,      // 必填
  Left: NotesSidebar,         // 可选
  Right: NotesInspector,      // 可选
  Status: NotesStatus,        // 可选
  rightTitle: '详情',
}

export const inject = ['folioFrame'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.folioFrame.registerApp(notesApp), 'notes: register frame app')
}
```

注册后应用会出现在框架左侧栏的应用切换器里；`registerApp` 返回 disposer，卸载插件即移除。重复注册同一个 `id` 视为热替换，旧 disposer 不会误删新版本。

## 3. 区域契约

| 区域 | 字段 | 框架负责 | 插件负责 |
|---|---|---|---|
| 左侧 | `Left` | 宽度拖拽、折叠为图标轨（`Ctrl+B`）、持久化、`<Sidebar>` 容器 | 内容；可直接使用 `SidebarContent` / `SidebarFooter` / `SidebarMenu*` 等 shadcn 侧栏原语 |
| 中间 | `Main`（必填） | 占满剩余宽度、最小宽度保护、错误边界 | 内容（含自己的页头、滚动容器） |
| 右侧 | `Right` | 标题栏、折叠按钮、左边缘分隔条、宽度拖拽与持久化 | 正文；框架已提供纵向滚动容器 |
| 底部 | `Status` | 28px 信息栏、左侧正文区、右侧布局控件与 Esc 提示 | 左侧信息文本 / 状态组件 |

所有区域都由框架渲染，并收到同一份最新 props：

```ts
interface FrameViewProps {
  appId: string
  frame: FrameController
}
```

未声明的区域**不会渲染空面板**：没有 `Left` 时左侧栏整体消失（多应用时应用切换器自动移到底部信息栏），没有 `Right` 时右侧面板、分隔条与折叠按钮全部不出现，底部控件也会相应隐藏。此时框架不会挂载 `SidebarProvider`，因此其余区域不要使用依赖 `useSidebar` 的侧栏原语（`SidebarTrigger`、带 `tooltip` 的 `SidebarMenuButton` 等）。

## 4. 共享状态：Provider

四个区域是同一棵 React 树里的兄弟组件。若它们需要共享选择、文档或查询状态，给应用声明一个 `Provider`（框架会把四区和底部信息栏一起包进去）：

```tsx
function NotesProvider({ children }: FrameProviderProps) {
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <NotesContext.Provider value={{ selected, setSelected }}>
      {children}
    </NotesContext.Provider>
  )
}

const notesApp = {
  // ...
  Provider: NotesProvider,
  Left: NotesList,      // useNotes()
  Main: NotesEditor,    // useNotes()
  Right: NotesMeta,     // useNotes()
  Status: NotesStatus,  // useNotes() —— 底部信息栏也在 Provider 内
}
```

## 5. FrameController

区域组件通过 props 拿到控制器，无需 import 框架内部模块：

| 成员 | 用途 |
|---|---|
| `layout` | `{ leftCollapsed, leftWidth, rightCollapsed, rightWidth }`，每次拖拽/折叠/切换后都是最新值 |
| `toggleLeft()` / `setLeftCollapsed(v)` | 折叠、展开左侧面板 |
| `toggleRight()` / `setRightCollapsed(v)` | 折叠、展开右侧面板 |
| `setLeftWidth(px)` / `setRightWidth(px)` | 程序化设置宽度（会被限制在框架最小/最大值之间） |
| `resetLayout()` | 丢弃用户调整，回到 `defaultLayout` |
| `listApps()` | 当前已注册应用摘要 |
| `activateApp(id)` | 切换到另一个应用 |

非组件代码（其他 Host 服务、命令）使用 `ctx.folioFrame`：`View` / `registerApp` / `listApps` / `activateApp` / `openApp` / `getLayout` / `setLayout` / `subscribe` / `attachHostWorkspace`。

## 6. 布局与交互规则

- 左侧默认 `272px`（200–460），右侧默认 `320px`（220–620）；中间列保底 `360px`，窗口变窄时显示宽度会自动收缩，但用户设置值仍保留。
- 左侧支持两种折叠：`leftCollapse: 'icon'`（默认，折叠成图标轨，`Sidebar` 原语自动适配）与 `'offcanvas'`（完全移出，左上角出现展开按钮）。
- 快捷键：`Ctrl+B` 折叠/展开左栏（由 `SidebarProvider` 提供），`Ctrl+Alt+R` 折叠/展开右栏。
- 分隔条支持鼠标/触控拖拽、方向键微调（`Shift` 加速）、`Home`/`End` 到极限、双击或 `Enter` 恢复默认。
- 每个应用独立持久化：`activeAppId` 与各应用的宽度/折叠状态写入 `localStorage['folio.frame.v1']`。
- 每个区域独立 `Suspense` + 错误边界：右侧面板抛错不会空白左侧、中间或底部。
- 宿主工作区通过 `hideStatusBar: true` 关闭外壳的全局底栏，由框架自己渲染唯一一条底部信息栏，避免双底栏。

## 7. 边框与主题

框架不引入新的颜色体系：全部使用 `--dsw-*` 令牌（经 `[data-lf-shell]` 映射为 shadcn 的 `bg-background` / `bg-sidebar` / `border-border` / `text-muted-foreground`）。深浅主题切换、圆角与字体自动跟随 DSH。

## 8. 校验

```powershell
pnpm run typecheck
pnpm run build
pnpm run test
```
