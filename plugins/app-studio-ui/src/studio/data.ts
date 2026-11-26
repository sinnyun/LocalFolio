/**
 * Deterministic demo data for the Studio Admin port.
 *
 * The upstream template ships a JSON fixture per table; LocalFolio plugins do
 * not read host files, so the same rows are generated from a fixed PRNG seed
 * instead. Stable across refreshes, no `Math.random()` in render.
 */

export type Billing = 'Paid' | 'Pending' | 'Overdue' | 'Trial'
export type SubscriptionStatus = 'Subscribed' | 'Inactive' | 'Unsubscribed'

export interface CustomerRow {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly plan: string
  readonly status: SubscriptionStatus
  readonly billing: Billing
  readonly joined: string
}

const FIRST_NAMES = [
  'Olivia',
  'Liam',
  'Emma',
  'Noah',
  'Ava',
  'Elijah',
  'Sophia',
  'Lucas',
  'Isabella',
  'Mason',
  'Mia',
  'Ethan',
  'Amelia',
  'James',
  'Harper',
  'Benjamin',
  'Evelyn',
  'Henry',
  'Abigail',
  'Alexander',
]

const LAST_NAMES = [
  'Anderson',
  'Bennett',
  'Carter',
  'Delgado',
  'Ellis',
  'Foster',
  'Garcia',
  'Hayes',
  'Ibrahim',
  'Jensen',
  'Kowalski',
  'Lopez',
  'Meyer',
  'Nguyen',
  'Okafor',
  'Patel',
  'Quinn',
  'Reyes',
  'Silva',
  'Tanaka',
]

const PLANS = ['Starter', 'Growth', 'Business', 'Enterprise'] as const
const STATUSES: readonly SubscriptionStatus[] = ['Subscribed', 'Inactive', 'Unsubscribed']
const BILLING: readonly Billing[] = ['Paid', 'Pending', 'Overdue', 'Trial']

/** Mulberry32 — tiny deterministic PRNG, same output on every load. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(random: () => number, values: readonly T[]): T {
  const index = Math.floor(random() * values.length)
  return values[Math.min(index, values.length - 1)] as T
}

export function createCustomers(count = 64): readonly CustomerRow[] {
  const random = createRandom(20260101)
  const base = Date.UTC(2026, 0, 5)

  return Array.from({ length: count }, (_, index) => {
    const first = pick(random, FIRST_NAMES)
    const last = pick(random, LAST_NAMES)
    const joined = new Date(base + Math.floor(random() * 160) * 86_400_000)
    const id = String(10_240 + index)

    return {
      id,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      plan: pick(random, PLANS),
      status: pick(random, STATUSES),
      billing: pick(random, BILLING),
      joined: joined.toISOString().slice(0, 10),
    }
  })
}

export const CUSTOMERS = createCustomers()

export interface ActivityPoint {
  readonly date: string
  readonly newCustomers: number
  readonly activeAccounts: number
  readonly returningUsers: number
}

/**
 * 180 twelve-hour buckets (≈ 3 months), shaped like the template's fixture:
 * weekly seasonality, a slow decline, and a handful of acquisition spikes.
 */
export function createActivitySeries(points = 180): readonly ActivityPoint[] {
  const random = createRandom(987654321)
  const end = Date.UTC(2026, 10, 26, 0, 0, 0)
  const stepMs = 12 * 60 * 60 * 1000
  const start = end - (points - 1) * stepMs

  return Array.from({ length: points }, (_, index) => {
    const timestamp = start + index * stepMs
    const dayOfWeek = new Date(timestamp).getUTCDay()
    const weekendLift = dayOfWeek === 0 || dayOfWeek === 6 ? 1.15 : 1
    const decline = 1 - (index / points) * 0.22
    const spike = random() > 0.94 ? 1.6 : 1
    const newCustomers = Math.round((8_000 + random() * 3_200) * weekendLift * decline * spike)

    return {
      date: new Date(timestamp).toISOString().slice(0, 10),
      newCustomers,
      activeAccounts: Math.round(6_050 + random() * 550),
      returningUsers: Math.round(4_380 + random() * 420),
    }
  })
}

export const ACTIVITY_SERIES = createActivitySeries()

export const METRIC_CARDS = [
  {
    label: 'Total Revenue',
    value: '$1,250.00',
    delta: '+12.5%',
    tone: 'up' as const,
    caption: 'Visitors for the last 6 months',
    icon: 'revenue' as const,
  },
  {
    label: 'New Customers',
    value: '1,234',
    delta: '-20%',
    tone: 'down' as const,
    caption: 'Acquisition needs attention',
    icon: 'customers' as const,
  },
  {
    label: 'Active Accounts',
    value: '45,678',
    delta: '+12.5%',
    tone: 'up' as const,
    caption: 'Engagement exceeds targets',
    icon: 'accounts' as const,
  },
  {
    label: 'Growth Rate',
    value: '4.5%',
    delta: '+4.5%',
    tone: 'up' as const,
    caption: 'Meets growth projections',
    icon: 'growth' as const,
  },
] as const
