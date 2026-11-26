# `@folio/base-tasks-host`

提供 `ctx.folioTasks` Cordis 服务，供各工作区 Host 插件复用后台计算与 I/O 调度能力，避免阻塞主进程或重复编写 Worker 与 SSE 进度逻辑。

## 核心能力

1. **有界并发队列**（`createQueue`）：严格限制并发度（1..16，默认 4），支持 `AbortSignal` 排队取消与 `dispose()` 清理。
2. **Node Worker 线程封装**（`runWorker`）：基于 `node:worker_threads`，支持进度回传、超时控制与取消终止。
3. **后台任务状态机**（`enqueue` / `pauseTask` / `resumeTask` / `cancelTask` / `listTasks` / `clearFinished`）：通过 `runtime.events.emitEvent` 以 200ms 节流向前端 SSE 推送 `tasks` 与 `tasks:<scope>` 事件；状态切换立即刷新。

## 注册动作

- `tasks.list`：查询任务列表（可按 `scope` 过滤）
- `tasks.pause`：暂停指定任务
- `tasks.resume`：恢复指定任务
- `tasks.cancel`：取消指定任务
- `tasks.clear`：清理已结束的历史任务
