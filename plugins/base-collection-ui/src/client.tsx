import type { Context } from '@deepseek-ai/cordis'

export const name = 'base-collection-ui'

export function apply(_ctx: Context): void {}

export default { name, apply }

export {
  useVirtualList,
  useVirtualGroupedGrid,
  type VirtualListItem,
  type UseVirtualListOptions,
  type VirtualGroupRow,
  type UseVirtualGroupedGridOptions,
  type UseVirtualGroupedGridResult,
} from './virtual.js'

export {
  compareNaturalName,
  filterItems,
  sortByNaturalName,
  filterAndSortItems,
  filterAndSortGroups,
  type CollectionSortDirection,
  type FilterItemsOptions,
  type SortByNaturalNameOptions,
  type FilterAndSortItemsOptions,
  type FilterAndSortGroupsOptions,
} from './filter-sort.js'

export {
  GroupedVirtualGrid,
  type GroupedVirtualGridProps,
} from './components/GroupedVirtualGrid.js'

export {
  CollectionBrowser,
  type CollectionBrowserProps,
  type CollectionGroupRenderState,
  type CollectionItemRenderLayout,
} from './components/CollectionBrowser.js'

export {
  CollectionToolbar,
  COLLECTION_GROUP_OPTIONS,
  COLLECTION_VIEW_OPTIONS,
  type CollectionCategoryState,
  type CollectionFilterState,
  type CollectionGroupByState,
  type CollectionOption,
  type CollectionSortState,
  type CollectionToolbarProps,
} from './components/CollectionToolbar.js'

export {
  layoutCollection,
  resolveCollectionColumnCount,
  type CollectionGroupOffset,
  type CollectionHeaderRow,
  type CollectionItemRow,
  type CollectionLayoutOptions,
  type CollectionLayoutResult,
  type CollectionRow,
  type CollectionViewMode,
} from './layout.js'

export {
  collectionCategoryLabel,
  collectionCategoryOrder,
  groupItems,
  groupItemsByCategory,
  groupItemsByNameInitial,
  groupItemsByTime,
  resolveNameBucket,
  resolveTimeBucket,
  type CollectionGroupBucket,
  type CollectionGroupBy,
  type GroupItemsOptions,
  type NameBucket,
  type TimeBucket,
} from './grouping.js'

export {
  clearCachedAspectRatios,
  normalizeAspectRatio,
  readCachedAspectRatio,
  writeCachedAspectRatio,
} from './aspect.js'

export {
  CollectionLightbox,
  useLightboxState,
  DEFAULT_COLLECTION_LIGHTBOX_LABELS,
  type LightboxState,
  type UseLightboxStateResult,
  type CollectionLightboxLabels,
  type CollectionLightboxProps,
} from './components/CollectionLightbox.js'

export {
  LocalFilePickerDialog,
  type LocalPickerMode,
  type LocalPickerQuickFolderKind,
  type LocalPickerQuickFolder,
  type LocalPickerDrive,
  type LocalPickerRoots,
  type LocalPickerEntry,
  type LocalPickerDirResult,
  type LocalFilePickerDialogProps,
} from './components/LocalFilePickerDialog.js'
