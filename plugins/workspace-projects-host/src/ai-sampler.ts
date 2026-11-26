import fsp from 'node:fs/promises'
import path from 'node:path'
import { FolioError } from '@folio/base-contract'
import { isPathInside, normalizeProjectPath } from './classify.js'
import {
  AiExtractionOutputSchema,
  type AiExtractionOutput,
  type ProjectFileEntry,
  type ProjectManifest,
} from './types.js'

const MAX_TREE_LINES = 80
const MAX_TREE_DEPTH = 3
const MAX_DOC_READ_BYTES = 8192
const MAX_TOTAL_TEXT_CHARS = 2000
const MAX_COVER_CANDIDATES = 15

const TEXT_DOC_EXTS = new Set(['.md', '.mdx', '.txt', '.rst', '.json', '.yaml', '.yml', '.toml'])

export interface ProjectSampleTextSnippet {
  readonly relPath: string
  readonly content: string
}

export interface ProjectSample {
  readonly projectName: string
  readonly fileCount: number
  readonly folderCount: number
  readonly totalBytes: number
  readonly categories: Readonly<Record<string, number>>
  readonly topExtensions: readonly { readonly ext: string; readonly count: number }[]
  readonly treeLines: readonly string[]
  readonly textSnippets: readonly ProjectSampleTextSnippet[]
  readonly coverCandidates: readonly string[]
}

function docPriority(file: ProjectFileEntry): number {
  const lowerRel = file.relPath.toLowerCase()
  const lowerName = file.name.toLowerCase()
  const isRoot = file.folderRelPath === ''
  const rootBoost = isRoot ? 0 : 100

  if (lowerName === 'readme.md' || lowerName === 'readme.txt') return rootBoost + 1
  if (lowerName === '说明.md' || lowerName === '说明.txt') return rootBoost + 2
  if (lowerName.includes('brief') || lowerName.includes('简介') || lowerName.includes('说明')) {
    return rootBoost + 3
  }
  if (lowerName === 'package.json') return rootBoost + 4
  if (lowerRel.endsWith('.md') || lowerRel.endsWith('.txt')) return rootBoost + 10
  return rootBoost + 20
}

function coverPriority(file: ProjectFileEntry): number {
  const lowerName = file.name.toLowerCase()
  const nameBoost =
    lowerName.includes('cover') ||
    lowerName.includes('hero') ||
    lowerName.includes('thumb') ||
    lowerName.includes('preview') ||
    lowerName.includes('封面') ||
    lowerName.includes('主视觉')
      ? 0
      : 10
  if (file.category === 'image') return nameBoost + 1
  if (file.category === 'design') return nameBoost + 2
  if (file.category === 'video') return nameBoost + 3
  if (file.category === 'document') return nameBoost + 4
  return nameBoost + 5
}

async function readSafeTextSnippet(
  absPath: string,
  charBudget: number,
): Promise<string | null> {
  if (charBudget <= 0) return null
  let handle: fsp.FileHandle | null = null
  try {
    handle = await fsp.open(absPath, 'r')
    const buf = Buffer.allocUnsafe(MAX_DOC_READ_BYTES)
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
    if (bytesRead <= 0) return null
    const slice = buf.subarray(0, bytesRead)
    if (slice.includes(0)) return null
    const text = slice.toString('utf8').replace(/\r\n/g, '\n').trim()
    if (!text) return null
    return text.length > charBudget ? `${text.slice(0, charBudget)}…` : text
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => {})
  }
}

