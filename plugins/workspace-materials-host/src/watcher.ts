import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { normalizeLocalPath } from './dialogs.js'
import type { VectorCraftBridge } from './vectorcraft-bridge.js'

export interface MaterialsSyncManagerOptions {
  readonly bridge: VectorCraftBridge
  readonly getTrackedPaths: () => Promise<readonly string[]>
  readonly shouldWatchFiles: () => Promise<boolean>
  readonly shouldPollLive: () => Promise<boolean>
  readonly onExternalFileChange: (filePath: string) => void
  readonly onLiveControlChange: (changedPath: string | null) => void
}

export function createMaterialsSyncManager(options: MaterialsSyncManagerOptions) {
  const dirWatchers = new Map<string, fs.FSWatcher>()
  const trackedByDir = new Map<string, Map<string, string>>()
  const selfWriteUntil = new Map<string, number>()
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let lastLiveDigest = ''
  let started = false
  let disposed = false

  function markSelfWrite(filePath: string): void {
    const key = normalizeLocalPath(filePath).toLowerCase()
    selfWriteUntil.set(key, Date.now() + 1800)
  }

  function isSelfWrite(filePath: string): boolean {
    const key = normalizeLocalPath(filePath).toLowerCase()
    const until = selfWriteUntil.get(key)
    if (!until) return false
    if (Date.now() <= until) return true
    selfWriteUntil.delete(key)
    return false
  }

  function triggerFileChange(filePath: string): void {
    if (disposed || isSelfWrite(filePath)) return
    const key = normalizeLocalPath(filePath).toLowerCase()
    const prev = debounceTimers.get(key)
    if (prev) clearTimeout(prev)
    const timer = setTimeout(() => {
      debounceTimers.delete(key)
      if (!disposed && !isSelfWrite(filePath)) {
        options.onExternalFileChange(filePath)
      }
    }, 300)
    debounceTimers.set(key, timer)
  }

  async function refreshWatches(): Promise<void> {
    if (!started || disposed) return
    const enabled = await options.shouldWatchFiles()
    if (!enabled) {
      for (const w of dirWatchers.values()) w.close()
      dirWatchers.clear()
      trackedByDir.clear()
      return
    }

    const paths = await options.getTrackedPaths()
    const nextByDir = new Map<string, Map<string, string>>()
    for (const raw of paths) {
      const normalized = normalizeLocalPath(raw)
      if (!normalized) continue
      const dir = path.dirname(normalized)
      const dirKey = dir.toLowerCase()
      const fileName = path.basename(normalized).toLowerCase()
      let map = nextByDir.get(dirKey)
      if (!map) {
        map = new Map()
        nextByDir.set(dirKey, map)
      }
      map.set(fileName, normalized)
    }

    for (const [dirKey, watcher] of dirWatchers.entries()) {
      if (!nextByDir.has(dirKey)) {
        watcher.close()
        dirWatchers.delete(dirKey)
        trackedByDir.delete(dirKey)
      }
    }

    for (const [dirKey, fileMap] of nextByDir.entries()) {
      trackedByDir.set(dirKey, fileMap)
      if (dirWatchers.has(dirKey)) continue
      const sampleFile = fileMap.values().next().value as string | undefined
      if (!sampleFile) continue
      const dir = path.dirname(sampleFile)
      try {
        const realDir = await fsp.realpath(dir)
        const watcher = fs.watch(realDir, (_event, changedName) => {
          if (!changedName) return
          const targetMap = trackedByDir.get(dirKey)
          if (!targetMap) return
          const matched = targetMap.get(String(changedName).toLowerCase())
          if (matched) {
            triggerFileChange(matched)
          }
        })
        watcher.on('error', () => {
          watcher.close()
          dirWatchers.delete(dirKey)
        })
        dirWatchers.set(dirKey, watcher)
      } catch {
        // Directory may not exist yet; retry on next refreshWatches
      }
    }
  }

  async function pollOnce(): Promise<void> {
    if (disposed) return
    if (!(await options.shouldPollLive())) return
    try {
      const probe = await options.bridge.probeLiveControl()
      const digest = JSON.stringify({
        c: probe.connected,
        a: probe.activePath,
        d: probe.documents.map(doc => [doc.path, doc.dirty, doc.title]),
      })
      if (digest !== lastLiveDigest) {
        const hadPrev = lastLiveDigest !== ''
        lastLiveDigest = digest
        if (hadPrev) {
          options.onLiveControlChange(probe.activePath)
        }
      }
    } catch {
      // ignore transient poll failures
    }
  }

  function start(): void {
    if (started || disposed) return
    started = true
    void refreshWatches()
    pollTimer = setInterval(() => {
      void pollOnce()
    }, 2500)
  }

  function dispose(): void {
    disposed = true
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    for (const timer of debounceTimers.values()) clearTimeout(timer)
    debounceTimers.clear()
    for (const w of dirWatchers.values()) w.close()
    dirWatchers.clear()
    trackedByDir.clear()
  }

  return {
    start,
    dispose,
    refreshWatches,
    markSelfWrite,
  }
}
