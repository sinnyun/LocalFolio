import fsp from 'node:fs/promises'
import {
  A3_LANDSCAPE_HEIGHT_PT,
  A3_LANDSCAPE_WIDTH_PT,
  HEADER_LAYER_NAME,
  LEGACY_HEADER_LAYER_NAME,
  type MaterialFields,
  type MaterialPageSummary,
  type PageSidecarEntry,
  type VectorCraftSymbolicCommand,
} from './types.js'

const PT_PER_MM = 72 / 25.4
const A3_TOLERANCE_PT = 2.5

export function formatPageNumber(index: number): string {
  return String(Math.max(0, index) + 1).padStart(2, '0')
}

export function ptToMm(pt: number): number {
  return Math.round((pt / PT_PER_MM) * 10) / 10
}

export function isA3LandscapeSize(widthPt: number, heightPt: number): boolean {
  return (
    Math.abs(widthPt - A3_LANDSCAPE_WIDTH_PT) <= A3_TOLERANCE_PT &&
    Math.abs(heightPt - A3_LANDSCAPE_HEIGHT_PT) <= A3_TOLERANCE_PT
  )
}

export function formatSpecLine(
  fields: Pick<MaterialFields, 'material' | 'craft' | 'size' | 'quantity' | 'note'>,
): string {
  return [fields.material, fields.craft, fields.size, fields.quantity, fields.note]
    .map(part => part.trim())
    .filter(Boolean)
    .join(' | ')
}

function stripOptionalPrefix(segment: string, prefixes: readonly string[]): string {
  const trimmed = segment.trim()
  for (const prefix of prefixes) {
    const re = new RegExp(`^${prefix}\\s*[:：]?\\s*`, 'i')
    if (re.test(trimmed)) {
      return trimmed.replace(re, '').trim()
    }
  }
  return trimmed
}

export function parseSpecLine(
  specText: string,
): Pick<MaterialFields, 'material' | 'craft' | 'size' | 'quantity' | 'note'> {
  const rawParts = specText
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)

  if (rawParts.length === 0) {
    return { material: '', craft: '', size: '', quantity: '', note: '' }
  }

  return {
    material: stripOptionalPrefix(rawParts[0] ?? '', ['材质']),
    craft: stripOptionalPrefix(rawParts[1] ?? '', ['工艺']),
    size: stripOptionalPrefix(rawParts[2] ?? '', ['尺寸', '规格']),
    quantity: stripOptionalPrefix(rawParts[3] ?? '', ['数量']),
    note: rawParts
      .slice(4)
      .map(s => stripOptionalPrefix(s, ['备注']))
      .filter(Boolean)
      .join(' | '),
  }
}

export function extractVectorCraftJson(buffer: Buffer): Record<string, unknown> {
  const marker = Buffer.from('VCBLOBS')
  const markerIdx = buffer.indexOf(marker)
  const slice = markerIdx >= 0 ? buffer.subarray(0, markerIdx) : buffer
  const text = slice.toString('utf8')
  const lastBrace = text.lastIndexOf('}')
  if (lastBrace < 0) {
    throw new Error('无效的 VectorCraft 文件：未找到 JSON 文档结尾')
  }
  return JSON.parse(text.slice(0, lastBrace + 1)) as Record<string, unknown>
}

interface RawPoint {
  readonly p?: readonly [number, number]
}

interface RawSubpath {
  readonly anchors?: readonly RawPoint[]
}

interface RawNode {
  readonly id?: number
  readonly name?: string
  readonly locked?: boolean
  readonly visible?: boolean
  readonly kind?: {
    readonly type?: string
    readonly children?: readonly RawNode[]
    readonly runs?: readonly { readonly text?: string }[]
    readonly xf?: readonly number[]
    readonly path?: {
      readonly subpaths?: readonly RawSubpath[]
    }
    readonly live?: {
      readonly xf?: readonly number[]
      readonly w?: number
      readonly h?: number
    }
  }
}

