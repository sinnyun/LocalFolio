import type { Context } from '@deepseek-ai/cordis'

export const name = 'base-tasks-ui'

export function apply(_ctx: Context): void {}

export default { name, apply }

export {
  useFolioTasks,
  useTaskItems,
  fetchTaskItems,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  type UseFolioTasksOptions,
  type UseFolioTasksResult,
  type UseTaskItemsOptions,
  type UseTaskItemsResult,
  type TaskItemsQueryOptions,
} from './use-folio-tasks.js'
export {
  TaskStatusBar,
  type TaskStatusBarProps,
} from './components/TaskStatusBar.js'
