# Shadcn Admin（@folio/test-shadcn-admin-ui）

把 [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)（MIT）的后台界面移植成 LocalFolio 工作台插件，注册为工作区 `Shadcn Admin`。

## 这是什么

- **不是**把原仓库当作依赖安装：shadcn-admin 是 Vite 应用模板，没有可安装的包入口；DSH Client 插件要求单模块、React 由平台表提供、不得新增 app root。
- 因此做的是**移植**：品牌图标、演示数据、布局结构与文案取自原仓库；页面改用 `@folio/base-ui-kit` 的 shadcn 原语重新实现，图表用纯 SVG 绘制。

## 已实现

- 布局：图标折叠侧栏（含子菜单、折叠态悬浮下拉）、团队切换、用户菜单、顶栏面包屑、⌘K 命令搜索、Light/Dark/System 主题切换。
- 页面：Dashboard（概览 + Analytics 两个分页）、Tasks、Users、Apps、Chats（收件箱与消息流）、Settings（Profile/Account/Appearance/Notifications/Display）、Auth（Sign In 单列/双列、Sign Up、Forgot Password、OTP 演示）、Errors（401/403/404/500/503）、Help Center 占位。
- 表格：本地 `AdminDataTable`，支持全局搜索、状态/优先级/角色分面筛选、列显隐、排序、分页、行选择与批量删除。
- 数据：任务 100 条、用户 80 条由固定种子 PRNG 生成，刷新不变；新增/编辑/删除只作用于组件内 state。

## 与原模板的差异（有意取舍）

| 原模板 | 本插件 |
| --- | --- |
| TanStack Router 文件路由 | 单工作区内 `AdminRoute` 状态机 |
| recharts | 自绘 SVG 柱状/面积图 + CSS 条形列表 |
| @tanstack/react-table | 自写轻量表格 |
| zod + react-hook-form | 受控表单 + 提交 toast |
| Clerk / axios / TanStack Query | 无后端；登录、邀请等只弹 toast 演示 |
| next-themes 全局主题 | 仅作用于插件子树的内联主题变量，不改宿主主题 |

## 依赖与约束

- 仅 `dsh.client.external` 共享 `@folio/base-ui-kit`，其余依赖（lucide-react、品牌图标）随插件打包。
- 所有弹层通过 base-ui-kit 的受管 Portal 渲染在 `shell.overlay` 内，不写入 `document.body`。
- 不读取宿主 DOM、不注册全局样式；主题变量使用内联 `style`，避免与宿主样式表顺序竞争。

## 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
pwsh -File scripts/lfdev.ps1 install
pwsh -File scripts/lfdev.ps1 restart
```

`lfdev` 是隔离 profile（端口 3081），安装聚合元包 `@folio/workbench-suite` 后即可在顶栏 `LocalFolio` 工作台里打开 `Shadcn Admin` 工作区。
