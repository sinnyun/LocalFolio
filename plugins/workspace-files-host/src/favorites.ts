import crypto from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { FolioError, type JsonStore } from '@folio/base-contract'
import { normalizeBrowsePath } from './classify.js'
import type { FavoriteFolder, FavoriteGroup, FavoritesState } from './types.js'

export const DEFAULT_FAVORITE_GROUP_ID = 'default'

export function createDefaultFavoritesState(): FavoritesState {
  return {
    version: 1,
    groups: [
      {
        id: DEFAULT_FAVORITE_GROUP_ID,
        name: '常用收藏',
        color: '#3b82f6',
        order: 0,
      },
    ],
    items: [],
  }
}

export function normalizeFavoritesState(state: FavoritesState): FavoritesState {
  const hasDefault = state.groups.some(g => g.id === DEFAULT_FAVORITE_GROUP_ID)
  const rawGroups = hasDefault
    ? state.groups
    : [
        {
          id: DEFAULT_FAVORITE_GROUP_ID,
          name: '常用收藏',
          color: '#3b82f6',
          order: 0,
        },
        ...state.groups,
      ]

  const groups: FavoriteGroup[] = [...rawGroups]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((g, index) => ({ ...g, order: index }))

  const validGroupIds = new Set(groups.map(g => g.id))
  const itemsByGroup = new Map<string, FavoriteFolder[]>()
  for (const item of state.items) {
    const gid = validGroupIds.has(item.groupId) ? item.groupId : DEFAULT_FAVORITE_GROUP_ID
    const list = itemsByGroup.get(gid) ?? []
    list.push({ ...item, groupId: gid })
    itemsByGroup.set(gid, list)
  }

  const normalizedItems: FavoriteFolder[] = []
  for (const group of groups) {
    const list = (itemsByGroup.get(group.id) ?? []).sort(
      (a, b) => a.order - b.order || a.createdAt - b.createdAt,
    )
    list.forEach((item, index) => {
      normalizedItems.push({ ...item, order: index })
    })
  }

  return {
    version: 1,
    groups,
    items: normalizedItems,
  }
}

export interface FavoritesManager {
  get(): Promise<FavoritesState>
  add(input: { path: string; name?: string; groupId?: string }): Promise<FavoritesState>
  update(input: { id: string; name?: string; groupId?: string; order?: number }): Promise<FavoritesState>
  remove(input: { id?: string; path?: string }): Promise<FavoritesState>
  createGroup(input: { name: string; color?: string }): Promise<FavoritesState>
  updateGroup(input: {
    id: string
    name?: string
    color?: string
    order?: number
  }): Promise<FavoritesState>
  deleteGroup(input: { id: string; mode?: 'move-to-default' | 'delete-items' }): Promise<FavoritesState>
}