interface RawArtboard {
  readonly id?: number
  readonly name?: string
  readonly rect?: {
    readonly x0?: number
    readonly y0?: number
    readonly x1?: number
    readonly y1?: number
  }
}

interface ExtractedBounds {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

function collectBounds(node: RawNode, acc: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  let found = false
  const k = node.kind
  if (!k) return false

  if (k.type === 'text' && Array.isArray(k.xf) && k.xf.length >= 6) {
    const x = Number(k.xf[4])
    const y = Number(k.xf[5])
    if (Number.isFinite(x) && Number.isFinite(y)) {
      acc.minX = Math.min(acc.minX, x)
      acc.minY = Math.min(acc.minY, y)
      acc.maxX = Math.max(acc.maxX, x)
      acc.maxY = Math.max(acc.maxY, y)
      found = true
    }
  }

  if (k.live && Array.isArray(k.live.xf) && k.live.xf.length >= 6) {
    const x = Number(k.live.xf[4])
    const y = Number(k.live.xf[5])
    const w = Number(k.live.w ?? 0)
    const h = Number(k.live.h ?? 0)
    if (Number.isFinite(x) && Number.isFinite(y)) {
      acc.minX = Math.min(acc.minX, x)
      acc.minY = Math.min(acc.minY, y)
      acc.maxX = Math.max(acc.maxX, x + w)
      acc.maxY = Math.max(acc.maxY, y + h)
      found = true
    }
  }

  if (k.path?.subpaths) {
    for (const sp of k.path.subpaths) {
      for (const anchor of sp.anchors ?? []) {
        const px = Number(anchor.p?.[0])
        const py = Number(anchor.p?.[1])
        if (Number.isFinite(px) && Number.isFinite(py)) {
          acc.minX = Math.min(acc.minX, px)
          acc.minY = Math.min(acc.minY, py)
          acc.maxX = Math.max(acc.maxX, px)
          acc.maxY = Math.max(acc.maxY, py)
          found = true
        }
      }
    }
  }

  if (Array.isArray(k.children)) {
    for (const child of k.children) {
      if (collectBounds(child, acc)) found = true
    }
  }

  return found
}

function getNodeBounds(node: RawNode): ExtractedBounds | null {
  const acc = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  }
  if (!collectBounds(node, acc)) return null
  return acc
}

function readTextContent(node: RawNode): string {
  const runs = node.kind?.runs
  if (!Array.isArray(runs)) return ''
  return runs.map(r => String(r.text ?? '')).join('')
}

function findNamedTexts(node: RawNode, out: Map<string, string>): void {
  if (node.kind?.type === 'text' && node.name) {
    out.set(node.name, readTextContent(node))
  }
  if (Array.isArray(node.kind?.children)) {
    for (const child of node.kind.children) {
      findNamedTexts(child, out)
    }
  }
}

interface ParsedHeaderGroup {
  readonly id: number
  readonly name: string
  readonly locked: boolean
  readonly layerName: string
  readonly centerX: number
  readonly centerY: number
  readonly texts: Map<string, string>
}

function collectHeaderGroups(layers: readonly RawNode[]): ParsedHeaderGroup[] {
  const groups: ParsedHeaderGroup[] = []
  for (const layer of layers) {
    const layerName = String(layer.name ?? '')
    const isHeaderLayer =
      layerName === HEADER_LAYER_NAME || layerName === LEGACY_HEADER_LAYER_NAME
    const children = layer.kind?.children ?? []
    for (const node of children) {
      const nodeName = String(node.name ?? '')
      const isHeaderGroup =
        nodeName.startsWith('LF_MATERIAL_HEADER_') ||
        nodeName.startsWith('MEDSH_MATERIAL_HEADER_') ||
        (isHeaderLayer && node.kind?.type === 'group')
      if (!isHeaderGroup || typeof node.id !== 'number') continue
      const bounds = getNodeBounds(node)
      if (!bounds) continue
      const texts = new Map<string, string>()
      findNamedTexts(node, texts)
      groups.push({
        id: node.id,
        name: nodeName,
        locked: Boolean(node.locked),
        layerName,
        centerX: (bounds.minX + bounds.maxX) / 2,
        centerY: (bounds.minY + bounds.maxY) / 2,
        texts,
      })
    }
  }
  return groups
}

