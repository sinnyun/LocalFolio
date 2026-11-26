import {
  Bell,
  Bug,
  Construction,
  FileX,
  HelpCircle,
  LayoutDashboard,
  ListTodo,
  Lock,
  MessagesSquare,
  Monitor,
  Package,
  Palette,
  ServerOff,
  Settings,
  ShieldCheck,
  UserCog,
  UserX,
  Users,
  Wrench,
} from 'lucide-react'
import type * as React from 'react'

export type AdminIcon = React.ComponentType<{ size?: number | string; className?: string }>

export type AdminRoute =
  | 'dashboard'
  | 'tasks'
  | 'apps'
  | 'chats'
  | 'users'
  | 'settings-profile'
  | 'settings-account'
  | 'settings-appearance'
  | 'settings-notifications'
  | 'settings-display'
  | 'help-center'
  | 'sign-in'
  | 'sign-in-2'
  | 'sign-up'
  | 'forgot-password'
  | 'otp'
  | 'error-401'
  | 'error-403'
  | 'error-404'
  | 'error-500'
  | 'error-503'

export interface NavLinkItem {
  readonly title: string
  readonly route: AdminRoute
  readonly icon?: AdminIcon
  readonly badge?: string
}

export interface NavCollapsibleItem {
  readonly title: string
  readonly icon?: AdminIcon
  readonly items: readonly NavLinkItem[]
}

export type NavItem = NavLinkItem | NavCollapsibleItem

export interface NavGroup {
  readonly title: string
  readonly items: readonly NavItem[]
}

export const isCollapsible = (item: NavItem): item is NavCollapsibleItem =>
  Array.isArray((item as NavCollapsibleItem).items)

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: 'General',
    items: [
      { title: 'Dashboard', route: 'dashboard', icon: LayoutDashboard },
      { title: 'Tasks', route: 'tasks', icon: ListTodo },
      { title: 'Apps', route: 'apps', icon: Package },
      { title: 'Chats', route: 'chats', icon: MessagesSquare, badge: '3' },
      { title: 'Users', route: 'users', icon: Users },
    ],
  },
  {
    title: 'Pages',
    items: [
      {
        title: 'Auth',
        icon: ShieldCheck,
        items: [
          { title: 'Sign In', route: 'sign-in' },
          { title: 'Sign In (2 Col)', route: 'sign-in-2' },
          { title: 'Sign Up', route: 'sign-up' },
          { title: 'Forgot Password', route: 'forgot-password' },
          { title: 'OTP', route: 'otp' },
        ],
      },
      {
        title: 'Errors',
        icon: Bug,
        items: [
          { title: 'Unauthorized', route: 'error-401', icon: Lock },
          { title: 'Forbidden', route: 'error-403', icon: UserX },
          { title: 'Not Found', route: 'error-404', icon: FileX },
          { title: 'Internal Server Error', route: 'error-500', icon: ServerOff },
          { title: 'Maintenance Error', route: 'error-503', icon: Construction },
        ],
      },
    ],
  },
  {
    title: 'Other',
    items: [
      {
        title: 'Settings',
        icon: Settings,
        items: [
          { title: 'Profile', route: 'settings-profile', icon: UserCog },
          { title: 'Account', route: 'settings-account', icon: Wrench },
          { title: 'Appearance', route: 'settings-appearance', icon: Palette },
          { title: 'Notifications', route: 'settings-notifications', icon: Bell },
          { title: 'Display', route: 'settings-display', icon: Monitor },
        ],
      },
      { title: 'Help Center', route: 'help-center', icon: HelpCircle },
    ],
  },
]

export interface Crumb {
  readonly title: string
  readonly route?: AdminRoute
}

export interface RouteMeta {
  readonly title: string
  readonly crumbs: readonly Crumb[]
}

export const ROUTE_META: Record<AdminRoute, RouteMeta> = {
  dashboard: { title: 'Dashboard', crumbs: [{ title: 'General' }, { title: 'Dashboard' }] },
  tasks: { title: 'Tasks', crumbs: [{ title: 'General' }, { title: 'Tasks' }] },
  apps: { title: 'Apps', crumbs: [{ title: 'General' }, { title: 'Apps' }] },
  chats: { title: 'Chats', crumbs: [{ title: 'General' }, { title: 'Chats' }] },
  users: { title: 'Users', crumbs: [{ title: 'General' }, { title: 'Users' }] },
  'settings-profile': {
    title: 'Settings',
    crumbs: [
      { title: 'Other' },
      { title: 'Settings', route: 'settings-profile' },
      { title: 'Profile' },
    ],
  },
  'settings-account': {
    title: 'Settings',
    crumbs: [
      { title: 'Other' },
      { title: 'Settings', route: 'settings-profile' },
      { title: 'Account' },
    ],
  },
  'settings-appearance': {
    title: 'Settings',
    crumbs: [
      { title: 'Other' },
      { title: 'Settings', route: 'settings-profile' },
      { title: 'Appearance' },
    ],
  },
  'settings-notifications': {
    title: 'Settings',
    crumbs: [
      { title: 'Other' },
      { title: 'Settings', route: 'settings-profile' },
      { title: 'Notifications' },
    ],
  },
  'settings-display': {
    title: 'Settings',
    crumbs: [
      { title: 'Other' },
      { title: 'Settings', route: 'settings-profile' },
      { title: 'Display' },
    ],
  },
  'help-center': { title: 'Help Center', crumbs: [{ title: 'Other' }, { title: 'Help Center' }] },
  'sign-in': { title: 'Sign In', crumbs: [{ title: 'Pages' }, { title: 'Auth' }, { title: 'Sign In' }] },
  'sign-in-2': {
    title: 'Sign In',
    crumbs: [{ title: 'Pages' }, { title: 'Auth' }, { title: 'Sign In (2 Col)' }],
  },
  'sign-up': { title: 'Sign Up', crumbs: [{ title: 'Pages' }, { title: 'Auth' }, { title: 'Sign Up' }] },
  'forgot-password': {
    title: 'Forgot Password',
    crumbs: [{ title: 'Pages' }, { title: 'Auth' }, { title: 'Forgot Password' }],
  },
  otp: { title: 'OTP', crumbs: [{ title: 'Pages' }, { title: 'Auth' }, { title: 'OTP' }] },
  'error-401': {
    title: 'Unauthorized',
    crumbs: [{ title: 'Pages' }, { title: 'Errors' }, { title: 'Unauthorized' }],
  },
  'error-403': {
    title: 'Forbidden',
    crumbs: [{ title: 'Pages' }, { title: 'Errors' }, { title: 'Forbidden' }],
  },
  'error-404': {
    title: 'Not Found',
    crumbs: [{ title: 'Pages' }, { title: 'Errors' }, { title: 'Not Found' }],
  },
  'error-500': {
    title: 'Internal Server Error',
    crumbs: [{ title: 'Pages' }, { title: 'Errors' }, { title: 'Internal Server Error' }],
  },
  'error-503': {
    title: 'Maintenance Error',
    crumbs: [{ title: 'Pages' }, { title: 'Errors' }, { title: 'Maintenance Error' }],
  },
}

export const ALL_NAV_LINKS: readonly NavLinkItem[] = NAV_GROUPS.flatMap(group =>
  group.items.flatMap(item => (isCollapsible(item) ? item.items : [item])),
)

/** Flat command-palette entries: top-level links plus nested children under their parent title. */
export const SEARCH_ENTRIES: readonly NavLinkItem[] = [
  ...ALL_NAV_LINKS,
  { title: 'Settings', route: 'settings-profile', icon: Settings },
]
