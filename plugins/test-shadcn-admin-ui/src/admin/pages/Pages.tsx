import * as React from 'react'
import {
  ArrowLeft,
  Bug,
  Construction,
  FileX,
  Github,
  HelpCircle,
  LifeBuoy,
  Lock,
  MailCheck,
  ServerOff,
  ShieldCheck,
  UserX,
} from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Separator,
  cn,
  toast,
} from '@folio/base-ui-kit/client'
import type { AdminIcon, AdminRoute } from '../routes'

function AuthShell({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-4 py-10">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}

function SignInForm({ onNavigate }: { onNavigate: (route: AdminRoute) => void }): React.ReactElement {
  return (
    <AuthShell>
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck size={20} />
          </div>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>Sign in to Shadcn Admin</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault()
              toast({ title: 'Signed in (demo)', description: 'Authentication is not wired.' })
              onNavigate('dashboard')
            }}
          >
            <div className="space-y-2">
              <label htmlFor="signin-email" className="text-sm font-medium">
                Email
              </label>
              <Input id="signin-email" type="email" placeholder="name@example.com" required />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="signin-password" className="text-sm font-medium">
                  Password
                </label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => onNavigate('forgot-password')}
                >
                  Forgot password?
                </button>
              </div>
              <Input id="signin-password" type="password" required />
            </div>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
          <div className="my-4 flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">Or continue with</span>
            <Separator className="flex-1" />
          </div>
          <Button variant="outline" className="w-full" onClick={() => toast({ title: 'GitHub OAuth is not wired.' })}>
            <Github size={16} /> GitHub
          </Button>
        </CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          Don&apos;t have an account?
          <button
            type="button"
            className="ms-1 font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => onNavigate('sign-up')}
          >
            Sign up
          </button>
        </CardFooter>
      </Card>
    </AuthShell>
  )
}

function SignInTwoColumn({ onNavigate }: { onNavigate: (route: AdminRoute) => void }): React.ReactElement {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-lg font-bold">
              <ShieldCheck size={20} /> Shadcn Admin
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Enter your email and password to sign in.</p>
          </div>
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault()
              toast({ title: 'Signed in (demo)' })
              onNavigate('dashboard')
            }}
          >
            <div className="space-y-2">
              <label htmlFor="signin2-email" className="text-sm font-medium">
                Email
              </label>
              <Input id="signin2-email" type="email" placeholder="name@example.com" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="signin2-password" className="text-sm font-medium">
                Password
              </label>
              <Input id="signin2-password" type="password" required />
            </div>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={() => toast({ title: 'GitHub OAuth is not wired.' })}>
              <Github size={16} /> Sign in with GitHub
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            By clicking continue, you agree to our terms of service and privacy policy.
          </p>
          <div className="flex gap-3 text-sm">
            <button type="button" className="underline-offset-4 hover:underline" onClick={() => onNavigate('sign-up')}>
              Create account
            </button>
            <button type="button" className="underline-offset-4 hover:underline" onClick={() => onNavigate('sign-in')}>
              Single column
            </button>
          </div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-slate-950 p-10 text-slate-100 lg:flex lg:flex-col lg:justify-end">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.35),transparent_45%),radial-gradient(circle_at_80%_30%,rgba(168,85,247,0.35),transparent_40%),radial-gradient(circle_at_50%_90%,rgba(16,185,129,0.3),transparent_45%)]"
        />
        <blockquote className="relative space-y-3">
          <p className="text-lg font-medium">
            “This dashboard finally made plugin development feel like product work instead of plumbing.”
          </p>
          <footer className="text-sm text-slate-300">satnaing, shadcn-admin</footer>
        </blockquote>
      </div>
    </div>
  )
}

function SignUpForm({ onNavigate }: { onNavigate: (route: AdminRoute) => void }): React.ReactElement {
  return (
    <AuthShell>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create an account</CardTitle>
          <CardDescription>Enter your details to create your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault()
              toast({ title: 'Account created (demo)' })
              onNavigate('dashboard')
            }}
          >
            <div className="space-y-2">
              <label htmlFor="signup-name" className="text-sm font-medium">
                Name
              </label>
              <Input id="signup-name" placeholder="John Doe" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="signup-email" className="text-sm font-medium">
                Email
              </label>
              <Input id="signup-email" type="email" placeholder="name@example.com" required />
            </div>
            <div className="space-y-2">
              <label htmlFor="signup-password" className="text-sm font-medium">
                Password
              </label>
              <Input id="signup-password" type="password" required />
            </div>
            <Button type="submit" className="w-full">
              Create account
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          Already have an account?
          <button
            type="button"
            className="ms-1 font-medium text-foreground underline-offset-4 hover:underline"
            onClick={() => onNavigate('sign-in')}
          >
            Sign in
          </button>
        </CardFooter>
      </Card>
    </AuthShell>
  )
}

