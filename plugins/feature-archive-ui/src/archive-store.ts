import * as React from 'react'
import type { TaskSnapshot } from '@folio/base-contract'
import { rpcCall } from '@folio/base-contract/rpc'
import type { ArchiveSettings, ArchiveToolStatus } from './types.js'

export interface ArchiveUiStoreState {
  readonly status: ArchiveToolStatus | null
  readonly loading: boolean
  readonly dialogOpen: boolean
  readonly downloading: boolean
  readonly savingSettings: boolean
  readonly error: string | null
}

let state: ArchiveUiStoreState = {
  status: null,
  loading: false,
  dialogOpen: false,
  downloading: false,
  savingSettings: false,
  error: null,
}

const listeners = new Set<() => void>()
let initialized = false

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function setState(patch: Partial<ArchiveUiStoreState>): void {
  state = { ...state, ...patch }
  emit()
}

export { formatBytes, formatDateTime } from '@folio/base-ui-kit/client'

export async function refreshArchiveStatus(): Promise<ArchiveToolStatus | null> {
  setState({ loading: true, error: null })
  try {
    const res = await rpcCall<ArchiveToolStatus>('archive.tool.status', {})
    setState({ status: res, loading: false, error: null })
    return res
  } catch (err) {
    setState({
      loading: false,
      error: err instanceof Error ? err.message : '获取归档引擎状态失败',
    })
    return null
  }
}

export function setArchiveDialogOpen(open: boolean): void {
  setState({ dialogOpen: open })
}

export async function downloadZpaqfranz(
  mirrorPrefix?: string,
  onTaskEnqueued?: (task: TaskSnapshot) => void,
): Promise<TaskSnapshot | null> {
  setState({ downloading: true, error: null })
  try {
    const res = await rpcCall<{ task: TaskSnapshot }>('archive.tool.download', {
      ...(mirrorPrefix !== undefined ? { mirrorPrefix } : {}),
    })
    onTaskEnqueued?.(res.task)
    return res.task
  } catch (err) {
    setState({
      downloading: false,
      error: err instanceof Error ? err.message : '启动下载失败',
    })
    throw err
  }
}

export async function pickLocalZpaqfranz(): Promise<{
  readonly cancelled: boolean
  readonly status: ArchiveToolStatus
}> {
  const res = await rpcCall<{ cancelled: boolean; status: ArchiveToolStatus }>(
    'archive.tool.pickLocal',
    {},
  )
  setState({ status: res.status })
  return res
}

export async function revealZpaqfranzDir(): Promise<void> {
  await rpcCall('archive.tool.revealDir', {})
}

export async function updateArchiveSettings(
  patch: Partial<ArchiveSettings>,
): Promise<ArchiveToolStatus> {
  setState({ savingSettings: true })
  try {
    const status = await rpcCall<ArchiveToolStatus>('archive.settings.update', patch)
    setState({ status, savingSettings: false })
    return status
  } catch (err) {
    setState({ savingSettings: false })
    throw err
  }
}

export async function clearArchiveCache(): Promise<void> {
  await rpcCall('archive.cache.clear', {})
  await refreshArchiveStatus()
}

export async function mountProjectArchive(options: {
  readonly projectId: string
  readonly allVersions?: boolean
  readonly driveLetter?: string
  readonly openInExplorer?: boolean
}): Promise<{
  readonly mount: {
    readonly projectId: string
    readonly mountPoint: string | null
    readonly allVersions: boolean
  }
  readonly alreadyMounted: boolean
}> {
  const res = await rpcCall<{
    readonly mount: {
      readonly projectId: string
      readonly mountPoint: string | null
      readonly allVersions: boolean
    }
    readonly alreadyMounted: boolean
  }>('archive.project.mount', options)
  await refreshArchiveStatus()
  return res
}

export async function unmountProjectArchive(projectId: string): Promise<{ readonly unmounted: boolean }> {
  const res = await rpcCall<{ readonly unmounted: boolean }>('archive.project.unmount', {
    projectId,
  })
  await refreshArchiveStatus()
  return res
}

function ensureGlobalSyncListeners(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  window.addEventListener('folio:invalidate', (ev: Event) => {
    const detail = (ev as CustomEvent<{ scope?: string }>).detail
    if (detail?.scope === 'archive' || detail?.scope === '*') {
      void refreshArchiveStatus()
    }
  })

  window.addEventListener('folio:topic', (ev: Event) => {
    const detail = (ev as CustomEvent<{ topic?: string; payload?: TaskSnapshot }>).detail
    if (detail?.topic !== 'tasks:projects' || !detail.payload) return
    const snap = detail.payload
    if (snap.queue === 'archive-ops') {
      if (snap.status === 'completed' || snap.status === 'failed' || snap.status === 'cancelled') {
        setState({ downloading: false })
        void refreshArchiveStatus()
      }
    }
  })
}

export function useArchiveUiStore(): ArchiveUiStoreState {
  React.useEffect(() => {
    ensureGlobalSyncListeners()
    if (!state.status && !state.loading) {
      void refreshArchiveStatus()
    }
  }, [])

  return React.useSyncExternalStore(
    React.useCallback(listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }, []),
    () => state,
    () => state,
  )
}

export function resetArchiveStoreForTests(): void {
  state = {
    status: null,
    loading: false,
    dialogOpen: false,
    downloading: false,
    savingSettings: false,
    error: null,
  }
  initialized = false
}
