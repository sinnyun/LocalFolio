import * as React from 'react'
import type { FolioToastInput, FolioToastRecord } from '@folio/lib-shared-contract'

const DEFAULT_DURATION_MS = 3600
const MAX_TOASTS = 5

let nextSeq = 1
let toastsSnapshot: readonly FolioToastRecord[] = []
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function emit(): void {
  for (const listener of [...listeners]) listener()
}

export function dismissToast(id: string): void {
  const timer = timers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    timers.delete(id)
  }
  const next = toastsSnapshot.filter(item => item.id !== id)
  if (next.length === toastsSnapshot.length) return
  toastsSnapshot = next
  emit()
}

export function clearToasts(): void {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
  if (toastsSnapshot.length === 0) return
  toastsSnapshot = []
  emit()
}

export function toast(input: FolioToastInput | string): string {
  const normalized: FolioToastInput = typeof input === 'string' ? { title: input } : input
  const id = normalized.id ?? `lf-toast-${nextSeq++}`
  const durationMs = normalized.durationMs ?? DEFAULT_DURATION_MS
  const record: FolioToastRecord = {
    id,
    title: normalized.title,
    description: normalized.description,
    tone: normalized.tone ?? 'neutral',
    durationMs,
    createdAt: Date.now(),
  }

  const prevTimer = timers.get(id)
  if (prevTimer !== undefined) {
    clearTimeout(prevTimer)
    timers.delete(id)
  }

  const withoutDup = toastsSnapshot.filter(item => item.id !== id)
  const next = [...withoutDup, record]
  if (next.length > MAX_TOASTS) {
    const evicted = next.splice(0, next.length - MAX_TOASTS)
    for (const item of evicted) {
      const t = timers.get(item.id)
      if (t !== undefined) {
        clearTimeout(t)
        timers.delete(item.id)
      }
    }
  }
  toastsSnapshot = next
  emit()

  if (durationMs > 0) {
    const timer = setTimeout(() => dismissToast(id), durationMs)
    timers.set(id, timer)
  }

  return id
}

function getToastsSnapshot(): readonly FolioToastRecord[] {
  return toastsSnapshot
}

function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
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
