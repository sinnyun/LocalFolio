# @folio/base-metadata-ui · 元数据编辑原语与统一剪贴板工具

各工作区检查器（文件浏览器、项目库、画板 Eagle 面板等）共用的客户端基础能力插件。通过 `dsh.client.external` 导出无存储耦合的 React 组件、Hook 与剪贴板工具函数，自身不注册独立工作区或后台路由。

## 导出能力一览

| 模块 | 导出符号 | 用途 |
|---|---|---|
| `clipboard.ts` | `copyTextToClipboard(text)` | 优先调用 `navigator.clipboard.writeText`，不可用或抛错时降级到离屏 `textarea` + `document.execCommand('copy')` |
| `clipboard.ts` | `useCopyFeedback(resetMs = 1500)` | 管理 `{ copied, copy(text) }` 短暂复制反馈状态与定时器清理 |
| `StarRatingInput.tsx` | `<StarRatingInput />` | 1–5 星评分选择，支持悬停预览、再次点击当前星级清零及「清除」按钮 |
| `TagChipsEditor.tsx` | `TAG_COLOR_PALETTE`、`TagOption`、`StringTagChipsEditor`、`ColoredTagChipsEditor`、`TagChipsEditor` | 统一支持纯字符串标签列表与带颜色/ID 的标签分配、搜索筛选、快捷新建及管理入口 |
| `AutoSaveNoteField.tsx` | `<AutoSaveNoteField />` | 带脏状态追踪的多行备注输入框，支持失焦、`Ctrl/Cmd+Enter` 与卸载时自动刷新保存 |

## 接入方式

在消费方插件 `package.json` 的 `dsh.client` 中声明：

```json
{
  "dsh": {
    "client": {
      "inject": ["@folio/base-ui-kit", "@folio/base-metadata-ui"],
      "external": ["@folio/base-ui-kit", "@folio/base-metadata-ui"]
    }
  }
}
```

随后即可直接从 `@folio/base-metadata-ui/client` 导入组件与函数，无需重复打包或各自复制 `navigator.clipboard` 降级逻辑。
