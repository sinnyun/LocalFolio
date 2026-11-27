# `@folio/base-tasks-ui` · 后台任务 SSE 订阅与状态栏进度条

`@folio/base-tasks-host` 的客户端配套基础能力插件。通过 `dsh.client.external` 导出多作用域后台任务订阅 Hook（`useFolioTasks`）与统一底栏进度控制组件（`<TaskStatusBar>`），供项目库、归档、Eagle 缩略图补全等工作区与功能插件复用。

## 导出能力一览

| 模块 | 导出符号 | 用途 |
|---|---|---|
| `use-folio-tasks.ts` | `useFolioTasks`、`UseFolioTasksOptions`、`UseFolioTasksResult` | 启动时按 `scopes` 拉取 `tasks.list` 并按 `updatedAt` 降序合并；监听 `folio:topic` 上的 `tasks:<scope>` 与 `tasks:cleared` 事件；提供 `tasks`、`activeTask`、`recentFinishedTask`、`trackTask`、`pauseTask`、`resumeTask`、`cancelTask`、`clearFinishedTasks` |
| `TaskStatusBar.tsx` | `<TaskStatusBar>`、`TaskStatusBarProps` | 活跃态渲染任务标题、百分比进度条、`progress.message` 与暂停/恢复/取消按钮；空闲态渲染 `idleContent` 插槽、最近已完成任务摘要与清除按钮 |

## 依赖的后端动作与 SSE Topic

- **RPC 动作**（由 `@folio/base-tasks-host` 提供）：`tasks.list`、`tasks.pause`、`tasks.resume`、`tasks.cancel`、`tasks.clear`。
- **SSE Topic**（通过 `window` `folio:topic` 自定义事件分发）：`tasks:<scope>`（`TaskSnapshot`）、`tasks:cleared`（`{ scope: string }`）。

## 接入方式

在消费方插件 `package.json` 的 `dsh.client` 中声明依赖并置为 external：

```json
{
  "dsh": {
    "client": {
      "inject": ["@folio/base-ui-kit", "@folio/base-tasks-ui"],
      "external": ["@folio/base-ui-kit", "@folio/base-tasks-ui"]
    }
  }
}
```

在工作区上下文中使用：

```tsx
import { useFolioTasks, TaskStatusBar } from '@folio/base-tasks-ui/client'

const {
  tasks,
  activeTask,
  recentFinishedTask,
  trackTask,
  pauseTask,
  resumeTask,
  cancelTask,
  clearFinishedTasks,
} = useFolioTasks({
  scopes: ['projects', 'thumbs-eagle'],
  onTaskCompleted: task => {
    // 刷新工作区数据
  },
})
```
