import crypto from 'node:crypto'
import path from 'node:path'
import { FolioError, type PluginStorageNamespace } from '@folio/base-contract'
import { createDefaultCatalog } from './defaults.js'
import { normalizeLocalPath } from './dialogs.js'
import {
  CatalogStateSchema,
  DEFAULT_CONTROL_PORT,
  MaterialsSettingsSchema,
  PageMetaStateSchema,
  ProjectsStateSchema,
  type CatalogState,
  type MaterialDataScope,
  type MaterialFieldCategory,
  type MaterialFileRef,
  type MaterialOptionItem,
  type MaterialProject,
  type MaterialsSettings,
  type MaterialTemplateItem,
  type PageMetaState,
  type PageSidecarEntry,
  type ProjectsState,
} from './types.js'

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export function createMaterialsStore(storage: PluginStorageNamespace) {
  const projectsStore = storage.jsonStore('projects.json', ProjectsStateSchema, () => ({
    version: 1 as const,
    activeProjectId: null,
    projects: [],
  }))

  const catalogStore = storage.jsonStore('catalog.json', CatalogStateSchema, createDefaultCatalog)

  const pageMetaStore = storage.jsonStore<PageMetaState>(
    'page-meta.json',
    PageMetaStateSchema as unknown as import('zod').ZodType<PageMetaState>,
    () => ({
      version: 1 as const,
      files: {},
    }),
  )

  const settingsStore = storage.jsonStore('settings.json', MaterialsSettingsSchema, () => ({
    version: 1 as const,
    cliPath: '',
    appPath: '',
    controlPort: DEFAULT_CONTROL_PORT,
    autoWatchFiles: true,
    autoPollLiveControl: true,
    defaultExportDir: '',
  }))

  async function listProjects(): Promise<ProjectsState> {
    return projectsStore.read()
  }

  async function getProject(projectId: string): Promise<MaterialProject> {
    const state = await projectsStore.read()
    const project = state.projects.find(p => p.id === projectId)
    if (!project) {
      throw new FolioError('project_not_found', `物料项目不存在: ${projectId}`, 404)
    }
    return project
  }

  async function createProject(input: {
    readonly name: string
    readonly description?: string
  }): Promise<{ readonly state: ProjectsState; readonly project: MaterialProject }> {
    const trimmed = input.name.trim()
    if (!trimmed) {
      throw new FolioError('invalid_name', '项目名称不能为空', 400)
    }
    const now = Date.now()
    const project: MaterialProject = {
      id: newId('proj'),
      name: trimmed,
      description: (input.description ?? '').trim(),
      files: [],
      createdAt: now,
      updatedAt: now,
    }
    const state = await projectsStore.update(curr => ({
      ...curr,
      activeProjectId: project.id,
      projects: [...curr.projects, project],
    }))
    return { state, project }
  }

  async function updateProject(input: {
    readonly id: string
    readonly name?: string
    readonly description?: string
    readonly setActive?: boolean
  }): Promise<ProjectsState> {
    return projectsStore.update(curr => {
      const idx = curr.projects.findIndex(p => p.id === input.id)
      if (idx < 0) {
        throw new FolioError('project_not_found', `物料项目不存在: ${input.id}`, 404)
      }
      const existing = curr.projects[idx]!
      const nextName = input.name !== undefined ? input.name.trim() : existing.name
      if (!nextName) {
        throw new FolioError('invalid_name', '项目名称不能为空', 400)
      }
      const nextProject: MaterialProject = {
        ...existing,
        name: nextName,
        description:
          input.description !== undefined ? input.description.trim() : existing.description,
        updatedAt: Date.now(),
      }
      const nextProjects = [...curr.projects]
      nextProjects[idx] = nextProject
      return {
        ...curr,
        activeProjectId: input.setActive ? input.id : curr.activeProjectId,
        projects: nextProjects,
      }
    })
  }

  async function deleteProject(projectId: string): Promise<ProjectsState> {
    const nextState = await projectsStore.update(curr => {
      const filtered = curr.projects.filter(p => p.id !== projectId)
      if (filtered.length === curr.projects.length) {
        throw new FolioError('project_not_found', `物料项目不存在: ${projectId}`, 404)
      }
      return {
        ...curr,
        activeProjectId:
          curr.activeProjectId === projectId ? (filtered[0]?.id ?? null) : curr.activeProjectId,
        projects: filtered,
      }
    })

    await catalogStore.update(curr => {
      if (!(projectId in curr.projectData)) return curr
      const rest = { ...curr.projectData }
      delete rest[projectId]
      return { ...curr, projectData: rest }
    })

    return nextState
  }

  async function addFilesToProject(
    projectId: string,
    filePaths: readonly string[],
  ): Promise<{ readonly project: MaterialProject; readonly added: readonly MaterialFileRef[] }> {
    const added: MaterialFileRef[] = []
    const nextState = await projectsStore.update(curr => {
      const idx = curr.projects.findIndex(p => p.id === projectId)
      if (idx < 0) {
        throw new FolioError('project_not_found', `物料项目不存在: ${projectId}`, 404)
      }
      const existing = curr.projects[idx]!
      const seen = new Set(existing.files.map(f => f.path.toLowerCase()))
      const now = Date.now()
      const nextFiles = [...existing.files]
      for (const raw of filePaths) {
        const normalized = normalizeLocalPath(raw)
        if (!normalized) continue
        if (seen.has(normalized.toLowerCase())) continue
        seen.add(normalized.toLowerCase())
        const fileRef: MaterialFileRef = {
          id: newId('vcfile'),
          path: normalized,
          name: path.basename(normalized),
          addedAt: now,
        }
        nextFiles.push(fileRef)
        added.push(fileRef)
      }
      const nextProject: MaterialProject = {
        ...existing,
        files: nextFiles,
        updatedAt: now,
      }
      const nextProjects = [...curr.projects]
      nextProjects[idx] = nextProject
      return { ...curr, projects: nextProjects }
    })

    const project = nextState.projects.find(p => p.id === projectId)!
    return { project, added }
  }

  async function removeFileFromProject(
    projectId: string,
    fileId: string,
  ): Promise<MaterialProject> {
    const nextState = await projectsStore.update(curr => {
      const idx = curr.projects.findIndex(p => p.id === projectId)
      if (idx < 0) {
        throw new FolioError('project_not_found', `物料项目不存在: ${projectId}`, 404)
      }
      const existing = curr.projects[idx]!
      const nextFiles = existing.files.filter(f => f.id !== fileId)
      const nextProject: MaterialProject = {
        ...existing,
        files: nextFiles,
        updatedAt: Date.now(),
      }
      const nextProjects = [...curr.projects]
      nextProjects[idx] = nextProject
      return { ...curr, projects: nextProjects }
    })
    return nextState.projects.find(p => p.id === projectId)!
  }

  async function getFileSidecar(filePath: string): Promise<Record<string, PageSidecarEntry>> {
    const key = normalizeLocalPath(filePath).toLowerCase()
    const meta = await pageMetaStore.read()
    return meta.files[key] ?? {}
  }

  async function setPageSidecar(filePath: string, entry: PageSidecarEntry): Promise<PageMetaState> {
    const key = normalizeLocalPath(filePath).toLowerCase()
    return pageMetaStore.update(curr => ({
      ...curr,
      files: {
        ...curr.files,
        [key]: {
          ...(curr.files[key] ?? {}),
          [entry.artboardKey]: entry,
        },
      },
    }))
  }

  async function removePageSidecar(filePath: string, artboardKey: string): Promise<void> {
    const key = normalizeLocalPath(filePath).toLowerCase()
    await pageMetaStore.update(curr => {
      const fileMap = curr.files[key]
      if (!fileMap || !(artboardKey in fileMap)) return curr
      const nextMap = { ...fileMap }
      delete nextMap[artboardKey]
      return {
        ...curr,
        files: {
          ...curr.files,
          [key]: nextMap,
        },
      }
    })
  }

  async function getCatalog(projectId?: string | null): Promise<{
    readonly defaultOptions: readonly MaterialOptionItem[]
    readonly defaultTemplates: readonly MaterialTemplateItem[]
    readonly projectOptions: readonly MaterialOptionItem[]
    readonly projectTemplates: readonly MaterialTemplateItem[]
  }> {
    const state = await catalogStore.read()
    const bucket = projectId ? state.projectData[projectId] : undefined
    return {
      defaultOptions: [...state.defaultOptions].sort((a, b) => a.sortOrder - b.sortOrder),
      defaultTemplates: [...state.defaultTemplates].sort((a, b) => a.sortOrder - b.sortOrder),
      projectOptions: [...(bucket?.options ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
      projectTemplates: [...(bucket?.templates ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    }
  }

  async function upsertOption(input: {
    readonly scope: MaterialDataScope
    readonly projectId?: string
    readonly id?: string
    readonly category: MaterialFieldCategory
    readonly label?: string
    readonly value: string
    readonly description?: string
    readonly sortOrder?: number
  }): Promise<CatalogState> {
    const value = input.value.trim()
    if (!value) throw new FolioError('invalid_input', '选项值不能为空', 400)
    const label = (input.label?.trim() || value)
    const description = (input.description ?? '').trim()
    const now = Date.now()

    return catalogStore.update(curr => {
      if (input.scope === 'default') {
        const list = [...curr.defaultOptions]
        const idx = input.id
          ? list.findIndex(o => o.id === input.id)
          : list.findIndex(o => o.category === input.category && o.value === value)
        const item: MaterialOptionItem =
          idx >= 0
            ? {
                ...list[idx]!,
                category: input.category,
                label,
                value,
                description,
                sortOrder: input.sortOrder ?? list[idx]!.sortOrder,
                updatedAt: now,
              }
            : {
                id: newId('opt'),
                category: input.category,
                label,
                value,
                description,
                sortOrder: input.sortOrder ?? list.length + 1,
                createdAt: now,
                updatedAt: now,
              }
        if (idx >= 0) list[idx] = item
        else list.push(item)
        return { ...curr, defaultOptions: list }
      }

      if (!input.projectId) {
        throw new FolioError('project_required', '项目数据操作需要指定 projectId', 400)
      }
      const bucket = curr.projectData[input.projectId] ?? { options: [], templates: [] }
      const list = [...bucket.options]
      const idx = input.id
        ? list.findIndex(o => o.id === input.id)
        : list.findIndex(o => o.category === input.category && o.value === value)
      const item: MaterialOptionItem =
        idx >= 0
          ? {
              ...list[idx]!,
              category: input.category,
              label,
              value,
              description,
              sortOrder: input.sortOrder ?? list[idx]!.sortOrder,
              updatedAt: now,
            }
          : {
              id: newId('popt'),
              category: input.category,
              label,
              value,
              description,
              sortOrder: input.sortOrder ?? list.length + 1,
              createdAt: now,
              updatedAt: now,
            }
      if (idx >= 0) list[idx] = item
      else list.push(item)
      return {
        ...curr,
        projectData: {
          ...curr.projectData,
          [input.projectId]: { ...bucket, options: list },
        },
      }
    })
  }

  async function deleteOptions(input: {
    readonly scope: MaterialDataScope
    readonly projectId?: string
    readonly ids: readonly string[]
  }): Promise<CatalogState> {
    const idSet = new Set(input.ids)
    return catalogStore.update(curr => {
      if (input.scope === 'default') {
        return {
          ...curr,
          defaultOptions: curr.defaultOptions.filter(o => !idSet.has(o.id)),
        }
      }
      if (!input.projectId) {
        throw new FolioError('project_required', '项目数据操作需要指定 projectId', 400)
      }
      const bucket = curr.projectData[input.projectId] ?? { options: [], templates: [] }
      return {
        ...curr,
        projectData: {
          ...curr.projectData,
          [input.projectId]: {
            ...bucket,
            options: bucket.options.filter(o => !idSet.has(o.id)),
          },
        },
      }
    })
  }

  async function copyOption(input: {
    readonly id: string
    readonly fromScope: MaterialDataScope
    readonly toScope: MaterialDataScope
    readonly projectId: string
  }): Promise<CatalogState> {
    const curr = await catalogStore.read()
    const sourceList =
      input.fromScope === 'default'
        ? curr.defaultOptions
        : (curr.projectData[input.projectId]?.options ?? [])
    const found = sourceList.find(o => o.id === input.id)
    if (!found) {
      throw new FolioError('not_found', `未找到物料选项: ${input.id}`, 404)
    }
    return upsertOption({
      scope: input.toScope,
      projectId: input.projectId,
      category: found.category,
      label: found.label,
      value: found.value,
      description: found.description,
    })
  }

  async function upsertTemplate(input: {
    readonly scope: MaterialDataScope
    readonly projectId?: string
    readonly id?: string
    readonly name: string
    readonly title?: string
    readonly material?: string
    readonly craft?: string
    readonly size?: string
    readonly quantity?: string
    readonly note?: string
    readonly showProjectName?: boolean
    readonly sortOrder?: number
  }): Promise<CatalogState> {
    const name = input.name.trim()
    if (!name) throw new FolioError('invalid_input', '模板名称不能为空', 400)
    const now = Date.now()

    return catalogStore.update(curr => {
      if (input.scope === 'default') {
        const list = [...curr.defaultTemplates]
        const idx = input.id ? list.findIndex(t => t.id === input.id) : -1
        const item: MaterialTemplateItem =
          idx >= 0
            ? {
                ...list[idx]!,
                name,
                title: (input.title ?? '').trim(),
                material: (input.material ?? '').trim(),
                craft: (input.craft ?? '').trim(),
                size: (input.size ?? '').trim(),
                quantity: (input.quantity ?? '').trim(),
                note: (input.note ?? '').trim(),
                showProjectName: Boolean(input.showProjectName),
                sortOrder: input.sortOrder ?? list[idx]!.sortOrder,
                updatedAt: now,
              }
            : {
                id: newId('tpl'),
                name,
                title: (input.title ?? '').trim(),
                material: (input.material ?? '').trim(),
                craft: (input.craft ?? '').trim(),
                size: (input.size ?? '').trim(),
                quantity: (input.quantity ?? '').trim(),
                note: (input.note ?? '').trim(),
                showProjectName: Boolean(input.showProjectName),
                sortOrder: input.sortOrder ?? list.length + 1,
                createdAt: now,
                updatedAt: now,
              }
        if (idx >= 0) list[idx] = item
        else list.push(item)
        return { ...curr, defaultTemplates: list }
      }

      if (!input.projectId) {
        throw new FolioError('project_required', '项目模板操作需要指定 projectId', 400)
      }
      const bucket = curr.projectData[input.projectId] ?? { options: [], templates: [] }
      const list = [...bucket.templates]
      const idx = input.id ? list.findIndex(t => t.id === input.id) : -1
      const item: MaterialTemplateItem =
        idx >= 0
          ? {
              ...list[idx]!,
              name,
              title: (input.title ?? '').trim(),
              material: (input.material ?? '').trim(),
              craft: (input.craft ?? '').trim(),
              size: (input.size ?? '').trim(),
              quantity: (input.quantity ?? '').trim(),
              note: (input.note ?? '').trim(),
              showProjectName: Boolean(input.showProjectName),
              sortOrder: input.sortOrder ?? list[idx]!.sortOrder,
              updatedAt: now,
            }
          : {
              id: newId('ptpl'),
              name,
              title: (input.title ?? '').trim(),
              material: (input.material ?? '').trim(),
              craft: (input.craft ?? '').trim(),
              size: (input.size ?? '').trim(),
              quantity: (input.quantity ?? '').trim(),
              note: (input.note ?? '').trim(),
              showProjectName: Boolean(input.showProjectName),
              sortOrder: input.sortOrder ?? list.length + 1,
              createdAt: now,
              updatedAt: now,
            }
      if (idx >= 0) list[idx] = item
      else list.push(item)
      return {
        ...curr,
        projectData: {
          ...curr.projectData,
          [input.projectId]: { ...bucket, templates: list },
        },
      }
    })
  }

  async function deleteTemplates(input: {
    readonly scope: MaterialDataScope
    readonly projectId?: string
    readonly ids: readonly string[]
  }): Promise<CatalogState> {
    const idSet = new Set(input.ids)
    return catalogStore.update(curr => {
      if (input.scope === 'default') {
        return {
          ...curr,
          defaultTemplates: curr.defaultTemplates.filter(t => !idSet.has(t.id)),
        }
      }
      if (!input.projectId) {
        throw new FolioError('project_required', '项目模板操作需要指定 projectId', 400)
      }
      const bucket = curr.projectData[input.projectId] ?? { options: [], templates: [] }
      return {
        ...curr,
        projectData: {
          ...curr.projectData,
          [input.projectId]: {
            ...bucket,
            templates: bucket.templates.filter(t => !idSet.has(t.id)),
          },
        },
      }
    })
  }

  async function copyTemplate(input: {
    readonly id: string
    readonly fromScope: MaterialDataScope
    readonly toScope: MaterialDataScope
    readonly projectId: string
  }): Promise<CatalogState> {
    const curr = await catalogStore.read()
    const sourceList =
      input.fromScope === 'default'
        ? curr.defaultTemplates
        : (curr.projectData[input.projectId]?.templates ?? [])
    const found = sourceList.find(t => t.id === input.id)
    if (!found) {
      throw new FolioError('not_found', `未找到物料模板: ${input.id}`, 404)
    }
    return upsertTemplate({
      scope: input.toScope,
      projectId: input.projectId,
      name: found.name,
      title: found.title,
      material: found.material,
      craft: found.craft,
      size: found.size,
      quantity: found.quantity,
      note: found.note,
      showProjectName: found.showProjectName,
    })
  }

  async function resetDefaults(): Promise<CatalogState> {
    const seeded = createDefaultCatalog()
    return catalogStore.update(curr => ({
      ...curr,
      defaultOptions: seeded.defaultOptions,
      defaultTemplates: seeded.defaultTemplates,
    }))
  }

  async function getSettings(): Promise<MaterialsSettings> {
    return settingsStore.read()
  }

  async function updateSettings(patch: Partial<MaterialsSettings>): Promise<MaterialsSettings> {
    return settingsStore.update(curr => ({
      ...curr,
      ...patch,
    }))
  }

  return {
    listProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    addFilesToProject,
    removeFileFromProject,
    getFileSidecar,
    setPageSidecar,
    removePageSidecar,
    getCatalog,
    upsertOption,
    deleteOptions,
    copyOption,
    upsertTemplate,
    deleteTemplates,
    copyTemplate,
    resetDefaults,
    getSettings,
    updateSettings,
  }
}

export type MaterialsStore = ReturnType<typeof createMaterialsStore>
