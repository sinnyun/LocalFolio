import * as React from 'react'
import { Bell, Monitor, Palette, Plus, UserCog, Wrench } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  cn,
  toast,
} from '@folio/core-ui-kit/client'
import type { AdminIcon, AdminRoute } from '../routes'
import { useAdminTheme, type AdminTheme } from '../theme'

const SETTINGS_NAV: readonly { title: string; route: AdminRoute; icon: AdminIcon }[] = [
  { title: 'Profile', route: 'settings-profile', icon: UserCog },
  { title: 'Account', route: 'settings-account', icon: Wrench },
  { title: 'Appearance', route: 'settings-appearance', icon: Palette },
  { title: 'Notifications', route: 'settings-notifications', icon: Bell },
  { title: 'Display', route: 'settings-display', icon: Monitor },
]

function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  htmlFor?: string
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function ProfileForm(): React.ReactElement {
  const [username, setUsername] = React.useState('satnaing')
  const [email, setEmail] = React.useState('m@example.com')
  const [bio, setBio] = React.useState('I own a computer.')
  const [urls, setUrls] = React.useState([{ value: 'https://shadcn.com' }, { value: 'http://twitter.com/shadcn' }])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          This is how others will see you on the site.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-8"
          onSubmit={event => {
            event.preventDefault()
            toast({ title: 'Profile saved', description: username })
          }}
        >
          <Field label="Username" htmlFor="settings-username" hint="This is your public display name. It can be your real name or a pseudonym.">
            <Input id="settings-username" value={username} onChange={event => setUsername(event.target.value)} />
          </Field>
          <Field label="Email" hint="You can manage verified email addresses in your email settings.">
            <Select value={email} onValueChange={setEmail}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a verified email to display" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="m@example.com">m@example.com</SelectItem>
                <SelectItem value="m@google.com">m@google.com</SelectItem>
                <SelectItem value="m@support.com">m@support.com</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Bio" htmlFor="settings-bio" hint="You can @mention other users and organizations to link to them.">
            <textarea
              id="settings-bio"
              value={bio}
              onChange={event => setBio(event.target.value)}
              rows={4}
              className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <p className="text-xs text-muted-foreground">{bio.length}/160</p>
          </Field>
          <div className="space-y-3">
            <div className="text-sm font-medium">URLs</div>
            <p className="text-xs text-muted-foreground">Add links to your website, blog, or social media profiles.</p>
            {urls.map((url, index) => (
              <Input
                key={index}
                value={url.value}
                aria-label={`URL ${index + 1}`}
                onChange={event =>
                  setUrls(previous =>
                    previous.map((item, itemIndex) =>
                      itemIndex === index ? { value: event.target.value } : item,
                    ),
                  )
                }
              />
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setUrls(previous => [...previous, { value: '' }])}
            >
              <Plus size={14} /> Add URL
            </Button>
          </div>
          <Button type="submit">Update profile</Button>
        </form>
      </CardContent>
    </Card>
  )
}

function AccountForm(): React.ReactElement {
  const [name, setName] = React.useState('satnaing')
  const [dob, setDob] = React.useState('1990-01-01')

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Update your account settings. Set your preferred language and timezone.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={event => {
            event.preventDefault()
            toast({ title: 'Account saved', description: name })
          }}
        >
          <Field label="Name" htmlFor="account-name" hint="This is the name that will be displayed on your profile and in emails.">
            <Input id="account-name" value={name} onChange={event => setName(event.target.value)} />
          </Field>
          <Field label="Date of birth" htmlFor="account-dob" hint="Your date of birth is used to calculate your age.">
            <Input id="account-dob" type="date" value={dob} onChange={event => setDob(event.target.value)} />
          </Field>
          <Button type="submit">Update account</Button>
        </form>
      </CardContent>
    </Card>
  )
}

function AppearanceForm(): React.ReactElement {
  const { theme, setTheme } = useAdminTheme()
  const [fontSize, setFontSize] = React.useState('default')
  const options: readonly { value: AdminTheme; label: string }[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Customize the appearance of the app. Automatically switch between day and night themes.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={event => {
            event.preventDefault()
            toast({ title: 'Appearance saved', description: `${theme}, ${fontSize} font` })
          }}
        >
          <div className="space-y-3">
            <div className="text-sm font-medium">Theme</div>
            <p className="text-xs text-muted-foreground">Select the theme for the dashboard.</p>
            <div className="grid max-w-md grid-cols-3 gap-4">
              {options.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={theme === option.value}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'flex flex-col items-center gap-2 rounded-md border-2 p-3 text-sm transition-colors',
                    theme === option.value ? 'border-primary' : 'border-muted hover:border-accent',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-16 w-full items-center justify-center rounded-md border',
                      option.value === 'dark'
                        ? 'border-slate-700 bg-slate-950 text-slate-100'
                        : option.value === 'light'
                          ? 'border-slate-200 bg-white text-slate-900'
                          : 'border-slate-300 bg-linear-to-r from-white to-slate-900 text-slate-500',
                    )}
                  >
                    <span className="text-xs font-medium">Aa</span>
                  </span>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Font size" hint="Use the system font size for the whole dashboard.">
            <Select value={fontSize} onValueChange={setFontSize}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Small</SelectItem>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="lg">Large</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit">Update preferences</Button>
        </form>
      </CardContent>
    </Card>
  )
}