export interface ParsedVectorCraftDoc {
  readonly documentTitle: string
  readonly hasHeaderLayer: boolean
  readonly headerLayerId: number | null
  readonly headerLayerNames: readonly string[]
  readonly pages: readonly MaterialPageSummary[]
  readonly headerGroupsByArtboardIndex: ReadonlyMap<number, readonly ParsedHeaderGroup[]>
}

export function parseVectorCraftObject(
  rootObj: Record<string, unknown>,
  fileMeta: {
    readonly fileId: string
    readonly filePath: string
    readonly fileName: string
    readonly sidecarEntries?: Readonly<Record<string, PageSidecarEntry>>
  },
): ParsedVectorCraftDoc {
  const doc = (rootObj.document ?? rootObj) as {
    readonly title?: string
    readonly artboards?: readonly RawArtboard[]
    readonly layers?: readonly RawNode[]
  }

  const documentTitle = String(doc.title ?? fileMeta.fileName.replace(/\.vectorcraft$/i, ''))
  const rawArtboards = Array.isArray(doc.artboards) ? doc.artboards : []
  const rawLayers = Array.isArray(doc.layers) ? doc.layers : []
  const headerLayerNames = rawLayers
    .map(l => String(l.name ?? ''))
    .filter(n => n === HEADER_LAYER_NAME || n === LEGACY_HEADER_LAYER_NAME)

  const headerGroups = collectHeaderGroups(rawLayers)
  const headerGroupsByArtboardIndex = new Map<number, ParsedHeaderGroup[]>()

  const pages: MaterialPageSummary[] = rawArtboards.map((ab, idx) => {
    const x0 = Number(ab.rect?.x0 ?? 0)
    const y0 = Number(ab.rect?.y0 ?? 0)
    const x1 = Number(ab.rect?.x1 ?? A3_LANDSCAPE_WIDTH_PT)
    const y1 = Number(ab.rect?.y1 ?? A3_LANDSCAPE_HEIGHT_PT)
    const widthPt = Math.max(1, x1 - x0)
    const heightPt = Math.max(1, y1 - y0)
    const artboardId = typeof ab.id === 'number' ? ab.id : idx + 1
    const artboardKey = `id:${artboardId}`
    const artboardName = String(ab.name ?? `第 ${idx + 1} 页`)
    const pageNumber = formatPageNumber(idx)

    const matchedGroups = headerGroups.filter(
      g => g.centerX >= x0 && g.centerX <= x1 && g.centerY >= y0 && g.centerY <= y1,
    )
    headerGroupsByArtboardIndex.set(idx, matchedGroups)

    const primaryGroup =
      matchedGroups.find(g => g.name.startsWith('LF_MATERIAL_HEADER_')) ??
      matchedGroups.find(g => g.name.startsWith('MEDSH_MATERIAL_HEADER_')) ??
      matchedGroups[0] ??
      null

    const sidecar = fileMeta.sidecarEntries?.[artboardKey]

    if (primaryGroup) {
      const liveTitle =
        primaryGroup.texts.get('LF_PAGE_TITLE') ??
        primaryGroup.texts.get('MEDSH_PAGE_TITLE') ??
        artboardName
      const liveProjRaw =
        primaryGroup.texts.get('LF_PROJECT_NAME') ??
        primaryGroup.texts.get('MEDSH_PROJECT_NAME') ??
        ''
      const liveProjClean = liveProjRaw.replace(/^-\s*/, '').trim()
      const liveSpecText =
        primaryGroup.texts.get('LF_MATERIAL_SPEC') ??
        primaryGroup.texts.get('MEDSH_FIELDS') ??
        ''

      const matchesSidecar =
        sidecar !== undefined &&
        sidecar.lastRenderedSpecText.trim() === liveSpecText.trim() &&
        (sidecar.lastRenderedTitle === liveTitle || liveTitle === artboardName)

      if (matchesSidecar && sidecar) {
        return {
          fileId: fileMeta.fileId,
          filePath: fileMeta.filePath,
          fileName: fileMeta.fileName,
          artboardIndex: idx,
          artboardId,
          artboardKey,
          artboardName,
          pageNumber,
          x: x0,
          y: y0,
          widthPt,
          heightPt,
          widthMm: ptToMm(widthPt),
          heightMm: ptToMm(heightPt),
          isA3Landscape: isA3LandscapeSize(widthPt, heightPt),
          hasMaterialHeader: true,
          headerGroupId: primaryGroup.id,
          headerLocked: primaryGroup.locked,
          specText: liveSpecText,
          syncSource: 'header',
          fields: {
            ...sidecar.fields,
            title: liveTitle,
          },
        }
      }

      const parsedSpec = parseSpecLine(liveSpecText)
      const isLiveEdited =
        sidecar !== undefined && sidecar.lastRenderedSpecText.trim() !== liveSpecText.trim()

      return {
        fileId: fileMeta.fileId,
        filePath: fileMeta.filePath,
        fileName: fileMeta.fileName,
        artboardIndex: idx,
        artboardId,
        artboardKey,
        artboardName,
        pageNumber,
        x: x0,
        y: y0,
        widthPt,
        heightPt,
        widthMm: ptToMm(widthPt),
        heightMm: ptToMm(heightPt),
        isA3Landscape: isA3LandscapeSize(widthPt, heightPt),
        hasMaterialHeader: true,
        headerGroupId: primaryGroup.id,
        headerLocked: primaryGroup.locked,
        specText: liveSpecText,
        syncSource: isLiveEdited ? 'live-edited' : 'header',
        fields: {
          title: liveTitle,
          showProjectName: liveProjClean.length > 0 || Boolean(sidecar?.fields.showProjectName),
          projectNameOverride: liveProjClean || sidecar?.fields.projectNameOverride || '',
          ...parsedSpec,
        },
      }
    }

    if (sidecar) {
      return {
        fileId: fileMeta.fileId,
        filePath: fileMeta.filePath,
        fileName: fileMeta.fileName,
        artboardIndex: idx,
        artboardId,
        artboardKey,
        artboardName,
        pageNumber,
        x: x0,
        y: y0,
        widthPt,
        heightPt,
        widthMm: ptToMm(widthPt),
        heightMm: ptToMm(heightPt),
        isA3Landscape: isA3LandscapeSize(widthPt, heightPt),
        hasMaterialHeader: false,
        headerGroupId: null,
        headerLocked: false,
        specText: formatSpecLine(sidecar.fields),
        syncSource: 'sidecar',
        fields: sidecar.fields,
      }
    }

    return {
      fileId: fileMeta.fileId,
      filePath: fileMeta.filePath,
      fileName: fileMeta.fileName,
      artboardIndex: idx,
      artboardId,
      artboardKey,
      artboardName,
      pageNumber,
      x: x0,
      y: y0,
      widthPt,
      heightPt,
      widthMm: ptToMm(widthPt),
      heightMm: ptToMm(heightPt),
      isA3Landscape: isA3LandscapeSize(widthPt, heightPt),
      hasMaterialHeader: false,
      headerGroupId: null,
      headerLocked: false,
      specText: '',
      syncSource: 'empty',
      fields: {
        title: artboardName,
        showProjectName: false,
        projectNameOverride: '',
        material: '',
        craft: '',
        size: '',
        quantity: '',
        note: '',
      },
    }
  })

  const headerLayerNode = rawLayers.find(l => String(l.name ?? '') === HEADER_LAYER_NAME)
  const headerLayerId = typeof headerLayerNode?.id === 'number' ? headerLayerNode.id : null

  return {
    documentTitle,
    hasHeaderLayer: Boolean(headerLayerNode),
    headerLayerId,
    headerLayerNames,
    pages,
    headerGroupsByArtboardIndex,
  }
}

