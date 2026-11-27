# 本地开发：构建、挂载与启动排错

面向「改完代码要立刻看到效果」的场景。除特别说明外，命令都在仓库根目录执行，可直接复制。
日常安装与发布流程见 [README](../README.md) 的 §2、§3；本文件只收集**启动链路上的坑**。

## 一、标准循环

改完代码后只需要一条命令，链接不用动（`link:` 已经指向本仓库，产物一改就生效）：

```powershell
pnpm run build      # 构建全部 plugins/* 到各自的 lib/
```

- **只改了 Client（`*-ui`、`base-ui-kit`、样式）**：刷新 DSH 页面即可，boot payload 每次加载都会重新读取 `lib/client.js`。
- **改了 Host（`*-host`）、Worker 或 `cordis.patch.yml`**：重启 DSH。
- **想边改边看**：`pnpm run build:watch`，UI 改动自动重编并联带刷新 `base-ui-kit` 的共享 Tailwind 样式表。
- **提交前**：`pnpm run verify`（类型检查 → 构建 → 产物语法检查 → 单元测试）。

> 提示：`pnpm run verify` 的四步只要前一步失败，pnpm 会在末尾补一行
> `[ELIFECYCLE] Command failed with exit code 1`。这行只是包装，**真正的原因永远在它上面第一段红色输出里**，
> 不要拿这行当错误去搜。

## 二、什么时候才需要「重装链接」

常规开发**不需要**。下面两种情况才重装：

1. 套件 `bundles/workbench-suite/package.json` 的依赖变了（新增 / 删除子插件、改包名）；
2. 链接被卸掉或指向了旧路径。

桌面版 `desktop` profile 由 Electron 独占，CLI 会拒绝写入，只能在界面里操作：

```text
DSH → 插件 → 先卸载 @folio/workbench-suite → 添加插件 → 包名或地址填：
link:F:\AI\geren\LocalFolio\bundles\workbench-suite
```

非桌面 profile（如隔离调试实例 `lfdev`）可以用脚本装：

```powershell
pwsh -File scripts/lfdev.ps1 install
```

## 三、报错对照

### 3.1 类型检查成片 TS2307「Cannot find module」

```text
plugins/base-collection-ui/src/components/GroupedVirtualGrid.tsx(2,43): error TS2307:
  Cannot find module 'lucide-react' or its corresponding type declarations.
plugins/... error TS2307: Cannot find module '@folio/base-ui-kit/client' ...
plugins/... error TS2307: Cannot find module '@folio/base-contract' ...
```

同屏往往还夹着几十条 `error TS7006: Parameter 'x' implicitly has an 'any' type`。

**原因**：仓库里部分 `plugins/*` 目录缺 `node_modules` 软链（通常是新拉的分支、`pnpm install` 中途被打断、
或某个插件是后加的）。模块解析不到，导入的符号全变 `any`，于是连带刷出一堆隐式 any 报错。

**不要逐条去修 TS7006** —— 模块一解析出来它们自己就消失了。

**修复**：

```powershell
pnpm install --offline --frozen-lockfile --trust-lockfile
```

本机实测 1.5 秒完成。验证是否补全：

```powershell
Get-ChildItem plugins -Directory |
  ForEach-Object { "$($_.Name): $(Test-Path (Join-Path $_.FullName 'node_modules'))" }
```

### 3.2 `pnpm install` 长时间无输出、反复 ETIMEDOUT

```text
? Verifying lockfile against supply-chain policies (387 entries)...
[WARN] GET https://registry.npmmirror.com/@esbuild%2Fwin32-x64 error (ETIMEDOUT). Will retry in 10 seconds. 2 retries left.
[WARN] Request took 113247ms: https://registry.npmmirror.com/@lezer%2Flr
```

**原因**：pnpm 11 在安装前会对 lockfile 里**每一条**依赖回源做供应链校验（`minimumReleaseAge` /
`trustPolicy`）。本机 registry 指向 `registry.npmmirror.com`，这个校验会把几百个条目逐个请求一遍，
大部分超时重试，于是几分钟都不结束。`--offline` 单独用**不管用**，它仍然会做这一步校验。

**修复**：加 `--trust-lockfile` 跳过校验（lockfile 本身已在仓库里可信）：

```powershell
pnpm install --offline --frozen-lockfile --trust-lockfile
```

`--trust-lockfile` 是 pnpm 11 才有的开关（本机 11.6.0 与 11.28.5 均确认可用）。更早的 pnpm 没有这个
跳过入口，遇到同样的卡顿只能等它跑完，或把 registry 换成可达的源再装。另外注意 `.npmrc` 里的
`verify-deps-before-run=false` 是防止**脚本运行时**隐式触发安装，和这里**安装时**的供应链校验不是一回事，
不能互相替代。

### 3.3 `[ELIFECYCLE] Command failed with exit code 1`

见 §1 末尾的提示：这是 pnpm 对失败步骤的收尾包装，不是根因。往上找真正的报错段。

### 3.4 构建 / 界面里找不到「工作台」入口

按这个顺序查，前三步都不用重启：

