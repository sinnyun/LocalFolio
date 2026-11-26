import * as React from 'react'
import {
  Bug,
  Circle,
  Copy,
  Ellipsis,
  FileText,
  Import,
  ListTodo,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
  cn,
} from '@folio/core-ui-kit/client'
import { AdminDataTable, type AdminColumn, type AdminFacet } from '../components/AdminDataTable'
import {
  LABEL_META,
  PRIORITY_META,
  STATUS_META,
  createTasks,
  type Task,
  type TaskLabel,
  type TaskPriority,
  type TaskStatus,
} from '../data'

const STATUS_TONE: Record<TaskStatus, string> = {
  backlog: 'text-muted-foreground',
  todo: 'text-muted-foreground',
  'in progress': 'text-sky-700 dark:text-sky-300',
  done: 'text-emerald-700 dark:text-emerald-300',
  canceled: 'text-muted-foreground line-through',
}

interface TaskDraft {
  title: string
  status: TaskStatus
  label: TaskLabel
  priority: TaskPriority
  description: string
}

const EMPTY_DRAFT: TaskDraft = {
  title: '',
  status: 'todo',
  label: 'bug',
  priority: 'medium',
  description: '',
}

function TaskDialog({
  open,
  onOpenChange,
  task,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task | null
  onSubmit: (draft: TaskDraft, id: string | null) => void
}): React.ReactElement {
  const [draft, setDraft] = React.useState<TaskDraft>(EMPTY_DRAFT)

  React.useEffect(() => {
    if (!open) return
    setDraft(
      task
        ? {
            title: task.title,
            status: task.status,
            label: task.label,
            priority: task.priority,
            description: task.description,
          }
        : EMPTY_DRAFT,
    )
  }, [open, task])

  const update = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]): void =>
    setDraft(previous => ({ ...previous, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? 'Update task' : 'Create task'}</DialogTitle>
          <DialogDescription>
            {task ? 'Edit the task, then save your changes.' : 'Add a new task to the board.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault()
            onSubmit(draft, task?.id ?? null)
          }}
        >
          <div className="space-y-2">
            <label htmlFor="task-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="task-title"
              value={draft.title}
              onChange={event => update('title', event.target.value)}
              placeholder="What needs to be done?"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={draft.status} onValueChange={value => update('status', value as TaskStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_META.map(meta => (
                    <SelectItem key={meta.value} value={meta.value}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Label</label>
              <Select value={draft.label} onValueChange={value => update('label', value as TaskLabel)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LABEL_META.map(meta => (
                    <SelectItem key={meta.value} value={meta.value}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <Select
                value={draft.priority}
                onValueChange={value => update('priority', value as TaskPriority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_META.map(meta => (
                    <SelectItem key={meta.value} value={meta.value}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="task-description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="task-description"
              value={draft.description}
              onChange={event => update('description', event.target.value)}
              rows={4}
              placeholder="Add more detail..."
              className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{task ? 'Save changes' : 'Create task'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.ReactElement {
  const [text, setText] = React.useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import tasks</DialogTitle>
          <DialogDescription>Paste one task title per line to preview an import.</DialogDescription>
        </DialogHeader>
        <textarea
          value={text}
          onChange={event => setText(event.target.value)}
          rows={6}
          placeholder={'Fix sidebar focus ring\nReview storage validation'}
          className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const count = text
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean).length
              toast({
                title: count > 0 ? `${count} task(s) parsed` : 'Nothing to import',
                description: 'The demo does not persist imported rows.',
              })
              onOpenChange(false)
            }}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmDeleteDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  count: number
  onConfirm: () => void
}): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {count} task(s)?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. The selected rows are removed from the local demo store.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TasksPage(): React.ReactElement {
  const [tasks, setTasks] = React.useState<Task[]>(() => createTasks())
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Task | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<readonly string[]>([])
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const submitTask = (draft: TaskDraft, id: string | null): void => {
    if (id) {
      setTasks(previous =>
        previous.map(task =>
          task.id === id
            ? { ...task, title: draft.title, status: draft.status, label: draft.label, priority: draft.priority, description: draft.description }
            : task,
        ),
      )
      toast({ title: 'Task updated', description: draft.title })
    } else {
      const nextId = `TASK-${1000 + tasks.length * 7 + 1}`
      setTasks(previous => [
        {
          id: nextId,
          title: draft.title,
          status: draft.status,
          label: draft.label,
          priority: draft.priority,
          assignee: 'satnaing',
          createdAt: new Date().toISOString(),
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          description: draft.description,
        },
        ...previous,
      ])
      toast({ title: 'Task created', description: draft.title })
    }
    setDialogOpen(false)
    setEditing(null)
  }

  const requestDelete = (ids: readonly string[]): void => {
    setPendingDelete(ids)
    setDeleteOpen(true)
  }

  const confirmDelete = (): void => {
    const ids = new Set(pendingDelete)
    setTasks(previous => previous.filter(task => !ids.has(task.id)))
    toast({ title: `${ids.size} task(s) deleted` })
    setPendingDelete([])
  }

  const columns = React.useMemo<AdminColumn<Task>[]>(
    () => [
      {
        id: 'id',
        header: 'Task',
        sortValue: task => task.id,
        className: 'ps-2',
        cell: task => <span className="font-medium text-nowrap">{task.id}</span>,
      },
      {
        id: 'title',
        header: 'Title',
        sortValue: task => task.title,
        cell: task => <span className="line-clamp-1 max-w-96 text-wrap">{task.title}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        cell: task => {
          const meta = STATUS_META.find(item => item.value === task.status)
          const Icon = meta?.icon ?? Circle
          return (
            <Badge variant="outline" className={cn('gap-1.5 capitalize', STATUS_TONE[task.status])}>
              <Icon size={12} />
              {task.status}
            </Badge>
          )
        },
      },
      {
        id: 'label',
        header: 'Label',
        cell: task => (
          <Badge variant="secondary" className="gap-1.5 capitalize">
            {task.label === 'bug' ? <Bug size={12} /> : <FileText size={12} />}
            {task.label}
          </Badge>
        ),
      },
      {
        id: 'priority',
        header: 'Priority',
        cell: task => {
          const meta = PRIORITY_META.find(item => item.value === task.priority)
          const Icon = meta?.icon ?? Circle
          return (
            <span className="flex items-center gap-1.5 text-sm capitalize">
              <Icon size={14} className="text-muted-foreground" />
              {task.priority}
            </span>
          )
        },
      },
      {
        id: 'actions',
        header: '',
        headClassName: 'text-end',
        className: 'text-end',
        hideable: false,
        cell: task => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Open actions for ${task.id}`}>
                <Ellipsis size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={() => {
                  setEditing(task)
                  setDialogOpen(true)
                }}
              >
                <Pencil size={14} /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setTasks(previous => [{ ...task, id: `${task.id}-COPY` }, ...previous])
                  toast({ title: 'Task duplicated' })
                }}
              >
                <Copy size={14} /> Make a copy
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => requestDelete([task.id])}>
                <Trash2 size={14} /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [],
  )

  const facets = React.useMemo<AdminFacet<Task>[]>(
    () => [
      {
        id: 'status',
        title: 'Status',
        options: STATUS_META.map(meta => ({ label: meta.label, value: meta.value, icon: meta.icon })),
        match: (task, selected) => selected.has(task.status),
      },
      {
        id: 'priority',
        title: 'Priority',
        options: PRIORITY_META.map(meta => ({ label: meta.label, value: meta.value, icon: meta.icon })),
        match: (task, selected) => selected.has(task.priority),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
          <p className="text-muted-foreground">Here&apos;s a list of your tasks for this month!</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Import size={16} /> Import
          </Button>
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus size={16} /> Add Task
          </Button>
        </div>
      </div>

      <AdminDataTable
        data={tasks}
        columns={columns}
        getRowId={task => task.id}
        searchText={task => `${task.id} ${task.title}`}
        searchPlaceholder="Filter by title or ID..."
        facets={facets}
        bulkActions={(rows, clear) => (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              requestDelete(rows.map(row => row.id))
              clear()
            }}
          >
            <Trash2 size={14} /> Delete
          </Button>
        )}
      />

      <TaskDialog
        open={dialogOpen}
        onOpenChange={open => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        task={editing}
        onSubmit={submitTask}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        count={pendingDelete.length}
        onConfirm={confirmDelete}
      />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ListTodo size={13} />
        {tasks.length} tasks in the local demo store.
      </div>
    </div>
  )
}