export async function parseVectorCraftDocument(
  filePath: string,
  fileMeta: {
    readonly fileId: string
    readonly fileName: string
    readonly sidecarEntries?: Readonly<Record<string, PageSidecarEntry>>
  },
): Promise<ParsedVectorCraftDoc> {
  const buf = await fsp.readFile(filePath)
  const json = extractVectorCraftJson(buf)
  return parseVectorCraftObject(json, {
    fileId: fileMeta.fileId,
    filePath,
    fileName: fileMeta.fileName,
    sidecarEntries: fileMeta.sidecarEntries,
  })
}

function estimateTextWidthPt(text: string, fontSizePt: number): number {
  let width = 0
  for (const ch of text) {
    width += ch.charCodeAt(0) > 127 ? fontSizePt : fontSizePt * 0.56
  }
  return width
}

export interface BuildArtboardHeaderOptions {
  readonly artboardIndex: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly fields: MaterialFields
  readonly projectDisplayName: string
  readonly existingHeaderGroups: readonly { readonly id: number; readonly locked: boolean }[]
  readonly renameArtboard?: boolean
}

export function buildEnsureHeaderLayerCommands(
  headerLayerId: number | null,
): VectorCraftSymbolicCommand[] {
  if (headerLayerId !== null) {
    return [{ command: 'layer.setCurrent', params: { id: headerLayerId } }]
  }
  return [{ command: 'layer.new', params: { name: HEADER_LAYER_NAME } }]
}

