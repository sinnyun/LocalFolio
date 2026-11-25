# DSH 插件与能力参考手册

> **用途**：LocalFolio 开发 DSH 插件时的单一查阅入口。上半部分回答「插件怎么组成、新东西挂在哪」，下半部分是可直接检索的全量插件包、能力 seam、官方组合包、已占用工具名，以及 master 与本机版本的差异清单。
>
> **双锚点**：本机运行的 `0.2.2-rc.5` + 本地克隆的 `master`（`0.2.3-alpha.2`，commit `4b399c3`，2026-11-22）。**表格以 master 为准**，`本机` 列标记该包在本机 Desktop 构建里是否已存在（`✓` 可用 / `—` 需要升级 DSH 才能装）。

---

## 目录

- [0. 锚点与可信度](#0-锚点与可信度)
- [1. 插件模型](#1-插件模型)
- [2. Manifest 与组合层规范](#2-manifest-与组合层规范)
- [3. 浏览器侧冻结模块表](#3-浏览器侧冻结模块表)
- [4. 服务与能力 Seam 全景](#4-服务与能力-seam-全景)
- [5. 任务导向索引](#5-任务导向索引)
- [6. Web Client Slot 体系](#6-web-client-slot-体系)
- [7. 全量插件包目录](#7-全量插件包目录)
- [8. 官方组合包矩阵](#8-官方组合包矩阵)
- [9. 已被占用的模型工具名](#9-已被占用的模型工具名)
- [10. DSH 侧硬规范](#10-dsh-侧硬规范)
- [11. LocalFolio 落地约定](#11-localfolio-落地约定)
- [12. 校验清单与常见坑](#12-校验清单与常见坑)
- [13. master 与本机 0.2.2-rc.5 的差异](#13-master-与本机-022-rc5-的差异)
- [14. 来源与再生成](#14-来源与再生成)

---

## 0. 锚点与可信度

| 项 | 已安装（运行中） | master（本地克隆） |
|---|---|---|
| 版本 | `0.2.2-rc.5` | `0.2.3-alpha.2`（`@deepseek-ai/dsh-root`） |
| 位置 | `D:\deepseekharness\resources\app.asar\dsh\node_modules\`（Desktop，ASAR） | `F:\AI\geren\deepseek-harness`（普通目录，可 grep） |
| 提交 | 发行版 | `4b399c39a6d1479cd84ca591b4d7c88e24d38a96`（2026-11-22，tag 前的 release 合并） |
| 可装载插件包 | 282 个 / 51 组 | **305 个 / 53 组** |
| 工作区包总数 | 338 个目录 | 397 个包（305 可装载 + 92 个 seam 定义/客户端库/测试与构建工具） |
| 能力 seam | 110 条 | **121 条** |
| 模型工具 | 77 个 | **78 个** |
| 官方可选组合包 | 16 个 | **17 个** |

正文里的路径，`master` 侧相对仓库根（`F:\AI\geren\deepseek-harness`），安装侧相对 `app.asar/dsh/node_modules/`。需要精确签名（`Service` 方法、`Event` 模式、Slot props、Config schema）时，以该包 README/`src` 或运行时 `cordis_inspect` 为准，本文只定位到「哪个包、哪个 ctx 键、什么角色」。

---

## 1. 插件模型

DSH 没有特权内核：模型适配器、工具注册表、会话日志、agent loop 都是插件，都能被配置替换。扩展方式是**把插件挂到别的插件旁边**，所有注册都是副作用，随插件卸载撤销。

### 1.1 最小形态

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'my-plugin'
export const inject = ['tools']          // 依赖的服务；未就绪则不加载

export function apply(ctx: Context) {
  ctx.effect(() => {
    // 注册一切（工具、监听、路由、Slot…）
    return () => { /* 需要手动清理的外部资源 */ }
  })
}
```

三种导出形态，**不要混用**：

| 形态 | 导出 | 何时用 |
|---|---|---|
| 函数 | `export function apply(ctx, config)` + `inject` / `Config` | 绝大多数功能插件 |
| 对象 | `export default { name, inject, apply }` | 需要可复用插件描述对象时（LocalFolio 的 `createXxxPlugin()`） |
| 类 | `export default class X extends Service`（`super(ctx,'x')`） | **要对外提供服务**时；注册随 fiber 自动移除 |

三条生命周期规则：`ctx` 上注册的东西卸载自动回收；自建外部资源必须放进 `ctx.effect` 的 cleanup；注册到**其他上下文**（典型 `agent.ctx`）的是双 owner，插件自己也要留 disposer。

### 1.2 六种交付物

| 形态 | 判定标志 | 回答的问题 |
|---|---|---|
| **Host 插件包** | 有 `main`/`exports`，代码导出 `apply` | 后端能力 |
| **Client（UI）插件包** | 有 `dsh.client` + `exports["./client"]` | 浏览器界面 |
| **双 half 包** | 两者都有 | 前后端各半（LocalFolio 的 `core-*` + `shell-*-ui`） |
| **纯配置 bundle** | 只有 `dsh.bundle.patch`，行指向别人的包 | 组装已有插件（如接一个 MCP server） |
| **聚合 bundle** | `dsh.bundle.patch` + 多条 `insert` + `dependencies` 指向自家插件 | 一键装整套（`@folio/bundle-suite-all`） |
| **连接器插件**（`connector` 组，0.2.3） | Host 包 + `dsh.bundle.patch`，注册第三方服务账号 | 接第三方服务：CLI app plugin（`dsh-cli-account` + `dsh-upstream-skills`）或 MCP connector（`dsh-mcp-account`），页面统一由 `dsh-client-ui-connector-account` 承载 |

另有 **agent preset**（`@deepseek-ai/dsh-agent-preset`）：用 Cordis YAML 声明某类会话的能力组合，属于组合层。

> 注意区分「插件」与「客户端库」：`dsh-client-ui-primitives`、`dsh-client-store`、`dsh-client-ui-slots`、`dsh-client-ui-dockkit`、`dsh-client-web`、`dsh-client-config` 等都**不是可装载插件**（不在 §7 的 305 个里），它们是浏览器侧的库/平台模块，只能被 client bundle import。

### 1.3 新行为挂在哪（架构映射）

| 你要加的东西 | 机制 |
|---|---|
| 模型提供方 | `ctx.llm` 注册适配器 |
| 面向模型的能力 | `ctx.tools.register()`；schema 自动进提示词 |
| 拦截/改写工具调用 | `tools/pre-execute`（waterfall） |
| 单调拒绝 | `ctx.tools.guard()`（同步） |
| 对某 agent 收窄工具 | 该 agent 上下文上的 `ctx.tools.restrict()` |
| 包裹分发（超时/重试/指标） | `tools/execute`（仅 `exec.signal` 可替换） |
| 观察 / 变换结果 | `tools/result` / `tools/post-execute` |
| 提示词片段 | `ctx.systemPrompt.section()` |
| 一次性上下文 | `agent.inject()`（不唤醒 agent） |
| 唤醒并排一轮 | `agent.followup()` / `agent.steer()` |
| 人类斜杠命令 | `ctx.commands.register()` |
| 会话级派生状态 | `ctx.sessionProjections` 单元（**不要**自订阅 `session/event` 重扫） |
| 会话读取/搜索/追踪 | `ctx.sessionQuery` |
| 后台任务 | `ctx.jobs`（+ `job_*` 工具） |
| 定时提醒 | `ctx.schedule` |
| 同会话目标 | `ctx.goals` + `dsh-goal-round-driver` |
| 任务树（替代 Todo） | `dsh-timeline`（可选组合包，0.2.3 新增） |
| 文件系统能力/策略 | `ctx.fs` 提供方或 `fs/*` 事件 |
| 命令执行后端 | `ctx.shell` |
| 持久终端 | `ctx.terminals` + `dsh-tool-terminal` |
| 子代理后端 | `ctx.subagents` |
| Agent Teams 任务板 | `ctx.agentTeams` |
| 搜索/抓取源 | `ctx.web` |
| 语言服务器 | `ctx.lsp` |
| 存储 | `ctx.storage` / `ctx.storageDomain` |
| Web GUI 路由 | `ctx.webServer` |
| Chat 行 | `ConversationNodeDefinition` + `conversation.chat.node` keyed renderer |
| UI 装饰/面板 | `ctx.slots.register()`（§6） |
| 外部事件起会话 | `ctx.webhookRuntime` |
| 浏览器插件读自己的 Host 配置 | `dsh-client-config` 的 `SyncedConfig`（client `apply` 第二参）+ `ctx.config` |
| 遥测 | `ctx.otel` / `ctx.sessionTelemetry` |

---

## 2. Manifest 与组合层规范

### 2.1 组合包 manifest

```json
{
  "name": "@folio/bundle-suite-all",
  "version": "0.2.0-alpha.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./index.js",
    "./icon": "./icon.svg",
    "./locale/*.json": "./locale/*.json",
    "./package.json": "./package.json"
  },
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
  "files": ["index.js", "cordis.patch.yml", "icon.svg", "locale/*.json"],
  "engines": { "dsh": "^0.2.2-rc.5" }
}
```

| 字段 | 语义 |
|---|---|
| `dsh.bundle.patch` | 一个 patch 路径或**有序数组**（同一层按序应用，相对路径相对所在文件） |
| `dsh.bundle.platforms` | 可选，声明支持平台；插件管理器做离线检查 |
| `engines.dsh` | 支持的 DSH SemVer 范围，见 §2.5 |
| `exports["./locale/*.json"]` | 不激活插件即可读 `meta.title` / `meta.description` / `meta.detail` |
| `exports["./icon"]` 或顶层 `icon` | SVG/PNG/JPEG/WebP ≤256 KiB，必须在包内；顶层 `icon` 优先 |
| `files` | 打包白名单；**本地 `link:` 安装不过滤** |
| `peerDependencies` + `devDependencies` | 需与宿主共享实例的 DSH 包**两处都声明** |

只有声明 `dsh.bundle` 的包会在 `dsh plugin add` 时被追加进 `dsh.profile.bundles`；普通库包可装但不产生层。

### 2.2 patch 行格式

```yaml
- insert:
    - id: folio-shell
      name: '@folio/shell-overlay-ui'
    - id: folio-runtime
      name: '@folio/core-host-runtime'
      config:
        port: !!js ctx.profileContext?.port ?? 0
    - id: web-search-alt
      name: '@deepseek-ai/dsh-web-search-deepseek'
      disabled: !!js "!ctx.get('profileContext')"
```

行有 `id`、`name`、`config`、`disabled`、`isolate`、`inject`；`!!js` 在该行注入就绪后求值（`--help` 时提供方不发布服务，这些行不激活）；**行顺序没有加载语义**。

### 2.3 层叠与覆盖

1. profile 的 `dsh.profile.bundles`（按序，先 `dsh-base`）
2. profile 的 `cordis.patch.yml`
3. `$DSH_HOME/cordis.patch.yml`
4. 每个 `--patch` overlay（argv 顺序）

**后层按 `id` 整行胜出，`config` 整体替换而不是深合并。** 覆盖某行必须重述它需要的每一个键；反过来用户也能在自己的 patch 里覆盖你的行，所以把「用户大概率保留」的值设为 schema 默认。

### 2.4 Config 规范

```ts
import Schema from '@deepseek-ai/schemastery'

export interface Config { greeting: string; timeoutMs: number }
export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  timeoutMs: Schema.number().default(30000),
})
export function apply(ctx: Context, config: Config) { /* 已校验、已填默认值 */ }
```

- 不同部署可能需要不同值的参数**必须是 Config 字段**（检验：只改 `cordis.yml` 能不能变）。
- 约束写进 schema，让非法配置在加载时响亮失败；不要导出普通对象冒充 `Config`。
- 改 `config` 触发该插件热替换；注册都是 effect，不残留。
- 持久化配置走 `ctx.configEditor`，凭据走 `ctx.credentials`，**不要自己写配置文件**。
- 客户端要读自己的 Host 配置：用 `dsh-client-config` 的类型 + `SyncedConfig`（`apply(ctx, config)` 的第二参），只读、每个顶层 volatile 字段可能为 `undefined`；跨包读用 `ctx.config.resolveConfigByPackage(name)`。

### 2.5 `engines.dsh` 的精确语义（0.2.3 文档明确）

- 写了 `engines.dsh` 就**只由它决定**，peer 依赖范围被忽略；没写则要求 `peerDependencies` 里每个 `@deepseek-ai/dsh` / `dsh-*` 范围都匹配。
- 下限要**原样带上运行版本的预发布后缀**：运行 `0.2.2-alpha.2` 时 `^0.2.2` 会拒绝它，`^0.2.2-alpha.2` 才接受；`^0.2.2-alpha.2` 接受 `0.2.2-rc.1`、`0.2.2`、`0.2.9`，不接受 `0.3.0`。
- 空串、非法值、`workspace:` 范围会**拒绝所有版本**；非字符串视为 manifest 损坏；两者都不写则在任何版本加载。
- 拒绝时返回 `incompatible-version`，带 `runtimeVersion` 与未满足的 `requirements`。

### 2.6 安装、启用与热更新（0.2.3 语义）

- `plugin_manager` 的 `install_bundle` 负责安装 + 选择层；`list_plugins` / `list_bundles` 给准确 id；`set_plugin` / `set_bundle` 开关；`remove_bundle` 移除。
- 安装结果看 `application` 与 `warnings`，不看日志或进程：`failed` 要诊断，`overridden` 表示被更高层覆盖，`restart-required` 表示未生效。
- 有 HMR 时：新装 bundle 会激活；**已装包的文件在磁盘上变了（含本地 link 目录），下一次 profile 重组就会重载**，触发方式是 `set_plugin` 该行 `enabled: true`（即使本来已启用也会重组）。`install_bundle` 对已装 spec 返回 `already-installed` 且不重载。`client.js` 的变化经 Client HMR 到达已打开页面。
- 不要把「需要重启」当成结论写出来，先重组再探测；也不要因为 slot id 没变就认定浏览器代码已更新。

---

## 3. 浏览器侧冻结模块表

权威来源：`packages/client/web/src/platform.ts` 的 `PLATFORM_MODULES`（种子表、打包 externals、Vite alias 共用同一份，防止模块身份漂移）。实测本机前端 dist 的 seed 对象与它**完全一致**。

| 模块 id | 说明 |
|---|---|
| `react` / `react/jsx-runtime` / `react-dom` / `react-dom/client` | 单实例 React 与新 JSX 运行时 |
| `@deepseek-ai/cordis` | 同一份 Cordis（`Context`、`Service`） |
| `zod` | |
| `@tanstack/react-virtual` | 长列表虚拟化 |
| `@deepseek-ai/dsh-client-store` | 共享视图 store（Zustand/Immer 引擎，React-free 契约） |
| `@deepseek-ai/dsh-client-ui-slots` | Slot 注册表与类型代数 |
| `@deepseek-ai/dsh-client-ui-primitives` | UI 原语（控件、图标、markdown、JSON inspector） |
| `@deepseek-ai/dsh-client-ui-dockkit` | 停靠布局引擎 + React 组件（零 cordis） |

其余事实：

- `PRELOADED_CLIENT_EXTERNALS`（当前为空）与 `STATIC_MODULE_MANIFEST_EXPORT = '__$dsh_client_module_manifest'`：`staticLinked` 库用这个具名导出携带模块清单，其 factory 返回除它以外的导出，`meta` 描述编译后的样式表。
- 开机即加载（不等其它 client 包）：`dsh-client-modules`、`dsh-api-session-controller`、`dsh-client-ui-renderer`、`dsh-client-ui-layout`、`dsh-client-ui-session`、`dsh-client-ui-chat`、`dsh-client-ui-sidebar`。
- 解析失败时报 `require("<spec>") missed the module table — not a platform seed word, not a materialized module, and no registered package factory`。
- **政策口径（本工作区已对齐）**：`references/practices.md` 明确写「不要 `require('@deepseek-ai/dsh-client-ui-primitives')`，也不要加载任何其他 Harness Client 包作为模块；需要控件就照 `src/*.tsx` 与 `*.module.css` 抄一份，类名加自己前缀，只留 `--dsw-alias-*` 令牌」。技术上讲，`primitives` 在冻结表里所以**能跑**，但它是内部包、导出随时会变；一个抛错的组件会让该 Slot entry 整块空白（`slot entry crashed in '<slot>'`）。LocalFolio 已由独立插件 `@folio/core-ui-kit`（基于 Radix UI + `lucide-react` + `.lf-*` 样式）统一提供基础组件与图标，各 UI 插件通过 `dsh.client.external: ['@folio/core-ui-kit']` 单实例复用，客户端产物不再 import 任何 `@deepseek-ai/dsh-client-*`（见 §11.6）。
- 打包：上表全部 `external`；客户端产物导出 `./client`，注册 **id 等于包名**的懒工厂；不要 CDN、第二份 React、UMD 查找；`dsh.client.external` 只登记需要 loader 预载的非基线模块。

---

## 4. 服务与能力 Seam 全景

三种角色，读表前先记住：

| 角色 | 含义 | 你要做的事 |
|---|---|---|
| **核心**（core） | 主干服务，唯一实现，通常不可换 | 注入 → 调用 |
| **服务**（service） | 有明确 API 的领域服务 | 注入 → 调用；少数可注册贡献 |
| **Seam** | 可替换能力：Definition + Provider + Consumer | 换实现 → 写 Provider；用能力 → 当 Consumer |

seam 是「换一个提供方就换掉整个产品」的地方：把 `ctx.fs` 与 `ctx.subprocess` 指向远程沙箱，Bash、PTY、LSP 会一起搬过去（0.2.3 的 `ssh` 组就是这套做法的现成样本）。

| ctx 键 | 角色 | 所属包 | 实现 | 主要消费方 | 说明 |
|---|---|---|---|---|---|
| `ctx.remoteConnection` | `service` | `client-remote-connection` | — | — | 管理二维码邀请、获批的配对申请、Remote 浏览器凭据和匿名登录文档；Client 提供审批控件及独立的 Token 链接入口。 |
| `ctx.actionCards` | `service` | `action-cards` | — | `creation-recommendations`, `client-ui-action-cards` | 负责卡片状态、用户操作和状态通知；各卡片种类注册自己的动作和处理器。 |
| `ctx.pluginRecommendations` | `service` | `plugin-recommendations` | — | `client-ui-plugin-recommendations` | 读取官方插件卡片的当前目录文本，并在用户点击后通过配置插件管理器启用该插件。 |
| `ctx.deepseekChatImport` | `service` | `deepseek-chat-import` | — | — | 提供仅 owner 可用的上传路由，把 DeepSeek 会话导出的每个对话导入为一个会话，并提供浏览器先行检查的上传上限。 |
| `ctx.headlessStartup` | `core` | `headless` | — | `headless` | 将解析后的任务和运行选项提供给无界面运行器及其 sandbox-policy 配置。 |
| `ctx.cotTranslation` | `service` | `experimental-client-ui-cot-translation` | — | — | 为展开的思考内容提供有界的 Session 翻译请求，不改变模型可见历史。 |
| `ctx.translator` | `service` | `experimental-translator` | — | `experimental-client-ui-cot-translation` | 解析 Google 或 Bing 请求，并可选保留统一的实验性 Session 记录。 |
| `ctx.hmr` | `core` | `hmr` | — | `app-boot` | 负责模块和精确配置监听；应用修改共用其队列，自动重载等待应用文件锁。 |
| `ctx.pluginRegistryProbe` | `core` | `client-ui-plugin-manager` | — | `client-ui-plugin-manager` | 在 Host 上并发比较公共安装源响应；初始安装源推荐由 Client 负责。 |
| `ctx.pluginManager` | `core` | `plugin-manager` | — | `plugin-manager` | 与 CLI 共享 profile 包操作，并向 Web 和 Agent 调用方分别报告持久状态与运行状态。 |
| `ctx.connectorAccounts` | `service` | `client-ui-connector-account` | — | — | 保存 CLI 应用插件和 MCP 连接器注册的账号，并通过一个 Remote 把 Host 算好的展示内容提供给插件页；授权页和提示只出现在发起操作的浏览器中。 |
| `ctx.cliAccounts` | `service` | `cli-account` | — | — | 保存每个 CLI 应用插件注册的内容：把 CLI 的绝对路径加入必需的运行时上下文，通过有时限的命令让插件的账号操作一次只执行一个，并在 `ctx.connectorAccounts` 这个注册表已加载时把账号注册进去。 |
| `ctx.pluginMarket` | `core` | `plugin-market` | — | `client-ui-plugin-market`, `plugin-market` | 获取并校验用户配置的索引源；安装通过插件管理器完成。 |
| `ctx.profileContext` | `core` | `app-boot` | — | `plugin-manager` | dsh launcher 提供纯数据形式的 profile 位置与组合输入；重载调度由 dsh-hmr 负责。 |
| `ctx.connection` | `core` | `client-connection` | — | `api-gateway`, `host-frontend-static` | 执行来源策略与共享 HTTP 请求分发；凭据验证归 ConnectionAuthentication，API 适配器注册端点和流。 |
| `ctx.connection.authentication` | `seam` | `client-connection` | `host-authentication-token`, `host-authentication-desktop` | `client-connection` | 按注册顺序尝试作用域拥有的凭据验证器，返回首个存活 Peer；传输来源策略和业务授权仍归各自消费者。 |
| `ctx.forge` | `seam` | `experimental-forge` | `experimental-forge-github`, `forge-gitlab` | `experimental-forge-session`, `experimental-client-ui-forge` | 提供方映射远端与变更请求 URL、按 head 分支查找变更请求并批量读取状态；同一变更请求的监听方共享一个轮询循环。 |
| `ctx.forgeSession` | `service` | `experimental-forge-session` | — | `experimental-client-ui-forge` | Session 投影从 shell 结果与绑定记录派生绑定，并把不含状态的 URL 发布给客户端；推送结果触发按 head 分支的发现，Session 监听方通过 forge 注册表轮询已绑定的变更请求。 |
| `ctx.forgePanel` | `service` | `experimental-client-ui-forge` | — | — | 为每个被跟随的 Session 推送一份面板状态：使用 Session 权限进行的 Git 检查、识别出的代码托管平台及其登录状态，以及带轮询状态的已绑定变更请求。 |
| `ctx.worktrees` | `seam` | `experimental-worktree` | `experimental-worktree` | `experimental-tool-worktree` | 显式实验组合从固定的本地提交创建工作树。检出目录与共享 Git 元数据受现有写权限约束；工作目录服务拥有创建后的 Session 目录。 |
| `ctx.workingDirectory` | `seam` | `working-directory` | `working-directory` | `tool-fs`, `tool-bash`, `tool-pwsh`, `subagent`, `sdk-jsonrpc-server`, `sandbox-policy`, `api-workspace-files`, `api-terminal-controller`, `workspace-changes`, `file-reference-local`, `tool-skill`, `agent-instructions`, `tool-lsp` | 一个 Session 投影维护当前执行目录，只有 Host 操作能移动它。文件系统验证变更，用户上下文报告变更。模型工具基于当前目录解析路径，沙箱边界、文件视图和文件发现也随目录更新。原始元数据保持不变。 |
| `ctx.mcpResources` | `seam` | `mcp-resources` | `mcp-client` | `mcp-resources` | 连接所有者提供的操作在调用 agent 的作用域内服务于共享资源工具。 |
| `ctx.browserUse` | `seam` | `browser-use` | `experimental-browser-use-playwright-mcp`, `experimental-browser-use-chrome-devtools-mcp`, `experimental-browser-use-stagehand-native` | `experimental-browser-use-playwright-mcp`, `experimental-browser-use-chrome-devtools-mcp`, `experimental-browser-use-stagehand-native` | 每个服务实例注册一个提供方拥有的名称。提供方按实时 Session 拥有自己的工具与浏览器资源；共享服务不提供浏览器操作 API。 |
| `ctx.computerUse` | `seam` | `computer-use` | `experimental-computer-use-cua-driver-mcp`, `experimental-computer-use-cua-driver-native` | `experimental-computer-use-cua-driver-mcp`, `experimental-computer-use-cua-driver-native` | 每个服务实例只注册一个提供方自定的名称。各提供方也拥有自己的模型工具；服务不提供通用操作 API、运行时选择或 Session 流程锁。 |
| `ctx.cuaAccess` | `core` | `cua` | — | `cua` | 原生 provider 负责应用授权和取消操作；可选的 Client 权限页面通过 Remote 查询和修改授权。 |
| `ctx.cuaPrograms` | `core` | `cua` | — | `cua-mcp` | 提供方持有保留的 cua_run_code 运行时；没有模型的宿主通过它释放单个 Agent 的环境，并读取已配置的截图请求目标。 |
| `ctx.officeKit` | `core` | `office-kit` | — | `client-ui-sidebar-documentpreview`, `tool-office` | 已授权的 Office 字节在宿主上使用已声明的原生目标引擎渲染为 PDF 或图片、转换或重算；未声明原生目标时使用 Node WASM。 |
| `ctx.attachments` | `seam` | `attachment` | `attachment-local` | `api-session-controller`, `tool-fs`, `llm-pi-ai`, `llm-deepseek` | 宿主会在会话事件之前提交已接受的图片；提供方适配器将已授权的持久引用解析为提供方原生内容。 |
| `ctx.fileUploads` | `core` | `client-file-upload` | — | `api-session-controller` | 负责流式接收、持久存储和暂存回执生命周期；Session Controller 将回执绑定到已接受的提交。 |
| `ctx.llm` | `seam` | `llm` | `llm-deepseek`, `llm-pi-ai`, `llm-replay` | `agent-loop`, `compaction-basic` | 适配器注册提供方实现；agent loop（智能体循环）与压缩功能调用提供方无关的流服务。 |
| `ctx.sessionLogDeepSeek` | `core` | `session-log-deepseek` | — | — | 插件在准备权威 Session 日志请求贡献前注册归调用方所有的排除条件；没有条件匹配的请求应用普通上传资格判断。 |
| `ctx.deepseekLlmApiExtensions` | `seam` | `deepseek-llm-api-extensions` | `session-log-deepseek`, `plugin-package-inventory-deepseek` | `llm-deepseek` | 插件准备彼此独立的顶层字段；官方适配器会合并这些字段，并在 HTTP 接受后提交其交付状态。 |
| `ctx.tokenMeter` | `core` | `token-meter` | — | `compaction-basic` | 拥有按会话隔离的回放折叠区；压力消费方共享不可变且带修订版本的测量结果。 |
| `ctx.toolResultPruner` | `core` | `compaction-tool-result-pruner` | — | `compaction-basic` | 在摘要压缩前，通过可回放的单节点表层替换来改写过大的当前工具结果。 |
| `ctx.sessions` | `core` | `session` | — | `agent-loop`, `agent`, `session-persistence`, `session-query`, `session-query-sqlite`, `subagent`, `message-feedback` | 拥有仅追加的 Session 实例，并发出持久的会话事件流。 |
| `ctx.speechController` | `core` | `experimental-api-speech-to-text` | — | — | 在 Provider 调用前校验受限的浏览器音频。 |
| `ctx.sessionStatus` | `core` | `client-ui-session-status` | — | `client-ui-session-status` | 在会话历史之外保存使用者的阅读确认和手动未读标记；其前端部分通过 Remote 订阅已保存的更新、确认已加载的完成内容，并提供会话状态表。 |
| `ctx.sessionController` | `core` | `api-session-controller` | — | — | 负责 Session 命令、冷读取、持久事件跟随、实时控制状态、模型目录、workspace 打开与 Agent 激活策略。 |
| `ctx.sessionFileReferences` | `core` | `api-session-controller` | — | — | 通过 Session Controller 的既有 Agent lookup 策略委托文件引用发现。 |
| `ctx.sessionSkillCatalog` | `core` | `api-session-controller` | — | — | 在不激活冷 Agent 的前提下列出 Session 组合中允许用户调用的 skill。 |
| `ctx.jobController` | `core` | `api-job-controller` | — | — | 经生成的 Remote namespace 流式发送一个后台任务的观测 record；名册仍在会话控制流上。 |
| `ctx.credentialsController` | `core` | `api-settings-controller` | — | — | 把凭据引用 seam 投影到生成的 Remote namespace：批量扇出、视图投影与拒绝映射都在这里，而不在 seam Definition 上。 |
| `ctx.settingsController` | `core` | `api-settings-controller` | — | — | 把用户设置 seam 投影到生成的 Remote namespace：读取一律脱敏，所有拒绝在这里分类，而不在 seam Definition 上。 |
| `ctx.workspaceFiles` | `core` | `api-workspace-files` | — | — | 为会话工作区根内的文件提供 stat、分页文本、字节窗口、目录列举与变更流，经 lstat、包含关系与 stat 重检限定。 |
| `ctx.workspaceChanges` | `core` | `workspace-changes` | — | — | Serves the summary each workspace/changes event announced and each listed file's turn-start and turn-end comparison, by Session and event sequence, until that Session is disposed; the log carries only the turn. |
| `ctx.terminalController` | `core` | `api-terminal-controller` | — | — | 通过子进程提供方与类型化 Remote 传输管理用户终端进程、解析默认 shell，并恢复有界终端屏幕。 |
| `ctx.workspaceController` | `core` | `api-workspace-controller` | — | — | 通过生成的 Remote namespace 负责 Workspace 命令和可在重连后收敛的 Workspace 状态投递。 |
| `ctx.directoryPickerController` | `core` | `api-workspace-controller` | — | — | 把选目录 seam 送上线：能力门禁、取消传播，以及浏览器目录流程用于分支判断的 seam 错误码。 |
| `ctx.typert` | `core` | `typert-registry` | — | `typert-loader`, `api-gateway` | 插件直接或通过 dsh-typert-loader 注册实时 zod 贡献；API 网关消费调用描述符和提供方，其他运行时消费方则在各自边界查询 schema 与反射元数据。 |
| `ctx.typertGateway` | `core` | `api-gateway` | — | — | 将生成的 Remote 描述符与实时 Cordis 服务关联，解析已注册的身份，并通过共享的 Connection RPC 载体提供一元调用。 |
| `ctx.remoteAccess` | `core` | `api-remote-access` | — | `api-gateway`, `api-session-controller`, `api-workspace-controller` | 通过业务方注册的基于 role 的 policy 判定非 owner Peer 可调用哪些 Remote 方法，过滤列表结果，并为每个 Peer 推送访问快照。 |
| `ctx.sessionPersistence` | `seam` | `session-persistence` | `session-persistence-jsonl` | `agent-loop`, `tool-bash`, `hooks-claude-code`, `hooks-codex`, `session-query`, `session-query-sqlite`, `message-feedback` | JSONL backend 把 SessionEvent 词汇持久化为每个 Session 一份产物。 |
| `ctx.configEditor` | `core` | `config-editor` | — | `settings`, `agent-default-model` | Persists profile config patches under the application file lock and HMR queue, then reconciles Loader entries. |
| `ctx.settings` | `core` | `settings` | — | `api-settings-controller` | Forms project volatile Config fields from active profile entries and delegate validated edits to config-editor. Plugins consume their own Config references. |
| `ctx.subagentModelSelection` | `core` | `tool-subagent` | — | `tool-subagent` | 拥有默认关闭的设置命名空间；Agent 作用域的委派工具会在组合新顶层 Session 时读取它。 |
| `ctx.credentials` | `seam` | `credentials` | `credentials-local` | `api-settings-controller`, `deepseek-auth`, `llm-pi-ai` | 配置携带对机密信息的引用；提供方拥有实际值。消费方按操作解析，因此轮换后的凭据会在紧接着的下一次请求中生效；settings controller 提供不含实际值的视图和只写存储。 |
| `ctx.deepseekAccount` | `service` | `deepseek-account` | — | `deepseek-auth`, `llm-deepseek-account` | Host 负责浏览器授权和本地凭证，并向 DeepSeek 请求鉴权释放按请求的凭据；账号模型路由注册其运行中任务报告，UI 使用方只接收不含 token 的状态。 |
| `ctx.deepseekAuth` | `service` | `deepseek-auth` | — | `llm-deepseek-account`, `llm-deepseek-api-key`, `web-deepseek-api`, `web-search-deepseek` | 每个 DeepSeek API 消费方给出其 API 接受的凭据种类；服务按计费方式排定 API 密钥与账号登录的顺序，把每一种绑定到其部署，并释放请求头。 |
| `ctx.authorization` | `seam` | `authorization` | — | `llm-pi-ai` | flow 由知道如何取得某份凭据的插件注册，并以其写入的记录为键；seam 拥有这段对话与"每个键同时只跑一次尝试"的生命周期，而非协议本身。 |
| `ctx.productAnalytics` | `service` | `client-product-analytics` | — | — | 根据 Host 动态采集策略接收指定桌面事件、补充可用登录身份并监听实时压缩。 |
| `ctx.otel` | `service` | `otel` | — | `host-product-telemetry-otel`, `session-telemetry-otel` | 产品埋点和 Session 反馈适配器通过同一个注入服务创建独立上报通道。 |
| `ctx.productTelemetry` | `service` | `host-product-telemetry-otel` | — | — | 通过 OTLP/HTTP 发送显式提交的分析事件；仅挂载插件不会采集信息。 |
| `ctx.sessionTelemetry` | `seam` | `session-telemetry` | `session-telemetry-otel` | — | 该 seam 捕获会话记录、进行脱敏并交给一个后端；没有其他组件消费该服务，其输出会离开当前进程。 |
| `ctx.storage` | `seam` | `storage` | `storage-json`, `storage-sqlite` | `storage-domain` | 各后端以不同名称并列注册；数据形态（领域优先）挂载到枢纽上，并将类型化操作转换为不透明的 KV 单元原语。 |
| `ctx.storageDomain` | `core` | `storage-domain` | — | `workspace` | 等待所有已配置后端就绪，然后将领域形态发布为一个受生命周期约束的服务，用于类型化持久状态。 |
| `ctx.messageFeedback` | `core` | `message-feedback` | — | — | 拥有权威 Session 日志中的逐 assistant 消息反馈、目标校验、逐条目 compare-and-set 及 Host 一元 Remote 契约。反馈不进入模型历史；日志导出遵循消费方策略。 |
| `ctx.sessionFeedback` | `core` | `command-feedback` | — | — | 通过 Host 一元 Remote 契约在 live Session 上把一条带分类的 Session 级评价记录为仅写日志的 feedback/record 事件；/feedback 命令共用同一个生产方。 |
| `ctx.workspaceRegistry` | `core` | `workspace` | — | `api-workspace-controller`, `api-session-controller` | 通过领域设施拥有带 WorkspaceId 品牌类型的记录；稳定的 sessionIds 账户驱动 Host RPC 与 GUI 投影。 |
| `ctx.sessionQuery` | `seam` | `session-query` | `session-query-sqlite` | `session-reference`, `tool-session-query` | 该接口提供精确读取、过滤和追踪；具体后端还提供全文协调、排序、摘要片段和游标世代，而模型消费方负责工作区权限与不含游标的渲染。 |
| `ctx.fileReferences` | `seam` | `file-reference` | `file-reference-local` | `api-session-controller` | 该接口返回 Agent cwd 内仅含路径的补全候选；提供方负责命名空间访问与排序，但不读取文件内容。 |
| `ctx.sessionReferenceResolver` | `core` | `session-reference` | — | — | 将当前表层中有界的对话快照投影为持久但不可信的消息上下文；Host 适配器负责提及语法。 |
| `ctx.sessionTitle` | `seam` | `session-title` | `session-title-first-prompt-llm`, `session-title-all-prompts-llm` | — | 负责确定性回退、最新标题折叠区，以及唯一的可选异步提供方注册。 |
| `ctx.systemPrompt` | `core` | `system-prompt` | — | `agent-loop`, `tools`, `tool-fs`, `tool-terminal`, `tool-web` | 为每个步骤收集提示词各部分和面向模型的工具 schema。 |
| `ctx.tools` | `core` | `tools` | — | `agent-loop`, `tool-ask-user`, `tool-bash`, `tool-cordis`, `tool-fs`, `tool-terminal`, `tool-skill`, `tool-subagent`, `tool-todo`, `tool-web` | 注册能力和作用域执行器。原生与 PTC 提供者负责工具描述及完整原始调用批次；它们可选用共享流水线处理工具策略和分发。 |
| `ctx.userQuestions` | `seam` | `user-questions` | — | `tool-ask-user` | UI 前端提供当前生效的人工回答提供方；tool-ask-user 在提供方无关的 ask() promise 上暂停工具调用。 |
| `ctx.planMode` | `core` | `plan-mode` | — | — | 折叠已记录的计划／模式状态，在轮次边界刷新用户选择，渲染由部署方拥有的指导信息，注册 /plan，并在状态转换期间保持计划退出 schema 稳定。 |
| `ctx.agentPresets` | `core` | `agent-preset-registry` | — | — | 立即挂载 YAML 声明的 preset 版本，把 Agent 和冷读取绑定到作用域内的贡献，并保留已替换的版本，直到最后一个使用者释放它。 |
| `ctx.commands` | `core` | `commands` | — | — | 插件注册直接面向人的命令，而不会把调用发送给模型。 |
| `ctx.sessionProjections` | `core` | `session-projection` | — | `api-session-controller`, `tool-todo`, `session-title` | 各领域注册由状态驱动的折叠单元；主动驱动过程维护每个会话的水位状态，Session controller 提供 baseline 并推送发生变化的值。 |
| `ctx.sessionProjectionCache` | `core` | `session-projection-cache` | — | `api-session-controller`, `session-query`, `session-reference` | 按会话持久保存投影单元状态的检查点（节流检查点，以及轮次／结束／分离时的必选检查点），提供缓存投影视图，并加速 prepared Session 的投影恢复。 |
| `ctx.skills` | `seam` | `skill` | `sandbox-windows-acl`, `skill-badge`, `skill-filesystem`, `skill-office` | `tool-skill` | 合并提供方的 skill（技能）目录；tool-skill 渲染会话前缀目录，并加载完整的 skill 正文。 |
| `ctx.upstreamSkills` | `service` | `upstream-skills` | — | — | 保存每个 CLI 应用插件注册的内容：从厂商 GitHub 仓库下载其入口技能索引的固定上游文件，校验并缓存，文件就位后通过 `ctx.skills` 列出入口技能。 |
| `ctx.agents` | `core` | `agent` | — | `agent-loop`, `acp`, `subagent` | 拥有实时 Agent 句柄、创建／恢复工厂 seam，以及进程本地的发起方传播。 |
| `ctx.agentDefaultModel` | `core` | `agent-default-model` | — | `api-session-controller`, `headless` | Reads the default ModelSelection from volatile Config and saves selections through the profile editor. |
| `ctx.agentLoop` | `bundle` | `agent-loop` | — | `base`, `sdk-minimal` | 唯一的具体循环插件；扩展包依赖 dsh-agent 的事件和服务，而不依赖此包。 |
| `ctx.mcpManager` | `core` | `mcp-manager` | — | — | 依据自身 volatile servers 配置对账 mcp-client 实例，聚合它们的连接状态，并向管理界面提供 restart 与 probe。 |
| `ctx.mcpClientHost` | `service` | `mcp-client` | — | `mcp-manager` | 管理器创建它来校验、挂载、探测和授权服务器，此外不使用 mcp-client 的任何值；其服务器运行在管理器之下。 |
| `ctx.mcpAccounts` | `service` | `mcp-account` | — | — | 在插件页通过连接器账号注册表显示每个 MCP 连接器插件注册的 OAuth 服务器账号；页面的操作经由管理器执行。 |
| `ctx.schedule` | `core` | `schedule` | — | — | 独立于 Session 的加载状态存储任务，并将到期消息排入每个任务的目标 Session。 |
| `ctx.goals` | `core` | `goal` | — | — | 从会话日志折叠带修订版本的目标状态，并将实时延续激活保留在进程本地。 |
| `ctx.ssh` | `core` | `ssh` | — | `fs-ssh`, `subprocess-ssh`, `sandbox-ssh` | 负责一条经过认证的 OpenSSH 连接、已安装辅助程序身份、独立程序流，以及配套远端提供方的断连清理。 |
| `ctx.subprocess` | `seam` | `subprocess` | `subprocess-local`, `subprocess-ssh` | `bash-local`, `bash-sandbox`, `terminal-bash`, `lsp-stdio`, `subagent-acp`, `subagent-codex`, `subagent-claude-code` | Bash 执行器、PTY shell 后端、LSP Host，以及进程外 ACP、Codex 和 Claude Code subagent 后端都通过 ctx.subprocess 执行 spawn；该服务负责进程坐标、进程树／会话生命周期、stdio 处置、终端机制和 kill 升级。 |
| `ctx.shell` | `seam` | `shell` | `bash-local`, `bash-sandbox`, `pwsh-local` | `tool-bash`, `tool-pwsh`, `hooks-claude-code`, `hooks-codex` | 面向模型的 shell 工具和钩子桥接消费此 seam；沙箱、远程或 PowerShell 执行器可以替换 bash-local，而无需改动这些消费方。 |
| `ctx.shellEnv` | `core` | `shell-env` | — | `tool-bash`, `tool-pwsh` | 插件声明限定于 effect 作用域的 DSH_* 事实；每个 shell 工具在每次执行时收集一份可信快照，其执行器据此重建命名空间。 |
| `ctx.terminals` | `seam` | `terminal` | `terminal-bash`, `terminal-panel` | `tool-terminal` | 注册表负责精确到 Agent 的会话身份和清理；后端负责终端机制，tool-terminal 则提供限定于所有者作用域的模型接口。 |
| `ctx.sandbox` | `seam` | `sandbox` | `sandbox-local`, `sandbox-ssh` | `bash-sandbox`, `terminal-bash`, `api-terminal-controller` | 消费方交出即将执行 spawn 的确切 argv；与配套子进程提供方共享执行环境的后端按每次调用的策略包装该 argv，并报告强制执行情况。 |
| `ctx.sandboxPolicy` | `core` | `sandbox-policy` | — | `bash-sandbox`, `fs-sandbox`, `terminal-bash`, `terminal-panel` | 统一保存部署默认模式和工作区根目录；只有沙箱执行器和提供方读取该服务（工具层使用它同时导出的纯 `sandbox/mode` 折叠区）。两类强制执行组件都读取该服务，因此 bash 与 fs 不会限制到不同的根目录。 |
| `ctx.approval` | `seam` | `user-approval` | — | `tools`, `tool-bash`, `acp` | 一次性权限决策通过 `approval/request` waterfall（瀑布式事件）分派；回答方是监听器（即 ACP 为自身 agent 提供的桥接），没有回答方时以 `unavailable` 关闭失败。 |
| `ctx.permissionPresets` | `core` | `permission-presets` | — | — | 面向用户的预设表（`workspace-write`／`danger-full-access`），将沙箱模式与审批策略选项组合在一起；一次切换会写入一个 `permission/preset` 事件，并贯通到两个选项事件。 |
| `ctx.ptcRuntime` | `seam` | `ptc-runtime` | `ptc-runtime-node` | `tool-executor-ptc`, `workflow-ptc` | 使用 Host 提供的异步绑定运行程序；tool-executor-ptc 负责 PTC 呈现，workflow-ptc 负责工作流编排。 |
| `ctx.fs` | `seam` | `fs` | `fs-local`, `fs-sandbox`, `fs-ssh` | `tool-fs` | tool-fs 通过 ctx.fs 执行读取／写入／编辑；fs-sandbox 按共享沙箱模式限制变更；fs-observation-policy 通过 fs/* 事件门禁贡献基于观测状态的检查。 |
| `ctx.compaction` | `seam` | `compaction` | `compaction-basic` | `compaction-basic` | 基础后端消费步骤后的压力事件和请求错误恢复事件；不存在面向模型的压缩工具。 |
| `ctx.subagents` | `seam` | `subagent` | `subagent-spawn-in-process`, `subagent-fork-in-process`, `subagent-acp`, `subagent-codex`, `subagent-claude-code`, `subagent-dsh-sdk` | `tool-subagent`, `tool-subagent-control`, `tool-ralph` | 提供方准备本地子级或执行外部任务；一个 activation 管理器持有两类生命周期。委派工具选择后端，控制工具投递本地后续消息，工作流等待 activation 结果。 |
| `ctx.speechToText` | `seam` | `experimental-speech-to-text` | `experimental-speech-to-text-sensevoice` | `experimental-api-speech-to-text` | 路由显式选择的识别器；浏览器使用带认证的 Remote，并在提交前将转写保留在草稿中。 |
| `ctx.agentTeams` | `core` | `agent-team` | — | `tool-agent-team` | 负责子代理树共享的任务 DAG；tool-agent-team 提供任务控制工具。 |
| `ctx.claudeCodeMods` | `core` | `experimental-claude-code-mods` | — | — | 加载 defineMod 插件添加的模组，从 harness 扩展点触发其钩子链，并通过其 Remote 绘制提示框上方的横幅。 |
| `ctx.inspector` | `core` | `inspector` | — | — | 负责 Worker 托管的 CDP target，以及独立于传输的 Host 和 Client observation 与 Cordis tree query API。 |
| `ctx.jobs` | `seam` | `jobs` | `jobs-local` | `tool-bash`, `tool-pwsh`, `tool-terminal`, `tool-jobs`, `api-job-controller` | 生产方（后台 bash/pwsh 与 PTY 发送）登记正在运行的工作；声明 record 的 job 还为非消费观察者流式提供原始输出；tool-jobs 是面向模型的控制器，用于读取、列出和终止这些工作；jobs-local 是进程本地注册表。 |
| `ctx.web` | `seam` | `web` | `web-search-deepseek`, `web-deepseek-api`, `web-fetch-http` | `tool-web` | 搜索和抓取提供方注册到同一个 ctx.web seam；tool-web 负责稳定的面向模型名称。 |
| `ctx.spillStore` | `seam` | `spill` | `spill-local` | `spill-policy` | 后端保存过大的工具文本，并返回面向模型的定位信息和取回提示；spill-policy 是 tools/post-execute 消费方，负责决定何时 spill。 |
| `ctx.directoryPicker` | `seam` | `host-directory-picker` | `host-directory-picker-native`, `host-directory-picker-browse` | `api-workspace-controller` | 带判别标记的交互能力：原生后端在 Host 显示设备上打开一个操作系统选择器，浏览后端为应用内浏览器提供列表与创建原语；双端后端通过其浏览器侧填充 ui-workspace 目录流程的 slot（不通过协议发布）。 |
| `ctx.webServer` | `core` | `host-webserver` | — | `client-connection`, `client-modules`, `client-hmr` | 普通的 node:http 载体：具名路由注册表、索引转换 tap，以及静态 dist 回退；Web 传输插件注册自己的路由。 |
| `ctx.webApp` | `core` | `web-app` | — | `harness-dev-context` | web-runtime 行为其 Web GUI 公告一个 URL：配置了 publicUrl 时用它，否则用监听器 origin；DSH_WEB_URL、启动 URL 与 harness-dev-context 读取同一个值。 |
| `ctx.config` | `service` | `client-config` | `client-modules` | — | 只有类型的声明；client-modules 插件面提供对各包当前同步 Config 的只读查询。 |
| `ctx.clientModules` | `core` | `client-modules` | — | `client-hmr` | 通过增量 `dsh.client` 扫描组合 __DSH_BOOT__ 入口图，提供插件组合包，并通知重建／图变更订阅方。 |
| `ctx.workflowEngine` | `seam` | `workflow` | `workflow-ptc` | `tool-workflow`, `tool-ralph` | 每个上下文使用一个引擎，与 bash 相同，且没有具名提供方注册表；通用工作流与固定 Ralph 消费方启动运行，其中的 agent() 调用通过 ctx.subagents 扇出。 |
| `ctx.webhookRuntime` | `core` | `webhook` | — | `webhook-github` | 提供方适配器分派已认证交付；可信插件注册独立的进程本地规则，runtime 把非 null 结果转换为普通的 Workspace-backed Session，不保留交付或完成状态。 |
| `ctx.lsp` | `seam` | `lsp` | `lsp-stdio` | `tool-lsp` | 提供方注册与选择，加上恰好四种操作的标准化查询执行；该 seam 不提供协议逃生口，后端必须转换为标准化请求和结果。 |
| `ctx.dynamicCordisRunner` | `core` | `cordis-host-runner` | — | `tool-cordis` | 拥有内存定义注册表、Host 半的 vm 沙箱和 request-run 往返流程；浏览器页面通过其 Remote 命名空间在线访问同一服务。 |
| `ctx.cordisInspect` | `core` | `cordis-host-runner` | — | `tool-cordis` | 注册 Host inspect 提供方、镜像 Client 提供方 manifest，并通过动态 Cordis 传输路由 Client 查询。 |
| `ctx.liveshareShares` | `service` | `experimental-liveshare` | — | — | 以单个 Typert Remote 命名空间发布 owner 分享管理操作，供 owner 客户端面调用；每个方法都委托给同源路由原先使用的同一组操作。 |

> 上表由 `docs/capability-seams.zh.md` 生成（master 121 条；本机 0.2.2-rc.5 为 110 条）。该文档随 `scripts/gen-doc-graphs.ts` 生成，不要手改。

---

## 5. 任务导向索引

| 目标 | 机制 | 参考包（省略 `@deepseek-ai/`） | 关键约束 |
|---|---|---|---|
| 加模型工具 | `ctx.tools.register()` / `defineTool` | `tool-fs`、`tool-web`、`tool-todo` | 工具名全局唯一（§9）；schema 自动进提示词 |
| 加权限门禁 | `tools/pre-execute` waterfall | `user-approval`、`permission-presets`、`experimental-auto-review` | 不掌权必须 `next()`；`ask` 交 `ctx.approval` |
| 单调拒绝 | `ctx.tools.guard()` | `tool-call-timeout-policy` | guard 同步；要 await 用 `ask` |
| 收窄某 agent 工具 | `ctx.tools.restrict()` | — | 展示/查找/执行三者对齐 |
| 提示词段 | `ctx.systemPrompt.section()` | `agent-instructions`、`persona` | 不要用 `system-prompt/assemble` 增删工具/文字 |
| 一次性上下文 | `agent.inject()` | `time-context`、`session-reference` | 不唤醒 agent；记为 `agent/inbox/spliced` |
| 斜杠命令 | `ctx.commands.register()` | `command-compact`、`command-goal`、`command-feedback` | 不经模型轮次 |
| 设置页 | `dsh-client-ui-settings*` slot + `ctx.settings` + `ctx.configEditor` | `client-ui-settings-general`、`client-ui-settings-models` | 表单字段来自活着的 profile 条目 |
| 客户端读自己的配置 | `dsh-client-config` 的 `SyncedConfig` / `ctx.config` | `client-config`、`client-modules` | 只读；字段可能 `undefined`；无写操作 |
| Chat 行/节点 | `ConversationNodeDefinition` + `conversation.chat.node` | `client-ui-chat`、`client-ui-workflow-run` | 分页/摆位由 Conversation 层负责 |
| 会话状态浮层 | `ui-session-panel` 的分区注册 | `client-ui-session-panel`、`client-ui-session-status` | 0.2.3 新增；分区由插件注册 |
| 侧栏面板 | `sidebar.*` slots | `client-ui-sidebar`、`client-ui-sidebar-right`、`client-ui-jobs` | list 里给唯一 `id` + `order` |
| 后台任务 | `ctx.jobs.register` | `jobs-local`、`tool-jobs` | 声明 record 的 job 才能被观察流读到 |
| 定时任务 | `ctx.schedule` + `followup(...,{source:{kind:'schedule'}})` | `schedule`、`tool-schedule` | Host 级，独立于 Session |
| 任务树替代 Todo | `dsh-timeline`（组合包） | `timeline` | 长程任务；实时进度条 + 定时报告 |
| 搜索/抓取源 | `ctx.web` 提供方 | `web-search-deepseek`、`web-fetch-http`、`web-deepseek-api` | `tool-web` 提供稳定工具名 |
| 文件系统能力/策略 | `ctx.fs` 提供方或 `fs/*` | `fs-local`、`fs-sandbox`、`fs-observation-policy` | 与 `ctx.sandboxPolicy` 同一写入根 |
| 换 shell 执行器 | `ctx.shell` 后端 | `bash-local`、`bash-sandbox`、`pwsh-local` | `pwsh-*` 同 seam |
| 远程执行（新） | `ctx.ssh` + 三个配对提供方 | `ssh`、`fs-ssh`、`subprocess-ssh`、`sandbox-ssh` | 一条认证连接，配套提供方断开即清理 |
| 持久终端 | `ctx.terminals` + `tool-terminal` | `terminal-bash`、`terminal-panel` | owner 作用域 id |
| 语言服务（新） | `ctx.lsp` 提供方 | `lsp`、`lsp-stdio`、`tool-lsp` | 只 4 个标准操作，无协议逃生口 |
| 委派子代理 | `ctx.subagents` 提供方 | `subagent-spawn-in-process`、`subagent-fork-in-process`、`subagent-acp` | 委派工具选后端 |
| 会话控制（新） | `tool-session-control` / `tool-session-list` | `tool-session-control`、`tool-session-list` | 向普通 Web 会话发消息要回执；列表工具只读分页 |
| 接 MCP server | `dsh-mcp-manager` 配置或纯配置 bundle | `mcp-client`、`mcp-manager`、`mcp-resources` | 每个 server 一个 client；工具落 `ctx.tools` |
| 接第三方服务账号（新） | `connector` 组 + `dsh-cli-account` / `dsh-mcp-account` | `dingtalk`、`feishu`、`wecom`、`tencent-docs`、`tencent-meeting`、`linear`、`notion` | CLI 型带官方 skill；MCP 型走 MCP 管理器授权 |
| 持久状态 | `ctx.storage` / `ctx.storageDomain` | `storage-json`、`storage-sqlite`、`storage-domain` | 不要写 DSH 自己的会话目录 |
| 会话持久化后端（新） | `ctx.sessionPersistence` | `session-persistence-jsonl`、`session-persistence-sqlite` | 实现 `create/open/stat/list/export` |
| 会话派生状态 | `ctx.sessionProjections` | `session-projection`、`session-projection-cache` | `apply` 纯、同步、未变返回同一引用 |
| 会话读取/搜索 | `ctx.sessionQuery` | `session-query`、`session-query-sqlite` | 模型侧工具自己做权限与去游标 |
| 会话标题 | `ctx.sessionTitle` 提供方 | `session-title-first-prompt-llm`、`session-title-all-prompts-llm` | 唯一可选异步提供方 |
| 遥测/回放 | `ctx.otel`、`ctx.sessionTelemetry`、JSONL | `session-telemetry-otel`、`llm-replay` | 仅挂载不采集 |
| Web GUI 路由 | `ctx.webServer` | `host-webserver`、`host-open-in-app` | 静态 fallback 归 `host-frontend-static` |
| 桌面能力 | `ctx.directoryPicker`、`open-in-app` | `host-directory-picker-*`、`host-open-in-app` | 原生/浏览后端由 `*-auto` 启动时选 |
| 浏览器内运行时（实验） | `dsh-experimental-webworker-runtime` | `experimental-webworker-runtime`、`experimental-webworker-packer` | 在 Web Worker 里跑宿主树；VFS + 模块转换 |
| 动态脚本环境（新） | `dsh-client-script-realm` | `client-script-realm`、`client-script-realm-iframe` | 直接引用脚本环境 + Cordis 提供方注册 |

---

## 6. Web Client Slot 体系

Slot 是 Web Client 的类型化 React 组合系统：`dsh-client-ui-slots` 拥有不依赖 React 的注册表与类型代数，`dsh-client-ui-renderer` 负责绑定与渲染。功能插件通过 `ctx.slots` 贡献 UI，**绝不 import 别的功能插件的组件**。

### 6.1 注册方式

```tsx
export const inject = ['slots']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      { name: 'conversation.session.header.actions', id: 'review', order: 100 },
      ReviewButton,
    ),
  ))
}
```

- `ctx.slots.inject(key, callback)`：等 owner 声明后运行；owner 折叠时移除，重新挂载时重跑。
- 向未声明的 slot 注册、或重复声明别人已拥有的 child slot，会在激活时直接失败。
- `root` 是唯一内建 key，由 `ui-renderer` 渲染；其余通过 owner 传下的 `renderSlot` / `renderSlotChain` 渲染。

### 6.2 两个正交维度

| 维度 | 取值 | 语义 |
|---|---|---|
| cardinality | `single` | 单格，渲染 priority 胜者；要并列就声明 child slot |
| | `list` | 必填 `id`，先 `order` 再注册顺序 |
| | `keyed` | owner 传 `entryKey`，用对应 props 渲染 |
| | `chain` | 每个 entry 给纯 `select(owner)`，按 priority 第一个非 null 获胜 |
| | `hoc` | 逐层包裹 owner 内容，最小者最外层；可按 `entryKey` 选层 |
| scope | `root` / `session-maybe` / `session` | 是否有 Session binding，以及 binding 变化时是否重挂载 |

`priority` 对 `single/list/keyed/hoc` 是遮蔽优先级，对 `chain` 是选举顺序；数值越小越先。增量贡献用新的 list id 或 hoc 层，不要抢别人的 cell。

### 6.3 常用 Slot 位置

| Slot key | 位置 | 备注 |
|---|---|---|
| `root` | 应用根（`AppFrame`） | 只能由 renderer 渲染 |
| `main`（keyed `key=conversation`） | 主区域 | |
| `conversation.header` / `.leading` | 会话头 | |
| `conversation.session.header.actions` | 会话头按钮区 | list，最常用入口 |
| `conversation.session.header.views.actions` | View 标签后「更多」 | list（root） |
| `conversation.session.header.utilities` / `.corner` | 会话头左右角 | |
| `conversation.view` | 视图容器（chat/trajectory…） | 新 View 挂这里 |
| `conversation.chat.flow` / `.node` | 对话流与节点位 | `.node` keyed，key = node kind |
| `conversation.chat.text-interaction` | 文本交互层 | list |
| `conversation.chat.markdown.fence` | 代码块 | hoc，按 fence 语言 keyed |
| `conversation.chat.user.before` | 用户消息前 | chain |
| `conversation.chat.assistant-actions` | 助手消息操作条 | 评分/反馈 |
| `conversation.composer` / `.bar` | 输入区外壳与输入条 | |
| `conversation.composer.dock` | 输入条上方停靠区 | 装饰/状态条常用位 |
| `conversation.input.attachments` / `.permission` / `.plan` / `.model` / `.left` / `.right` / `.activity` | 输入条各段 | `.activity` 是模型选择与发送之间的单活动控件 |
| `conversation.input.dock`（`id=queue`） | 排队消息区 | |
| `conversation.input.overlay` | 输入区浮层 | |
| `conversation.hero.*` | 首屏（品牌/工作区/预设/选项） | `.frame` 是 hoc |
| `tool.call.toolview` | 工具调用行 | keyed，key = 工具名 |
| `sidebar.*`（`panellist`、`panellist.actions`、`panel.icon`、`sidebar.right.*`） | 左右侧栏 | `panellist.actions` 是 list（root） |
| `shell.overlay` | 应用之上的覆盖层 | LocalFolio 工作台/悬浮面板挂载点 |
| `plugins.bundle.config` / `.activation` / `plugins.add.actions` | 插件页（详情配置、启用引导、添加菜单） | |
| `settings.*` | 设置页导航与分页 | key 见 `ui-settings` README |

> 完整清单（每个 key 的 cardinality、scope、owner props、当前 occupant）由 `pnpm run gen-client-catalog` 生成到 `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`；运行时 `cordis_inspect what:"client"` 可查实时树。

### 6.4 组件能拿到什么

| 输入 | 来源 | 类型 |
|---|---|---|
| owner 值 + 标准 scope 值 | `SlotMap` + scope adapter | `PropsRuntime<K>` |
| child renderer | 注册项 `children` | `PropsRenderSlots<S>` |
| 共享视图状态 | 注册项 `store` | `PropsStore<H>` |
| 私有数据/callback/observable hook | 注册项 `inject` 工厂 | `InjectFace<I>` |
| 本地化 `t` | 注册项 `locale` 命名空间 | `PropsLocale<N>` |
| chain 选中值 / hoc 内容 | `select` / `children` | `ComposedProps` |

标准 props：所有作用域有 `useSessions`、`useSessionStatus`、`useSessionRetainInfo`、`useSessionAccess`、`useWorkspaces`、`useWorkspaceAccess`、`useRemoteAccess`、`usePanelInfo`；`session` / `session-maybe` 另有 `sessionId`、`useSession`、`useProjection`、`useAccess`、`useConversation`、`useInput`、`inputActions`、`useChat`、`useTrajectory`（`session-maybe` 结果可空）。

### 6.5 扩展规则

1. 别人的包只能 `import type`，绝不 import 运行时值。
2. 只在拥有并渲染该位置的组件里声明 child slot。
3. 业务/传输状态留在 service / Client model，Slot store 只放共享视图状态。
4. 可观测 source 与 snapshot 身份在值变化前保持稳定。
5. UI 域间只传 JSON 兼容数据 + callback；React 内容走 Slot。
6. 不写组件外 DOM、不 append `document.body`、不用 iframe 承载宿主主题、不替换 app root。

---

## 7. 全量插件包目录

读法：

- 这是 **305 个可装载插件包**（53 组，master）。另有 92 个工作区包不在此表：seam 定义（抽象服务）、客户端库（`primitives`/`slots`/`store`/`dockkit`/`web`/`config`）、测试与构建工具（`test-support`、`typert/generator`、`util/*`）。判断某能力「有没有现成插件」时先查本表，再查 §4 的 seam。
- **Config**：`是` = Loader 行接受 `config`（schema 见包 README 或 `Config.listConfigs`）。
- **本机**：`✓` = 本机 0.2.2-rc.5 已装可用；`—` = 仅 master（升级 DSH 才能用，见 §13）。
- `experimental` 组属于预稳定，升级可能破坏。

### 7.1 三类包的真实 manifest 对照

从 master 里各挑一个，看 `dsh` 字段怎么用（完整 JSON 见对应目录）：

| 类型 | 例子（`packages/…`） | 关键字段 |
|---|---|---|
| 纯客户端库（不可装载） | `client/ui-primitives` | 无 `dsh.*`；`exports` 只有 `.`；`devDependencies` 挂 react/shiki/katex；`peerDependencies` 仅 cordis。零 cordis 依赖，只被 client bundle import |
| 插件 + 组合包 + 客户端三合一 | `experimental/timeline` | `dsh.bundle.patch` + `dsh.client { platform: "web", inject: [10 个 dsh-client-*] }`；`peerDependencies` 声明 cordis / dsh-session / dsh-tools / dsh-scope / dsh-error；`files` 同时含 `lib/index.js`、`lib/client.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、`docs` |
| 连接器 | `connector/feishu` | `dsh.bundle.patch`；`dependencies` 带厂商 CLI（`@larksuite/cli`）；`peerDependencies` 声明 `dsh-cli-account` / `dsh-skill`；`files` 额外带 `skills/`（随包下发的 skill 资源） |

另外一个容易误判的点：**仓库内的官方包几乎都不写 `engines.dsh`**，它们靠 `peerDependencies` 的 `workspace:*`（发布后变成精确范围）表达兼容性。第三方插件没有这层 workspace 约束，所以 §2.5 的 `engines.dsh` 建议对外部插件仍然成立。

#### account（2）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-deepseek-account` | 是 | ✓ | Sign in to DeepSeek and manage account credentials and notifications |
| `dsh-deepseek-auth` | — | — | DeepSeek request authentication (ctx.deepseekAuth): choose between the API key and the account sign-in for one DeepSeek API request and release its headers |

#### acp（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-acp` | 是 | ✓ | Automation-only Agent Client Protocol server for driving DeepSeek Harness agents over JSON-RPC stdio |

#### api（9）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-api-gateway` | 是 | ✓ | Typert Remote Host dispatcher and Client API endpoint |
| `dsh-api-job-controller` | 是 | ✓ | Job Remote observation stream and the reference-counted client job-output service |
| `dsh-api-remote-access` | — | ✓ | Method-level Remote access control for non-owner Peers and the per-Peer access snapshot |
| `dsh-api-remotes` | — | ✓ | Remote BFF assembly for application-selected Host capabilities |
| `dsh-api-session-controller` | 是 | ✓ | Session Remote commands, cold reads, and live control transport |
| `dsh-api-settings-controller` | 是 | ✓ | Remote owner for the configuration surfaces over the settings-domain seams |
| `dsh-api-terminal-controller` | 是 | ✓ | Session-owned interactive terminals with shell discovery, screen recovery and typed Remote control |
| `dsh-api-workspace-controller` | 是 | ✓ | Workspace Remote commands and reconnect-safe state transport |
| `dsh-api-workspace-files` | 是 | ✓ | Workspace file service and Client resource provider: bounded reads, directory listing, and live metadata over the workspaceFiles Remote namespace |

#### attachment（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-attachment-local` | 是 | ✓ | Private content-addressed DSH_HOME attachment storage |

#### boot（4）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-config-editor` | — | ✓ | Persist plugin configuration through profile patches and Loader reconciliation |
| `dsh-hmr` | 是 | ✓ | Coordinated module and profile configuration hot reload |
| `dsh-plugin-manager` | 是 | ✓ | Current-profile plugin and bundle management shared by dsh CLI, Web and agent tools |
| `dsh-plugin-market` | 是 | ✓ | Configured plugin market indexes for the Web Discover page and the plugin_market agent tool |

#### browser-use（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-browser-use` | — | — | Exclusive named browser-use provider registration |

#### bundle（4）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-acp-app` | — | ✓ | The dsh ACP profile bundle: automation-only JSON-RPC stdio and process lifecycle over dsh-base |
| `dsh-headless` | 是 | ✓ | The dsh one-shot bundle: a direct core Agent/Session runner over dsh-base with no Host, HTTP, or browser layer |
| `dsh-sdk-app` | 是 | ✓ | The dsh SDK profile bundle: stdio JSON-RPC serving and process lifecycle over dsh-base |
| `dsh-web-app` | 是 | ✓ | The dsh browser-surface bundle: the web patch layer over dsh-base plus the runtime glue plugin (frontend dist serving, bash runtime variables, URL line) |

#### client（74）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-client-config` | — | — | Types of browser-synced plugin configuration |
| `dsh-client-connection` | 是 | ✓ | Authenticated RPC transport and generation lifecycle |
| `dsh-client-file-upload` | — | ✓ | Agent-scoped browser file upload, streaming intake, and staged receipt service |
| `dsh-client-hmr` | 是 | ✓ | Web client graph and rebuilt-bundle delivery over an authenticated Remote stream |
| `dsh-client-locale` | — | ✓ | Locale plugin: Host-backed preference, extensible language catalog, browser fallback, and typed built-in dictionaries |
| `dsh-client-modules` | — | ✓ | Client module system, dual-face: node half composes the __DSH_BOOT__ entry graph (incremental dsh.client scan, bundle route, index tap, webPlugins service); browser half is the lazy-CJS module table the vendored cordis Loader consumes as its internal seam |
| `dsh-client-product-analytics` | 是 | ✓ | Desktop product event collection and authenticated Host reporting |
| `dsh-client-remote-connection` | 是 | — | QR login, private login links, and owner-approved browser pairing |
| `dsh-client-resources` | — | ✓ | Unified client resource model: protocol-registered providers turn URL addresses into live values, consumed through the useResource global standard hook |
| `dsh-client-script-realm` | — | — | Direct-reference script environments and Cordis-owned provider registration |
| `dsh-client-script-realm-iframe` | — | — | Optional iframe ScriptRealm provider |
| `dsh-client-shortcuts` | 是 | ✓ | Application keyboard command registry and physical-key routing |
| `dsh-client-ui-account-notifications` | 是 | ✓ | Display account notifications and refresh localized content |
| `dsh-client-ui-action-cards` | — | ✓ | Action cards below completed answers: the shared card frame, kind bodies and the layer that hides the answer blocks offering them |
| `dsh-client-ui-agent-preset` | — | ✓ | Agent-preset surfaces: the default for later sessions, this session's seat, and the composition editor |
| `dsh-client-ui-agent-team` | — | ✓ | Web shared task board for a subagent tree |
| `dsh-client-ui-approval` | — | ✓ | Approval composer takeover over the scoped Remote Event waterfall |
| `dsh-client-ui-attachment` | — | ✓ | Dynamic attachment presentation plugin for conversation input, message-image, and trajectory image slots |
| `dsh-client-ui-brand-official` | — | ✓ | Official DeepSeek Harness brand artwork and click-triggered home background |
| `dsh-client-ui-chat` | — | ✓ | Chat Conversation target, node definitions, renderers, and details surface |
| `dsh-client-ui-commands` | — | ✓ | Client command surface: global directory cache, '/' source, three command UI kinds, popupSelect registry |
| `dsh-client-ui-connector-account` | — | — | Connector account surfaces: the Host registry CLI app plugins and MCP connectors register their accounts with, and the Plugins page section, title tag, activation prompt, and notices it serves over one Remote |
| `dsh-client-ui-context-menu` | 是 | ✓ | Typed, plugin-extensible context menus with captured targets and shared Web presentation |
| `dsh-client-ui-conversation` | — | ✓ | Target-neutral Conversation assembly, shell, composer, queue, and view navigation |
| `dsh-client-ui-creation-recommendations` | — | ✓ | Body of the personalized page card: location choice, creation progress, Undo and Restore |
| `dsh-client-ui-deliverables` | — | ✓ | Changed-files card with per-file comparison tabs, delivery cards, and clickable final-response file references for Web |
| `dsh-client-ui-directory-picker-browse` | — | ✓ | In-app directory browsing surface: the workspace directory-flow owner rendering the host's listing and creation primitives |
| `dsh-client-ui-directory-picker-native` | — | ✓ | Native directory-picker surface: the renderless workspace directory-flow occupant driving the local Desktop or Host OS chooser |
| `dsh-client-ui-entry-customization` | — | ✓ | Customize plugin entries in the left sidebar, conversation views, and right sidebar, and quickly create new plugins. |
| `dsh-client-ui-file-actions` | — | ✓ | Original-file saving and image clipboard actions for Web and Desktop |
| `dsh-client-ui-file-drag` | — | ✓ | Application-owned file drag transfers and localized failure feedback |
| `dsh-client-ui-goal` | — | ✓ | Session goal surface: GoalBar docked above the composer, read from the goal session projection |
| `dsh-client-ui-input-trigger` | — | ✓ | Input trigger pipeline: '/' and '@' detection, candidate menu, pick routing to registered sources |
| `dsh-client-ui-jobs` | — | ✓ | Session panel background-job list with on-demand streaming record panels |
| `dsh-client-ui-layout` | — | ✓ | Shell plugin: three-column AppFrame with drag handles, ctx.layout viewing-state service (navigation + panels) |
| `dsh-client-ui-message-feedback` | — | ✓ | The Web feedback surface: per-message Like/Dislike in the assistant-message action strip and the feedback dialog behind both ratings and /feedback, backed by the messageFeedback and sessionFeedback Host Remotes |
| `dsh-client-ui-model-selection` | — | ✓ | Model selection over the shared model catalog, Session projection, and session.selectModel |
| `dsh-client-ui-open-in-app` | — | ✓ | Session application submenus and native opening controls for directories and previewed files |
| `dsh-client-ui-permission-presets` | — | ✓ | Permission surfaces: a new-session default in General settings and a current-session /permission popup over the permissions projection |
| `dsh-client-ui-plan` | — | ✓ | Plan mode controls, persistent transcript plan cards, and sidebar Markdown previews |
| `dsh-client-ui-plugin-manager` | 是 | ✓ | Plugin management for the dsh web client: the sidebar Plugins panel installs, enables, disables, retries, and composes installed plugin packages |
| `dsh-client-ui-plugin-market` | — | ✓ | Discover tab of the dsh web Plugins page: browse configured plugin market indexes and install their bundles |
| `dsh-client-ui-plugin-recommendations` | — | ✓ | Official plugin card body with catalog text and enabling |
| `dsh-client-ui-reference` | — | ✓ | Unified Web @file and @session reference source |
| `dsh-client-ui-renderer` | — | ✓ | Browser UI renderer: React slot bindings, ctx.uiRenderer, and the assembled application root |
| `dsh-client-ui-schedule` | — | ✓ | Host task management page and Session reminder catalog |
| `dsh-client-ui-secret-mask` | — | ✓ | Web display masking for recognized credentials in sent user text |
| `dsh-client-ui-session` | — | ✓ | Session Controller adapter for React and session-scoped slots |
| `dsh-client-ui-session-panel` | — | — | Floating Session panel opened from the Session header, composed of sections that plugins register |
| `dsh-client-ui-session-status` | — | — | Client Session status table over Host reading records: running state, the effective pending interaction, and read or unread reminders shared by clients of one Host |
| `dsh-client-ui-settings` | — | ✓ | Settings domain base plugin: shared configuration forms and the canonical settings slot-type contract |
| `dsh-client-ui-settings-account` | 是 | ✓ | Manage DeepSeek login and open Platform billing pages |
| `dsh-client-ui-settings-agent-loop` | — | ✓ | Settings page of the agent loop on the dsh web client's Plugins page: the parallel tool-call cap of the agent-loop namespace |
| `dsh-client-ui-settings-general` | — | ✓ | Settings ownerless-copy and product onboarding plugin: the General section, shell trigger/header chrome content, settings dictionaries, and the versioned welcome notice |
| `dsh-client-ui-settings-models` | 是 | ✓ | Models settings and shared product-onboarding dialogs over existing settings and credential joins |
| `dsh-client-ui-settings-session-log` | — | ✓ | General settings control for Session-log upload with DeepSeek API requests |
| `dsh-client-ui-settings-shell` | — | ✓ | Settings page of the shell executor on the dsh web client's Plugins page: the command timeout and the per-stream output cap of the shell namespace |
| `dsh-client-ui-settings-subagent` | — | ✓ | Settings page of Subagent delegation on the dsh web client's Plugins page: recursion depth, parallel capacity, and the models agents may choose for subagents |
| `dsh-client-ui-settings-web-search` | — | ✓ | Settings page for web search and fetch on the dsh web client's Plugins page: the Search and Fetch provider menus, the DeepSeek Search API result count, DeepSeek Search and Fetch API billing, and legacy Messages search settings |
| `dsh-client-ui-shortcuts` | — | ✓ | Keyboard shortcut reference, recording, and local preference editing |
| `dsh-client-ui-sidebar` | — | ✓ | Sidebar plugin: session multi-level tree, search, grouping, state dots |
| `dsh-client-ui-sidebar-browser` | — | ✓ | Sandboxed Web browser tabs for the right Sidebar |
| `dsh-client-ui-sidebar-documentpreview` | 是 | ✓ | Extensible Sidebar previews for Office documents, spreadsheets, Markdown, code, images, PDF, HTML, and plain text |
| `dsh-client-ui-sidebar-files` | — | ✓ | The workspace files page and one workspace directory tree per pane beside docked and floating file previews, listed lazily over the workspaceFiles Remote namespace |
| `dsh-client-ui-sidebar-right` | — | ✓ | Right Sidebar: the docking surface's session-bound state, its panel and header expand control, and the navigation service over it |
| `dsh-client-ui-sidebar-terminal` | — | ✓ | Interactive shell tabs for the right Sidebar |
| `dsh-client-ui-skill` | — | ✓ | Web skill references and the dedicated skill tool row |
| `dsh-client-ui-subagent` | — | ✓ | Subagent conversation catalog, continuation routing UI, and '@' reference source |
| `dsh-client-ui-theme` | 是 | ✓ | Theme plugin: Host bootstrap for the pre-plugin palette; ThemeRuntime for light/dark/system state and icon replacements; --dsw-* token styles and Appearance settings row |
| `dsh-client-ui-tool` | — | ✓ | Client Tool call-tree renderer and keyed per-tool presentation slot |
| `dsh-client-ui-trajectory` | 是 | ✓ | Trajectory event ledger and timing overview with live tool-result inspection |
| `dsh-client-ui-user-questions` | — | ✓ | Web ask_user_question composer takeover and plan-review presentation UI |
| `dsh-client-ui-workflow-run` | — | ✓ | Durable workflow-run Conversation Node and nested member disclosure for dsh web |
| `dsh-client-ui-workspace` | — | ✓ | Workspace picker plugin: one WorkspacePicker registered into the sidebar and empty-state workspace slots |

#### compaction（4）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-command-compact` | — | ✓ | Human-facing slash command for explicit session compaction |
| `dsh-compaction-basic` | 是 | ✓ | Token-meter-driven compaction policy and LLM summarization backend for the DeepSeek Harness |
| `dsh-compaction-image-offload` | — | ✓ | Durable image offload for image-capable routes: replace over-budget request images with placeholders and retry |
| `dsh-compaction-tool-result-pruner` | 是 | ✓ | Replay-safe model-free head/middle/tail pruning for tool-result surface nodes |

#### computer-use（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-computer-use` | — | ✓ | Exclusive named computer-use provider registration |

#### connector（9）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-cli-account` | 是 | — | Host Service of CLI app plugins: each plugin registers its third-party CLI and account, and the Service gives the model the CLI's absolute path, runs one account operation at a time, and shows the account on the Plugins page |
| `dsh-dingtalk` | 是 | — | DingTalk plugin: the official dws CLI with its skills, and sign-in from the Plugins page |
| `dsh-feishu` | 是 | — | Feishu plugin: the official lark-cli with its embedded skills, and account connection from the Plugins page |
| `dsh-linear` | 是 | — | Linear plugin: Linear's hosted MCP server, authorized through the shared MCP manager |
| `dsh-notion` | 是 | — | Notion plugin: Notion's hosted MCP server, authorized through the shared MCP manager |
| `dsh-tencent-docs` | 是 | — | Tencent Docs plugin: Tencent Docs' hosted MCP server, authorized through the shared MCP manager |
| `dsh-tencent-meeting` | 是 | — | Tencent Meeting plugin: the official tmeet with its skill, and account connection from the Plugins page |
| `dsh-upstream-skills` | 是 | — | Host Service of CLI app plugins: each plugin registers its entry skill and a pinned directory of the vendor's GitHub repository, and the Service downloads that directory into the DSH cache and lists the entry skill over it |
| `dsh-wecom` | 是 | — | WeCom plugin: the official wecom-cli with its skills, and authorization from the Plugins page |

#### context（6）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-agent-instructions` | 是 | ✓ | Workspace context loader for AGENTS.md/CLAUDE.md instruction files |
| `dsh-file-reference-local` | 是 | ✓ | Local-filesystem ctx.fileReferences provider with bounded fuzzy indexes |
| `dsh-harness-dev-context` | — | ✓ | Model context naming the DeepSeek Harness checkout and Web GUI URL without letting either change the system prompt |
| `dsh-session-reference` | 是 | ✓ | Cross-session snapshot references and durable untrusted model context (ctx.sessionReferenceResolver) |
| `dsh-time-context` | 是 | ✓ | Durable per-step context with the current time and elapsed time |
| `dsh-tmux-context` | 是 | ✓ | Opt-in durable per-step context with this agent's tmux pane and window location |

#### core（9）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-agent` | — | ✓ | Agent interface, registry, initiator scope, and event vocabulary for the DeepSeek Harness |
| `dsh-agent-default-model` | 是 | ✓ | Default model selection shared by Agent entry points |
| `dsh-agent-loop` | 是 | ✓ | The concrete agent loop plugin for the DeepSeek Harness |
| `dsh-agent-tool-presentation` | 是 | ✓ | Deprecated tool presentation selector; use dsh-tool-executor-native or dsh-tool-executor-ptc directly |
| `dsh-session` | — | ✓ | Event-sourced session store for the DeepSeek Harness |
| `dsh-system-prompt` | 是 | ✓ | System prompt assembly registry for the DeepSeek Harness |
| `dsh-tool-executor-native` | — | ✓ | Native tool execution plugin |
| `dsh-tool-executor-ptc` | 是 | ✓ | PTC program execution, tool bindings, and generated SDK prompts |
| `dsh-tools` | — | ✓ | Tool registry and execution pipeline for the DeepSeek Harness |

#### credentials（2）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-authorization` | — | ✓ | Authorization seam (ctx.authorization): plugin-owned flows that obtain a credential through a conversation with the human |
| `dsh-credentials-local` | 是 | ✓ | File-backed credentials provider ($DSH_HOME/.env under the live process environment) for the DeepSeek Harness |

#### deliverables（3）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-deliverable-file-references` | — | ✓ | Shared model guidance for file links and deliverables across DeepSeek Harness hosts |
| `dsh-tool-present` | 是 | ✓ | Explicit workspace file delivery declarations for the DeepSeek Harness |
| `dsh-workspace-changes` | 是 | ✓ | Per-turn workspace file changes recorded from git working-tree snapshots and whole-file captures, with per-file comparisons, for the DeepSeek Harness |

#### document（2）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-office-kit` | 是 | ✓ | Shared Office rendering, conversion, and recalculation with bounded queues and caching |
| `dsh-tool-office` | 是 | ✓ | Model-facing Office tools for rendering, converting, and recalculating documents |

#### experimental（42）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-cua` | — | ✓ | Shared Computer Use application objects, authorization, and logged tool execution |
| `dsh-cua-macos` | 是 | — | macOS native provider for shared Computer Use application and window objects |
| `dsh-cua-mcp` | 是 | — | Computer Use as an MCP stdio server: a dsh profile bundle that exposes cua_run_code to external agent harnesses |
| `dsh-cua-windows` | 是 | — | Windows C# computer use through shared application and window objects |
| `dsh-deepseek-chat-import` | 是 | ✓ | Import DeepSeek chat exports as stored Sessions in a chosen Workspace |
| `dsh-experimental-api-speech-to-text` | 是 | ✓ | Authenticated experimental speech transcription for browser clients |
| `dsh-experimental-auto-review` | — | ✓ | Per-tool LLM authorization review for the DeepSeek Harness Auto permission preset |
| `dsh-experimental-browser-use-chrome-devtools-mcp` | 是 | — | Experimental per-Session Chromium browser tools through chrome-devtools-mcp |
| `dsh-experimental-browser-use-playwright-mcp` | 是 | — | Experimental per-Session Chromium browser tools through @playwright/mcp |
| `dsh-experimental-browser-use-stagehand-native` | 是 | — | Experimental Stagehand browser tools with separately configured native models |
| `dsh-experimental-claude-code-mods` | 是 | — | Experimental bridge: load Claude Code mods (hooks modules) and run their hook chains on DeepSeek Harness extension points |
| `dsh-experimental-client-ui-claude-code-mods` | — | — | Web band above the prompt for Claude Code mods: draws each session's mod tree and sends button presses back to the bridge |
| `dsh-experimental-client-ui-cot-translation` | 是 | ✓ | Optional machine translation of expanded reasoning, preserving original Session text |
| `dsh-experimental-client-ui-forge` | 是 | ✓ | Session panel entries for a Session's change requests, with a worktree option for new Sessions and its Host Remote |
| `dsh-experimental-client-ui-stats` | — | ✓ | Per-turn and per-step context, timing, cache, and tool-cost table contributed as an experimental conversation View |
| `dsh-experimental-client-ui-voice-input` | — | ✓ | Record speech and insert editable text into the conversation draft |
| `dsh-experimental-computer-use-cua-driver-mcp` | 是 | — | Experimental computer use through an installed Cua Driver MCP executable |
| `dsh-experimental-computer-use-cua-driver-native` | — | — | Experimental computer-use provider embedding the Cua Driver native npm SDK |
| `dsh-experimental-forge` | 是 | ✓ | Provider-neutral change request registry with shared status polling |
| `dsh-experimental-forge-github` | 是 | ✓ | GitHub provider for the experimental forge registry, read through the GitHub CLI on the host |
| `dsh-experimental-forge-session` | 是 | ✓ | Binds change requests to the Session that created, pushed, or tracked them |
| `dsh-experimental-inspector` | 是 | ✓ | Experimental cross-realm CDP hub for Host debugging and Client Runtime inspection |
| `dsh-experimental-session-inspector` | — | ✓ | Experimental virtualized Session log and live Chat group/node inspectors |
| `dsh-experimental-speech-to-text` | 是 | ✓ | Experimental speech recognition with independently selectable providers |
| `dsh-experimental-speech-to-text-sensevoice` | 是 | ✓ | Local SenseVoice ONNX transcription with a managed sherpa-onnx process |
| `dsh-experimental-subagent-oar` | 是 | — | Experimental one-shot subagents through OAR runtimes |
| `dsh-experimental-tool-subagent-oar` | 是 | — | Delegate standalone tasks to configured external subagent providers |
| `dsh-experimental-tool-worktree` | — | ✓ | Model tool that creates and enters a new Git worktree |
| `dsh-experimental-translator` | 是 | ✓ | Machine translation with reusable Session results |
| `dsh-experimental-worktree` | 是 | ✓ | Creates a named Git worktree and changes the calling Session working directory |
| `dsh-forge-gitlab` | 是 | — | GitLab provider for the experimental forge registry, read and written through the GitLab CLI on the host |
| `dsh-hooks-claude-code` | 是 | — | Bridge plugin: run a Claude Code hooks.json / settings hook config on the DeepSeek Harness interception seams |
| `dsh-hooks-codex` | 是 | — | Bridge plugin: run a Codex hooks.json hook config on the DeepSeek Harness interception seams |
| `dsh-session-title-all-prompts-llm` | 是 | ✓ | All-user-messages LLM provider plugin for DeepSeek Harness session titles |
| `dsh-skill-badge` | — | ✓ | Bundled dsh badge skill provider for DeepSeek Harness |
| `dsh-terminal-panel` | 是 | ✓ | Persistent Agent terminals shown in the Web sidebar, plus read-only access to the user's terminals |
| `dsh-timeline` | 是 | — | Replace Todo in long-running sessions with task trees, a live progress bar, and timed reports |
| `dsh-tool-ralph` | 是 | ✓ | Model-facing fresh-agent Ralph loop over the workflow and subagent seams |
| `dsh-tool-session-query` | 是 | ✓ | Workspace-authorized model-facing session history search, trace, and event read tools |
| `dsh-tool-terminal` | 是 | ✓ | Six model-facing persistent PTY tools with owner isolation and generic background-job integration |
| `dsh-webhook` | — | — | Fire-and-forget webhook rule runtime that creates Workspace-backed DeepSeek Harness Sessions |
| `dsh-webhook-github` | 是 | — | Signed GitHub HTTP webhook adapter for the DeepSeek Harness webhook runtime |

#### extensions（6）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-client-ui-cordis` | — | ✓ | Cordis dynamic-plugin definition card: the keyed cordis_define tool row with its run/stop switch |
| `dsh-cordis-client-runner` | — | ✓ | Browser half of dynamic dual-half plugin packages: event subscription, closure evaluation, guard facade, and loader entries |
| `dsh-cordis-host-runner` | 是 | ✓ | Dynamic package definition registry, host-half sandbox lifecycle, and invoke handler table for model-mounted dual-half packages |
| `dsh-creation-recommendations` | — | ✓ | Create persistent removable interface plugins from explicit conversation needs |
| `dsh-plugin-recommendations` | — | ✓ | Official plugin suggestions with explicit user activation and persistent conversation decisions |
| `dsh-tool-cordis` | — | ✓ | Read-only runtime API inspection for Harness plugin development |

#### feedback（2）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-command-feedback` | — | ✓ | Log-only session feedback: the record event, the sessionFeedback Host Remote, and the human-facing slash command |
| `dsh-message-feedback` | 是 | ✓ | Canonical Session-log ratings and notes for finalized assistant messages |

#### fs（6）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-fs-local` | 是 | ✓ | Local-filesystem implementation of the DeepSeek Harness filesystem seam (ctx.fs) |
| `dsh-fs-observation-policy` | — | ✓ | File-context policy plugin for the DeepSeek Harness — observed-state, read-before-edit, and version-guarded write/edit added over the ctx.fs provider seam through the fs/* event gate (no service API) |
| `dsh-fs-sandbox` | 是 | ✓ | Sandbox-enforcing implementation of the DeepSeek Harness filesystem seam: fences write/edit by the per-call sandbox mode (read-only denies mutation, workspace-write contains it to the workspace + temp roots) while reads pass through |
| `dsh-tool-fs` | 是 | ✓ | Model-facing filesystem tools (read, write, edit) over the DeepSeek Harness filesystem seam (ctx.fs) |
| `dsh-tool-fs-search` | 是 | ✓ | Model-facing filesystem discovery tools (glob, grep) backed by the packaged ripgrep binary (@vscode/ripgrep) |
| `dsh-tool-str-replace-editor` | 是 | ✓ | Model-facing view, create, literal replace, and line insert tool over the Harness filesystem service |

#### goal（4）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-command-goal` | — | ✓ | Human-facing slash command for persisted same-session goals |
| `dsh-goal` | 是 | ✓ | Event-sourced same-session goal state and lifecycle service for the DeepSeek Harness |
| `dsh-goal-round-driver` | — | ✓ | Race-fenced same-session goal-round driver |
| `dsh-tool-goal` | 是 | ✓ | Model-facing same-session goal tools with execution-time authority checks |

#### guard（2）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-repeat-tool-reminder` | 是 | ✓ | Repeat-tool-call guard plugin: advisory reminders when an agent loops on identical tool calls |
| `dsh-tool-call-timeout-policy` | — | ✓ | Tool-call timeout policy: a tools/execute wrapper that arms a per-tool deadline on exec.signal and returns TOOL_TIMEOUT when it wins |

#### host（10）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-host-authentication-desktop` | 是 | — | Desktop private-channel authentication provider |
| `dsh-host-authentication-token` | 是 | — | Default token authentication provider and HTTP cookie exchange |
| `dsh-host-directory-picker-auto` | — | ✓ | Adaptive chooser of the directory-picker seam: resolves the host situation at boot and mounts the native or browse backend for the DeepSeek Harness web GUI host |
| `dsh-host-directory-picker-browse` | 是 | ✓ | In-app browsing backend of the directory-picker seam (listing/creation primitives over the host filesystem) |
| `dsh-host-directory-picker-native` | — | ✓ | Native-OS-chooser backend of the directory-picker seam for the DeepSeek Harness web GUI host |
| `dsh-host-frontend-static` | 是 | ✓ | SPA dist server for the Web shell: owns the webserver fallback seat, serving explicit index entries and static assets with traversal rejection and 404 misses |
| `dsh-host-open-in-app` | 是 | ✓ | Host half of open-in-app: resolved application catalog, icons, and the launch endpoint as three webServer routes |
| `dsh-host-plugin-inventory` | — | ✓ | Read-only Remote projection of current Cordis Loader plugin state |
| `dsh-host-product-telemetry-otel` | 是 | ✓ | Explicit product usage events exported through OpenTelemetry HTTP logs |
| `dsh-host-webserver` | 是 | ✓ | Web route-registration plugin: HTTP and upgrade routes, per-Peer index transform taps, and static dist fallback |

#### interaction（6）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-action-cards` | 是 | ✓ | Optional action cards below answers: card state, user actions and status notices |
| `dsh-commands` | — | ✓ | Plugin-owned human command registry for DeepSeek Harness UIs |
| `dsh-permission-presets` | 是 | ✓ | User-facing permission presets (ctx.permissionPresets) for the DeepSeek Harness: one product-level Permissions select bundling the sandbox-mode and approval-policy knobs, written through to their own session events |
| `dsh-tool-ask-user` | 是 | ✓ | Model-facing ask_user_question tool over the ctx.userQuestions seam |
| `dsh-user-approval` | 是 | ✓ | User-approval seam (ctx.approval) for the DeepSeek Harness: one-shot permission decisions dispatched to composed answerers over the approval/request waterfall, fail-closed by default |
| `dsh-user-questions` | — | ✓ | Abstract user-questions seam (ctx.userQuestions) for asking the human during agent runs |

#### jobs（2）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-jobs-local` | 是 | ✓ | Process-local implementation of the DeepSeek Harness background job registry seam |
| `dsh-tool-jobs` | 是 | ✓ | Model-facing background job control tools (job_output, job_list, job_kill) over the ctx.jobs registry |

#### llm（8）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-deepseek-llm-api-extensions` | — | ✓ | Additive request-field registry for the official DeepSeek LLM API adapter |
| `dsh-llm` | — | ✓ | Provider-neutral LLM service interface for the DeepSeek Harness |
| `dsh-llm-deepseek-account` | 是 | ✓ | DeepSeek account provider authentication and discovery |
| `dsh-llm-deepseek-api-key` | 是 | ✓ | DeepSeek api-key provider authentication and discovery |
| `dsh-llm-pi-ai` | 是 | ✓ | pi-ai-backed DeepSeek adapter for the DeepSeek Harness LLM seam (design-verification twin of dsh-llm-deepseek) |
| `dsh-llm-retry` | 是 | ✓ | Provider-routed LLM request retry policy for the DeepSeek Harness |
| `dsh-plugin-package-inventory-deepseek` | 是 | ✓ | Active Loader-backed plugin package inventory for official DeepSeek LLM API requests |
| `dsh-token-meter` | 是 | ✓ | Replay-aware token measurement service (ctx.tokenMeter) for the DeepSeek Harness |

#### lsp（3）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-lsp` | — | — | Abstract LSP capability seam (ctx.lsp) for the DeepSeek Harness — language-server provider registry keyed by branded id and extension mapping, order-independent per-query selection, normalized definition/references/implementation/hover requests and results, and the LspError taxonomy |
| `dsh-lsp-stdio` | 是 | — | Generic stdio language-server provider for the DeepSeek Harness LSP capability seam (ctx.lsp) — spawns configured servers, translates JSON-RPC, and serves transient-open goToDefinition/findReferences/goToImplementation/hover queries in the host filesystem namespace |
| `dsh-tool-lsp` | 是 | — | Model-facing lsp tool over the DeepSeek Harness LSP capability seam (ctx.lsp) — one read-only tool with goToDefinition/findReferences/goToImplementation/hover operations, one-based UTF-16 cursor coordinates, bounded location rendering, and hover normalization |

#### mcp（4）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-mcp-account` | — | — | MCP connector accounts on the Plugins page: each connector's OAuth server in the connector account registry, authorized through the MCP manager |
| `dsh-mcp-client` | 是 | ✓ | MCP client bridge: connects to MCP servers and registers their tools on ctx.tools |
| `dsh-mcp-manager` | 是 | ✓ | MCP server manager: a settings-driven fleet of mcp-client instances with runtime status, restart, and probe |
| `dsh-mcp-resources` | — | ✓ | Scoped MCP resource discovery and reading through shared model tools |

#### plan（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-plan-mode` | 是 | ✓ | Logged per-agent plan mode with deployment guidance, a direct slash command, and a user-reviewed exit |

#### preset（3）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-agent-preset` | 是 | ✓ | Declare an Agent capability composition in Cordis YAML |
| `dsh-agent-preset-registry` | 是 | ✓ | Declarative Agent preset registry and profile-backed editing |
| `dsh-persona` | 是 | ✓ | Composition-authored deployment persona section for the DeepSeek Harness |

#### ptc-runtime（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-ptc-runtime-node` | 是 | ✓ | Node PTC execution with async function, REPL, scoped REPL and VM Script evaluators and optional retained state |

#### sandbox（2）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-sandbox-local` | 是 | ✓ | Local process-sandbox backends for the DeepSeek Harness sandbox seam: bwrap, the npm-distributed landlock-run launcher, macOS Seatbelt, or the Windows ACL restricted-token runner — functionally probed, fail-closed |
| `dsh-sandbox-policy` | 是 | ✓ | Per-call sandbox policy resolver and current model context: deployment fallbacks plus each session's mode and workspace root, shared by every enforcing capability family |

#### schedule（2）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-schedule` | 是 | ✓ | Host-wide durable reminders with shared management and delivery to existing or new Sessions |
| `dsh-tool-schedule` | — | ✓ | Model-facing scheduled task tools (schedule_create, schedule_list, schedule_view, schedule_edit) over the Host ctx.schedule service |

#### sdk（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-sdk-jsonrpc-server` | 是 | ✓ | Stdio JSON-RPC server plugin for out-of-process DeepSeek Harness SDK clients |

#### session（14）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-message-quotes` | — | ✓ | Selected-text quotation and Markdown blockquote presentation |
| `dsh-session-checkpoint-policy` | — | ✓ | Semantic session durability checkpoints before model requests and tool side effects |
| `dsh-session-log-deepseek` | 是 | ✓ | Incremental lossless session-log request extension for the official DeepSeek LLM API |
| `dsh-session-persistence-jsonl` | 是 | ✓ | JSONL durable session persistence backend for the DeepSeek Harness |
| `dsh-session-persistence-sqlite` | 是 | — | SQLite Session event storage backend for the DeepSeek Harness |
| `dsh-session-projection` | — | ✓ | Session-projection seam: the merge-extensible projection type table, the provider contract, and the ctx.sessionProjections registry serving whole current values of log-derived per-session state |
| `dsh-session-projection-cache` | 是 | ✓ | Persisted projection cache (ctx.sessionProjectionCache): durable per-session checkpoint records on the session_projcache storage domain (per-record layout), throttled write-behind, and the cached listing read |
| `dsh-session-stats` | — | ✓ | Whole-log conversation counts and wall times projection (sessionStats) for the DeepSeek Harness |
| `dsh-session-telemetry-otel` | 是 | ✓ | Feedback-authorized Session logs over byte-bounded OpenTelemetry HTTP requests |
| `dsh-session-title` | 是 | ✓ | Log-backed session title service and provider registry for the DeepSeek Harness |
| `dsh-session-title-first-prompt-llm` | 是 | ✓ | First-message LLM provider plugin for DeepSeek Harness session titles |
| `dsh-session-turn-outline` | — | ✓ | Whole-log turn outline projection (turnOutline) for the DeepSeek Harness |
| `dsh-tool-session-control` | — | — | Send model-authored messages to ordinary Web Sessions with acceptance receipts |
| `dsh-working-directory` | 是 | ✓ | Session working directories with durable changes and model context |

#### session-query（3）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-session-log-export` | 是 | ✓ | Web Session-log ZIP export and Session Markdown copy |
| `dsh-session-query-sqlite` | 是 | ✓ | Concrete ctx.sessionQuery backend with SQLite FTS5 search |
| `dsh-tool-session-list` | — | — | Read-only paginated Workspace and Session metadata tools |

#### settings（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-settings` | — | ✓ | Abstract user-settings seam (ctx.settings) for the DeepSeek Harness |

#### shell（9）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-bash-local` | 是 | ✓ | Local-subprocess implementation of the DeepSeek Harness bash executor seam |
| `dsh-bash-sandbox` | 是 | ✓ | Sandbox-consuming implementation of the DeepSeek Harness bash executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts) |
| `dsh-pwsh-local` | 是 | ✓ | Local PowerShell implementation of the DeepSeek Harness bash executor seam |
| `dsh-pwsh-sandbox` | 是 | ✓ | Sandbox-consuming implementation of the DeepSeek Harness PowerShell executor seam (confines every command via ctx.sandbox, reports denial/enforcement result facts) |
| `dsh-shell-env` | 是 | ✓ | Tool-independent managed DSH_* shell environment registry |
| `dsh-tool-bash` | 是 | ✓ | Model-facing bash tool with optional generic background-job and sandbox-escalation support |
| `dsh-tool-bash-persistent` | 是 | ✓ | Model-facing owner-scoped persistent Bash tool backed by the Harness PTY service |
| `dsh-tool-pwsh` | 是 | ✓ | Model-facing pwsh tool over the bash executor seam |
| `dsh-tool-pwsh-persistent` | 是 | ✓ | Model-facing owner-scoped persistent PowerShell tool backed by the Harness PTY service |

#### skill（5）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-skill` | 是 | ✓ | Agent skill provider registry for the DeepSeek Harness |
| `dsh-skill-filesystem` | 是 | ✓ | Local filesystem skill provider for the DeepSeek Harness |
| `dsh-skill-office` | 是 | ✓ | Bundled Word, PowerPoint, and Excel workflows and Office operation guidance |
| `dsh-tool-skill` | 是 | ✓ | Model-facing skill loading tool for the DeepSeek Harness |
| `dsh-tool-workspace-dependencies` | 是 | ✓ | The load_workspace_dependencies tool: absolute paths into a bundled Python, Node.js, and pnpm payload |

#### spill（2）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-spill-local` | 是 | ✓ | Local-filesystem implementation of the DeepSeek Harness spill storage seam (private session-scoped files) |
| `dsh-spill-policy` | 是 | ✓ | Token-budgeted tool-result retention with recoverable text and image paths |

#### ssh（4）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-fs-ssh` | — | — | Filesystem provider over the shared POSIX SSH helper |
| `dsh-sandbox-ssh` | — | — | Remote POSIX sandbox argv provider over the shared SSH helper |
| `dsh-ssh` | 是 | — | Shared OpenSSH connection and versioned POSIX remote helper |
| `dsh-subprocess-ssh` | — | — | Subprocess and terminal provider over the shared POSIX SSH helper |

#### storage（4）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-storage` | — | ✓ | Storage hub (ctx.storage): named backend registry plus mounted data-form facilities for the DeepSeek Harness |
| `dsh-storage-domain` | 是 | ✓ | Domain data form (ctx.storage.domain): schema-validated, event-emitting KV domains over storage backends for the DeepSeek Harness |
| `dsh-storage-json` | 是 | ✓ | JSON file KV storage backend for the DeepSeek Harness storage hub |
| `dsh-storage-sqlite` | 是 | — | SQLite storage backend (kv facet) for the DeepSeek Harness storage hub |

#### subagent（9）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-subagent` | 是 | ✓ | Abstract subagent seam (ctx.subagents): named-provider registry for delegating to child agents |
| `dsh-subagent-acp` | 是 | — | Out-of-process ACP subagent backend: drives a child agent in a spawned subprocess over the Agent Client Protocol |
| `dsh-subagent-claude-code` | 是 | — | One-shot Claude Code subagent provider over the official Agent SDK |
| `dsh-subagent-codex` | 是 | — | One-shot Codex subagent provider over the official app-server protocol |
| `dsh-subagent-dsh-sdk` | 是 | — | Out-of-process SDK subagent backend: drives a child DeepSeek Harness runtime subprocess over stdio JSON-RPC through the TypeScript SDK client |
| `dsh-subagent-fork-in-process` | 是 | ✓ | In-process fork subagent backend: runs a child agent seeded with a prefix of the parent's log |
| `dsh-subagent-spawn-in-process` | 是 | ✓ | In-process spawn subagent backend: runs a fresh child agent on ctx.agents |
| `dsh-tool-subagent` | 是 | ✓ | Model-facing subagent delegation tool over the ctx.subagents seam |
| `dsh-tool-subagent-control` | 是 | ✓ | Shared messaging, interruption, and child discovery tools for subagents |

#### subprocess（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-subprocess-local` | — | ✓ | Local-subprocess implementation of the DeepSeek Harness subprocess seam |

#### team（2）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-agent-team` | 是 | ✓ | Shared task DAG and change waits for subagent trees |
| `dsh-tool-agent-team` | 是 | ✓ | Scoped model-facing Agent Teams tools over ctx.agentTeams |

#### telemetry（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-otel` | — | ✓ | Cordis service for independent ordinary-event and byte-bounded Session-log OTLP channels |

#### terminal（2）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-terminal` | — | ✓ | Persistent PTY session seam for the DeepSeek Harness — owner-scoped ids, backend registry, interactive sends, reads, signals, and awaited cleanup |
| `dsh-terminal-bash` | 是 | ✓ | Persistent shell PTY backend over the DeepSeek Harness subprocess terminal primitive |

#### test-support（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-llm-replay` | 是 | — | Replay LLM plugin: short-circuits llm/stream with model chunks reconstructed from a recorded session JSONL (keyless snapshot tests) |

#### todo（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-tool-todo` | 是 | ✓ | Model-facing todo_write tool over the DeepSeek Harness event-sourced session log |

#### typert（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-typert-loader` | 是 | ✓ | Loader integration for generated Typert package contributions |

#### web（5）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-tool-web` | 是 | ✓ | Model-facing web tools (web_search, web_fetch) over the DeepSeek Harness web capability seam (ctx.web) |
| `dsh-web` | 是 | ✓ | Abstract web access capability seam (ctx.web) for the DeepSeek Harness — search/fetch provider registry, registration-order-independent selection, request/result vocabulary, and the WebError taxonomy |
| `dsh-web-deepseek-api` | 是 | ✓ | DeepSeek Search and Fetch API providers for the DeepSeek Harness web capability seam (ctx.web) |
| `dsh-web-fetch-http` | 是 | ✓ | Anonymous HTTP(S) fetch provider for the DeepSeek Harness web capability seam (ctx.web) |
| `dsh-web-search-deepseek` | 是 | ✓ | DeepSeek-backed search provider (native web_search via the Anthropic-compatible API) for the DeepSeek Harness web capability seam (ctx.web) |

#### workflow（2）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-tool-workflow` | 是 | ✓ | Model-facing workflow tool: run a JavaScript orchestration script over ctx.workflowEngine |
| `dsh-workflow-ptc` | 是 | ✓ | Workflow orchestration in the shared sandboxed Node PTC runtime |

#### workspace（1）

| 包 | Config | 本机 | 说明 |
|---|---|---|---|
| `dsh-workspace` | — | ✓ | Workspace entity registry (ctx.workspaceRegistry): durable workspace records with validated session attachment over the domain data form for the DeepSeek Harness |

---

## 8. 官方组合包矩阵

`dsh-official-bundles`（master 在 `packages/util/official-bundles/src/bundles.ts`）由**安装方持有**名单，改名单要发新版本，profile 无法扩展。

### 8.1 随附 profile 模板（`PROFILE_TEMPLATES`）

| profile | 组合包层 | 用途 |
|---|---|---|
| `web` | `dsh-base` → `dsh-web-app` | 浏览器应用（Desktop 用的就是这一层） |
| `headless` | `dsh-base` → `dsh-headless` | 一次性运行器，无 Host/HTTP/浏览器层 |
| `sdk` | `dsh-base` → `dsh-sdk-app` | 进程外 SDK 客户端（stdio JSON-RPC） |
| `sdk-minimal` | `dsh-sdk-minimal`（**不叠 base**） | 显式完整配置树的独立组合 |
| `acp` | `dsh-base` → `dsh-acp-app` | 仅自动化的 ACP 服务器 |

`DEFAULT_PROFILE_BUNDLES` = `[@deepseek-ai/dsh-base]`。`desktop` **不在**模板表：Desktop 应用自己持有 `$DSH_HOME/profiles/desktop`，实际层是 `dsh-base` + `dsh-web-app` + 安装/用户选定的组合包。

### 8.2 可选组合包（`OPTIONAL_BUNDLES`，装好但默认关闭，17 个）

| 组合包 | 中文名 | 实际挂载的插件行 | 说明 |
|---|---|---|---|
| `dsh-cua-bundle` | Computer Use | `dsh-computer-use`、`dsh-cua-macos`、`dsh-cua-windows`、`dsh-cua` | 允许 agent 直接操作电脑上的应用程序。 |
| `dsh-cua-mcp` | Computer Use MCP 服务器 | `dsh-session`、`dsh-session-persistence-jsonl`、`dsh-session-projection`、`dsh-attachment-local`、`dsh-working-directory`、`dsh-storage`、`dsh-storage-json`、`dsh-storage-domain`、`dsh-subprocess-local`、`dsh-sandbox-local`、`dsh-sandbox-policy`、`dsh-user-approval`、`dsh-fs-sandbox`、`dsh-tools`、`dsh-tool-executor-native`、`dsh-system-prompt`、`dsh-user-questions`、`dsh-llm`、`dsh-agent`、`dsh-agent-loop`、`dsh-agent-preset-registry`、`dsh-agent-preset`、`dsh-computer-use`、`dsh-cua-macos`、`dsh-cua-windows`、`dsh-cua-mcp` | 通过 cua-mcp profile 向 Codex、Claude Code 等 MCP 客户端提供 Computer Use：cua_run_code 对桌面应用运行持久程序，cua_reset 清空程序环境。 |
| `dsh-timeline` | 时间线 | `dsh-timeline` | 在长程任务中替代待办工具。智能体主动维护任务树，你可以通过实时进度条和定时报告跟踪进展。 |
| `dsh-experimental-session-search` | 会话搜索 | `cordis:group`、`dsh-session-query-sqlite`、`dsh-tool-session-query` | 询问以往的工作，例如“上周我们是怎么修好连接池泄漏的？”，智能体会搜索同一工作区的历史会话来回答。 |
| `dsh-experimental-ralph-bundle` | Ralph 循环 | `cordis:group`、`dsh-workflow-ptc`、`dsh-tool-ralph` | 要求用 Ralph 循环完成一个目标后，智能体会一轮接一轮地启动新的智能体处理它，直到目标达成、报告受阻或达到轮次上限。 |
| `dsh-experimental-terminal-bundle` | 持久终端 | `cordis:group`、`dsh-terminal`、`dsh-terminal-panel`、`dsh-tool-terminal` | 为智能体提供以侧栏标签页打开的终端，你可以旁观，也可以直接在其中键入来接管。进程在多次工具调用之间持续运行，因此它可以启动开发服务器或 REPL，稍后再读取输出；它也能读取你自己打开的终端。 |
| `dsh-experimental-badge-skill-bundle` | DSH 徽章技能 | `dsh-skill-badge` | 让 Agent 为文档、PR 等产出添加「powered by dsh」徽章。 |
| `dsh-experimental-session-titles-bundle` | 随对话更新的标题 | `dsh-session-title-all-prompts-llm` | 根据你的所有消息生成会话标题，并在主要任务变化时更新，而不是只根据第一条消息生成。 |
| `dsh-experimental-voice-input-bundle` | 语音输入 | `dsh-experimental-speech-to-text`、`dsh-experimental-speech-to-text-sensevoice`、`dsh-experimental-api-speech-to-text`、`dsh-experimental-client-ui-voice-input` | 在本机使用 SenseVoice 转写录音，首次使用需安装依赖。 |
| `dsh-experimental-cot-translation-bundle` | 思考过程机器翻译 | `dsh-experimental-translator`、`dsh-experimental-client-ui-cot-translation` | 智能体输出时，把展开的“思考”行翻译成你选择的语言，点击“查看原文”可切换回原文。 |
| `dsh-experimental-auto-review` | 自动授权审查 | `dsh-experimental-auto-review` | 提供“自动审查”访问模式：每次工具调用前，由模型对照你的要求检查，获准的调用立即运行，被拒绝的调用等你审批。 |
| `dsh-experimental-inspector-profile` | 开发者工具 | `dsh-experimental-inspector`、`dsh-experimental-session-inspector`、`dsh-experimental-client-ui-stats` | 用于排查问题：在「会话数据诊断」中查看 DSH 为会话记录的内容，在「统计」页签查看每轮/每步的上下文、耗时、缓存和工具成本，并在 Chrome DevTools 中调试 DSH 后端。 |
| `dsh-experimental-liveshare` | LiveShare 会话分享 | `dsh-experimental-liveshare` | 把当前会话分享给同事，对方可在浏览器中驱动该会话、在分享允许写入时修改授权工作区内的文件，或从已完成历史分支出自己的会话。 |
| `dsh-experimental-plugin-market-bundle` | 自定义插件索引 | `dsh-plugin-market`、`dsh-client-ui-plugin-market` | 在插件页添加“发现”标签页，从你添加的插件索引中浏览和安装插件。 |
| `dsh-experimental-tool-worktree` | Git 工作树 | `dsh-experimental-worktree`、`dsh-experimental-tool-worktree` | 要求在新分支上工作时，智能体会创建单独的 Git 工作树并在其中继续，你当前的工作树保持原样。 |
| `dsh-experimental-forge-bundle` | 变更请求与工作树 | `dsh-experimental-worktree`、`dsh-experimental-tool-worktree`、`dsh-experimental-forge`、`dsh-experimental-forge-github`、`dsh-forge-gitlab`、`dsh-experimental-forge-session`、`dsh-experimental-client-ui-forge` | 在会话侧栏集中跟踪关联的代码变更请求，支持 GitHub PR 以及 GitLab MR：查看检查状态、评审意见与代码差异，并把修改建议交给智能体继续处理。也可查看本地改动，用独立工作树隔离任务。GitHub 功能需要本机安装 gh 并登录。GitLab 合并请求需要本机安装 glab 并登录。 |
| `dsh-deepseek-chat-import` | DeepSeek 会话导入 | `dsh-deepseek-chat-import` | 点击“新建会话”旁的按钮上传 DeepSeek 官网导出的 ZIP 文件，每段对话都会成为所选工作区中的一个会话。 |

> `dsh-cua-mcp` 值得单独记住：它是一整个 **profile bundle**（自带 session/agent-loop/storage 等核心行），把 Computer Use 作为 MCP stdio server 暴露给 Codex、Claude Code 等外部 harness —— 这是「一个组合包里塞一棵完整插件树」的现成样本。

### 8.3 按需组合包（`ON_DEMAND_BUNDLES`）

| 组合包 | 说明 |
|---|---|
| `dsh-subagent-claude-code` | 一次性 Claude Code 子代理提供方（官方 Agent SDK），走 `ctx.subagents` |
| `dsh-subagent-codex` | 一次性 Codex 子代理提供方（官方 app-server 协议） |

通过普通按需安装器进入 profile；`OFFICIAL_ON_DEMAND_CATALOG` 内嵌离线元信息、图标与平台声明。

### 8.4 已退役（`RETIRED_BUNDLES`，加载时自动从 profile 移除）

`dsh-experimental-schedule-bundle`（Web 组合已自己挂 Schedule）、`dsh-experimental-agent-team-profile`、`dsh-personalized-recommendations`（0.2.3 起 Web 组合自己挂推荐，见 `docs/upgrade-guide/v0.2.2-rc.5/personalized-recommendations-bundle-retired/`）。

### 8.5 插件管理器的展示策略

`src/plugin-manager.ts` 另有 `PROTECTED_PLUGINS`（管理依赖，只读，动它需解除 `management-required` 拒绝）、`HIDDEN_BUNDLES`、`EXTENSION_BUNDLES`（置顶）、`EXPERIMENTAL_BUNDLES`（实验标记）、`MORE_BUNDLES`（profile 启用前不上主列表）。自己发 bundle 不必碰这些。

---

## 9. 已被占用的模型工具名

写新工具前先避开重名（master `docs/tool-catalog.zh.md`，78 个工具；包名省略 `@deepseek-ai/`）：

| 归属包 | 工具名 |
|---|---|
| `dsh-experimental-browser-use-stagehand-native` | `stagehand_act`、`stagehand_extract`、`stagehand_navigate`、`stagehand_observe`、`stagehand_screenshot`、`stagehand_tabs` |
| `dsh-experimental-tool-subagent-oar` | `subagent_oar` |
| `dsh-experimental-tool-worktree` | `enter_worktree`、`exit_worktree` |
| `dsh-mcp-resources` | `list_mcp_resource_templates`、`list_mcp_resources`、`read_mcp_resource` |
| `dsh-plan-mode` | `exit_plan_mode` |
| `dsh-plugin-manager` | `plugin_manager` |
| `dsh-plugin-market` | `plugin_market` |
| `dsh-terminal-panel` | `user_terminal_list`、`user_terminal_read` |
| `dsh-tool-agent-team` | `team_task_create`、`team_task_get`、`team_task_list`、`team_task_update` |
| `dsh-tool-ask-user` | `ask_user_question` |
| `dsh-tool-bash` | `bash` |
| `dsh-tool-bash-persistent` | `bash` |
| `dsh-tool-cordis` | `cordis_inspect` |
| `dsh-tool-executor-ptc` | `run_code` |
| `dsh-tool-fs` | `apply_patch`、`edit`、`read`、`read_image`、`write` |
| `dsh-tool-fs-search` | `glob`、`grep` |
| `dsh-tool-goal` | `create_goal`、`get_goal`、`update_goal` |
| `dsh-tool-jobs` | `job_kill`、`job_list`、`job_output` |
| `dsh-tool-lsp` | `lsp` |
| `dsh-tool-office` | `office_convert`、`office_recalculate`、`office_render` |
| `dsh-tool-present` | `present` |
| `dsh-tool-pwsh` | `pwsh` |
| `dsh-tool-pwsh-persistent` | `pwsh` |
| `dsh-tool-ralph` | `ralph` |
| `dsh-tool-schedule` | `schedule_create`、`schedule_edit`、`schedule_list`、`schedule_view` |
| `dsh-tool-session-control` | `session_send_message` |
| `dsh-tool-session-list` | `list_session`、`list_workspace` |
| `dsh-tool-session-query` | `session_event_read`、`session_event_search`、`session_event_trace`、`session_search`、`session_trace` |
| `dsh-tool-skill` | `skill` |
| `dsh-tool-str-replace-editor` | `str_replace_editor` |
| `dsh-tool-subagent` | `list_subagent_models`、`subagent` |
| `dsh-tool-subagent-control` | `interrupt_agent`、`list_agents`、`send_message`、`wait_agent` |
| `dsh-tool-terminal` | `terminal_close`、`terminal_list`、`terminal_open`、`terminal_read`、`terminal_send`、`terminal_signal` |
| `dsh-tool-todo` | `todo_write` |
| `dsh-tool-web` | `web_fetch`、`web_search` |
| `dsh-tool-workflow` | `workflow` |
| `dsh-tool-workspace-dependencies` | `load_workspace_dependencies` |

---

## 10. DSH 侧硬规范

来自 `docs/user/develop/**`、`docs/cookbook/**`、`packages/preset/agent-preset/skills/dsh-doc/references/{practices,host-plugin,dsh-version,ui-plugin}.md`。

**Must**

1. **会话日志是唯一真源**：模型能看到的一切必须能从已提交事件重建；插件内存只是派生缓存。
2. **注册 = 上下文拥有的副作用**：插件卸载 / agent dispose / Slot 折叠 / profile patch 都会回收；注册到 `agent.ctx` 时双 owner 留 disposer。
3. **用最弱的机制**：`restrict()`（只能减）< `guard()`（只能拒）< waterfall（可改写、依赖顺序）< `system-prompt/assemble`（整体替换）。
4. **waterfall 必须委托**：不掌权就 `next()`；改写 `agent/pre-step` 决策要展开 `{ ...decision, messages }`。
5. **新增模型可见输入 = 需要会话事件**；改已有消息内容 = 注册纯消息投影。
6. **可调参数进 Config**；持久化走 `ctx.configEditor`。
7. **派生状态用 `ctx.sessionProjections`**：纯、同步、未变返回同一引用，字段或折叠语义变了 bump `stateVersion`。
8. **UI 是 DSH UI 的一部分**：宿主主题令牌、locale、布局节奏；先选渲染面再写样式。
9. **可选依赖用 `inject` / `ctx.inject([...])`**，让插件在没有该服务的 profile 里保持不激活。
10. **版本要求写 `engines.dsh`**（§2.5），并声明兼容旧读者/旧缓存。

**Must Not**

1. 不要 append 新 `type` 的会话事件（旧读者只接受带 `ignorable: true` 的未知事件，而 `Session.append()` 设不了这个标记，会话将无法重开；`appendPluginRecord()` 只留给 DSH 实验包）。
2. 不要自订阅 `session/event` 重扫 `session.events`。
3. 不要轮询 `agent/status`；等 `turn/end`、`assistant/message`、`tool/result`，实时 token 走 `agent/assistant-stream`。
4. 不要用 `system-prompt/assemble` 增删工具或文字。
5. 不要为插件页面起 Host 路由 + iframe。
6. 不要 require 冻结表以外的 Harness Client 包；原语本身官方也不建议 require（§3）。
7. 不要在组件外写 DOM 或 append `document.body`。
8. 不要把业务/传输状态塞 Slot store。
9. 不要手写配置文件或凭据。
10. 不要让定时器直接改状态（起工作用 `followup()`，只补上下文用 `inject()`，并在 owner effect 清掉定时器）。

---

## 11. LocalFolio 落地约定

定位：在 DSH 既有能力上增量追加；DSH 已提供的（主题、UI 原语、槽位、快捷键、只读文件浏览、设置框架）一律复用，只把缺口做成细粒度标准插件，最后用聚合 bundle 合装。

### 11.1 命名与目录

`@folio/<大类层>-<功能域>-<细分职责>`：

| 前缀 | 含义 | 例子 |
|---|---|---|
| `bundle-*` | 聚合元包 | `@folio/bundle-suite-all` |
| `core-*` | Host / UI 基础设施增量 | `core-host-storage`（`ctx.folioStorage`）、`core-host-runtime`（`ctx.folioRuntime`，`/lf/*` RPC + SSE）、`core-ui-kit`（`ctx.folioUi`，纯通用 shadcn/Radix + `lucide-react` 组件、无 Preflight Tailwind v4 共享样式、Portal/Toast 宿主） |
| `shell-*` | 覆盖层外壳 / 设置分页 | `shell-overlay-ui`（`ctx.folioShell`）、`shell-settings-ui` |
| `app-*` | 业务插件 | `app-starter-host`、`app-starter-ui`、`app-gallery-ui`、`app-sidebar-ui` |
| `bridge-*` / `ext-*` | 桥接 DSH 工具 / 薄扩展 | 预留 |
| `lib-*` | 编译期共享契约（不是插件） | `lib-shared-contract` |

### 11.2 Host 侧

```ts
export const name = 'core-host-runtime'
export const inject = ['folioStorage'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposeProvide = ctx.provide('folioRuntime', runtime)
    return () => {
      runtime.dispose()
      disposeProvide()
    }
  }, 'core-host-runtime: service')
}
```

`ctx.provide()` 是 Cordis 提供给插件的公开注册 API（`Service` 基类内部就是调用它）；返回的 disposer 归本插件 effect 所有，插件卸载即撤销服务。另一种等价写法是直接 `export default class extends Service`，但对「工厂造出的普通对象」这种形态，`ctx.provide` 改动最小。

> 类型提示：cordis 把 `provide` 的声明放在 `reflect.d.ts` 里，而包的 `index.d.ts` 没有 re-export 它，所以 TS 里需要像 `libs/lib-shared-contract/src/index.ts` 那样补一份同签名的 `declare module '@deepseek-ai/cordis'` 合并（运行时 `ctx.provide` 一定存在）。

### 11.3 Client 侧

```tsx
export const inject = ['slots'] as const

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposeService = ctx.provide('folioShell', controller)
    const disposeOverlay = ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register({ name: 'shell.overlay', id: 'folio.shell.overlay', order: 1 }, FolioOverlay),
    )
    return () => { disposeOverlay?.(); disposeService() }
  }, 'shell-overlay-ui: service + overlay')
}
```

约定：全屏工作台挂 `shell.overlay`（`order: 1`），自由悬浮面板层同 slot（`order: 2`），UI 样式/Portal/Toast 宿主由 `@folio/core-ui-kit` 挂同 slot（`order: 3`）；业务 UI 只调 `ctx.folioShell.registerWorkspace/registerFloatingPanel`；样式只用 `--dsw-alias-*` / `--dsw-font-family`，外壳还要尊重 `--dsh-frame-top-clearance`；控件与图标通过 `dsh.client.external: ['@folio/core-ui-kit']` 从 `@folio/core-ui-kit/client` 单实例引入；快捷键走 `ctx.shortcuts`；Client manifest 必须有 `dsh.client.platform: "web"`，`immediately` 只在确实要启动早期渲染时开，`inject` 只用于排序激活。

### 11.4 打包与构建

- 产物：每包 `lib/index.js`（Host）+ `lib/client.js`（Client），`exports` 暴露 `.` 与 `./client`，以及 `./locale/*.json` 与 `./icon`。
- `scripts/build.mjs` 的 `DSH_CLIENT_EXTERNALS` 与 master `packages/client/web/src/platform.ts` 的 11 个模块对齐（含 `react/jsx-runtime`），并把 `dsh.client.external` 合并进来；每次构建自动跑 `scripts/sync-ui-kit.mjs` 同步 `@folio/core-ui-kit` 的通用组件导出表，并仅对含 `src/tailwind.css` 的 `@folio/core-ui-kit` 编译一份无 Preflight 的 Tailwind v4 样式（`@source "../../";` 自动覆盖所有独立 UI 插件、`@layer base` 严格限定在 `[data-lf-*]` 作用域，`--watch` 下任意 UI 插件重编自动联动刷新）；新增通用 shadcn 原语直接用 `pnpm run ui:add <组件>`；业务插件专属图标可直接按需 import `lucide-react`（无状态 SVG，零跨插件单例问题）。实测 `@folio/core-ui-kit` 仅 require `react` / `react-dom` / `react/jsx-runtime`，其余 UI 插件额外仅 require `@folio/core-ui-kit/client`（均不再 import 任何 `@deepseek-ai/dsh-*`）。
- `react`、`cordis` 在 `peerDependencies`；需要与宿主共享实例的 DSH 包 peer+dev 双声明。
- 每个包都声明 `engines.dsh`（当前 `^0.2.2-rc.5`），`locale/{zh,en}.json` 提供 `meta.title/description`，`icon.svg` 为原创图标。
- 校验：`pnpm run verify`（typecheck → build → check-artifacts → vitest）。

### 11.5 运行时数据

`%LOCALAPPDATA%\LocalFolio\`（`LOCALFOLIO_DATA_DIR` 覆盖）：`shared/plugins-manifest.json` + `plugins/<pluginId>/{data,cache}`。**严禁**写 DSH 自己的 storage 或会话目录；底层优先走 `ctx.fs`。

### 11.6 已按 master 规范对齐的四处（2026-11-26）

| # | 之前 | 现在 |
|---|---|---|
| 1 | 7 个包都没有 `engines.dsh` | bundle 与 9 个插件都声明 `"engines": { "dsh": "^0.2.2-rc.5" }`（预发布后缀原样保留，见 §2.5） |
| 2 | bundle 只有 `icon.svg`，没有 `locale/*.json` | bundle 与 9 个插件都有 `locale/zh.json` + `locale/en.json` 的 `meta.title/description`，bundle 另带 `meta.detail: docs/DETAIL.md`；`exports`/`files` 同步导出 `./locale/*.json` 与 `./icon` |
| 3 | Client 插件直接 import `@deepseek-ai/dsh-client-ui-primitives` | 抽离纯通用底座插件 `@folio/core-ui-kit`（shadcn/Radix + `lucide-react` + 无 Preflight Tailwind v4 + `shell.overlay` Portal/Toast 宿主），其余 UI 插件（含独立测试插件 `app-gallery-ui`、`app-sidebar-ui`）通过 `dsh.client.external` 单实例复用；客户端产物不再 require 任何 `@deepseek-ai/dsh-client-*` |
| 4 | 服务用 `ctx.reflect.provide` 暴露 | 四处服务（`folioStorage` / `folioRuntime` / `folioUi` / `folioShell`）均用公开的 `ctx.provide()`；在 `libs/lib-shared-contract/src/index.ts` 补齐 cordis 未 re-export 的 `provide`/`get` 类型声明 |

图标分工：每个插件包及 bundle 根目录下保留 64×64 静态 `icon.svg`（深底 + `#60a5fa` 线稿 + `#34d399` 点缀，≤256 KiB），供 DSH 插件管理页在不加载 JS 时静态展示；工作台运行期界面内的按钮/菜单图标统一从 `@folio/core-ui-kit/client`（`lucide-react`）引入。

### 11.7 新增一个业务插件（七步）

1. 在 §7 找同类、在 §4 找 seam —— 能复用就只写薄封装。
2. `plugins/app-xxx-storage`：`inject: ['folioRuntime','folioStorage']`，用 `ctx.folioStorage.forPlugin('app-xxx-storage')` 取目录，`ctx.folioRuntime.registerAction` 注册动作，全部包在 `ctx.effect`。
3. `plugins/app-xxx-ui`：`dsh.client.inject: ['@folio/core-ui-kit', '@folio/shell-overlay-ui']`、`dsh.client.external: ['@folio/core-ui-kit']`、`inject: ['folioShell','slots']`，只调 `registerWorkspace` / `registerFloatingPanel`。
4. 需要模型能力再加 `bridge-*`：`ctx.tools.register()`，工具名避开 §9。
5. 两个包的 `package.json` + 图标 + `locale/zh.json`（+ 可选 `meta.detail`），补 `engines.dsh`。
6. 在 `bundles/bundle-suite-all/package.json` 与 `cordis.patch.yml` 各加一行。
7. `pnpm install --offline && pnpm run verify`；用 `scripts/lfdev.ps1` 在隔离 profile 实测后再进日常 profile。

---

## 12. 校验清单与常见坑

### 12.1 坑

| 现象 | 原因 | 处理 |
|---|---|---|
| 配置被吃掉一半 | patch 的 `config` 整体替换 | 覆盖某行时把键写全 |
| 插件一直 pending | `inject` 的服务在 profile 里不存在 | 改 `ctx.inject([...])` 或补提供方 |
| 激活直接失败 | 向未声明 slot 注册 / 抢了别人的 cell | `ctx.slots.inject()` 等声明；增量用新 id |
| UI 整块空白 | Slot entry 抛错 | 查控制台 `slot entry crashed`；确认没 import 冻结表外的包 |
| 改了代码页面没变 | 只重编 Host；改了被 `external` 的 `core-ui-kit` 未刷新页面；或新增插件未重组 | 改业务 UI 开 `build:watch` 自动局部 HMR；改 `core-ui-kit` 浏览器按 `F5`；新增插件/改 manifest/改 `host.ts` 需 `set_plugin(enabled:true)` 重组或重启 DSH |
| shadcn 下拉/弹层在 React 18 不弹出或透底 | 触发器缺少 `React.forwardRef` 丢 `ref`；弹层缺 `pointer-events-auto`；或 `--popover` 映射了半透明令牌 | `asChild` 目标组件用 `forwardRef`；Portal 接 `usePortalContainer()` 且内容加 `pointer-events-auto`；`--popover`/`--card` 映射不透明 `--dsw-alias-bg-base`；全屏弹层顶部避让 `--dsh-frame-top-clearance` |
| 升级后被拒装 | `engines.dsh` 不匹配（注意预发布后缀） | 按 §2.5 写法放宽范围；看 `incompatible-version` 的 `requirements` |
| git 安装后加载失败 | 拿到源码但没跑 `build`/`prepare` | 包提供自包含 `prepare`；用户侧 profile `pnpm-workspace.yaml` 加 `allowBuilds` |
| `files` 写了仍缺文件 | 本地 `link:` 安装不过滤 `files` | 发布前 `pnpm pack` 核对实际清单 |
| 详情页报错而非回退 README | `meta.detail` 路径错/文件缺失/超 `detailMaxBytes`（1 MiB） | 检查 locale 与 `files` |
| 图标不显示 | 格式/路径/大小不合规（≤256 KiB、包内、非绝对路径/URL/软链） | 换合法 SVG/PNG/JPEG/WebP |
| 升级后会话打不开 | 写了非 `ignorable` 的未知事件 | 见 §10 Must Not 1 |
| 列表越用越卡 | 自订阅事件重扫日志 | 改 `ctx.sessionProjections` |
| `install_bundle` 说已装就不重载 | `already-installed` 是幂等返回 | 用 `set_plugin` 的 `enabled: true` 强制重组 |

### 12.2 交付前自检

- [ ] `pnpm run verify` 全绿
- [ ] `package.json`：`dsh.bundle.patch` / `dsh.client` 齐全，`engines.dsh` 与 peer+dev 双声明到位
- [ ] patch 行 `id` 唯一，可被后续层定位
- [ ] Client 产物只 import §3 的 11 个 id，且已评估「原语依赖」风险
- [ ] 注册都在 `ctx.effect` 内，卸载无残留（定时器、SSE、PTY）
- [ ] 工具名不与 §9 冲突
- [ ] `locale/zh.json` + `locale/en.json` 的 `meta.*` 是真实描述；图标/详情页可渲染
- [ ] 在隔离 profile 实测安装、启停、卸载
- [ ] 对外行为变化写进 `meta.detail` 或 README

---

## 13. master 与本机 0.2.2-rc.5 的差异

从 `0.2.2-rc.5` 到 `0.2.3-alpha.2`：可装载插件包 282 → **305**（+23 净增，其中 76 个包本机没有、17 个本机独有没有上游），seam 110 → **121**，工具 77 → **78**，可选组合包 16 → **17**。

### 13.1 整组不在本机的功能族

| 组 | 包数 | 意味着 |
|---|---|---|
| `connector` | 9 | 全新的「第三方服务连接器」族：钉钉、飞书、企业微信、腾讯文档、腾讯会议、Linear、Notion + `cli-account` / `upstream-skills` / `mcp-account` / `client-ui-connector-account` |
| `ssh` | 5 | 远程 POSIX 执行：`ssh` 连接 + `fs-ssh` / `subprocess-ssh` / `sandbox-ssh` 配对提供方 |
| `lsp` | 3 | `lsp` seam + `lsp-stdio` + `tool-lsp`（4 个标准导航操作） |
| `browser-use` | 1 | `dsh-browser-use` 独占命名提供方注册 |
| `test-support` | 8 | 测试工具链（不进发行版） |

### 13.2 其它值得注意的新包

`dsh-timeline`（任务树替代 Todo）、`dsh-cua-windows`（Windows Computer Use）、`dsh-cua-mcp`（Computer Use 的 MCP profile bundle）、`dsh-forge-gitlab`（GitLab MR）、`dsh-session-persistence-sqlite`、`dsh-storage-sqlite`、`dsh-tool-session-control`、`dsh-tool-session-list`、`dsh-client-config`（浏览器同步配置类型）、`dsh-client-script-realm` / `-iframe`、`dsh-experimental-webworker-runtime` / `-packer`（浏览器内跑宿主树）、`dsh-deepseek-auth`（单请求的 API key / 账号二选一）、`dsh-client-ui-session-panel` / `-status`、`dsh-client-ui-connector-account`、`dsh-hook-protocol` + `dsh-hooks-*`（Claude Code / Codex 钩子桥）。

### 13.3 文档与规范变化

- 新增 `docs/user/session-control.zh.md`；新增 cookbook：`adding-a-plugin-preview`、`adding-a-remote-api`、`adding-a-vendored-package`、`adding-a-session-format-version`、`contributing-system-messages`、`reviewing-ui-design`、`reviewing-persistence-type-changes`。
- dsh-doc 技能新增 `references/dsh-version.md`（`engines.dsh` 的精确语义，已并入 §2.5）；`host-plugin.md` 改写安装/热更新段落（并入 §2.6）。
- `docs/subsystems/` 新增 `ssh`、`lsp`、`mcp`、`todo`、`translation`、`voice-input`、`worktrees`、`forge`、`liveshare`、`browser-use`、`computer-use`、`account`、`deliverables`、`extensions` 等页面。

### 13.4 本机有、master 树里没有的 17 个

这些是发行/构建产物或另一仓库的包，不是「你漏了」：`@deepseek-ai/cordis*`、`cosmokit`、`schemastery`（vendor/依赖）、`@deepseek-ai/dsh`（CLI 本体）、`dsh-web-frontend`（前端 dist）、`dsh-desktop-host`（Desktop 壳）、`libreoffice-kit*`、`node-addon-system`（原生载荷），以及本机发行版携带但已被合并/改名的 `dsh-client-ui-settings-plugins`、`dsh-client-ui-settings-plugin-inventory`、`dsh-tool-working-directory`、`dsh-personalized-recommendations`（后者在 master 已退役为组合包，代码仍在）。

### 13.5 master 有、本机 0.2.2-rc.5 没有（76 个）

| 组 | 包 | 说明 |
|---|---|---|
| account | `dsh-deepseek-auth` | DeepSeek request authentication (ctx.deepseekAuth): choose between the API key and the account sign-in for one DeepSeek API request and release its headers |
| browser-use | `dsh-browser-use` | Exclusive named browser-use provider registration |
| client | `dsh-client-config` | Types of browser-synced plugin configuration |
| client | `dsh-client-remote-connection` | QR login, private login links, and owner-approved browser pairing |
| client | `dsh-client-script-realm` | Direct-reference script environments and Cordis-owned provider registration |
| client | `dsh-client-script-realm-iframe` | Optional iframe ScriptRealm provider |
| client | `dsh-client-store` | React-free observable and snapshot-store contracts with the shared Zustand/Immer engine |
| client | `dsh-client-ui-connector-account` | Connector account surfaces: the Host registry CLI app plugins and MCP connectors register their accounts with, and the Plugins page section, title tag, activation prompt, and notices it serves over one Remote |
| client | `dsh-client-ui-dockkit` | Docking layout kit: split-tree engine with invertible operations, and the React components that render and drive it (zero cordis) |
| client | `dsh-client-ui-primitives` | Pure React atoms for the dsh web UI: controls, icons, markdown, and JSON inspectors (zero cordis) |
| client | `dsh-client-ui-session-panel` | Floating Session panel opened from the Session header, composed of sections that plugins register |
| client | `dsh-client-ui-session-status` | Client Session status table over Host reading records: running state, the effective pending interaction, and read or unread reminders shared by clients of one Host |
| client | `dsh-client-ui-slots` | Slot registry pure core: typed ordinary Slots and reusable Component Factories, derived props, Store seats, and renderer installation |
| client | `dsh-client-web` | Web boot kernel: static module table, Cordis loader, framework-free boot page, and UI-renderer handoff |
| connector | `dsh-cli-account` | Host Service of CLI app plugins: each plugin registers its third-party CLI and account, and the Service gives the model the CLI's absolute path, runs one account operation at a time, and shows the account on the Plugins page |
| connector | `dsh-dingtalk` | DingTalk plugin: the official dws CLI with its skills, and sign-in from the Plugins page |
| connector | `dsh-feishu` | Feishu plugin: the official lark-cli with its embedded skills, and account connection from the Plugins page |
| connector | `dsh-linear` | Linear plugin: Linear's hosted MCP server, authorized through the shared MCP manager |
| connector | `dsh-notion` | Notion plugin: Notion's hosted MCP server, authorized through the shared MCP manager |
| connector | `dsh-tencent-docs` | Tencent Docs plugin: Tencent Docs' hosted MCP server, authorized through the shared MCP manager |
| connector | `dsh-tencent-meeting` | Tencent Meeting plugin: the official tmeet with its skill, and account connection from the Plugins page |
| connector | `dsh-upstream-skills` | Host Service of CLI app plugins: each plugin registers its entry skill and a pinned directory of the vendor's GitHub repository, and the Service downloads that directory into the DSH cache and lists the entry skill over it |
| connector | `dsh-wecom` | WeCom plugin: the official wecom-cli with its skills, and authorization from the Plugins page |
| experimental | `dsh-experimental-browser-use-chrome-devtools-mcp` | Experimental per-Session Chromium browser tools through chrome-devtools-mcp |
| experimental | `dsh-experimental-browser-use-playwright-mcp` | Experimental per-Session Chromium browser tools through @playwright/mcp |
| experimental | `dsh-experimental-browser-use-runtime` | Session-owned browser resource lifecycles and MCP integration for experimental providers |
| experimental | `dsh-experimental-browser-use-stagehand-native` | Experimental Stagehand browser tools with separately configured native models |
| experimental | `dsh-experimental-claude-code-mods` | Experimental bridge: load Claude Code mods (hooks modules) and run their hook chains on DeepSeek Harness extension points |
| experimental | `dsh-experimental-client-ui-claude-code-mods` | Web band above the prompt for Claude Code mods: draws each session's mod tree and sends button presses back to the bridge |
| experimental | `dsh-experimental-computer-use-cua-driver-mcp` | Experimental computer use through an installed Cua Driver MCP executable |
| experimental | `dsh-experimental-computer-use-cua-driver-native` | Experimental computer-use provider embedding the Cua Driver native npm SDK |
| experimental | `dsh-cua-macos` | macOS native provider for shared Computer Use application and window objects |
| experimental | `dsh-cua-mcp` | Computer Use as an MCP stdio server: a dsh profile bundle that exposes cua_run_code to external agent harnesses |
| experimental | `dsh-cua-windows` | Windows C# computer use through shared application and window objects |
| experimental | `dsh-forge-gitlab` | GitLab provider for the experimental forge registry, read and written through the GitLab CLI on the host |
| experimental | `dsh-hook-protocol` | Shared Claude Code / Codex hook wire protocol: matcher engine, stdin/exit-code/stdout codec, multi-hook merge, and hook/* session events |
| experimental | `dsh-hooks-claude-code` | Bridge plugin: run a Claude Code hooks.json / settings hook config on the DeepSeek Harness interception seams |
| experimental | `dsh-hooks-codex` | Bridge plugin: run a Codex hooks.json hook config on the DeepSeek Harness interception seams |
| experimental | `dsh-experimental-subagent-oar` | Experimental one-shot subagents through OAR runtimes |
| experimental | `dsh-timeline` | Replace Todo in long-running sessions with task trees, a live progress bar, and timed reports |
| experimental | `dsh-experimental-tool-subagent-oar` | Delegate standalone tasks to configured external subagent providers |
| experimental | `dsh-webhook` | Fire-and-forget webhook rule runtime that creates Workspace-backed DeepSeek Harness Sessions |
| experimental | `dsh-webhook-github` | Signed GitHub HTTP webhook adapter for the DeepSeek Harness webhook runtime |
| experimental | `dsh-experimental-webworker-packer` | Build-time packer for the browser runtime's base VFS image and ordered data-overlay archives |
| experimental | `dsh-experimental-webworker-runtime` | Browser-only harness runtime: in-memory VFS, module transform and loader, postMessage tunnel, and the dedicated Web Worker assembly, with the Node-compatibility layer that lets the host tree run unchanged |
| host | `dsh-host-authentication-desktop` | Desktop private-channel authentication provider |
| host | `dsh-host-authentication-token` | Default token authentication provider and HTTP cookie exchange |
| lsp | `dsh-lsp` | Abstract LSP capability seam (ctx.lsp) for the DeepSeek Harness — language-server provider registry keyed by branded id and extension mapping, order-independent per-query selection, normalized definition/references/implementation/hover requests and results, and the LspError taxonomy |
| lsp | `dsh-lsp-stdio` | Generic stdio language-server provider for the DeepSeek Harness LSP capability seam (ctx.lsp) — spawns configured servers, translates JSON-RPC, and serves transient-open goToDefinition/findReferences/goToImplementation/hover queries in the host filesystem namespace |
| lsp | `dsh-tool-lsp` | Model-facing lsp tool over the DeepSeek Harness LSP capability seam (ctx.lsp) — one read-only tool with goToDefinition/findReferences/goToImplementation/hover operations, one-based UTF-16 cursor coordinates, bounded location rendering, and hover normalization |
| mcp | `dsh-mcp-account` | MCP connector accounts on the Plugins page: each connector's OAuth server in the connector account registry, authorized through the MCP manager |
| sdk | `dsh-sdk-client` | TypeScript client SDK for driving a DeepSeek Harness runtime subprocess over stdio JSON-RPC: the DeepSeekHarness high-level turns API and the lower-level HarnessClient |
| session | `dsh-session-persistence-sqlite` | SQLite Session event storage backend for the DeepSeek Harness |
| session | `dsh-tool-session-control` | Send model-authored messages to ordinary Web Sessions with acceptance receipts |
| session-query | `dsh-tool-session-list` | Read-only paginated Workspace and Session metadata tools |
| ssh | `dsh-fs-ssh` | Filesystem provider over the shared POSIX SSH helper |
| ssh | `dsh-sandbox-ssh` | Remote POSIX sandbox argv provider over the shared SSH helper |
| ssh | `dsh-ssh` | Shared OpenSSH connection and versioned POSIX remote helper |
| ssh | `dsh-ssh-helper-runtime` | Private executable carrier for the POSIX SSH helper and managed workers |
| ssh | `dsh-subprocess-ssh` | Subprocess and terminal provider over the shared POSIX SSH helper |
| storage | `dsh-storage-sqlite` | SQLite storage backend (kv facet) for the DeepSeek Harness storage hub |
| subagent | `dsh-subagent-acp` | Out-of-process ACP subagent backend: drives a child agent in a spawned subprocess over the Agent Client Protocol |
| subagent | `dsh-subagent-claude-code` | One-shot Claude Code subagent provider over the official Agent SDK |
| subagent | `dsh-subagent-codex` | One-shot Codex subagent provider over the official app-server protocol |
| subagent | `dsh-subagent-dsh-sdk` | Out-of-process SDK subagent backend: drives a child DeepSeek Harness runtime subprocess over stdio JSON-RPC through the TypeScript SDK client |
| test-support | `dsh-agent-loop-testkit` | Prerequisite mounting, production AgentLoop drivers, and Inbox stubs for tests |
| test-support | `dsh-client-test-runtime` | Browser test runtimes: a jsdom slot bench with test-owned Session and Workspace doubles, and a whole-client tier that boots the web roster through the production bootClient over an endpoint-named Remote mock |
| test-support | `dsh-llm-mock-server` | Scriptable Messages HTTP/SSE fault server for LLM recovery tests |
| test-support | `dsh-llm-replay` | Replay LLM plugin: short-circuits llm/stream with model chunks reconstructed from a recorded session JSONL (keyless snapshot tests) |
| test-support | `dsh-loader-smoke` | Shared subprocess and direct-agent harness for keyless real-Loader example smoke tests |
| test-support | `dsh-remote-mock` | Endpoint-named mock for Typert Remote traffic: unary answers and stream scripts per <namespace>/<method>, live stream control, a log, and the Connection carrier face whole-client specs install |
| test-support | `dsh-session-snapshot` | Session-log snapshot core with an ACP protocol adapter, expected-output normalization, and fixture invariants |
| test-support | `dsh-tool-testkit` | Tool definition and execution fixtures for tests and benchmarks |
| typert | `dsh-typert-generator` | TypeScript project analyzer and model-driven Typert artifact generator |
| util | `dsh-util-file-drag` | Shared file drag names and native transfer requests |
| util | `dsh-util-text-search` | Multilingual fuzzy filtering for in-memory search lists |

---

## 14. 来源与再生成

### 14.1 权威文件

| 用途 | master 路径（`F:\AI\geren\deepseek-harness`） | 安装内路径（`app.asar/dsh/node_modules/`） |
|---|---|---|
| 架构与扩展点归属 | `docs/architecture.zh.md` | `@deepseek-ai/dsh/docs/architecture.zh.md` |
| 服务与 seam | `docs/capability-seams.zh.md` | 同路径 |
| 可装载插件清单（生成物） | `packages/preset/agent-preset/skills/dsh-doc/references/packages.md` | 同路径 |
| 工具清单 | `docs/tool-catalog.zh.md` | 同路径 |
| 配置目录 | `docs/config-catalog.zh.md` | 同路径 |
| 持久化目录 | `docs/persistence-catalog.zh.md` | 同路径 |
| Slot 全树与规则 | `docs/subsystems/slots.zh.md` | 同路径 |
| 客户端平台模块表 | `packages/client/web/src/platform.ts` | 需读前端 dist（§3 已实测一致） |
| 组合包名单 | `packages/util/official-bundles/src/bundles.ts` | `@deepseek-ai/dsh-official-bundles/src/bundles.ts` |
| 规范层叠样本 | `packages/bundle/base/cordis.patch.yml`、`packages/bundle/web-app/cordis.patch.yml` | 同路径 |
| 插件开发技能 | `packages/preset/agent-preset/skills/dsh-doc/` | 同路径 |
| 升级指引 | `docs/upgrade-guide/` | 同路径 |

### 14.2 再生成命令

本机现在有克隆，重跑最省事的是在仓库里直接生成，再回到本工作区拼装：

```bash
git -C F:/AI/geren/deepseek-harness pull --ff-only     # 或重新 clone
cd F:/AI/geren/deepseek-harness
pnpm run gen-plugin-packages       # 刷新 packages.md（含 Config 分类）
pnpm run gen-doc-graphs            # 刷新 capability-seams
pnpm run gen-client-catalog        # 刷新 slot-catalog（可选）
```

然后重跑本工作区的抽取脚本（`.scratch/dsh-catalog/gen-master.cjs`、`gen-delta.cjs`）重新生成这几张表，按脚本输出替换本文件对应章节的表格内容。表格只做搬运，结论必须带来源。

### 14.3 本机版本的核对方式

ASAR 内的文件用 Host 文件读取工具直接读；目录列举与搜索必须用运行中的 Electron 运行时（`ELECTRON_RUN_AS_NODE=1 "<DSH_NODE_EXECUTABLE>"`），普通 `node` / `grep` / `glob` 读不进 ASAR。dsh-doc 技能已封装这套定位与读取流程。

### 14.4 升级 DSH 后要重跑的最小核对

1. `@deepseek-ai/dsh/package.json` 的 `version` —— 更新 §0 锚点。
2. `references/packages.md` 与 `docs/capability-seams.zh.md` —— 重建 §4 / §7。
3. `official-bundles/src/bundles.ts` —— 更新 §8（模板/可选/按需/退役）。
4. `packages/client/web/src/platform.ts` —— 更新 §3。
5. `docs/tool-catalog.zh.md` —— 更新 §9。
6. `docs/upgrade-guide/` 新条目 —— 追加到 §12 与 §13。
