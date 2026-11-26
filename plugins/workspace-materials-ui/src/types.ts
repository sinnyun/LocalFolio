export type MaterialsViewLayer = 'pages' | 'editor' | 'data'
export type MaterialFieldCategory = 'title' | 'material' | 'craft' | 'size' | 'quantity' | 'note'
export type MaterialDataScope = 'default' | 'project'
export type ExportFormat = 'png' | 'jpg' | 'webp' | 'svg' | 'pdf-merged' | 'pdf-separate'

export interface MaterialFields {
  readonly title: string
  readonly showProjectName: boolean
  readonly projectNameOverride: string
  readonly material: string
  readonly craft: string
  readonly size: string
  readonly quantity: string
  readonly note: string
}

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

export interface MaterialFileRef {
  readonly id: string
  readonly path: string
  readonly name: string
  readonly addedAt: number
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

export interface MaterialProject {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly files: readonly MaterialFileRef[]
  readonly createdAt: number
  readonly updatedAt: number
}

export interface ProjectsState {
  readonly version: 1
  readonly activeProjectId: string | null
  readonly projects: readonly MaterialProject[]
}

export interface MaterialOptionItem {
  readonly id: string
  readonly category: MaterialFieldCategory
  readonly label: string
  readonly value: string
  readonly description: string
  readonly sortOrder: number
  readonly createdAt: number
  readonly updatedAt: number
}

export interface MaterialTemplateItem {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly material: string
  readonly craft: string
  readonly size: string
  readonly quantity: string
  readonly note: string
  readonly showProjectName: boolean
  readonly sortOrder: number
  readonly createdAt: number
  readonly updatedAt: number
}

export interface CatalogResponse {
  readonly defaultOptions: readonly MaterialOptionItem[]
  readonly defaultTemplates: readonly MaterialTemplateItem[]
  readonly projectOptions: readonly MaterialOptionItem[]
  readonly projectTemplates: readonly MaterialTemplateItem[]
}

export interface MaterialsSettings {
  readonly version: 1
  readonly cliPath: string
  readonly appPath: string
  readonly controlPort: number
  readonly autoWatchFiles: boolean
  readonly autoPollLiveControl: boolean
  readonly defaultExportDir: string
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

export function makePageKey(fileId: string, artboardIndex: number): string {
  return `${fileId}::${artboardIndex}`
}

export function formatSpecSummary(
  fields: Pick<MaterialFields, 'material' | 'craft' | 'size' | 'quantity' | 'note'>,
): string {
  return [fields.material, fields.craft, fields.size, fields.quantity, fields.note]
    .map(v => v.trim())
    .filter(Boolean)
    .join(' | ')
}

export function buildPreviewUrl(
  filePath: string,
  artboardIndex: number,
  ppi: number,
  cacheBust: number | string,
): string {
  const params = new URLSearchParams({
    path: filePath,
    artboard: String(artboardIndex),
    ppi: String(ppi),
    v: String(cacheBust),
  })
  return `/lf/materials/preview?${params.toString()}`
}