export function buildHeaderCommandsForArtboard(
  opts: BuildArtboardHeaderOptions,
): VectorCraftSymbolicCommand[] {
  const cmds: VectorCraftSymbolicCommand[] = []
  const tag = `ab${opts.artboardIndex}`

  for (const existing of opts.existingHeaderGroups) {
    if (existing.locked) {
      cmds.push({
        command: 'object.setProps',
        params: { id: existing.id, locked: false },
      })
    }
    cmds.push({
      command: 'edit.clear',
      params: { ids: [existing.id] },
    })
  }

  const pageNumber = formatPageNumber(opts.artboardIndex)
  const titleText = opts.fields.title.trim() || `第 ${pageNumber} 页`
  const projectLabel = opts.fields.projectNameOverride.trim() || opts.projectDisplayName.trim()
  const showProject = Boolean(opts.fields.showProjectName && projectLabel)
  const specText = formatSpecLine(opts.fields) || '待填写物料信息'

  if (opts.renameArtboard && titleText) {
    cmds.push({
      command: 'artboard.rename',
      params: { index: opts.artboardIndex, name: titleText },
    })
  }

  const bandX = opts.x + 16
  const bandY = opts.y + 16
  const bandW = Math.max(120, opts.width - 32)
  const bandH = 52

  // 1. Background band
  cmds.push({
    command: 'shape.rectangle',
    params: { x: bandX, y: bandY, width: bandW, height: bandH, radius: 6 },
    captureAs: `${tag}_band`,
  })
  cmds.push({
    command: 'paint.setFill',
    params: { id: `$ref:${tag}_band`, color: '#EEF4FD' },
  })
  cmds.push({
    command: 'paint.setStroke',
    params: { id: `$ref:${tag}_band`, color: '#D8E5F4' },
  })
  cmds.push({
    command: 'stroke.set',
    params: { id: `$ref:${tag}_band`, weight: 0.75 },
  })
  cmds.push({
    command: 'object.setProps',
    params: { id: `$ref:${tag}_band`, name: 'LF_MATERIAL_BAND' },
  })

  // 2. Page number pill badge
  cmds.push({
    command: 'shape.rectangle',
    params: { x: opts.x + 26, y: opts.y + 28, width: 32, height: 28, radius: 4 },
    captureAs: `${tag}_badge`,
  })
  cmds.push({
    command: 'paint.setFill',
    params: { id: `$ref:${tag}_badge`, color: '#FFFFFF' },
  })
  cmds.push({
    command: 'paint.setStroke',
    params: { id: `$ref:${tag}_badge`, color: '#CBD5E1' },
  })
  cmds.push({
    command: 'stroke.set',
    params: { id: `$ref:${tag}_badge`, weight: 0.75 },
  })
  cmds.push({
    command: 'object.setProps',
    params: { id: `$ref:${tag}_badge`, name: 'LF_NUMBER_BADGE' },
  })

  // 3. Sequential page number text
  cmds.push({
    command: 'text.create',
    params: {
      x: opts.x + 42,
      y: opts.y + 46,
      text: pageNumber,
      font: 'Microsoft YaHei',
      style: 'Bold',
      size: 12,
      color: '#0F172A',
      justify: 'center',
    },
    captureAs: `${tag}_num`,
  })
  cmds.push({
    command: 'object.setProps',
    params: { id: `$ref:${tag}_num`, name: 'LF_PAGE_NUMBER' },
  })

  // 4. Title text
  const titleX = opts.x + 70
  cmds.push({
    command: 'text.create',
    params: {
      x: titleX,
      y: opts.y + 48,
      text: titleText,
      font: 'Microsoft YaHei',
      style: 'Bold',
      size: 18,
      color: '#0F172A',
      justify: 'left',
    },
    captureAs: `${tag}_title`,
  })
  cmds.push({
    command: 'object.setProps',
    params: { id: `$ref:${tag}_title`, name: 'LF_PAGE_TITLE' },
  })

  const groupMembers = [
    `$ref:${tag}_band`,
    `$ref:${tag}_badge`,
    `$ref:${tag}_num`,
    `$ref:${tag}_title`,
  ]

  // 5. Optional project name text
  if (showProject) {
    const projX = titleX + estimateTextWidthPt(titleText, 18) + 12
    cmds.push({
      command: 'text.create',
      params: {
        x: projX,
        y: opts.y + 47,
        text: `- ${projectLabel}`,
        font: 'Microsoft YaHei',
        style: 'Regular',
        size: 12,
        color: '#475569',
        justify: 'left',
      },
      captureAs: `${tag}_proj`,
    })
    cmds.push({
      command: 'object.setProps',
      params: { id: `$ref:${tag}_proj`, name: 'LF_PROJECT_NAME' },
    })
    groupMembers.push(`$ref:${tag}_proj`)
  }

  // 6. Right-side consolidated material spec text
  cmds.push({
    command: 'text.create',
    params: {
      x: opts.x + opts.width - 28,
      y: opts.y + 46,
      text: specText,
      font: 'Microsoft YaHei',
      style: 'Regular',
      size: 13,
      color: '#1E293B',
      justify: 'right',
    },
    captureAs: `${tag}_spec`,
  })
  cmds.push({
    command: 'object.setProps',
    params: { id: `$ref:${tag}_spec`, name: 'LF_MATERIAL_SPEC' },
  })
  groupMembers.push(`$ref:${tag}_spec`)

  // 7. Group & lock
  cmds.push({
    command: 'object.group',
    params: { ids: groupMembers },
    captureAs: `${tag}_group`,
  })
  cmds.push({
    command: 'object.setProps',
    params: {
      id: `$ref:${tag}_group`,
      name: `LF_MATERIAL_HEADER_${opts.artboardIndex + 1}`,
      locked: true,
    },
  })

  return cmds
}