1. **页面是否刷新过**。Client 是随页面加载下发的，装完不刷新看不到。
2. **profile 里是否还有套件条目**（.dsh 是指向 `D:\dsh_data` 的 Junction，两个路径等价）：

   ```powershell
   $m = Join-Path $env:DSH_PROFILE_DIR 'package.json'
   $d = Get-Content $m -Raw | ConvertFrom-Json
   $d.dependencies.'@folio/workbench-suite'          # 期望 link:F:/AI/geren/LocalFolio/bundles/workbench-suite
   $d.dsh.profile.bundles | Where-Object { $_ -like '@folio/*' }   # 期望含 @folio/workbench-suite
   ```

   `$env:DSH_PROFILE_DIR` 只在 DSH 拉起的 shell 里有值；在普通终端执行就换成
   `$env:USERPROFILE\.dsh\profiles\desktop`（它与 `D:\dsh_data\profiles\desktop` 是同一处）。

   缺依赖 → 重装链接（见 §2）；有依赖但 bundles 里没有 → 就是没启用，重新启一次。

3. **软链是否还有效**：

   ```powershell
   Get-Item (Join-Path $env:DSH_PROFILE_DIR 'node_modules\@folio\workbench-suite') -Force |
     Select-Object LinkType, Target
   ```

   期望 `SymbolicLink` + 指向 `F:\AI\geren\LocalFolio\bundles\workbench-suite`。

4. 以上都正常还不出现 → 当前进程是安装前启动的，**重启 DSH**。

> 插件管理器的回执里 `application: applied` 表示这次改动已生效，但 Host 侧新挂的行仍以重启后最稳。
> 判据看 `application` 和 `warnings`，不要靠翻日志或看进程列表推断。

### 3.5 `{"stage":"install","error":{"code":"already-installed"}}`

同一个链接装第二次会被拒。**先卸再装**：在插件页卸载，再按 §2 重新添加。
注意卸载会同时把 `dsh.profile.bundles` 里的条目删掉，装回来时要用 §3.4 第 2 步确认条目又出现了。

### 3.6 `managed exclusively by the Electron application`

`desktop` profile 被桌面应用独占，`dsh plugin --profile desktop add ...` 一律拒绝。
桌面版只能走界面装；要用 CLI 就换一个 profile（`scripts/lfdev.ps1` 默认用 `lfdev`）。

### 3.7 `dsh web authentication required; reopen the URL printed by dsh web`

不是故障。`Invoke-WebRequest http://127.0.0.1:<port>` 直接抓首页拿不到内容，因为带授权令牌的完整地址
只在启动时打印一次。想在命令行核验 boot payload，用 `scripts/lfdev.ps1 verify` 配合它自己记录的
`.scratch/dsh-<profile>-<port>-url.txt`，不要手拼 URL。

### 3.8 构建完 `git status` 出现脏文件

```text
 M plugins/base-ui-kit/src/tailwind.generated.css
?? plugins/test-shadcn-admin-ui/src/lib/
```

第一条是构建重新生成的共享样式表（被 git 跟踪，内容随 UI 改动变化），属预期；
第二条是漏进 `lib/` 的产物目录。两者都不影响运行，提交前按需 `git checkout` / 补 `.gitignore`。

## 四、隔离调试实例（lfdev，端口 3081）

不影响桌面版，同时挂产品套件和 `test-suite`。可传 `-Port <空闲端口>` 换端口：

```powershell
pwsh -File scripts/lfdev.ps1 install    # link: 装两个套件，并清理旧悬空链接
pwsh -File scripts/lfdev.ps1 restart    # 重启实例
pwsh -File scripts/lfdev.ps1 url        # 打印访问地址
pwsh -File scripts/lfdev.ps1 verify     # 核验 boot payload 含全部 client 插件
pwsh -File scripts/lfdev.ps1 stop
```

脚本默认读 `D:\deepseekharness\DeepSeek Harness.exe` 与 `app.asar` 内的
`dsh/node_modules/@deepseek-ai/dsh/lib/bin.js`，换安装位置时用 `$env:DSH_EXE` / `$env:DSH_BIN` 覆盖。
README §2 给的 `$env:DSH_BIN` 指向同包内的 `dsh-desktop-host/lib/cli.js`——两条路径在 asar 里都存在，
任选其一都能拉起实例。新增 client 插件后要把它加进脚本的 `$ExpectedClientPlugins`，`verify` 才会校验到。

> **`app.asar` 内部路径不能用 `Test-Path` 判断**：`D:\deepseekharness\resources\app.asar\dsh\...`
> 这类路径对 `Test-Path`、`Get-Item`、资源管理器一律返回「不存在」，因为 asar 是单个装箱文件，
> 只有 Electron / Node 的 asar 读取层能进去。`Test-Path` 报 False **不代表路径写错**，
> 别据此去改 `$env:DSH_BIN`。要确认某个入口是否真的在包里，就读 asar 头部 JSON 走一遍文件树。

## 五、自检清单

出问题时按这个顺序跑，基本能定位到是哪一层坏了：

```powershell
pnpm install --offline --frozen-lockfile --trust-lockfile   # 依赖链
pnpm run typecheck                                          # 源码/模块解析
pnpm run build                                              # 产物
pnpm run check:artifacts                                    # 产物语法
pnpm run test                                               # 行为
```

全绿但仍然看不到界面 → 问题在挂载层，回到 §3.4。

## 附：本机实测环境

| 项 | 值 |
|---|---|
| Node.js | v24.18.0 |
| pnpm（PATH 上） | 11.6.0 |
| pnpm（profile 安装实际调用） | 11.28.5 |
| DSH | 0.2.2-rc.5 |
| profile | `desktop`（`$env:DSH_PROFILE_DIR`） |
| `DSH_HOME` | `C:\Users\Administrator\.dsh` → Junction 到 `D:\dsh_data` |

README §2 记录的对齐目标是 pnpm 10.28.0；本机 11.x 实测可正常构建、测试与安装。
