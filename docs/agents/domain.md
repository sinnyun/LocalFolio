# 领域文档

Engineering skills 探索 codebase 时，应如何消费这个 repo 的 domain documentation。

## 探索前先读取这些

- repo 根目录的 **`GLOSSARY.md`**
- **`docs/adr/`**：读取与你即将处理区域相关的 ADRs

如果这些文件不存在，**静默继续**。不要标记缺失；不要提前建议创建。`/domain-modeling` skill（经由 `/grill-with-docs` 和 `/improve-codebase-architecture` 调用）会在 terms 或 decisions 实际被解决时懒创建它们。

## 文件结构

本 repo 目前是 **single-context**：

```
/
├── GLOSSARY.md
├── CHANGELOG.md
├── docs/adr/
│   ├── 0001-reuse-dsh-file-capabilities-without-dsh-workspace-model.md
│   ├── 0002-frame-stays-a-capability-rendered-by-its-host-workspace.md
│   ├── 0003-shell-owns-window-and-workspace-frame-owns-app-regions.md
│   └── …（按时间递增编号）
├── plugins/        ← pnpm workspace 成员
├── libs/
└── bundles/
```

如果以后各个包的词汇真的独立到需要分开维护，可以改成 multi-context：根目录放 `GLOSSARY-MAP.md` 指向每个 context 的 `GLOSSARY.md`，并允许 `plugins/<name>/docs/adr/` 存放 context-scoped decisions。

## 使用 glossary 的词汇

当你的输出命名某个 domain concept 时（issue title、refactor proposal、hypothesis、test name），使用 `GLOSSARY.md` 中定义的 term。不要漂移到 glossary 明确避免的 synonyms。

如果你需要的概念还不在 glossary 中，这是一个信号：要么你正在发明项目没有使用的语言（重新考虑），要么确实存在缺口（为 `/domain-modeling` 记录）。

## 标记 ADR 冲突

如果你的输出与现有 ADR 矛盾，明确指出，而不是静默覆盖：

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

## 词表与代码的对齐

`工作台 / 工作区 / 功能插件 / 基础能力 / 测试界面 / 桥接` 已经同时在文档与代码里生效：包名前缀是 `base-* / workspace-* / feature-* / test-* / bridge-*`，工作区由 `ctx.folioShell.registerWorkspace` 注册，框架内的四区视图由 `ctx.folioFrame.registerApp` 登记，插件分类由 `libs/base-contract/src/manifest.ts` 的 `DshPluginCategory` 枚举钉死，插件清单的默认内容在 `plugins/base-runtime-host/src/host.ts` 的 `createDefaultPluginManifest()`。新增术语前先确认它真的属于这套层级，而不是同一个东西的第二个名字。

新增一个工作区时，有三处必须同步，漏一处就只剩「能跑但看不见」：`bundles/workbench-suite/cordis.patch.yml`（装得上）、`createDefaultPluginManifest()`（设置页显示得出）、`scripts/lfdev.ps1` 的 `$ExpectedClientPlugins`（verify 校验得到）。