function NotificationsForm(): React.ReactElement {
  const [choices, setChoices] = React.useState({
    communication: true,
    marketing: false,
    social: true,
    security: true,
  })

  const toggle = (key: keyof typeof choices): void =>
    setChoices(previous => ({ ...previous, [key]: !previous[key] }))

  const rows: readonly { key: keyof typeof choices; title: string; description: string }[] = [
    {
      key: 'communication',
      title: 'Communication emails',
      description: 'Receive emails about your account activity.',
    },
    {
      key: 'marketing',
      title: 'Marketing emails',
      description: 'Receive emails about new products, features, and more.',
    },
    {
      key: 'social',
      title: 'Social emails',
      description: 'Receive emails for friend requests, follows, and more.',
    },
    {
      key: 'security',
      title: 'Security emails',
      description: 'Receive emails about your account activity and security.',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>Choose what you want to be notified about.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={event => {
            event.preventDefault()
            toast({ title: 'Notifications saved' })
          }}
        >
          <div className="space-y-1">
            {rows.map(row => (
              <label
                key={row.key}
                className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-accent/50"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 cursor-pointer accent-primary"
                  checked={choices[row.key]}
                  onChange={() => toggle(row.key)}
                />
                <span>
                  <span className="block text-sm font-medium">{row.title}</span>
                  <span className="block text-xs text-muted-foreground">{row.description}</span>
                </span>
              </label>
            ))}
          </div>
          <Button type="submit">Update notifications</Button>
        </form>
      </CardContent>
    </Card>
  )
}

function DisplayForm(): React.ReactElement {
  const [items, setItems] = React.useState({ recents: true, home: true, applications: true, desktop: false })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display</CardTitle>
        <CardDescription>Turn sidebar items on or off.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={event => {
            event.preventDefault()
            toast({ title: 'Display settings saved' })
          }}
        >
          <div className="space-y-1">
            {(Object.keys(items) as (keyof typeof items)[]).map(key => (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between rounded-md border-b py-3 last:border-b-0"
              >
                <span className="text-sm font-medium capitalize">{key}</span>
                <input
                  type="checkbox"
                  className="size-4 cursor-pointer accent-primary"
                  checked={items[key]}
                  onChange={() => setItems(previous => ({ ...previous, [key]: !previous[key] }))}
                />
              </label>
            ))}
          </div>
          <Button type="submit">Update display</Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function SettingsPage({
  route,
  onNavigate,
}: {
  route: AdminRoute
  onNavigate: (route: AdminRoute) => void
}): React.ReactElement {
  const active = SETTINGS_NAV.find(item => item.route === route) ?? SETTINGS_NAV[0]

  const content =
    route === 'settings-account' ? (
      <AccountForm />
    ) : route === 'settings-appearance' ? (
      <AppearanceForm />
    ) : route === 'settings-notifications' ? (
      <NotificationsForm />
    ) : route === 'settings-display' ? (
      <DisplayForm />
    ) : (
      <ProfileForm />
    )

  return (
    <div className="flex flex-1 flex-col px-4 py-6">
      <div className="space-y-0.5">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and set e-mail preferences.</p>
      </div>
      <Separator className="my-4 lg:my-6" />
      <div className="flex flex-1 flex-col gap-4 md:flex-row md:gap-8">
        <aside className="top-0 shrink-0 md:sticky md:w-48">
          <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible">
            {SETTINGS_NAV.map(item => {
              const Icon = item.icon
              return (
                <button
                  key={item.route}
                  type="button"
                  aria-current={active?.route === item.route ? 'page' : undefined}
                  onClick={() => onNavigate(item.route)}
                  className={cn(
                    'inline-flex shrink-0 items-center justify-start gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                    active?.route === item.route
                      ? 'bg-muted font-medium hover:bg-accent'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon size={16} />
                  {item.title}
                </button>
              )
            })}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">{content}</div>
      </div>
    </div>
  )
}
