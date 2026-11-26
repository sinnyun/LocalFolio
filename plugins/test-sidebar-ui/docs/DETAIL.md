# @folio/test-sidebar-ui · 测试侧栏示例 UI

形态 B（自绘全屏）的样板，测试界面（Test Surface）之一：把 shadcn 的 sidebar-07 示例整页搬进一个工作区，验证图标轨折叠、面包屑、嵌套菜单与 Tooltip。它不接四区框架，页面自己就是骨架；最终会删除或并入真实工作区。

## 它验证什么

- 形态 B 能撑起「页面自带侧栏」的布局：`MainView` 直接是 `Sidebar07DemoView`，不需要 `FrameAppDefinition`。
- `Sidebar collapsible="icon"` 的图标轨折叠：宽度收到 `--sidebar-width-icon`（3rem），菜单项退化成图标。
- Tooltip 只在折叠态出现（`SidebarMenuButton` 的 `tooltip` 属性），展开时不挡视线。
- 嵌套菜单：`Collapsible` + `SidebarMenuSub` / `SidebarMenuSubItem` / `SidebarMenuSubButton` 的组合与旋转箭头。
- 下拉菜单与 Tooltip 都在受管 Portal 里渲染，`document.body` 不被污染。
- 面包屑跟随选中项变化：`Breadcrumb` 第一段是分组，第二段是子项。

## 接入方式

工作区注册与画廊同构，只是 id / 排序 / 图标不同：

```tsx
export const sidebarDemoWorkspace: WorkspaceUiContribution = {
  id: 'sidebar-07-demo',
  title: '测试侧栏示例',
  order: 3,
  pluginId: '@folio/test-sidebar-ui',
  icon: FolioIconPanelLeft,
  MainView: Sidebar07DemoView,
}

export const inject = ['folioShell'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const dispose = ctx.folioShell.registerWorkspace(sidebarDemoWorkspace)
    return () => {
      dispose()
    }
  }, 'test-sidebar-ui: register workspace')
}
```

`package.json` 的 `dsh.client` 与画廊一致：`platform: "web"`、`immediately: true`、`inject: ['@folio/base-ui-kit', '@folio/base-shell-ui']`、`external: ['@folio/base-ui-kit']`。

## 页面结构

`src/client.tsx` 是一棵自顶向下的组件树，节点全部来自 `@folio/base-ui-kit/client`：

- `TooltipProvider` → `SidebarProvider`（`h-full min-h-0`）→ `Sidebar collapsible="icon"` + `SidebarInset`。
- `SidebarHeader` 放 `TeamSwitcher`：`DropdownMenu` 里三个团队，选中后只改本地 `activeTeam`，`DropdownMenuShortcut` 显示 `⌘1/2/3`。
- `SidebarContent` 放 `NavMain`（Platform 分组，`Collapsible asChild` 套 `SidebarMenuItem`）与 `NavProjects`（`SidebarMenuAction showOnHover` 出「更多」菜单）。
- `SidebarFooter` 放 `NavUser`：`Avatar` + `AvatarFallback` 与账户菜单。
- `SidebarRail` 提供边缘点击折叠；`SidebarInset` 顶栏是 `SidebarTrigger` + `Separator` + `Breadcrumb`。

## 折叠态行为

`SidebarProvider` 里 `state = open ? 'expanded' : 'collapsed'`，写到 `data-state`；`Sidebar` 再把 `data-collapsible` 写到容器。于是：

- `SidebarMenuButton` 在折叠时被压成 `size-8` 方块，文字由 `overflow-hidden` + `truncate` 收掉。
- 同一个按钮的 `tooltip` 只在 `state === 'collapsed' && !isMobile` 时显示（`TooltipContent` 的 `hidden` 条件），`SidebarProvider` 内层用 `delayDuration={0}` 让悬浮立即出现。
- `NavProjects` 的分组外壳带 `group-data-[collapsible=icon]:hidden`，图标轨形态下整组隐藏，避免只剩一排无标签图标。
- 折叠状态由 `SidebarProvider` 管：`Ctrl+B` / `⌘B` 在窗口级监听切换（页内说明文案也这么写），状态同时写 `sidebar_state` cookie（7 天）。它不读宿主主题，也不进 `localStorage`。

## 数据

`DEMO_DATA` 是源码常量（当前用户、三个团队、四组主导航、三个项目）；选中项是 `Sidebar07DemoView` 里的 `{ group, item }` state，点击子项后同步面包屑与 `SidebarInset` 里的两张状态卡。没有 Host 依赖，不发 RPC。

## 退场

删除本包与 `bundles/test-suite/cordis.patch.yml` 里的 `test-sidebar-ui` 一行。需要留意 `SidebarProvider` 的 `sidebar_state` cookie 是 shadcn 原样行为，卸载插件不会清掉它，下次装回来折叠状态还在。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```
