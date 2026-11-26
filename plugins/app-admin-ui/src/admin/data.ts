import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle,
  Circle,
  CircleOff,
  CreditCard,
  HelpCircle,
  Shield,
  Timer,
  UserCheck,
  Users,
} from 'lucide-react'
import type { AdminIcon } from './routes'
import {
  IconDiscord,
  IconDocker,
  IconFigma,
  IconGithub,
  IconGitlab,
  IconGmail,
  IconMedium,
  IconNotion,
  IconSkype,
  IconSlack,
  IconStripe,
  IconTelegram,
  IconTrello,
  IconWhatsapp,
  IconZoom,
} from '../assets/brand-icons/index'

/** Deterministic PRNG so the demo data never changes between mounts. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T,>(rnd: () => number, values: readonly T[]): T =>
  values[Math.floor(rnd() * values.length)] as T

export type TaskStatus = 'backlog' | 'todo' | 'in progress' | 'done' | 'canceled'
export type TaskLabel = 'bug' | 'feature' | 'documentation'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

export interface Task {
  id: string
  title: string
  status: TaskStatus
  label: TaskLabel
  priority: TaskPriority
  assignee: string
  createdAt: string
  dueDate: string
  description: string
}

export type UserStatus = 'active' | 'inactive' | 'invited' | 'suspended'
export type UserRole = 'superadmin' | 'admin' | 'manager' | 'cashier'

export interface AdminUser {
  id: string
  firstName: string
  lastName: string
  username: string
  email: string
  phoneNumber: string
  status: UserStatus
  role: UserRole
  createdAt: string
  updatedAt: string
}

const TASK_TITLES = [
  'Update tokenizer fallback path',
  'Refactor settings persistence layer',
  'Add dark mode audit for charts',
  'Investigate flaky workspace sync',
  'Write migration notes for v0.4',
  'Polish sidebar collapse animation',
  'Cache plugin icon lookups',
  'Rebuild task import pipeline',
  'Tune streaming reconnect backoff',
  'Document overlay slot contract',
  'Fix breadcrumb overflow on narrow panes',
  'Simplify data table column config',
  'Add keyboard focus ring to menus',
  'Review storage schema validation',
  'Replace legacy toast queue',
  'Trim unused icon exports',
  'Guard portal container teardown',
  'Speed up markdown preview render',
  'Normalize plugin manifest fields',
  'Verify theme token fallbacks',
  'Split oversized client bundle',
  'Align dialog close affordances',
] as const

const PEOPLE = [
  'Olivia Martin',
  'Jackson Lee',
  'Isabella Nguyen',
  'William Kim',
  'Sofia Davis',
  'Liam Chen',
  'Ava Patel',
  'Noah Garcia',
  'Mia Rossi',
  'Ethan Novak',
  'Chloe Dubois',
  'Lucas Meyer',
] as const

const DAY_MS = 24 * 60 * 60 * 1000
const BASE_TIME = Date.UTC(2026, 10, 20, 9, 0, 0)

const dateFrom = (offsetDays: number): string =>
  new Date(BASE_TIME + offsetDays * DAY_MS).toISOString()

export function createTasks(count = 100): Task[] {
  const rnd = mulberry32(0x51a7)
  const statuses: readonly TaskStatus[] = ['todo', 'in progress', 'done', 'canceled', 'backlog']
  const labels: readonly TaskLabel[] = ['bug', 'feature', 'documentation']
  const priorities: readonly TaskPriority[] = ['low', 'medium', 'high', 'critical']

  return Array.from({ length: count }, (_, index) => ({
    id: `TASK-${1000 + index * 7}`,
    title: `${pick(rnd, TASK_TITLES)}${index > 21 ? ` #${index}` : ''}`,
    status: pick(rnd, statuses),
    label: pick(rnd, labels),
    priority: pick(rnd, priorities),
    assignee: pick(rnd, PEOPLE),
    createdAt: dateFrom(-Math.floor(rnd() * 60)),
    dueDate: dateFrom(Math.floor(rnd() * 30) + 2),
    description:
      'Reproduced in the LocalFolio workspace. Expected behaviour is documented in the plugin brief; add regression coverage before closing.',
  }))
}

const FIRST_NAMES = [
  'Olivia',
  'Jackson',
  'Isabella',
  'William',
  'Sofia',
  'Liam',
  'Ava',
  'Noah',
  'Mia',
  'Ethan',
  'Chloe',
  'Lucas',
  'Amelia',
  'Henry',
  'Harper',
  'Daniel',
] as const

const LAST_NAMES = [
  'Martin',
  'Lee',
  'Nguyen',
  'Kim',
  'Davis',
  'Chen',
  'Patel',
  'Garcia',
  'Rossi',
  'Novak',
  'Dubois',
  'Meyer',
  'Silva',
  'Okafor',
  'Haddad',
  'Larsen',
] as const

export function createUsers(count = 80): AdminUser[] {
  const rnd = mulberry32(0x2c4e)
  const statuses: readonly UserStatus[] = ['active', 'inactive', 'invited', 'suspended']
  const roles: readonly UserRole[] = ['superadmin', 'admin', 'manager', 'cashier']

  return Array.from({ length: count }, (_, index) => {
    const firstName = pick(rnd, FIRST_NAMES)
    const lastName = pick(rnd, LAST_NAMES)
    const suffix = index === 0 ? '' : `${index}`
    return {
      id: `user-${(index + 1).toString().padStart(3, '0')}`,
      firstName,
      lastName,
      username: `${firstName}.${lastName}${suffix}`.toLowerCase(),
      email: `${firstName}.${lastName}${suffix}@example.com`.toLowerCase(),
      phoneNumber: `+1 (555) ${String(100 + index).padStart(3, '0')}-${String(2000 + index * 3).slice(-4)}`,
      status: pick(rnd, statuses),
      role: pick(rnd, roles),
      createdAt: dateFrom(-Math.floor(rnd() * 240) - 30),
      updatedAt: dateFrom(-Math.floor(rnd() * 14)),
    }
  })
}

export const STATUS_META: readonly {
  label: string
  value: TaskStatus
  icon: AdminIcon
}[] = [
  { label: 'Backlog', value: 'backlog', icon: HelpCircle },
  { label: 'Todo', value: 'todo', icon: Circle },
  { label: 'In Progress', value: 'in progress', icon: Timer },
  { label: 'Done', value: 'done', icon: CheckCircle },
  { label: 'Canceled', value: 'canceled', icon: CircleOff },
]

export const PRIORITY_META: readonly {
  label: string
  value: TaskPriority
  icon: AdminIcon
}[] = [
  { label: 'Low', value: 'low', icon: ArrowDown },
  { label: 'Medium', value: 'medium', icon: ArrowRight },
  { label: 'High', value: 'high', icon: ArrowUp },
  { label: 'Critical', value: 'critical', icon: AlertCircle },
]

export const LABEL_META: readonly { label: string; value: TaskLabel }[] = [
  { label: 'Bug', value: 'bug' },
  { label: 'Feature', value: 'feature' },
  { label: 'Documentation', value: 'documentation' },
]

export const USER_STATUS_META: readonly { label: string; value: UserStatus }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Invited', value: 'invited' },
  { label: 'Suspended', value: 'suspended' },
]

export const USER_STATUS_BADGE: Record<UserStatus, string> = {
  active: 'bg-teal-100/30 text-teal-900 border-teal-200 dark:text-teal-200',
  inactive: 'bg-neutral-300/40 border-neutral-300',
  invited: 'bg-sky-200/40 text-sky-900 border-sky-300 dark:text-sky-100',
  suspended: 'bg-destructive/10 text-destructive border-destructive/10 dark:bg-destructive/50 dark:text-primary',
}

export const ROLE_META: readonly { label: string; value: UserRole; icon: AdminIcon }[] = [
  { label: 'Superadmin', value: 'superadmin', icon: Shield },
  { label: 'Admin', value: 'admin', icon: UserCheck },
  { label: 'Manager', value: 'manager', icon: Users },
  { label: 'Cashier', value: 'cashier', icon: CreditCard },
]

export const REVENUE_DATA = [
  { name: 'Jan', value: 3120 },
  { name: 'Feb', value: 2480 },
  { name: 'Mar', value: 4210 },
  { name: 'Apr', value: 3690 },
  { name: 'May', value: 5120 },
  { name: 'Jun', value: 4470 },
  { name: 'Jul', value: 5330 },
  { name: 'Aug', value: 3880 },
  { name: 'Sep', value: 4720 },
  { name: 'Oct', value: 5860 },
  { name: 'Nov', value: 4980 },
  { name: 'Dec', value: 6210 },
] as const

export const ANALYTICS_DATA = [
  { name: 'Mon', clicks: 420, uniques: 260 },
  { name: 'Tue', clicks: 560, uniques: 310 },
  { name: 'Wed', clicks: 380, uniques: 220 },
  { name: 'Thu', clicks: 640, uniques: 390 },
  { name: 'Fri', clicks: 720, uniques: 410 },
  { name: 'Sat', clicks: 480, uniques: 300 },
  { name: 'Sun', clicks: 350, uniques: 190 },
] as const

export const RECENT_SALES = [
  { initials: 'OM', name: 'Olivia Martin', email: 'olivia.martin@email.com', amount: '+$1,999.00' },
  { initials: 'JL', name: 'Jackson Lee', email: 'jackson.lee@email.com', amount: '+$39.00' },
  { initials: 'IN', name: 'Isabella Nguyen', email: 'isabella.nguyen@email.com', amount: '+$299.00' },
  { initials: 'WK', name: 'William Kim', email: 'will@email.com', amount: '+$99.00' },
  { initials: 'SD', name: 'Sofia Davis', email: 'sofia.davis@email.com', amount: '+$39.00' },
] as const

export const REFERRERS = [
  { name: 'Direct', value: 512 },
  { name: 'Product Hunt', value: 238 },
  { name: 'Twitter', value: 174 },
  { name: 'Blog', value: 104 },
] as const

export const DEVICES = [
  { name: 'Desktop', value: 74 },
  { name: 'Mobile', value: 22 },
  { name: 'Tablet', value: 4 },
] as const

export interface AppEntry {
  name: string
  icon: AdminIcon
  connected: boolean
  desc: string
}

export const APP_ENTRIES: readonly AppEntry[] = [
  { name: 'Telegram', icon: IconTelegram, connected: false, desc: 'Connect with Telegram for real-time communication.' },
  { name: 'Notion', icon: IconNotion, connected: true, desc: 'Effortlessly sync Notion pages for seamless collaboration.' },
  { name: 'Figma', icon: IconFigma, connected: true, desc: 'View and collaborate on Figma designs in one place.' },
  { name: 'Trello', icon: IconTrello, connected: false, desc: 'Sync Trello cards for streamlined project management.' },
  { name: 'Slack', icon: IconSlack, connected: false, desc: 'Integrate Slack for efficient team communication.' },
  { name: 'Zoom', icon: IconZoom, connected: true, desc: 'Host Zoom meetings directly from the dashboard.' },
  { name: 'Stripe', icon: IconStripe, connected: false, desc: 'Easily manage Stripe transactions and payments.' },
  { name: 'Gmail', icon: IconGmail, connected: true, desc: 'Access and manage Gmail messages effortlessly.' },
  { name: 'Medium', icon: IconMedium, connected: false, desc: 'Explore and share Medium stories on your dashboard.' },
  { name: 'Skype', icon: IconSkype, connected: false, desc: 'Connect with Skype contacts seamlessly.' },
  { name: 'Docker', icon: IconDocker, connected: false, desc: 'Effortlessly manage Docker containers on your dashboard.' },
  { name: 'GitHub', icon: IconGithub, connected: false, desc: 'Streamline code management with GitHub integration.' },
  { name: 'GitLab', icon: IconGitlab, connected: false, desc: 'Efficiently manage code projects with GitLab integration.' },
  { name: 'Discord', icon: IconDiscord, connected: false, desc: 'Connect with Discord for seamless team communication.' },
  { name: 'WhatsApp', icon: IconWhatsapp, connected: false, desc: 'Easily integrate WhatsApp for direct messaging.' },
]
