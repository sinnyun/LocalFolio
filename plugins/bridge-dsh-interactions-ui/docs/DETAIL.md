# @folio/bridge-dsh-interactions-ui · DSH 交互桥接

把 DSH 原生的三件事——`contextMenus`（右键菜单）、`fileDrag`（拖出/拖入文件）、`fileActions`（复制图片、另存）——统一适配成工作台侧的 `ctx.folioInteractions`，并为每一件都准备好**没有 DSH 服务时**的降级路径。工作区只按 `folioInteractions` 写代码，桌面版与纯浏览器跑同一份。

| 能力 | DSH 原生服务 | 有服务 | 无服务（降级） |
|---|---|---|---|
| 右键菜单 | `contextMenus.register / open / close / notify` | 菜单由 DSH 渲染（原生外观） | `FallbackContextMenuHost` 渲染内置菜单 |
| 拖出文件 | `fileDrag.actions.prepare / reportFailure` | 桌面原生拖拽接管（可跨出应用） | 浏览器拖拽，只带 `text/plain` + folio 载荷 |
| 拖入文件 | `fileDrag.read` | DSH 解析拖入的文件 | 无兜底，返回 `undefined` |
| 复制图片 | `fileActions.copyImage` | DSH 写系统剪贴板 | `fetch` + `ClipboardItem` 写入 |
| 另存 | `fileActions.save(…, 'saveAs')` | 系统另存对话框 | `<a download>` 下载 |

## 1. 服务接口

```ts
interface FolioInteractionsService {
  hasNativeContextMenu(): boolean
  hasNativeFileDrag(): boolean
  canSaveAs(): boolean
  registerContextMenu(contribution: FolioContextMenuContribution): () => void
  openContextMenu(target: FolioContextMenuTarget, point: FolioContextMenuPoint): void
  closeContextMenu(): void
  notify(text: string, success?: boolean): void
  createFileDragSession(
    source: FolioFileDragSource,
    fallbackPayload?: { paths: readonly string[]; sourceWorkspace?: string },
  ): FolioFileDragSession
  readDroppedFile(transfer: DataTransfer): File | undefined
  copyImage(source: FolioFileTransferSource): Promise<void>
  saveFile(source: FolioFileTransferSource, mode?: 'download' | 'saveAs'): Promise<void>
}
```

服务在插件 `apply` 里 `ctx.provide('folioInteractions', service)`，同时把内置菜单挂到 `shell.overlay` 第 4 层（id `folio.interactions.fallback-menu`）。`dispose()` 之后 `registerContextMenu` 返回空 disposer，菜单相关调用全部变成空操作。

三个能力探测都是**即时求值**，不是快照：`hasNativeContextMenu()` = `contextMenus` 是否可用（`register` / `open` / `close` 齐全），`hasNativeFileDrag()` = `fileDrag.actions.prepare` / `reportFailure` / `read` 齐全，`canSaveAs()` = `fileActions.canSaveAs` 为真。宿主服务不存在时一律 `false`，所以纯浏览器下 `canSaveAs()` 永远为假。

## 2. 右键菜单

```tsx
ctx.effect(
  () =>
    ctx.folioInteractions.registerContextMenu({
      id: 'notes.entry-menu',
      target: 'folio.notes.entry',
      order: 10,
      resolve: (value, signal) => [
        { id: 'open', label: '打开', run: () => open(String(value.path)) },
        { id: 'delete', label: '删除', separatorBefore: true, danger: true, run: () => remove(value) },
      ],
    }),
  'notes: context menu',
)
```

打开：

```ts
ctx.folioInteractions.openContextMenu(
  { kind: 'folio.notes.entry', value: { path } },
  { x: event.clientX, y: event.clientY },
)
```

`FolioContextMenuAction` 的字段：`id` / `label` / `disabled` / `danger`（危险色）/ `separatorBefore`（上方加分隔线）/ `children`（子菜单，可递归）/ `failureLabel`（`run` 抛错时显示这句，没给就用抛错信息）/ `run`（可返回 Promise）。

