import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type {
  GeneratedThumbMime,
  JsonStore,
  PluginStorageNamespace,
  ThumbCacheStats,
  ThumbIndexStatus,
  ThumbStatusEntry,
} from '@folio/base-contract'

export interface ThumbIndexRecord {
  readonly filePath: string
  readonly canonicalKey: string
  readonly fingerprint: string
  readonly status: ThumbIndexStatus
  readonly providerId: string | null
  readonly thumbPath: string | null
  readonly mime: GeneratedThumbMime | null
  readonly ext: string
  readonly fileSize: number
  readonly updatedAt: number
}

const ThumbIndexJsonRecordSchema = z.object({
  filePath: z.string(),
  canonicalKey: z.string(),
  fingerprint: z.string(),
  status: z.enum(['READY', 'MISSING', 'IGNORED', 'FAILED_EAGLE']),
  providerId: z.string().nullable(),
  thumbPath: z.string().nullable(),
  mime: z.enum(['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp']).nullable(),
  ext: z.string(),
  fileSize: z.number().nonnegative(),
  updatedAt: z.number(),
})

const ThumbIndexJsonStateSchema = z.object({
  version: z.literal(1),
  entries: z.record(z.string(), ThumbIndexJsonRecordSchema),
})

type ThumbIndexJsonState = z.infer<typeof ThumbIndexJsonStateSchema>

const MAX_CACHE_BYTES = 512 * 1024 * 1024 // 512 MB

export function canonicalThumbPathKey(filePath: string): string {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function buildThumbFingerprint(size: number, mtimeMs: number): string {
  return `${Math.max(0, Math.trunc(size))}_${Math.max(0, Math.trunc(mtimeMs))}`
}

export function mimeToCacheExt(mime: GeneratedThumbMime): string {
  switch (mime) {
    case 'image/webp':
      return '.webp'
    case 'image/png':
      return '.png'
    case 'image/svg+xml':
      return '.svg'
    default:
      return '.jpg'
  }
}

export function sniffThumbMime(buffer: Buffer): GeneratedThumbMime {
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png'
  }
  const head = buffer.subarray(0, Math.min(buffer.length, 256)).toString('utf8').trimStart()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return 'image/svg+xml'
  }
  return 'image/jpeg'
}

export interface ThumbIndexStore {
  readonly backend: 'node-sqlite' | 'json-store' | 'memory'
  readonly cacheDir: string | null
  get(filePath: string): Promise<ThumbIndexRecord | null>
  upsert(record: ThumbIndexRecord): Promise<void>
  delete(filePath: string): Promise<void>
  listAll(): Promise<readonly ThumbIndexRecord[]>
  writeCacheFile(options: {
    readonly filePath: string
    readonly fingerprint: string
    readonly maxDim: number
    readonly mime: GeneratedThumbMime
    readonly buffer: Buffer
  }): Promise<string | null>
  readCacheFile(relOrAbsPath: string): Promise<Buffer | null>
  cacheFileExists(relOrAbsPath: string): Promise<boolean>
  getStats(): Promise<ThumbCacheStats>
  clearAll(): Promise<{ readonly removedFiles: number; readonly clearedEntries: number }>
  dispose(): void
}

interface SqliteStatementLike {
  get(...params: unknown[]): Record<string, unknown> | undefined
  all(...params: unknown[]): Array<Record<string, unknown>>
  run(...params: unknown[]): unknown
}

interface SqliteDatabaseLike {
  exec(sql: string): void
  prepare(sql: string): SqliteStatementLike
  close(): void
}