export async function buildProjectSample(
  rawProjectPath: string,
  manifest: ProjectManifest,
): Promise<ProjectSample> {
  const projectPath = normalizeProjectPath(rawProjectPath)
  const allFiles: ProjectFileEntry[] = []
  const extCounts = new Map<string, number>()

  for (const group of manifest.groups) {
    for (const file of group.files) {
      allFiles.push(file)
      const extKey = file.ext || '(no-ext)'
      extCounts.set(extKey, (extCounts.get(extKey) ?? 0) + 1)
    }
  }

  const topExtensions = Array.from(extCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([ext, count]) => ({ ext, count }))

  // Bounded directory tree summary (depth <= 3, entries <= 80)
  const treeLines: string[] = []
  for (const group of manifest.groups) {
    if (treeLines.length >= MAX_TREE_LINES) break
    if (group.depth > MAX_TREE_DEPTH) continue
    const folderLabel = group.relPath === '' ? './' : `${group.relPath}/`
    treeLines.push(`${folderLabel} (${group.fileCount} files)`)
    const maxSampleFiles = Math.min(group.files.length, 8)
    for (let i = 0; i < maxSampleFiles && treeLines.length < MAX_TREE_LINES; i += 1) {
      const f = group.files[i]!
      treeLines.push(`  - ${f.name}`)
    }
    if (group.files.length > maxSampleFiles && treeLines.length < MAX_TREE_LINES) {
      treeLines.push(`  - ... (+${group.files.length - maxSampleFiles} more)`)
    }
  }

  // Up to 2 priority text docs, max 2000 characters total
  const docCandidates = allFiles
    .filter(f => TEXT_DOC_EXTS.has(f.ext.toLowerCase()) && f.size > 0)
    .sort((a, b) => docPriority(a) - docPriority(b) || a.relPath.localeCompare(b.relPath))

  const textSnippets: ProjectSampleTextSnippet[] = []
  let remainingChars = MAX_TOTAL_TEXT_CHARS
  for (const doc of docCandidates) {
    if (textSnippets.length >= 2 || remainingChars <= 0) break
    const absPath = normalizeProjectPath(path.join(projectPath, doc.relPath))
    if (!isPathInside(projectPath, absPath)) continue
    const content = await readSafeTextSnippet(absPath, remainingChars)
    if (!content) continue
    textSnippets.push({ relPath: doc.relPath, content })
    remainingChars -= content.length
  }

  // Up to 15 thumbable cover candidates
  const coverCandidates = allFiles
    .filter(f => f.thumbSupported)
    .sort((a, b) => coverPriority(a) - coverPriority(b) || a.relPath.localeCompare(b.relPath))
    .slice(0, MAX_COVER_CANDIDATES)
    .map(f => f.relPath)

  return {
    projectName: manifest.name,
    fileCount: manifest.stats.fileCount,
    folderCount: manifest.stats.folderCount,
    totalBytes: manifest.stats.totalBytes,
    categories: manifest.stats.categories,
    topExtensions,
    treeLines,
    textSnippets,
    coverCandidates,
  }
}

export function buildAiExtractionPrompts(sample: ProjectSample): {
  readonly system: string
  readonly user: string
} {
  const system = [
    '你是一个归档项目整理助手。根据提供的项目目录结构采样、文件类型分布与说明文本，提炼结构化的中文项目元数据。',
    '请严格只输出一个合法 JSON 对象，不要附加 markdown 代码块标记或解释文字，字段如下：',
    '{',
    '  "projectType": "简短的项目类型（例如：品牌视觉设计 / 三维渲染 / 影视剪辑 / 前端工程 / 文档资料，不超过15字）",',
    '  "tags": ["1到8个核心中文或英文短标签"],',
    '  "summary": "一句话项目简介（20到120字，概括交付物与主题）",',
    '  "recommendedCoverRelPath": "从候选封面路径中选出最适合作为项目封面的一条相对路径；若无合适候选填 null"',
    '}',
  ].join('\n')

  const parts: string[] = [
    `项目名称: ${sample.projectName}`,
    `规模统计: ${sample.fileCount} 个文件, ${sample.folderCount} 个子目录, 总大小 ${sample.totalBytes} 字节`,
    `分类分布: ${JSON.stringify(sample.categories)}`,
    `常见扩展名: ${sample.topExtensions.map(e => `${e.ext}:${e.count}`).join(', ') || '无'}`,
    '',
    '目录结构采样:',
    sample.treeLines.join('\n') || '(空目录)',
  ]

  if (sample.textSnippets.length > 0) {
    parts.push('', '关键文本摘录:')
    for (const snippet of sample.textSnippets) {
      parts.push(`--- ${snippet.relPath} ---`, snippet.content)
    }
  }

  parts.push(
    '',
    '候选封面相对路径 (recommendedCoverRelPath 必须严格等于以下之一或 null):',
    sample.coverCandidates.length > 0 ? sample.coverCandidates.join('\n') : '(无可用封面候选)',
  )

  return {
    system,
    user: parts.join('\n'),
  }
}

export function parseAiExtractionJson(rawText: string): AiExtractionOutput {
  let cleaned = rawText.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(cleaned)
  if (fenced && fenced[1]) {
    cleaned = fenced[1].trim()
  }

  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new FolioError('ai_invalid_output', '模型返回内容未包含有效的 JSON 对象', 502)
  }

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new FolioError('ai_invalid_output', `模型 JSON 解析失败: ${msg}`, 502)
  }

  const validated = AiExtractionOutputSchema.safeParse(parsedJson)
  if (!validated.success) {
    const detail = validated.error.issues
      .map(i => `${i.path.join('.') || 'root'}: ${i.message}`)
      .join('; ')
    throw new FolioError('ai_invalid_output', `模型输出未通过 schema 校验: ${detail}`, 502)
  }

  const dedupedTags = Array.from(new Set(validated.data.tags.map(t => t.trim()).filter(Boolean)))
  return {
    ...validated.data,
    tags: dedupedTags.slice(0, 8),
    recommendedCoverRelPath: validated.data.recommendedCoverRelPath?.trim() || null,
  }
}