`resolve(value, signal)` 的取消语义：

- 每次打开都会新建一个 `AbortController`；`openContextMenu` 再开一次、`closeContextMenu()`、或服务 `dispose()` 都会 `abort()` 上一次的 signal。异步取数据的 `resolve` 应把这个 `signal` 传给自己的请求。
- 降级路径下，同一 `target` 的所有贡献按 `order` 升序、`order` 相同再按 `id` 字典序解析，结果 `flat()` 拼接成一个菜单；任一贡献的 `resolve` 抛错按空数组处理，不拖垮其它贡献。`abort` 之后到货的结果直接丢弃。
- 原生路径下注册是懒的：`registerContextMenu` 时若 `contextMenus` 已在就直接转注册；若它是后出现的，`openContextMenu` 会在打开前把当前 `target` 匹配的贡献补注册一遍。

`notify(text, success?)` 优先走 `contextMenus.notify(text, success)`；没有 DSH 时退到 `toast`，注意**默认 `success = false` 是失败色（danger）**，成功提示要显式传 `true`。

## 3. 文件拖拽

```ts
const session = ctx.folioInteractions.createFileDragSession(
  { kind: 'url', url: downloadUrl(entry), name: entry.name, mediaType: entry.mime },
  { paths: [entry.path], sourceWorkspace: 'files' },
)
session.prepare()   // pointerdown 时预热，异步、可取消、幂等
```

生命周期：

| 方法 | 行为 |
|---|---|
| `prepare()` | 调 `fileDrag.actions.prepare(source, signal)` 预热原生拖拽句柄。重复调用被忽略（`preparing` / `prepared` 守卫）；结果到达时会话已 `dispose` 或已 `abort`，句柄立刻 `release()` |
| `start(transfer, element)` | 返回 `boolean`，见下 |
| `release()` | `abort` 预热、释放原生句柄；可以再次 `prepare()` |
| `dispose()` | 标记会话作废并 `release()`；之后 `start()` 恒返回 `false` |

`start()` 的四条分支：

1. 先写跨工作区载荷：`fallbackPayload.paths` 非空时 `transfer.setData(FOLIO_DRAG_MIME, encodeFolioDragPayload(fallbackPayload))`（`FOLIO_DRAG_MIME = 'application/x-localfolio-items'`，写入受限于 `DataTransfer` 时静默忽略）。
2. 原生句柄已就绪 → 返回它自己的 `start(transfer, element)`。
3. 预热失败（`prepFailed`）→ 先 `fileDrag.actions.reportFailure()`，返回 `false`。
4. 否则走浏览器拖拽：`effectAllowed = 'copy'`、`setData('text/plain', source.name)`，返回 `true`。

调用方契约：**返回 `false` 表示桌面原生拖拽已接管，必须 `event.preventDefault()` 取消浏览器拖拽**，否则两条拖拽会打架。

```tsx
onDragStart={event => {
  if (!event.dataTransfer) return
  const continueBrowserDrag = session.start(event.dataTransfer, event.currentTarget)
  if (!continueBrowserDrag) event.preventDefault()
}}
```

拖入侧 `readDroppedFile(transfer)` 只转给 `fileDrag.read()`；没有 DSH 服务时返回 `undefined`，调用方要么自己读 `transfer.files`，要么把这种情况当「不支持」。工作区之间互拖时用契约里的解码器：

```ts
const payload = decodeFolioDragPayload(event.dataTransfer.getData(FOLIO_DRAG_MIME))
if (payload) dropInto(payload.paths, payload.sourceWorkspace)
```

## 4. 复制与保存

```ts
await ctx.folioInteractions.copyImage({ url: '/lf/files/media?path=a.png', name: 'a.png' })

const mode = ctx.folioInteractions.canSaveAs() ? 'saveAs' : 'download'
await ctx.folioInteractions.saveFile({ url, name }, mode)
```

