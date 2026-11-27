# @folio/base-collection-ui · 集合浏览与交互原语

各工作区（文件浏览器、项目库、画板等）共用的客户端基础能力插件。通过 `dsh.client.external` 导出无业务耦合的虚拟滚动、分组网格、筛选排序、图片灯箱与本地目录选择弹窗组件，自身不注册独立工作区或后台路由。

## 导出能力一览

| 模块 | 导出符号 | 用途 |
|---|---|---|
| `virtual.ts` | `useVirtualList`、`useVirtualGroupedGrid`、`VirtualListItem`、`VirtualGroupRow` | 泛型虚拟列表与自适应列数的可折叠分组网格（支持 `activeStickyGroup` 吸顶分组头） |
| `layout.ts` | `layoutCollection`、`resolveCollectionColumnCount`、`CollectionViewMode` | 四种中间视图的统一几何：`grid` 等比网格（行列同 `gap`）、`waterfall` 按宽高比堆叠、`equal` 等高行（按比例分宽）、`list` 单列；输出带 `x/y/width/height` 的扁平行，一次虚拟化覆盖全部模式 |
| `grouping.ts` | `groupItems`、`groupItemsByTime/ByCategory/ByNameInitial`、`collectionCategoryLabel` | 统一分组桶（今天/昨天/本周…、固定类别序、`0-9` / `A`–`Z` / `中文与符号`），供文件浏览器与项目库共用 |
| `aspect.ts` | `readCachedAspectRatio`、`writeCachedAspectRatio`、`normalizeAspectRatio` | 缩略图真实宽高比的进程内缓存，瀑布/等高布局在图片解码后只重排一次 |
| `CollectionToolbar.tsx` | `<CollectionToolbar />`、`COLLECTION_VIEW_OPTIONS`、`COLLECTION_GROUP_OPTIONS` | 统一工具栏：关键词筛选、类型筛选、分组方式、排序 + 升降序、卡片尺寸滑杆、四视图切换；`leading` / `actions` / `extraFilters` 插槽承载各工作区的独有控件 |
| `CollectionBrowser.tsx` | `<CollectionBrowser />` | 工具栏 + 四视图主体 + 吸顶/可折叠分组头 + 虚拟滚动 + 加载/空态插槽；卡片内容由 `renderItem` 决定 |
| `filter-sort.ts` | `compareNaturalName`、`filterItems`、`sortByNaturalName`、`filterAndSortItems`、`filterAndSortGroups` | 自然文件名排序与泛型集合/分组筛选排序辅助函数 |
| `GroupedVirtualGrid.tsx` | `<GroupedVirtualGrid />` | 吸顶分组头、可折叠分组标题栏（支持自定义标题与右侧操作按钮）、虚拟化网格行、加载骨架屏与空状态插槽 |
| `CollectionLightbox.tsx` | `useLightboxState`、`<CollectionLightbox />`、`LightboxState` | 统一受控灯箱状态机与中文本地化 `<Lightbox>` 包装 |
| `LocalFilePickerDialog.tsx` | `<LocalFilePickerDialog />` | 通用本地文件/目录选择弹窗（`single-file` / `multi-file` / `folder`），通过回调注入根目录、目录列举与缩略图地址 |

## 统一中间文件视图

`CollectionBrowser` 是文件浏览器与项目库中区共用的唯一入口。两个工作区只需要提供：

- `groups` + `getGroupKey` / `getGroupItems` / `getGroupTitle` / `getGroupMeta` / `hasHeader`；
- 各自的筛选、分类、排序选项（`filter` / `category` / `sort` / `groupBy` 受控对象）；
- `renderItem(item, group, layout)` —— `layout` 带 `mode`、`width`、`height`、`thumbHeight`、`aspectKey` 与 `reportAspectRatio`，卡片按需把缩略图的真实宽高比回报给布局。

由此得到的可见差异只有卡片本身：文件浏览器显示星级/标签/备注与拖拽、右键菜单，项目库显示项目内文件的分类/大小与项目级操作；筛选、分组、排序、视图切换与折叠行为完全一致。

```tsx
<CollectionBrowser<Group, Item>
  groups={groups}
  getGroupKey={g => g.key}
  getGroupItems={g => g.items}
  getItemKey={item => item.id}
  getItemAspectKey={item => `thumb:${item.id}`}
  renderItem={(item, _group, layout) => (
    <CardThumb item={item} onAspectRatio={layout.reportAspectRatio} />
  )}
  collapsedKeys={collapsed}
  onToggleGroupCollapsed={toggle}
  viewMode={viewMode}
  onViewModeChange={setViewMode}
  cardSize={cardSize}
  onCardSizeChange={setCardSize}
  filter={{ value: query, onChange: setQuery }}
  category={{ value: category, onChange: setCategory, options: CATEGORY_OPTIONS }}
  groupBy={{ value: groupBy, onChange: setGroupBy }}
  sort={{
    value: sortKey,
    onChange: setSortKey,
    options: SORT_OPTIONS,
    dir: sortDir,
    onDirChange: setSortDir,
  }}
/>
```

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