export function createFavoritesManager(store: JsonStore<FavoritesState>): FavoritesManager {
  return {
    async get(): Promise<FavoritesState> {
      return normalizeFavoritesState(await store.read())
    },

    async add(input): Promise<FavoritesState> {
      const normalizedPath = normalizeBrowsePath(input.path)
      if (!normalizedPath) {
        throw new FolioError('invalid_path', '收藏文件夹路径不能为空', 400)
      }
      const st = await fsp.stat(normalizedPath).catch(() => null)
      if (!st || !st.isDirectory()) {
        throw new FolioError('not_a_directory', `目标不是有效文件夹: ${normalizedPath}`, 400)
      }

      const defaultName = path.basename(normalizedPath) || normalizedPath
      const alias = input.name?.trim() || defaultName

      const saved = await store.update(curr => {
        const state = normalizeFavoritesState(curr)
        const targetGroupId = input.groupId?.trim() || DEFAULT_FAVORITE_GROUP_ID
        if (!state.groups.some(g => g.id === targetGroupId)) {
          throw new FolioError('group_not_found', `收藏分组不存在: ${targetGroupId}`, 404)
        }

        const existing = state.items.find(
          item => item.path.toLowerCase() === normalizedPath.toLowerCase(),
        )
        if (existing) {
          const nextItems = state.items.map(item =>
            item.id === existing.id
              ? {
                  ...item,
                  name: input.name?.trim() ? alias : item.name,
                  groupId: input.groupId ? targetGroupId : item.groupId,
                }
              : item,
          )
          return normalizeFavoritesState({ ...state, items: nextItems })
        }

        const nextOrder = state.items.filter(item => item.groupId === targetGroupId).length
        const newItem: FavoriteFolder = {
          id: `fav_${crypto.randomBytes(6).toString('hex')}`,
          groupId: targetGroupId,
          name: alias,
          path: normalizedPath,
          order: nextOrder,
          createdAt: Date.now(),
        }
        return normalizeFavoritesState({
          ...state,
          items: [...state.items, newItem],
        })
      })
      return normalizeFavoritesState(saved)
    },

    async update(input): Promise<FavoritesState> {
      const saved = await store.update(curr => {
        const state = normalizeFavoritesState(curr)
        const target = state.items.find(item => item.id === input.id)
        if (!target) {
          throw new FolioError('favorite_not_found', `收藏项不存在: ${input.id}`, 404)
        }

        const nextGroupId = input.groupId?.trim() || target.groupId
        if (!state.groups.some(g => g.id === nextGroupId)) {
          throw new FolioError('group_not_found', `收藏分组不存在: ${nextGroupId}`, 404)
        }

        const nextName =
          input.name !== undefined ? input.name.trim() || path.basename(target.path) || target.path : target.name

        const othersInGroup = state.items
          .filter(item => item.groupId === nextGroupId && item.id !== target.id)
          .sort((a, b) => a.order - b.order)

        const updatedTarget: FavoriteFolder = {
          ...target,
          name: nextName,
          groupId: nextGroupId,
        }

        if (input.order !== undefined) {
          const clampedIdx = Math.max(0, Math.min(othersInGroup.length, Math.round(input.order)))
          othersInGroup.splice(clampedIdx, 0, updatedTarget)
        } else if (nextGroupId !== target.groupId) {
          othersInGroup.push(updatedTarget)
        } else {
          const oldIdx = state.items
            .filter(item => item.groupId === nextGroupId)
            .findIndex(item => item.id === target.id)
          othersInGroup.splice(Math.max(0, oldIdx), 0, updatedTarget)
        }

        const reindexedGroup = othersInGroup.map((item, idx) => ({ ...item, order: idx }))
        const rest = state.items.filter(
          item => item.groupId !== nextGroupId && item.id !== target.id,
        )
        return normalizeFavoritesState({
          ...state,
          items: [...rest, ...reindexedGroup],
        })
      })
      return normalizeFavoritesState(saved)
    },

    async remove(input): Promise<FavoritesState> {
      if (!input.id && !input.path) {
        throw new FolioError('invalid_input', '必须提供收藏项 id 或 path', 400)
      }
      const targetPathLower = input.path ? normalizeBrowsePath(input.path).toLowerCase() : null
      const saved = await store.update(curr => {
        const state = normalizeFavoritesState(curr)
        const nextItems = state.items.filter(item => {
          if (input.id && item.id === input.id) return false
          if (targetPathLower && item.path.toLowerCase() === targetPathLower) return false
          return true
        })
        return normalizeFavoritesState({ ...state, items: nextItems })
      })
      return normalizeFavoritesState(saved)
    },

    async createGroup(input): Promise<FavoritesState> {
      const name = input.name.trim()
      if (!name) {
        throw new FolioError('invalid_input', '分组名称不能为空', 400)
      }
      const saved = await store.update(curr => {
        const state = normalizeFavoritesState(curr)
        if (state.groups.some(g => g.name.toLowerCase() === name.toLowerCase())) {
          throw new FolioError('duplicate_group', `分组已存在: ${name}`, 409)
        }
        const nextGroup: FavoriteGroup = {
          id: `grp_${crypto.randomBytes(6).toString('hex')}`,
          name,
          color: input.color?.trim() || '#3b82f6',
          order: state.groups.length,
        }
        return normalizeFavoritesState({
          ...state,
          groups: [...state.groups, nextGroup],
        })
      })
      return normalizeFavoritesState(saved)
    },

    async updateGroup(input): Promise<FavoritesState> {
      const saved = await store.update(curr => {
        const state = normalizeFavoritesState(curr)
        const target = state.groups.find(g => g.id === input.id)
        if (!target) {
          throw new FolioError('group_not_found', `收藏分组不存在: ${input.id}`, 404)
        }

        const nextName = input.name !== undefined ? input.name.trim() : target.name
        if (!nextName) {
          throw new FolioError('invalid_input', '分组名称不能为空', 400)
        }
        if (
          state.groups.some(
            g => g.id !== target.id && g.name.toLowerCase() === nextName.toLowerCase(),
          )
        ) {
          throw new FolioError('duplicate_group', `分组名称重复: ${nextName}`, 409)
        }

        const updatedTarget: FavoriteGroup = {
          ...target,
          name: nextName,
          color: input.color?.trim() || target.color,
        }

        const others = state.groups.filter(g => g.id !== target.id).sort((a, b) => a.order - b.order)
        if (input.order !== undefined) {
          const clampedIdx = Math.max(0, Math.min(others.length, Math.round(input.order)))
          others.splice(clampedIdx, 0, updatedTarget)
        } else {
          const oldIdx = state.groups.findIndex(g => g.id === target.id)
          others.splice(Math.max(0, oldIdx), 0, updatedTarget)
        }

        return normalizeFavoritesState({
          ...state,
          groups: others.map((g, idx) => ({ ...g, order: idx })),
        })
      })
      return normalizeFavoritesState(saved)
    },

    async deleteGroup(input): Promise<FavoritesState> {
      if (input.id === DEFAULT_FAVORITE_GROUP_ID) {
        throw new FolioError('cannot_delete_default', '默认分组不能删除', 400)
      }
      const mode = input.mode ?? 'move-to-default'
      const saved = await store.update(curr => {
        const state = normalizeFavoritesState(curr)
        if (!state.groups.some(g => g.id === input.id)) {
          throw new FolioError('group_not_found', `收藏分组不存在: ${input.id}`, 404)
        }
        const nextGroups = state.groups.filter(g => g.id !== input.id)
        const nextItems =
          mode === 'delete-items'
            ? state.items.filter(item => item.groupId !== input.id)
            : state.items.map(item =>
                item.groupId === input.id ? { ...item, groupId: DEFAULT_FAVORITE_GROUP_ID } : item,
              )
        return normalizeFavoritesState({
          ...state,
          groups: nextGroups,
          items: nextItems,
        })
      })
      return normalizeFavoritesState(saved)
    },
  }
}
