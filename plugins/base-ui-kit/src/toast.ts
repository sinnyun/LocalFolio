import * as React from 'react'
import type { FolioToastInput, FolioToastRecord } from '@folio/base-contract'
import { pageSingleton } from '@/page-singleton'

const DEFAULT_DURATION_MS = 3600
const MAX_TOASTS = 5

/**
 * The queue is page state: plugins push through whichever `@folio/base-ui-kit`
 * copy they resolved, while the single `FolioToaster` subscribes from the copy
 * mounted on `shell.overlay`. Live code replacement can swap either side, so the
 * store lives on the page (`pageSingleton`) instead of in module scope.
 */
interface ToastStore {
  nextSeq: number
  snapshot: readonly FolioToastRecord[]
  readonly listeners: Set<() => void>
  readonly timers: Map<string, ReturnType<typeof setTimeout>>
}

const store = pageSingleton<ToastStore>('@folio/base-ui-kit/toast-store', () => ({
  nextSeq: 1,
  snapshot: [],
  listeners: new Set(),
  timers: new Map(),
}))

function emit(): void {
  for (const listener of [...store.listeners]) listener()
}

export function dismissToast(id: string): void {
  const timer = store.timers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    store.timers.delete(id)
  }
  const next = store.snapshot.filter(item => item.id !== id)
  if (next.length === store.snapshot.length) return
  store.snapshot = next
  emit()
}

export function clearToasts(): void {
  for (const timer of store.timers.values()) clearTimeout(timer)
  store.timers.clear()
  if (store.snapshot.length === 0) return
  store.snapshot = []
  emit()
}

export function toast(input: FolioToastInput | string): string {
  const normalized: FolioToastInput = typeof input === 'string' ? { title: input } : input
  const id = normalized.id ?? `lf-toast-${store.nextSeq++}`
  const durationMs = normalized.durationMs ?? DEFAULT_DURATION_MS
  const record: FolioToastRecord = {
    id,
    title: normalized.title,
    description: normalized.description,
    tone: normalized.tone ?? 'neutral',
    durationMs,
    createdAt: Date.now(),
  }

  const prevTimer = store.timers.get(id)
  if (prevTimer !== undefined) {
    clearTimeout(prevTimer)
    store.timers.delete(id)
  }

  const withoutDup = store.snapshot.filter(item => item.id !== id)
  const next = [...withoutDup, record]
  if (next.length > MAX_TOASTS) {
    const evicted = next.splice(0, next.length - MAX_TOASTS)
    for (const item of evicted) {
      const t = store.timers.get(item.id)
      if (t !== undefined) {
        clearTimeout(t)
        store.timers.delete(item.id)
      }
    }
  }
  store.snapshot = next
  emit()

  if (durationMs > 0) {
    const timer = setTimeout(() => dismissToast(id), durationMs)
    store.timers.set(id, timer)
  }

  return id
}

function getToastsSnapshot(): readonly FolioToastRecord[] {
  return store.snapshot
}

function subscribeToasts(listener: () => void): () => void {
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}

export function useToasts(): readonly FolioToastRecord[] {
  return React.useSyncExternalStore(subscribeToasts, getToastsSnapshot, getToastsSnapshot)
}

export function useToast() {
  return React.useMemo(
    () => ({
      toast,
      dismissToast,
      clearToasts,
    }),
    [],
  )
}