function tryOpenNodeSqlite(dbPath: string): SqliteDatabaseLike | null {
  try {
    // Dynamic require avoids bundler static resolution while supporting Node 22.5+/24 built-in node:sqlite.
    const modName = 'node:sqlite'
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteMod = require(modName) as {
      DatabaseSync?: new (location: string) => SqliteDatabaseLike
    }
    if (!sqliteMod?.DatabaseSync) return null
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    const db = new sqliteMod.DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode = WAL;')
    db.exec('PRAGMA synchronous = NORMAL;')
    db.exec(`
      CREATE TABLE IF NOT EXISTS thumbnail_index (
        canonical_key TEXT PRIMARY KEY,
        file_path     TEXT NOT NULL,
        fingerprint   TEXT NOT NULL,
        status        TEXT NOT NULL,
        provider      TEXT,
        thumb_path    TEXT,
        mime          TEXT,
        ext           TEXT NOT NULL,
        file_size     INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_thumb_status_ext ON thumbnail_index(status, ext);
    `)
    return db
  } catch {
    return null
  }
}

function rowToRecord(row: Record<string, unknown>): ThumbIndexRecord {
  return {
    canonicalKey: String(row.canonical_key ?? ''),
    filePath: String(row.file_path ?? ''),
    fingerprint: String(row.fingerprint ?? ''),
    status: String(row.status ?? 'MISSING') as ThumbIndexStatus,
    providerId: row.provider == null ? null : String(row.provider),
    thumbPath: row.thumb_path == null ? null : String(row.thumb_path),
    mime: row.mime == null ? null : (String(row.mime) as GeneratedThumbMime),
    ext: String(row.ext ?? ''),
    fileSize: Number(row.file_size ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  }
}

export function toThumbStatusEntry(
  record: ThumbIndexRecord,
  resolveCacheAbs?: (rel: string) => string,
): ThumbStatusEntry {
  const cachePath =
    record.thumbPath && resolveCacheAbs
      ? path.isAbsolute(record.thumbPath)
        ? record.thumbPath
        : resolveCacheAbs(record.thumbPath)
      : record.thumbPath
  return {
    filePath: record.filePath,
    status: record.status,
    providerId: record.providerId,
    cachePath,
    mime: record.mime,
    ext: record.ext,
    fileSize: record.fileSize,
    updatedAt: record.updatedAt,
  }
}

export function createThumbIndexStore(options?: {
  readonly storage?: PluginStorageNamespace
  readonly maxCacheBytes?: number
}): ThumbIndexStore {
  const storage = options?.storage
  const maxCacheBytes = options?.maxCacheBytes ?? MAX_CACHE_BYTES
  const cacheDir = storage ? storage.cachePath('thumbs') : null

  const sqliteDb = storage ? tryOpenNodeSqlite(storage.dataPath('thumb-index.sqlite')) : null
  const jsonStore: JsonStore<ThumbIndexJsonState> | null =
    !sqliteDb && storage
      ? storage.jsonStore('thumb-index.json', ThumbIndexJsonStateSchema, () => ({
          version: 1 as const,
          entries: {},
        }))
      : null

  const backend: ThumbIndexStore['backend'] = sqliteDb
    ? 'node-sqlite'
    : jsonStore
      ? 'json-store'
      : 'memory'

  const memMap = new Map<string, ThumbIndexRecord>()
  let jsonLoaded = false
  let jsonLoadPromise: Promise<void> | null = null
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let dirty = false
  let disposed = false
  let writesSincePrune = 0

  const ensureJsonLoaded = async (): Promise<void> => {
    if (!jsonStore || jsonLoaded) return
    if (!jsonLoadPromise) {
      jsonLoadPromise = jsonStore
        .read()
        .then(state => {
          for (const [key, rec] of Object.entries(state.entries)) {
            memMap.set(key, rec)
          }
          jsonLoaded = true
        })
        .catch(() => {
          jsonLoaded = true
        })
    }
    await jsonLoadPromise
  }

  const flushJsonNow = async (): Promise<void> => {
    if (!jsonStore || !dirty) return
    dirty = false
    const entries: Record<string, ThumbIndexRecord> = {}
    for (const [k, v] of memMap.entries()) {
      entries[k] = v
    }
    await jsonStore.write({ version: 1, entries }).catch(() => {})
  }

  const scheduleJsonFlush = (): void => {
    if (!jsonStore || disposed) return
    dirty = true
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flushJsonNow()
    }, 150)
    flushTimer.unref?.()
  }

  const resolveCachePath = (relOrAbs: string): string | null => {
    if (path.isAbsolute(relOrAbs)) return relOrAbs
    if (!cacheDir) return null
    return path.join(cacheDir, relOrAbs)
  }

  const pruneCacheIfNeeded = async (): Promise<void> => {
    if (!cacheDir) return
    writesSincePrune += 1
    if (writesSincePrune < 40) return
    writesSincePrune = 0

    let names: string[]
    try {
      names = await fsp.readdir(cacheDir)
    } catch {
      return
    }
    const items: Array<{ fullPath: string; size: number; mtimeMs: number }> = []
    let total = 0
    for (const name of names) {
      const fullPath = path.join(cacheDir, name)
      try {
        const st = await fsp.stat(fullPath)
        if (!st.isFile()) continue
        total += st.size
        items.push({ fullPath, size: st.size, mtimeMs: st.mtimeMs })
      } catch {
        // ignore
      }
    }
    if (total <= maxCacheBytes) return
    items.sort((a, b) => a.mtimeMs - b.mtimeMs)
    const targetBytes = Math.floor(maxCacheBytes * 0.8)
    for (const item of items) {
      if (total <= targetBytes) break
      await fsp.unlink(item.fullPath).catch(() => {})
      total -= item.size
    }
  }

  const stmtGet = sqliteDb
    ? sqliteDb.prepare('SELECT * FROM thumbnail_index WHERE canonical_key = ?')
    : null
  const stmtUpsert = sqliteDb
    ? sqliteDb.prepare(`
        INSERT INTO thumbnail_index (
          canonical_key, file_path, fingerprint, status, provider, thumb_path, mime, ext, file_size, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(canonical_key) DO UPDATE SET
          file_path = excluded.file_path,
          fingerprint = excluded.fingerprint,
          status = excluded.status,
          provider = excluded.provider,
          thumb_path = excluded.thumb_path,
          mime = excluded.mime,
          ext = excluded.ext,
          file_size = excluded.file_size,
          updated_at = excluded.updated_at
      `)
    : null
  const stmtDelete = sqliteDb
    ? sqliteDb.prepare('DELETE FROM thumbnail_index WHERE canonical_key = ?')
    : null
  const stmtAll = sqliteDb ? sqliteDb.prepare('SELECT * FROM thumbnail_index') : null

  return {
    backend,
    cacheDir,

    async get(filePath: string): Promise<ThumbIndexRecord | null> {
      const key = canonicalThumbPathKey(filePath)
      if (stmtGet) {
        const row = stmtGet.get(key)
        return row ? rowToRecord(row) : null
      }
      await ensureJsonLoaded()
      return memMap.get(key) ?? null
    },

    async upsert(record: ThumbIndexRecord): Promise<void> {
      if (stmtUpsert) {
        stmtUpsert.run(
          record.canonicalKey,
          record.filePath,
          record.fingerprint,
          record.status,
          record.providerId,
          record.thumbPath,
          record.mime,
          record.ext,
          record.fileSize,
          record.updatedAt,
        )
        return
      }
      await ensureJsonLoaded()
      memMap.set(record.canonicalKey, record)
      scheduleJsonFlush()
    },

    async delete(filePath: string): Promise<void> {
      const key = canonicalThumbPathKey(filePath)
      if (stmtDelete) {
        stmtDelete.run(key)
        return
      }
      await ensureJsonLoaded()
      if (memMap.delete(key)) {
        scheduleJsonFlush()
      }
    },

    async listAll(): Promise<readonly ThumbIndexRecord[]> {
      if (stmtAll) {
        return stmtAll.all().map(rowToRecord)
      }
      await ensureJsonLoaded()
      return Array.from(memMap.values())
    },

    async writeCacheFile(opts): Promise<string | null> {
      if (!cacheDir || opts.buffer.length === 0) return null
      await fsp.mkdir(cacheDir, { recursive: true })
      const canonical = canonicalThumbPathKey(opts.filePath)
      const hash = crypto
        .createHash('md5')
        .update(`${canonical}|${opts.fingerprint}|${opts.maxDim}`)
        .digest('hex')
      const fileName = `${hash}${mimeToCacheExt(opts.mime)}`
      const targetPath = path.join(cacheDir, fileName)
      const tmpPath = `${targetPath}.${crypto.randomUUID().slice(0, 8)}.tmp`
      await fsp.writeFile(tmpPath, opts.buffer)
      const st = await fsp.stat(tmpPath).catch(() => null)
      if (!st || st.size <= 0) {
        await fsp.unlink(tmpPath).catch(() => {})
        return null
      }
      await fsp.rename(tmpPath, targetPath)
      void pruneCacheIfNeeded()
      return fileName
    },

    async readCacheFile(relOrAbsPath: string): Promise<Buffer | null> {
      const fullPath = resolveCachePath(relOrAbsPath)
      if (!fullPath) return null
      try {
        const st = await fsp.stat(fullPath)
        if (!st.isFile() || st.size <= 0) return null
        const buf = await fsp.readFile(fullPath)
        return buf.length > 0 ? buf : null
      } catch {
        return null
      }
    },

    async cacheFileExists(relOrAbsPath: string): Promise<boolean> {
      const fullPath = resolveCachePath(relOrAbsPath)
      if (!fullPath) return false
      try {
        const st = await fsp.stat(fullPath)
        return st.isFile() && st.size > 0
      } catch {
        return false
      }
    },

    async getStats(): Promise<ThumbCacheStats> {
      const all = await this.listAll()
      let readyCount = 0
      let missingCount = 0
      let ignoredCount = 0
      let failedEagleCount = 0
      for (const rec of all) {
        if (rec.status === 'READY') readyCount += 1
        else if (rec.status === 'MISSING') missingCount += 1
        else if (rec.status === 'IGNORED') ignoredCount += 1
        else if (rec.status === 'FAILED_EAGLE') failedEagleCount += 1
      }

      let cacheFileCount = 0
      let cacheBytes = 0
      if (cacheDir) {
        try {
          const names = await fsp.readdir(cacheDir)
          for (const name of names) {
            const st = await fsp.stat(path.join(cacheDir, name)).catch(() => null)
            if (st?.isFile()) {
              cacheFileCount += 1
              cacheBytes += st.size
            }
          }
        } catch {
          // ignore
        }
      }

      return {
        entryCount: all.length,
        readyCount,
        missingCount,
        ignoredCount,
        failedEagleCount,
        cacheFileCount,
        cacheBytes,
        storageBackend: backend,
      }
    },

    async clearAll(): Promise<{ readonly removedFiles: number; readonly clearedEntries: number }> {
      const existing = await this.listAll()
      const clearedEntries = existing.length
      if (sqliteDb) {
        sqliteDb.exec('DELETE FROM thumbnail_index;')
      } else {
        await ensureJsonLoaded()
        memMap.clear()
        if (jsonStore) {
          dirty = false
          await jsonStore.write({ version: 1, entries: {} }).catch(() => {})
        }
      }

      let removedFiles = 0
      if (cacheDir) {
        try {
          const names = await fsp.readdir(cacheDir)
          for (const name of names) {
            const ok = await fsp
              .unlink(path.join(cacheDir, name))
              .then(() => true)
              .catch(() => false)
            if (ok) removedFiles += 1
          }
        } catch {
          // ignore
        }
      }
      return { removedFiles, clearedEntries }
    },

    dispose(): void {
      if (disposed) return
      disposed = true
      if (flushTimer) {
        clearTimeout(flushTimer)
        flushTimer = null
      }
      if (dirty && jsonStore) {
        void flushJsonNow()
      }
      if (sqliteDb) {
        try {
          sqliteDb.close()
        } catch {
          // ignore
        }
      }
    },
  }
}
