import { z } from 'zod'

export const A3_LANDSCAPE_WIDTH_PT = 1190.5511811023623
export const A3_LANDSCAPE_HEIGHT_PT = 841.8897637795276
export const ARTBOARD_SPACING_PT = 20
export const DEFAULT_CONTROL_PORT = 7979
export const HEADER_LAYER_NAME = 'LF Material Header'
export const LEGACY_HEADER_LAYER_NAME = 'WorkCrate header'

export const MaterialFieldsSchema = z.object({
  title: z.string().default(''),
  showProjectName: z.boolean().default(false),
  projectNameOverride: z.string().default(''),
  material: z.string().default(''),
  craft: z.string().default(''),
  size: z.string().default(''),
  quantity: z.string().default(''),
  note: z.string().default(''),
})

export type MaterialFields = z.infer<typeof MaterialFieldsSchema>

export const MaterialFieldCategorySchema = z.enum([
  'title',
  'material',
  'craft',
  'size',
  'quantity',
  'note',
])

export type MaterialFieldCategory = z.infer<typeof MaterialFieldCategorySchema>

export const MaterialDataScopeSchema = z.enum(['default', 'project'])
export type MaterialDataScope = z.infer<typeof MaterialDataScopeSchema>

export const MaterialOptionItemSchema = z.object({
  id: z.string().min(1),
  category: MaterialFieldCategorySchema,
  label: z.string().min(1),
  value: z.string().min(1),
  description: z.string().default(''),
  sortOrder: z.number().int().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type MaterialOptionItem = z.infer<typeof MaterialOptionItemSchema>

export const MaterialTemplateItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  title: z.string().default(''),
  material: z.string().default(''),
  craft: z.string().default(''),
  size: z.string().default(''),
  quantity: z.string().default(''),
  note: z.string().default(''),
  showProjectName: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type MaterialTemplateItem = z.infer<typeof MaterialTemplateItemSchema>

export const ProjectCatalogBucketSchema = z.object({
  options: z.array(MaterialOptionItemSchema).default([]),
  templates: z.array(MaterialTemplateItemSchema).default([]),
})

export type ProjectCatalogBucket = z.infer<typeof ProjectCatalogBucketSchema>

export const CatalogStateSchema = z.object({
  version: z.literal(1).default(1),
  defaultOptions: z.array(MaterialOptionItemSchema).default([]),
  defaultTemplates: z.array(MaterialTemplateItemSchema).default([]),
  projectData: z
    .record(z.string(), ProjectCatalogBucketSchema)
    .default((): Record<string, z.infer<typeof ProjectCatalogBucketSchema>> => ({})),
})

export type CatalogState = z.infer<typeof CatalogStateSchema>

export const MaterialFileRefSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  name: z.string().min(1),
  addedAt: z.number(),
})

export type MaterialFileRef = z.infer<typeof MaterialFileRefSchema>

export const MaterialProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  files: z.array(MaterialFileRefSchema).default([]),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type MaterialProject = z.infer<typeof MaterialProjectSchema>

export const ProjectsStateSchema = z.object({
  version: z.literal(1).default(1),
  activeProjectId: z.string().nullable().default(null),
  projects: z.array(MaterialProjectSchema).default([]),
})

export type ProjectsState = z.infer<typeof ProjectsStateSchema>

export const PageSidecarEntrySchema = z.object({
  artboardKey: z.string().min(1),
  fields: MaterialFieldsSchema,
  lastRenderedSpecText: z.string().default(''),
  lastRenderedTitle: z.string().default(''),
  updatedAt: z.number(),
})

export type PageSidecarEntry = z.infer<typeof PageSidecarEntrySchema>

export const PageMetaStateSchema = z.object({
  version: z.literal(1).default(1),
  files: z
    .record(z.string(), z.record(z.string(), PageSidecarEntrySchema))
    .default((): Record<string, Record<string, z.infer<typeof PageSidecarEntrySchema>>> => ({})),
})

export type PageMetaState = z.infer<typeof PageMetaStateSchema>

export const MaterialsSettingsSchema = z.object({
  version: z.literal(1).default(1),
  cliPath: z.string().default(''),
  appPath: z.string().default(''),
  controlPort: z.number().int().min(1024).max(65535).default(DEFAULT_CONTROL_PORT),
  autoWatchFiles: z.boolean().default(true),
  autoPollLiveControl: z.boolean().default(true),
  defaultExportDir: z.string().default(''),
})

export type MaterialsSettings = z.infer<typeof MaterialsSettingsSchema>

export interface MaterialPageSummary {
  readonly fileId: string
  readonly filePath: string
  readonly fileName: string
  readonly artboardIndex: number
  readonly artboardId: number
  readonly artboardKey: string
  readonly artboardName: string
  readonly pageNumber: string
  readonly x: number
  readonly y: number
  readonly widthPt: number
  readonly heightPt: number
  readonly widthMm: number
  readonly heightMm: number
  readonly isA3Landscape: boolean
  readonly hasMaterialHeader: boolean
  readonly headerGroupId: number | null
  readonly headerLocked: boolean
  readonly specText: string
  readonly syncSource: 'header' | 'sidecar' | 'live-edited' | 'empty'
  readonly fields: MaterialFields
}

export interface MaterialFileState {
  readonly fileId: string
  readonly path: string
  readonly name: string
  readonly exists: boolean
  readonly mtimeMs: number
  readonly size: number
  readonly documentTitle: string
  readonly artboardCount: number
  readonly activeInLiveControl: boolean
  readonly dirtyInLiveControl: boolean
  readonly error: string | null
  readonly pages: readonly MaterialPageSummary[]
}

export interface VectorCraftStatus {
  readonly cliPath: string | null
  readonly cliFound: boolean
  readonly cliVersion: string | null
  readonly appPath: string | null
  readonly appFound: boolean
  readonly controlPort: number
  readonly liveConnected: boolean
  readonly liveActiveDocumentPath: string | null
  readonly liveOpenDocuments: readonly {
    readonly index: number
    readonly path: string | null
    readonly title: string
    readonly dirty: boolean
  }[]
  readonly settings: MaterialsSettings
}

export type ExportFormat = 'png' | 'jpg' | 'webp' | 'svg' | 'pdf-merged' | 'pdf-separate'

export const ExportSelectionItemSchema = z.object({
  fileId: z.string().min(1),
  artboardIndex: z.number().int().min(0),
})

export const ExportRequestSchema = z.object({
  projectId: z.string().min(1),
  items: z.array(ExportSelectionItemSchema).min(1),
  format: z.enum(['png', 'jpg', 'webp', 'svg', 'pdf-merged', 'pdf-separate']),
  outputDir: z.string().min(1),
  ppi: z.number().int().min(36).max(600).default(150),
  mergedPdfFileName: z.string().default(''),
  revealAfterExport: z.boolean().default(true),
})

export type ExportRequest = z.infer<typeof ExportRequestSchema>

export interface ExportedFileItem {
  readonly path: string
  readonly format: string
  readonly bytes: number
  readonly warnings: readonly string[]
}

export interface ExportResult {
  readonly outputDir: string
  readonly exported: readonly ExportedFileItem[]
}

export interface VectorCraftSymbolicCommand {
  readonly command: string
  readonly params: Record<string, unknown>
  readonly captureAs?: string
}
