# `@folio/base-tasks-ui` · 后台任务 SSE 订阅与状态栏进度条

`@folio/base-tasks-host` 的客户端配套基础能力插件。通过 `dsh.client.external` 导出多作用域后台任务订阅 Hook（`useFolioTasks`）、按任务读取子项明细的 `useTaskItems` / `fetchTaskItems`，以及统一底栏进度控制组件（`<TaskStatusBar>`），供项目库、归档、Eagle 缩略图补全等工作区与功能插件复用。

## 导出能力一览

| 模块 | 导出符号 | 用途 |
|---|---|---|
| `use-folio-tasks.ts` | `useFolioTasks`、`UseFolioTasksOptions`、`UseFolioTasksResult` | 启动时按 `scopes` 拉取 `tasks.list` 并按 `updatedAt` 降序合并；监听 `folio:topic` 上的 `tasks:<scope>` 与 `tasks:cleared` 事件；提供 `tasks`、`activeTask`、`recentFinishedTask`、`trackTask`、`pauseTask`、`resumeTask`、`stopTask`、`cancelTask`、`retryTaskItems`、`clearFinishedTasks` |
| 同上 | `useTaskItems`、`fetchTaskItems`、`UseTaskItemsOptions`、`UseTaskItemsResult` | 读取单个任务的子项分页；`refreshKey` 变化时重新拉取，`live` 时按间隔轮询；用于失败/待处理项的选择与重试 |
| `TaskStatusBar.tsx` | `<TaskStatusBar>`、`TaskStatusBarProps` | 活跃态渲染任务标题、百分比进度条、`progress.message` 与暂停/恢复/停止（或取消）按钮；空闲态渲染 `idleContent` 插槽、最近已完成任务摘要与清除按钮 |

## 依赖的后端动作与 SSE Topic

- **RPC 动作**（由 `@folio/base-tasks-host` 提供）：`tasks.list`、`tasks.items`、`tasks.pause`、`tasks.resume`、`tasks.stop`、`tasks.cancel`、`tasks.retry`、`tasks.clear`。
- **SSE Topic**（通过 `window` `folio:topic` 自定义事件分发）：`tasks:<scope>`（`TaskSnapshot`）、`tasks:cleared`（`{ scope: string }`）。

## 状态约定

`TaskStatus` 除常规的 `queued / running / paused / completed / failed / cancelled` 外，还包含：

- `stopped`：用户点了「停止」，未完成子项保留为 `pending`，可通过重试处理器继续；
- `interrupted`：应用退出时仍在运行，重启后由 Host 账本恢复为中断态，可继续或重试。

`Terminal` 判定包含 `completed / failed / cancelled / stopped / interrupted`。`TaskSnapshot.items` 存在时表示任务已按子项登记，`retryable` 表示当前有注册的重试处理器且仍有失败/待处理项可重试。

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
  stopTask,
  cancelTask,
  retryTaskItems,
  clearFinishedTasks,
} = useFolioTasks({
  scopes: ['projects', 'thumbs-eagle'],
  onTaskCompleted: task => {
    // 刷新工作区数据
  },
})
```

读取并重试某个任务的失败子项：

```tsx
const { page, reload } = useTaskItems({
  taskId: task.id,
  status: 'failed',
  live: task.status === 'running',
  refreshKey: task.items?.failed,
})

await retryTaskItems(task.id, page?.items.map(item => item.key))
await reload()
```

## 任务监控工作区

`@folio/workspace-monitor-ui` 使用这些 Hook 呈现跨工作区任务：筛选与展开状态写入 `localStorage['folio.monitor.v1']`；任务行内提供暂停 / 停止 / 继续 / 取消、分段进度、耗时与预计剩余时间；展开后按状态浏览子项并支持单选、全选失败项、批量重试与“重试全部失败”。
