import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { z } from 'zod'
import {
  FolioError,
  type DirEntryInfo,
  type FsSeam,
  type JsonStore,
} from '@folio/base-contract'

interface DshFsTarget {
  targetKey: string
  displayPath: string
}

interface DshFsLike {
  resolve(filePath: string): Promise<DshFsTarget>
  readText(target: DshFsTarget): Promise<string>
  writeText(target: DshFsTarget, content: string): Promise<unknown>
  stat(target: DshFsTarget): Promise<object | undefined>
  listDir(target: DshFsTarget): Promise<Array<{ name: string; type: string; target: DshFsTarget }>>
  deleteFile(target: DshFsTarget): Promise<unknown>
}

interface ContextWithFsLike {
  get?(name: string): unknown
  fs?: DshFsLike
}

function resolveDshFs(ctx: unknown): DshFsLike | null {
  if (!ctx || typeof ctx !== 'object') return null
  const c = ctx as ContextWithFsLike
  let candidate: unknown
  if (typeof c.get === 'function') {
    try {
      candidate = c.get('fs')
    } catch {
      candidate = undefined
    }
  } else {
    try {
      candidate = c.fs
    } catch {
      candidate = undefined
    }
  }
  if (!candidate || typeof candidate !== 'object') return null
  const fsObj = candidate as DshFsLike
  const methods = ['resolve', 'readText', 'writeText', 'stat', 'listDir', 'deleteFile'] as const
  if (methods.every(method => typeof fsObj[method] === 'function')) {
    return fsObj
  }
  return null
}

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
}

function isNotFoundError(error: unknown): boolean {
  const code = errorCode(error)
  return code === 'ENOENT' || code === 'FS_NOT_FOUND'
}

export function createLocalFsSeam(): FsSeam {
  return {
    provider: 'local-node-fs',

    async readText(filePath: string): Promise<string | null> {
      try {
        return await fsp.readFile(filePath, 'utf8')
      } catch (error) {
        if (isNotFoundError(error)) return null
        throw error
      }
    },

    async writeText(filePath: string, content: string): Promise<void> {
      await fsp.mkdir(path.dirname(filePath), { recursive: true })
      const tmpPath = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`
      try {
        await fsp.writeFile(tmpPath, content, 'utf8')
        await fsp.rename(tmpPath, filePath)
      } catch (error) {
        await fsp.rm(tmpPath, { force: true }).catch(() => {})
        throw error
      }
    },

    async exists(filePath: string): Promise<boolean> {
      try {
        await fsp.access(filePath)
        return true
      } catch {
        return false
      }
    },

    async listDir(dirPath: string): Promise<readonly DirEntryInfo[]> {
      try {
        const entries = await fsp.readdir(dirPath, { withFileTypes: true })
        return entries.map(entry => ({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          isDirectory: entry.isDirectory(),
        }))
      } catch (error) {
        if (isNotFoundError(error)) return []
        throw error
      }
    },

    async remove(filePath: string): Promise<void> {
      await fsp.rm(filePath, { force: true })
    },
  }
}

export function createFsSeam(ctx?: unknown): FsSeam {
  const dshFs = resolveDshFs(ctx)
  if (!dshFs) return createLocalFsSeam()

  const exists = async (filePath: string): Promise<boolean> => {
    try {
      return (await dshFs.stat(await dshFs.resolve(filePath))) !== undefined
    } catch (error) {
      if (isNotFoundError(error)) return false
      throw error
    }
  }

  return {
    provider: 'dsh-ctx-fs',

    async readText(filePath: string): Promise<string | null> {
      try {
        return await dshFs.readText(await dshFs.resolve(filePath))
      } catch (error) {
        if (isNotFoundError(error)) return null
        throw error
      }
    },

    async writeText(filePath: string, content: string): Promise<void> {
      await dshFs.writeText(await dshFs.resolve(filePath), content)
    },

    exists,

    async listDir(dirPath: string): Promise<readonly DirEntryInfo[]> {
      try {
        const rows = await dshFs.listDir(await dshFs.resolve(dirPath))
        return rows.map(row => ({
          name: row.name,
          path: row.target.displayPath,
          isDirectory: row.type === 'directory',
        }))
      } catch (error) {
        if (isNotFoundError(error)) return []
        throw error
      }
    },

    async remove(filePath: string): Promise<void> {
      try {
        await dshFs.deleteFile(await dshFs.resolve(filePath))
      } catch (error) {
        if (isNotFoundError(error)) return
        // fs-local reports a missing delete target as a stale version.
        if (errorCode(error) === 'FS_STALE_VERSION' && !(await exists(filePath))) return
        throw error
      }
    },
  }
}

export function createJsonStore<T>(
  fsSeam: FsSeam,
  filePath: string,
  schema: z.ZodType<T>,
  defaultValue: () => T,
): JsonStore<T> {
  let queue: Promise<unknown> = Promise.resolve()

  const read = async (): Promise<T> => {
    const raw = await fsSeam.readText(filePath)
    if (raw === null || raw.trim().length === 0) {
      return schema.parse(defaultValue())
    }
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(raw)
    } catch (error) {
      throw new FolioError(
        'json_store_corrupt',
        `本地 JSON 文件解析失败: ${path.basename(filePath)}`,
        500,
        { cause: error instanceof Error ? error.message : String(error) },
      )
    }
    return schema.parse(parsedJson)
  }

  const write = async (data: T): Promise<T> => {
    const validated = schema.parse(data)
    await fsSeam.writeText(filePath, `${JSON.stringify(validated, null, 2)}\n`)
    return validated
  }

  const update = (updater: (current: T) => T): Promise<T> => {
    const task = queue.then(async () => {
      const current = await read()
      return await write(updater(current))
    })
    queue = task.catch(() => {})
    return task
  }

  return { filePath, read, write, update }
}
