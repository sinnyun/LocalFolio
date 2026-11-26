import {
  Banknote,
  Bitcoin,
  Calendar,
  ChartBar,
  CheckSquare,
  ContactRound,
  Fingerprint,
  FolderOpen,
  Forklift,
  Gauge,
  GraduationCap,
  HeartPulse,
  Hotel,
  Kanban,
  LayoutDashboard,
  ListTodo,
  Lock,
  Mail,
  MessageSquare,
  Package,
  ReceiptText,
  ScanBarcode,
  Server,
  ShoppingBag,
  SquareArrowUpRight,
  Stethoscope,
  UserRound,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'

export type StudioRoute =
  | 'default'
  | 'crm'
  | 'finance'
  | 'analytics'
  | 'productivity'
  | 'ecommerce'
  | 'academy'
  | 'logistics'
  | 'infrastructure'
  | 'file-manager'
  | 'patient-monitoring'
  | 'crypto'
  | 'hr'
  | 'products'
  | 'email'
  | 'chat'
  | 'calendar'
  | 'kanban'
  | 'tasks'
  | 'invoice'
  | 'profile'
  | 'users'
  | 'roles'
  | 'auth-login-v1'
  | 'auth-login-v2'
  | 'auth-register-v1'
  | 'auth-register-v2'
  | 'legacy-default-v1'
  | 'legacy-crm-v1'
  | 'legacy-finance-v1'
  | 'legacy-analytics-v1'
  | 'coming-soon'

export interface StudioNavLink {
  readonly id: StudioRoute
  readonly title: string
  readonly icon?: LucideIcon
  readonly badge?: 'new' | 'updated' | 'soon'
  readonly disabled?: boolean
}

export interface StudioNavParent {
  readonly id: string
  readonly title: string
  readonly icon?: LucideIcon
  readonly badge?: 'new' | 'updated' | 'soon'
  readonly subItems: readonly StudioNavLink[]
}

export type StudioNavItem = StudioNavLink | StudioNavParent

export interface StudioNavGroup {
  readonly id: number
  readonly label?: string
  readonly items: readonly StudioNavItem[]
}

export const isNavParent = (item: StudioNavItem): item is StudioNavParent => 'subItems' in item

export const STUDIO_NAV: readonly StudioNavGroup[] = [
  {
    id: 1,
    label: 'Dashboards',
    items: [
      { id: 'default', title: 'Default', icon: LayoutDashboard },
      { id: 'crm', title: 'CRM', icon: ChartBar },
      { id: 'finance', title: 'Finance', icon: Banknote },
      { id: 'analytics', title: 'Analytics', icon: Gauge },
      { id: 'productivity', title: 'Productivity', icon: ListTodo },
      { id: 'ecommerce', title: 'E-commerce', icon: ShoppingBag },
      { id: 'academy', title: 'Academy', icon: GraduationCap },
      { id: 'logistics', title: 'Logistics', icon: Forklift },
      { id: 'infrastructure', title: 'Infrastructure', icon: Server },
      { id: 'file-manager', title: 'File Manager', icon: FolderOpen },
      { id: 'patient-monitoring', title: 'Patient Monitoring', icon: HeartPulse },
      { id: 'crypto', title: 'Crypto', icon: Bitcoin, badge: 'new' },
      { id: 'coming-soon', title: 'Healthcare', icon: Stethoscope, badge: 'soon', disabled: true },
      { id: 'coming-soon', title: 'POS', icon: ScanBarcode, badge: 'soon', disabled: true },
      { id: 'hr', title: 'HR', icon: ContactRound, badge: 'new' },
      { id: 'coming-soon', title: 'Restaurant', icon: UtensilsCrossed, badge: 'soon', disabled: true },
      { id: 'coming-soon', title: 'Hotel', icon: Hotel, badge: 'soon', disabled: true },
    ],
  },
  {
    id: 2,
    label: 'Pages',
    items: [
      { id: 'products', title: 'Products', icon: Package, badge: 'new' },
      { id: 'email', title: 'Email', icon: Mail },
      { id: 'chat', title: 'Chat', icon: MessageSquare },
      { id: 'calendar', title: 'Calendar', icon: Calendar },
      { id: 'kanban', title: 'Kanban', icon: Kanban, badge: 'updated' },
      { id: 'tasks', title: 'Tasks', icon: CheckSquare },
      { id: 'invoice', title: 'Invoice', icon: ReceiptText },
      { id: 'profile', title: 'Profile', icon: UserRound },
      { id: 'users', title: 'Users', icon: Users },
      { id: 'roles', title: 'Roles', icon: Lock },
      {
        id: 'authentication',
        title: 'Authentication',
        icon: Fingerprint,
        subItems: [
          { id: 'auth-login-v1', title: 'Login v1' },
          { id: 'auth-login-v2', title: 'Login v2' },
          { id: 'auth-register-v1', title: 'Register v1' },
          { id: 'auth-register-v2', title: 'Register v2' },
        ],
      },
    ],
  },
  {
    id: 3,
    label: 'Legacy',
    items: [
      {
        id: 'legacy-dashboards',
        title: 'Dashboards',
        subItems: [
          { id: 'legacy-default-v1', title: 'Default V1' },
          { id: 'legacy-crm-v1', title: 'CRM V1' },
          { id: 'legacy-finance-v1', title: 'Finance V1' },
          { id: 'legacy-analytics-v1', title: 'Analytics V1' },
        ],
      },
    ],
  },
  {
    id: 4,
    label: 'Misc',
    items: [{ id: 'coming-soon', title: 'Others', icon: SquareArrowUpRight, badge: 'soon', disabled: true }],
  },
]

/** Screens already ported into this plugin. Everything else renders the porting stub. */
export const PORTED_ROUTES: ReadonlySet<StudioRoute> = new Set<StudioRoute>(['default'])

export interface StudioRouteMeta {
  readonly title: string
  readonly description: string
}

export const ROUTE_META: Record<StudioRoute, StudioRouteMeta> = {
  default: {
    title: 'Default dashboard',
    description: 'Business metrics, customer activity and recent customer records.',
  },
  crm: { title: 'CRM dashboard', description: 'Pipeline coverage, opportunities and task reminders.' },
  finance: { title: 'Finance dashboard', description: 'Wallet, income breakdown and transaction flow.' },
  analytics: { title: 'Analytics dashboard', description: 'Traffic quality, top pages and realtime visitors.' },
  productivity: {
    title: 'Productivity dashboard',
    description: 'Focus, projects, tasks and weekly summary.',
  },
  ecommerce: {
    title: 'E-commerce dashboard',
    description: 'Store KPIs, recent orders, inventory and traffic sources.',
  },
  academy: {
    title: 'Academy dashboard',
    description: 'Class schedule, assignments and performance highlights.',
  },
  logistics: {
    title: 'Logistics dashboard',
    description: 'Shipment list, route map and delivery details.',
  },
  infrastructure: {
    title: 'Infrastructure dashboard',
    description: 'Project environments, regions and deployment health.',
  },
  'file-manager': {
    title: 'File manager',
    description: 'Folder overview with grid and list views.',
  },
  'patient-monitoring': {
    title: 'Patient monitoring',
    description: 'Realtime vitals, waveform charts and patient detail.',
  },
  crypto: { title: 'Crypto dashboard', description: 'Portfolio holdings, price chart and exchange allocation.' },
  hr: { title: 'HR dashboard', description: 'Attendance, hiring pipeline and tenure breakdown.' },
  products: { title: 'Products', description: 'Product catalogue table with create/edit drawer.' },
  email: { title: 'Email', description: 'Mailbox layout with folders, list and reading pane.' },
  chat: { title: 'Chat', description: 'Conversation list, thread and profile details.' },
  calendar: { title: 'Calendar', description: 'Month and week event calendar.' },
  kanban: { title: 'Kanban', description: 'Drag-and-drop board with table view.' },
  tasks: { title: 'Tasks', description: 'Task table with status, priority and due-date filters.' },
  invoice: { title: 'Invoice', description: 'Invoice builder and print preview.' },
  profile: { title: 'Profile', description: 'Employee profile with personal and employment details.' },
  users: { title: 'Users', description: 'User directory table with role and status filters.' },
  roles: { title: 'Roles', description: 'Role permission matrix table.' },
  'auth-login-v1': { title: 'Login v1', description: 'Single-column sign-in screen.' },
  'auth-login-v2': { title: 'Login v2', description: 'Split-screen sign-in screen.' },
  'auth-register-v1': { title: 'Register v1', description: 'Single-column sign-up screen.' },
  'auth-register-v2': { title: 'Register v2', description: 'Split-screen sign-up screen.' },
  'legacy-default-v1': { title: 'Default V1', description: 'Legacy default dashboard layout.' },
  'legacy-crm-v1': { title: 'CRM V1', description: 'Legacy CRM dashboard layout.' },
  'legacy-finance-v1': { title: 'Finance V1', description: 'Legacy finance dashboard layout.' },
  'legacy-analytics-v1': { title: 'Analytics V1', description: 'Legacy analytics dashboard layout.' },
  'coming-soon': { title: 'Coming soon', description: 'Not part of the current port.' },
}

export interface StudioSearchEntry {
  readonly id: StudioRoute
  readonly title: string
  readonly group: string
  readonly icon?: LucideIcon
}

export const SEARCH_ENTRIES: readonly StudioSearchEntry[] = STUDIO_NAV.flatMap(group =>
  group.items.flatMap<StudioSearchEntry>(item =>
    isNavParent(item)
      ? item.subItems.map(child => ({
          id: child.id,
          title: `${item.title} · ${child.title}`,
          group: group.label ?? '',
        }))
      : [{ id: item.id, title: item.title, group: group.label ?? '', icon: item.icon }],
  ),
).filter(entry => entry.id !== 'coming-soon')
