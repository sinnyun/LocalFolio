import crypto from 'node:crypto'
import path from 'node:path'
import { FolioError, type JsonStore } from '@folio/base-contract'
import { normalizeBrowsePath } from './classify.js'
import { buildFileEntry } from './fs-ops.js'
import type {
  FileEntry,
  FileMetaRecord,
  MetadataSnapshot,
  MetadataState,
  TagDef,
  TagFilesResult,
} from './types.js'

const STAT_BATCH_SIZE = 32

export function toMetaKey(rawPath: string): string {
  return normalizeBrowsePath(rawPath).toLowerCase()
}

export function computeTagCounts(state: MetadataState): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const tag of state.tags) {
    counts[tag.id] = 0
  }
  for (const record of Object.values(state.files)) {
    for (const tagId of record.tagIds) {
      if (tagId in counts) {
        counts[tagId] += 1
      }
    }
  }
  return counts
}

function toSnapshot(state: MetadataState): MetadataSnapshot {
  return {
    tags: state.tags,
    files: state.files,
    tagCounts: computeTagCounts(state),
  }
}

export interface MetadataManager {
  get(): Promise<MetadataSnapshot>
  setFileMeta(input: {
    path: string
    rating?: number
    tagIds?: readonly string[]
    note?: string
  }): Promise<{
    readonly key: string
    readonly record: FileMetaRecord | null
    readonly tagCounts: Readonly<Record<string, number>>
  }>
  createTag(input: { name: string; color?: string; description?: string }): Promise<{
    readonly tag: TagDef
    readonly tags: readonly TagDef[]
    readonly tagCounts: Readonly<Record<string, number>>
  }>
  updateTag(input: {
    id: string
    name?: string
    color?: string
    description?: string
  }): Promise<{
    readonly tag: TagDef
    readonly tags: readonly TagDef[]
    readonly tagCounts: Readonly<Record<string, number>>
  }>
  deleteTag(input: { id: string }): Promise<MetadataSnapshot>
  listTagFiles(input: { tagId: string }): Promise<TagFilesResult>
  pruneMissing(input: { paths: readonly string[] }): Promise<{
    readonly removedCount: number
    readonly files: Readonly<Record<string, FileMetaRecord>>
    readonly tagCounts: Readonly<Record<string, number>>
  }>
}

