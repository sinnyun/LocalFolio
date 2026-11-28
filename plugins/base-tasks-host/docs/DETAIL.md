# `@folio/base-tasks-host`

提供 `ctx.folioTasks` Cordis 服务，供各工作区 Host 插件复用后台计算与 I/O 调度能力，避免阻塞主进程或重复编写 Worker 与 SSE 进度逻辑。

## 核心能力

1. **有界并发队列**（`createQueue`）：严格限制并发度（1..16，默认 4），支持 `AbortSignal` 排队取消与 `dispose()` 清理。
2. **Node Worker 线程封装**（`runWorker`）：基于 `node:worker_threads`，支持进度回传、超时控制与取消终止。
3. **后台任务状态机**（`enqueue` / `observe`）：`queued → running → paused → stopped / cancelled / completed / failed`；暂停、停止、继续、取消都通过 `runtime.events.emitEvent` 以 200ms 节流向前端 SSE 推送 `tasks` 与 `tasks:<scope>` 事件，状态切换立即刷新。
4. **子项明细与单独重试**：`TaskRunHelpers.items` 让生产者在任务内部登记 `{ key, label }` 子项并逐项报告 `begin / succeed / fail / cancel / skip`；`observe` 收到 `item` 时会自动按文件或项目累计子项状态。失败项可通过 `tasks.retry` 交给生产者注册的 `registerRetryHandler(kind)` 重试，原任务子项会标记 `retriedBy`。没有子项账本、只有聚合失败计数的旧任务，会以 `wholeTask: true` 回调处理器，由生产者决定是否按整个范围重试。
5. **账本持久化**：任务历史（含未完成的停止/中断状态与失败子项）写入 `plugins/base-tasks-host/data/tasks.json`。应用重启后，上次仍在运行的任务恢复为 `interrupted`，可继续未完成项或单独重试；已完成历史在监控页仍然可见。写入按 600ms 去抖并经 `@folio/base-storage-host` 原子落盘，单文件上限约 6 MB。

## 暂停 / 停止 / 继续

| 操作 | 语义 | 可恢复 |
| --- | --- | --- |
| `pauseTask` | 协作式暂停：不再启动新子项，正在执行的子项跑完；生产者需在子项边界调用 `helpers.items.checkpoint()` 或 `waitIfPaused()` | 是，`resumeTask` 在原任务内继续 |
| `stopTask` | 中止当前子项并停止调度，未完成子项保留为 `pending`，任务进入 `stopped` | 是，但通过重试处理器为未完成子项新建任务（跨重启同样适用） |
| `resumeTask` | `paused` 原任务继续；`stopped` / `interrupted` 且注册了重试处理器时，把未完成项交给处理器新建重试任务 | 视生产者是否登记 `retry` 描述符 |
| `cancelTask` | 中止并把未完成子项标记为 `cancelled`，任务终态 | 否 |

## 注册动作

- `tasks.list`：查询任务列表（可按 `scope` 过滤）
- `tasks.items`：分页查询子项明细（支持状态过滤、`unfinished` 与 `all`）
- `tasks.pause` / `tasks.resume` / `tasks.stop` / `tasks.cancel`：任务控制
- `tasks.retry`：重试指定子项；不传 `itemKeys` 时重试全部失败/待处理项
- `tasks.clear`：清理已结束的历史任务；仍可继续的 `stopped` / `interrupted` 任务会被保留，避免清理动作丢掉未完成工作

## 生产者接入

```ts
const handle = ctx.folioTasks.enqueue({
  scope: 'demo',
  title: `补全 ${filePaths.length} 个文件`,
  pausable: true,
  retry: { kind: 'demo-thumbs', params: { folderId } },
  run: async helpers => {
    helpers.items.define(filePaths.map(filePath => ({ key: filePath })))
    for (const filePath of filePaths) {
      await helpers.items.checkpoint()   // 暂停等待；停止/取消时抛 AbortError
      helpers.items.begin(filePath)
      try {
        await generateOne(filePath)
        helpers.items.succeed(filePath)
      } catch (error) {
        helpers.items.fail(filePath, error)
      }
    }
  },
})

ctx.effect(() =>
  ctx.folioTasks.registerRetryHandler({
    kind: 'demo-thumbs',
    retry: ({ items }) =>
      enqueueDemoBatch(items.map(item => item.key)).snapshot(),
  }),
)
```

`observe()` 的 `TaskActivityOptions.item` 已自动登记子项，适合“每个文件/项目一次调用”的现有代码；要支持单独重试，再补一个 `retry` 描述符和对应处理器即可。
