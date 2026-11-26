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

interface DshFsLike {
  readText?(filePath: string): Promise<string | { content?: string; text?: string } | null>
  writeText?(filePath: string, content: string): Promise<unknown>
  exists?(filePath: string): Promise<boolean>
  readDir?(
    dirPath: string,
  ): Promise<Array<{ name: string; path?: string; isDirectory?: boolean; type?: string }>>
  listDir?(
    dirPath: string,
  ): Promise<Array<{ name: string; path?: string; isDirectory?: boolean; type?: string }>>
  remove?(filePath: string): Promise<unknown>
  unlink?(filePath: string): Promise<unknown>
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
  if (typeof fsObj.readText === 'function' && typeof fsObj.writeText === 'function') {
    return fsObj
  }
  return null
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: unknown }).code
  return code === 'ENOENT' || code === 'NOT_FOUND'
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
  const fallback = createLocalFsSeam()
  if (!dshFs) return fallback

  return {
    provider: 'dsh-ctx-fs',

    async readText(filePath: string): Promise<string | null> {
      try {
        const res = await dshFs.readText!(filePath)
        if (res === null || res === undefined) return null
        if (typeof res === 'string') return res
        if (typeof res.content === 'string') return res.content
        if (typeof res.text === 'string') return res.text
        return null
      } catch (error) {
        if (isNotFoundError(error)) return null
        throw error
      }
    },

    async writeText(filePath: string, content: string): Promise<void> {
      await dshFs.writeText!(filePath, content)
    },

    async exists(filePath: string): Promise<boolean> {
      if (typeof dshFs.exists === 'function') return await dshFs.exists(filePath)
      return (await this.readText(filePath)) !== null
    },

    async listDir(dirPath: string): Promise<readonly DirEntryInfo[]> {
      const fn = dshFs.listDir ?? dshFs.readDir
      if (typeof fn === 'function') {
        const rows = await fn.call(dshFs, dirPath)
        return rows.map(row => ({
          name: row.name,
          path: row.path ?? path.join(dirPath, row.name),
          isDirectory: row.isDirectory ?? row.type === 'directory',
        }))
      }
      return fallback.listDir(dirPath)
    },

    async remove(filePath: string): Promise<void> {
      if (typeof dshFs.remove === 'function') {
        await dshFs.remove(filePath)
        return
      }
      if (typeof dshFs.unlink === 'function') {
        await dshFs.unlink(filePath)
        return
      }
      await fallback.remove(filePath)
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