export function createMetadataManager(store: JsonStore<MetadataState>): MetadataManager {
  return {
    async get(): Promise<MetadataSnapshot> {
      return toSnapshot(await store.read())
    },

    async setFileMeta(input) {
      const normalizedPath = normalizeBrowsePath(input.path)
      if (!normalizedPath) {
        throw new FolioError('invalid_path', '文件路径不能为空', 400)
      }
      const key = toMetaKey(normalizedPath)
      let resultRecord: FileMetaRecord | null = null

      const nextState = await store.update(curr => {
        const validTagIds = new Set(curr.tags.map(t => t.id))
        const existing = curr.files[key]
        const rating =
          input.rating !== undefined
            ? Math.max(0, Math.min(5, Math.round(input.rating)))
            : (existing?.rating ?? 0)
        const tagIds =
          input.tagIds !== undefined
            ? Array.from(new Set(input.tagIds.filter(id => validTagIds.has(id))))
            : (existing?.tagIds ?? [])
        const note = input.note !== undefined ? input.note : (existing?.note ?? '')

        const nextFiles = { ...curr.files }
        if (rating === 0 && tagIds.length === 0 && note.trim() === '') {
          delete nextFiles[key]
          resultRecord = null
        } else {
          resultRecord = {
            path: normalizedPath,
            rating,
            tagIds,
            note,
            updatedAt: Date.now(),
          }
          nextFiles[key] = resultRecord
        }

        return {
          ...curr,
          files: nextFiles,
        }
      })

      return {
        key,
        record: resultRecord,
        tagCounts: computeTagCounts(nextState),
      }
    },

    async createTag(input) {
      const name = input.name.trim()
      if (!name) {
        throw new FolioError('invalid_input', '标签名称不能为空', 400)
      }
      let created: TagDef | null = null
      const nextState = await store.update(curr => {
        if (curr.tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
          throw new FolioError('duplicate_tag', `标签已存在: ${name}`, 409)
        }
        created = {
          id: `tag_${crypto.randomBytes(6).toString('hex')}`,
          name,
          color: input.color?.trim() || '#3b82f6',
          description: input.description?.trim() ?? '',
          createdAt: Date.now(),
        }
        return {
          ...curr,
          tags: [...curr.tags, created],
        }
      })

      return {
        tag: created!,
        tags: nextState.tags,
        tagCounts: computeTagCounts(nextState),
      }
    },

    async updateTag(input) {
      let updated: TagDef | null = null
      const nextState = await store.update(curr => {
        const target = curr.tags.find(t => t.id === input.id)
        if (!target) {
          throw new FolioError('tag_not_found', `标签不存在: ${input.id}`, 404)
        }
        const nextName = input.name !== undefined ? input.name.trim() : target.name
        if (!nextName) {
          throw new FolioError('invalid_input', '标签名称不能为空', 400)
        }
        if (
          curr.tags.some(t => t.id !== target.id && t.name.toLowerCase() === nextName.toLowerCase())
        ) {
          throw new FolioError('duplicate_tag', `标签名称重复: ${nextName}`, 409)
        }
        updated = {
          ...target,
          name: nextName,
          color: input.color?.trim() || target.color,
          description:
            input.description !== undefined ? input.description.trim() : target.description,
        }
        return {
          ...curr,
          tags: curr.tags.map(t => (t.id === target.id ? updated! : t)),
        }
      })

      return {
        tag: updated!,
        tags: nextState.tags,
        tagCounts: computeTagCounts(nextState),
      }
    },

    async deleteTag(input) {
      const nextState = await store.update(curr => {
        if (!curr.tags.some(t => t.id === input.id)) {
          throw new FolioError('tag_not_found', `标签不存在: ${input.id}`, 404)
        }
        const nextTags = curr.tags.filter(t => t.id !== input.id)
        const nextFiles: Record<string, FileMetaRecord> = {}
        for (const [key, rec] of Object.entries(curr.files)) {
          const nextTagIds = rec.tagIds.filter(id => id !== input.id)
          if (rec.rating === 0 && nextTagIds.length === 0 && rec.note.trim() === '') {
            continue
          }
          nextFiles[key] =
            nextTagIds.length === rec.tagIds.length ? rec : { ...rec, tagIds: nextTagIds }
        }
        return {
          ...curr,
          tags: nextTags,
          files: nextFiles,
        }
      })

      return toSnapshot(nextState)
    },

    async listTagFiles(input): Promise<TagFilesResult> {
      const state = await store.read()
      const tag = state.tags.find(t => t.id === input.tagId)
      if (!tag) {
        throw new FolioError('tag_not_found', `标签不存在: ${input.tagId}`, 404)
      }

      const matchingRecords = Object.values(state.files).filter(rec =>
        rec.tagIds.includes(tag.id),
      )

      const entries: FileEntry[] = []
      const missingPaths: string[] = []

      for (let i = 0; i < matchingRecords.length; i += STAT_BATCH_SIZE) {
        const batch = matchingRecords.slice(i, i + STAT_BATCH_SIZE)
        const resolved = await Promise.all(
          batch.map(async rec => ({
            rec,
            entry: await buildFileEntry(rec.path, path.basename(rec.path) || rec.path),
          })),
        )
        for (const item of resolved) {
          if (item.entry) {
            entries.push(item.entry)
          } else {
            missingPaths.push(item.rec.path)
          }
        }
      }

      return {
        tag,
        entries,
        missingPaths,
        totalCount: entries.length,
      }
    },

    async pruneMissing(input) {
      let removedCount = 0
      const keysToRemove = new Set(input.paths.map(p => toMetaKey(p)).filter(Boolean))
      const nextState = await store.update(curr => {
        const nextFiles = { ...curr.files }
        for (const key of keysToRemove) {
          if (key in nextFiles) {
            delete nextFiles[key]
            removedCount += 1
          }
        }
        return {
          ...curr,
          files: nextFiles,
        }
      })

      return {
        removedCount,
        files: nextState.files,
        tagCounts: computeTagCounts(nextState),
      }
    },
  }
}