function ForgotPasswordForm({ onNavigate }: { onNavigate: (route: AdminRoute) => void }): React.ReactElement {
  return (
    <AuthShell>
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full border">
            <MailCheck size={18} />
          </div>
          <CardTitle className="text-xl">Forgot password?</CardTitle>
          <CardDescription>Enter your registered email and we&apos;ll send you a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault()
              toast({ title: 'Reset link sent (demo)' })
              onNavigate('sign-in')
            }}
          >
            <div className="space-y-2">
              <label htmlFor="forgot-email" className="text-sm font-medium">
                Email
              </label>
              <Input id="forgot-email" type="email" placeholder="name@example.com" required />
            </div>
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="ghost" size="sm" onClick={() => onNavigate('sign-in')}>
            <ArrowLeft size={14} /> Back to sign in
          </Button>
        </CardFooter>
      </Card>
    </AuthShell>
  )
}

function OtpForm({ onNavigate }: { onNavigate: (route: AdminRoute) => void }): React.ReactElement {
  const [code, setCode] = React.useState('')
  return (
    <AuthShell>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Two-factor authentication</CardTitle>
          <CardDescription>Enter the six-digit code from your authenticator app.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault()
              toast({ title: 'Code verified (demo)' })
              onNavigate('dashboard')
            }}
          >
            <Input
              value={code}
              onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
              aria-label="One-time code"
            />
            <Button type="submit" className="w-full" disabled={code.length !== 6}>
              Verify
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <Button variant="ghost" size="sm" onClick={() => onNavigate('sign-in')}>
            <ArrowLeft size={14} /> Back to sign in
          </Button>
        </CardFooter>
      </Card>
    </AuthShell>
  )
}

const ERROR_PAGES: Record<
  'error-401' | 'error-403' | 'error-404' | 'error-500' | 'error-503',
  { code: string; title: string; description: string; icon: AdminIcon }
> = {
  'error-401': {
    code: '401',
    title: 'Unauthorized',
    description: 'You don\u2019t have permission to access this page. Sign in with a different account.',
    icon: Lock,
  },
  'error-403': {
    code: '403',
    title: 'Forbidden',
    description: 'Access to this resource is forbidden. Ask an administrator to grant you access.',
    icon: UserX,
  },
  'error-404': {
    code: '404',
    title: 'Not Found',
    description: 'The page you are looking for does not exist or has been moved.',
    icon: FileX,
  },
  'error-500': {
    code: '500',
    title: 'Internal Server Error',
    description: 'Something went wrong on our end. Try again, or contact support if it persists.',
    icon: ServerOff,
  },
  'error-503': {
    code: '503',
    title: 'Maintenance Error',
    description: 'The service is temporarily unavailable while we perform maintenance.',
    icon: Construction,
  },
}

export function ErrorPage({
  route,
  onNavigate,
}: {
  route: 'error-401' | 'error-403' | 'error-404' | 'error-500' | 'error-503'
  onNavigate: (route: AdminRoute) => void
}): React.ReactElement {
  const page = ERROR_PAGES[route]
  const Icon = page.icon
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full border bg-muted/50">
        <Icon size={28} className="text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <p className="text-5xl font-black tracking-tight">{page.code}</p>
        <h1 className="text-xl font-semibold">{page.title}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{page.description}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => onNavigate('dashboard')}>Back to dashboard</Button>
        <Button
          variant="outline"
          onClick={() =>
            toast({ title: 'Support', description: 'support@example.com (demo destination only).' })
          }
        >
          <LifeBuoy size={15} /> Contact support
        </Button>
      </div>
    </div>
  )
}

export function HelpCenterPage(): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full border bg-muted/50">
        <HelpCircle size={28} className="text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Help Center</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Guides, keyboard shortcuts and troubleshooting notes are being written. The shadcn-admin demo ships
          this page as a placeholder too.
        </p>
      </div>
      <div className="flex w-full max-w-sm items-center gap-2">
        <Input placeholder="Search help articles..." aria-label="Search help articles" />
        <Button onClick={() => toast({ title: 'Search is not wired yet.' })}>Search</Button>
      </div>
      <p className={cn('text-xs text-muted-foreground')}>
        <Bug size={12} className="me-1 inline" /> Found a bug? Open an issue in the LocalFolio repo.
      </p>
    </div>
  )
}

export function AuthPage({
  route,
  onNavigate,
}: {
  route: 'sign-in' | 'sign-in-2' | 'sign-up' | 'forgot-password' | 'otp'
  onNavigate: (route: AdminRoute) => void
}): React.ReactElement {
  switch (route) {
    case 'sign-in':
      return <SignInForm onNavigate={onNavigate} />
    case 'sign-in-2':
      return <SignInTwoColumn onNavigate={onNavigate} />
    case 'sign-up':
      return <SignUpForm onNavigate={onNavigate} />
    case 'forgot-password':
      return <ForgotPasswordForm onNavigate={onNavigate} />
    case 'otp':
      return <OtpForm onNavigate={onNavigate} />
  }
}
