import * as React from 'react'
import { Copy, Ellipsis, Mail, Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
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
  cn,
  toast,
} from '@folio/core-ui-kit/client'
import { AdminDataTable, type AdminColumn, type AdminFacet } from '../components/AdminDataTable'
import {
  ROLE_META,
  USER_STATUS_BADGE,
  USER_STATUS_META,
  createUsers,
  type AdminUser,
  type UserRole,
  type UserStatus,
} from '../data'

interface UserDraft {
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  status: UserStatus
  role: UserRole
}

const EMPTY_DRAFT: UserDraft = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  status: 'invited',
  role: 'cashier',
}

function UserDialog({
  open,
  onOpenChange,
  user,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AdminUser | null
  onSubmit: (draft: UserDraft, id: string | null) => void
}): React.ReactElement {
  const [draft, setDraft] = React.useState<UserDraft>(EMPTY_DRAFT)

  React.useEffect(() => {
    if (!open) return
    setDraft(
      user
        ? {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            status: user.status,
            role: user.role,
          }
        : EMPTY_DRAFT,
    )
  }, [open, user])

  const update = <K extends keyof UserDraft>(key: K, value: UserDraft[K]): void =>
    setDraft(previous => ({ ...previous, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? 'Update user' : 'Create user'}</DialogTitle>
          <DialogDescription>
            {user ? 'Edit this user, then save the changes.' : 'Add a new user to the list.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault()
            onSubmit(draft, user?.id ?? null)
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="user-first">
                First name
              </label>
              <Input
                id="user-first"
                value={draft.firstName}
                onChange={event => update('firstName', event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="user-last">
                Last name
              </label>
              <Input
                id="user-last"
                value={draft.lastName}
                onChange={event => update('lastName', event.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="user-email">
              Email
            </label>
            <Input
              id="user-email"
              type="email"
              value={draft.email}
              onChange={event => update('email', event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="user-phone">
              Phone number
            </label>
            <Input
              id="user-phone"
              value={draft.phoneNumber}
              onChange={event => update('phoneNumber', event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={draft.status} onValueChange={value => update('status', value as UserStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_STATUS_META.map(meta => (
                    <SelectItem key={meta.value} value={meta.value}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={draft.role} onValueChange={value => update('role', value as UserRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_META.map(meta => (
                    <SelectItem key={meta.value} value={meta.value}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{user ? 'Save changes' : 'Create user'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.ReactElement {
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState<UserRole>('admin')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>Send an invitation to join the workspace.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault()
            toast({ title: 'Invitation sent (demo)', description: email })
            onOpenChange(false)
          }}
        >
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="invite-email">
              Email
            </label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="name@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Role</label>
            <Select value={role} onValueChange={value => setRole(value as UserRole)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_META.map(meta => (
                  <SelectItem key={meta.value} value={meta.value}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <Mail size={15} /> Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function UsersPage(): React.ReactElement {
  const [users, setUsers] = React.useState<AdminUser[]>(() => createUsers())
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [inviteOpen, setInviteOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AdminUser | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<readonly string[]>([])
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  const submitUser = (draft: UserDraft, id: string | null): void => {
    const username = `${draft.firstName}.${draft.lastName}`.toLowerCase() || 'new.user'
    if (id) {
      setUsers(previous =>
        previous.map(user =>
          user.id === id
            ? {
                ...user,
                ...draft,
                username,
                updatedAt: new Date().toISOString(),
              }
            : user,
        ),
      )
      toast({ title: 'User updated', description: draft.email })
    } else {
      setUsers(previous => [
        {
          id: `user-${Date.now()}`,
          ...draft,
          username,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        ...previous,
      ])
      toast({ title: 'User created', description: draft.email })
    }
    setDialogOpen(false)
    setEditing(null)
  }

  const confirmDelete = (): void => {
    const ids = new Set(pendingDelete)
    setUsers(previous => previous.filter(user => !ids.has(user.id)))
    toast({ title: `${ids.size} user(s) deleted` })
    setPendingDelete([])
  }

  const columns = React.useMemo<AdminColumn<AdminUser>[]>(
    () => [
      {
        id: 'username',
        header: 'Username',
        sortValue: user => user.username,
        hideable: false,
        cell: user => <span className="ps-2 font-medium">{user.username}</span>,
      },
      {
        id: 'fullName',
        header: 'Name',
        sortValue: user => `${user.firstName} ${user.lastName}`,
        cell: user => <span className="line-clamp-1 max-w-40">{`${user.firstName} ${user.lastName}`}</span>,
      },
      {
        id: 'email',
        header: 'Email',
        cell: user => <span className="text-nowrap text-sm text-muted-foreground">{user.email}</span>,
      },
      {
        id: 'phoneNumber',
        header: 'Phone Number',
        cell: user => <span className="text-nowrap">{user.phoneNumber}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        cell: user => (
          <Badge
            variant="outline"
            className={cn('capitalize', USER_STATUS_BADGE[user.status])}
          >
            {user.status}
          </Badge>
        ),
      },
      {
        id: 'role',
        header: 'Role',
        cell: user => {
          const meta = ROLE_META.find(item => item.value === user.role)
          const Icon = meta?.icon
          return (
            <span className="flex items-center gap-1.5 text-sm">
              {Icon ? <Icon size={14} className="text-muted-foreground" /> : null}
              {meta?.label ?? user.role}
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
        cell: user => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Open actions for ${user.username}`}>
                <Ellipsis size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={() => {
                  setEditing(user)
                  setDialogOpen(true)
                }}
              >
                <Pencil size={14} /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  void navigator.clipboard?.writeText(user.email)
                  toast({ title: 'Email copied', description: user.email })
                }}
              >
                <Copy size={14} /> Copy email
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setPendingDelete([user.id])
                  setDeleteOpen(true)
                }}
              >
                <Trash2 size={14} /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [],
  )

  const facets = React.useMemo<AdminFacet<AdminUser>[]>(
    () => [
      {
        id: 'status',
        title: 'Status',
        options: USER_STATUS_META.map(meta => ({ label: meta.label, value: meta.value })),
        match: (user, selected) => selected.has(user.status),
      },
      {
        id: 'role',
        title: 'Role',
        options: ROLE_META.map(meta => ({ label: meta.label, value: meta.value, icon: meta.icon })),
        match: (user, selected) => selected.has(user.role),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-6 sm:gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">User List</h2>
          <p className="text-muted-foreground">Manage your users and their roles here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setInviteOpen(true)}>
            <UserPlus size={16} /> Invite
          </Button>
          <Button
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <Plus size={16} /> Add User
          </Button>
        </div>
      </div>

      <AdminDataTable
        data={users}
        columns={columns}
        getRowId={user => user.id}
        searchText={user => `${user.username} ${user.firstName} ${user.lastName} ${user.email} ${user.phoneNumber}`}
        searchPlaceholder="Filter users..."
        facets={facets}
        bulkActions={(rows, clear) => (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setPendingDelete(rows.map(row => row.id))
              setDeleteOpen(true)
              clear()
            }}
          >
            <Trash2 size={14} /> Delete
          </Button>
        )}
      />

      <UserDialog
        open={dialogOpen}
        onOpenChange={open => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        user={editing}
        onSubmit={submitUser}
      />
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete.length} user(s)?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The selected users are removed from the local demo store.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                confirmDelete()
                setDeleteOpen(false)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
