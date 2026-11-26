# 测试界面不进产品套件，单独成一个可选套件

工作台最初只有一个套件，把基础能力、框架桥接和六个 `test-*` 验证界面一起装进 profile。这些验证界面的作用是「证明基础能力撑得起复杂界面」——它们不是给人日常使用的功能，其中 `test-studio-admin-ui` 的 client 产物约 1.2 MB。合在一起装，每个用户都要为验证代码付启动代价和内存代价，而删起来又会牵动产品安装形态。

因此拆成两个聚合元包：

- `@folio/workbench-suite` 是**产品安装入口**，只有基础能力（6 个 `base-*`）、桥接（`bridge-dsh-interactions-ui`、`bridge-frame-test-ui`）与正式工作区（`workspace-files-*`、`workspace-canvas-*`、`workspace-materials-*`）。
- `@folio/test-suite` 只装六个 `test-*`，装在产品套件之上。

两个套件都只由 `dsh.bundle.patch` 指向的 `cordis.patch.yml` 声明插入哪些插件，自身被加载但不提供能力。分类不是约定而是枚举：`libs/base-contract/src/manifest.ts` 的 `DshPluginCategory` 只有 `base / workspace / feature / test / bridge` 五个值，`test` 这个分类在设置页里独立成组，一眼能看出哪些是该删的。

## Consequences

- 只验证产品形态时只装 `workbench-suite`；`test-suite` 缺前置套件时插件保持 pending，而不是安装失败。
- 新增工作区要同时改三处才完整：`bundles/workbench-suite/{package.json,cordis.patch.yml}`（装得上）、`createDefaultPluginManifest()`（设置页看得见）、`scripts/lfdev.ps1` 的 `$ExpectedClientPlugins`（verify 校验得到）。只改前两处时界面能开，但自动校验会漏。
- 验证界面的退场成本降到「删目录 + 删两行」，不触碰基础能力和产品工作区。
- 反过来，任何被日常使用的功能都不许留在 `test-suite` 里：一旦某天要保留它，就得先把它改名成 `workspace-*` 并迁进产品套件，否则用户的日常功能会随着验证界面的删除一起消失。