- `copyImage`：有 `fileActions` 就交给它；否则 `fetch` 取 blob，再用 `navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])` 写入，成功后弹一条 toast。取图失败抛 `读取图片失败 (status)`，环境不支持剪贴板写入抛「当前环境不支持图片剪贴板写入」。
- `saveFile`：有 `fileActions` 时，`mode === 'saveAs'` 但 `canSaveAs === false` 会被降级成 `'download'` 再调用，所以调用方可以无条件试 `'saveAs'`。没有 `fileActions` 就创建隐藏 `<a download>` 点一下。

## 5. 降级菜单

无 DSH 时用内置菜单（`fallback-menu.tsx`），渲染进 `usePortalContainer()` 的 portal：

- 位置取点击点，左/上各夹到窗口内（右留 220px、下留 260px，最小 8px），固定 `zIndex: 95`。
- 支持任意深度子菜单：悬停展开，`depth >= 1` 时向左侧翻转弹出。
- `separatorBefore` 画分隔线，`danger` 用 `text-destructive`，`disabled` 变灰且不响应点击。
- 点击菜单项先 `close()` 再执行 `run()`；`run()` 抛错或 reject 时用 `failureLabel ?? 错误信息` 调 `onError`（插件里接到 danger toast）。
- 菜单打开时在 `document` 捕获阶段听 `pointerdown`（点到菜单外就关）与 `window` 捕获阶段的 `Escape`（`preventDefault` + `stopPropagation`，**不**触发外壳的「Esc 退回 DSH」）。

前提是宿主装了 `FolioUiHost`（portal 容器）；没有 portal 时退化成在原位渲染。

## 6. 为什么是独立插件

外壳（`@folio/base-shell-ui`）不该依赖 `contextMenus` / `fileDrag` / `fileActions`：这三项在 Web 客户端里可能一个都没有，而外壳在每种环境下都必须能开。拆成 bridge 之后：

- `dsh.client.inject` 只依赖 `@folio/base-ui-kit` 与 `@folio/base-shell-ui`；Cordis 的 `inject` 是空数组，三个 DSH 服务全靠 `ctx.get()` 惰性、带 try/catch 地取（`dsh-adapters.ts`），取不到就整体退化到降级路径。
- 工作区只 `inject: ['folioInteractions']`，不关心自己跑在浏览器还是桌面版；桌面能力出现或消失都不需要重写调用点（每次调用都重新探测）。
- 没有 `shell.overlay` 的极简宿主里，`slots.inject` 被 try/catch 包住：服务照常提供、原生菜单照常可用，只是内置菜单没有渲染位置。

## 7. 限制与边界

- `readDroppedFile` 没有浏览器兜底：无 DSH 时返回 `undefined`，不要假设它总能拿到 `File`。
- 浏览器降级拖拽只承诺 `text/plain`（文件名）与 `FOLIO_DRAG_MIME` 载荷；把文件真的拖到桌面（成为文件）需要 DSH 的原生接管。
- 降级菜单的层级是固定 `95`，低于悬浮面板的 `rect.zIndex`（从 `101` 起），面板打开时菜单可能被面板盖住。
- 原生路径下菜单内容由 DSH 渲染，`failureLabel` / `danger` 等字段的呈现取决于 DSH 自己的菜单实现。
- 服务的 `dispose()` 会清空所有贡献并关掉内置菜单，插件被卸载后旧会话不可再用。

## 8. 验证

```powershell
pnpm run typecheck
pnpm run build
pnpm run verify
```

`src/__tests__/interactions.test.tsx` 覆盖：原生路径的注册/打开/退订与 `resolve` 透传、降级路径的子菜单展开与点击关闭、`fileDrag` 预热 + `start()` 返回 `false` 的桌面接管契约、`FOLIO_DRAG_MIME` 载荷写入、`copyImage` / `saveFile('saveAs')` / `readDroppedFile` 的委派。
