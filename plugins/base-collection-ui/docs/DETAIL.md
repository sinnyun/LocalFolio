# @folio/base-collection-ui · 集合浏览与交互原语

各工作区（文件浏览器、项目库、画板等）共用的客户端基础能力插件。通过 `dsh.client.external` 导出无业务耦合的虚拟滚动、分组网格、筛选排序、图片灯箱与本地目录选择弹窗组件，自身不注册独立工作区或后台路由。

## 导出能力一览

| 模块 | 导出符号 | 用途 |
|---|---|---|
| `virtual.ts` | `useVirtualList`、`useVirtualGroupedGrid`、`VirtualListItem`、`VirtualGroupRow` | 泛型虚拟列表与自适应列数的可折叠分组网格（支持 `activeStickyGroup` 吸顶分组头） |
| `filter-sort.ts` | `compareNaturalName`、`filterItems`、`sortByNaturalName`、`filterAndSortItems`、`filterAndSortGroups` | 自然文件名排序与泛型集合/分组筛选排序辅助函数 |
| `GroupedVirtualGrid.tsx` | `<GroupedVirtualGrid />` | 吸顶分组头、可折叠分组标题栏（支持自定义标题与右侧操作按钮）、虚拟化网格行、加载骨架屏与空状态插槽 |
| `CollectionLightbox.tsx` | `useLightboxState`、`<CollectionLightbox />`、`LightboxState` | 统一受控灯箱状态机与中文本地化 `<Lightbox>` 包装 |
| `LocalFilePickerDialog.tsx` | `<LocalFilePickerDialog />` | 通用本地文件/目录选择弹窗（`single-file` / `multi-file` / `folder`），通过回调注入根目录、目录列举与缩略图地址 |

## 接入方式

在消费方插件 `package.json` 的 `dsh.client` 中声明：

```json
{
  "dsh": {
    "client": {
      "inject": ["@folio/base-ui-kit", "@folio/base-collection-ui"],
      "external": ["@folio/base-ui-kit", "@folio/base-collection-ui"]
    }
  }
}
```

随后即可直接从 `@folio/base-collection-ui/client` 导入组件、Hook 与工具函数。
