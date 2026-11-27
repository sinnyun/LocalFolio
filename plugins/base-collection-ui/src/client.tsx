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
