import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { FolioError } from '@folio/base-contract'
import { normalizeLocalPath } from './dialogs.js'
import {
  A3_LANDSCAPE_HEIGHT_PT,
  A3_LANDSCAPE_WIDTH_PT,
  ARTBOARD_SPACING_PT,
  DEFAULT_CONTROL_PORT,
  type ExportedFileItem,
  type ExportFormat,
  type MaterialsSettings,
  type VectorCraftStatus,
  type VectorCraftSymbolicCommand,
} from './types.js'

const execFileAsync = promisify(execFile)

const DEFAULT_CLI_CANDIDATES = [
  'C:\\Program Files\\VectorCraft\\vectorcraft-cli.exe',
  'C:\\Program Files (x86)\\VectorCraft\\vectorcraft-cli.exe',
]

const DEFAULT_APP_CANDIDATES = [
  'C:\\Program Files\\VectorCraft\\vectorcraft.exe',
  'C:\\Program Files (x86)\\VectorCraft\\vectorcraft.exe',
]

export interface LiveDocumentSummary {
  readonly index: number
  readonly path: string | null
  readonly title: string
  readonly dirty: boolean
  readonly active: boolean
}

export interface LiveProbeResult {
  readonly connected: boolean
  readonly documents: readonly LiveDocumentSummary[]
  readonly activePath: string | null
}

export interface VectorCraftBridge {
  getStatus(): Promise<VectorCraftStatus>
  probeLiveControl(): Promise<LiveProbeResult>
  readLiveDocumentJson(filePath: string): Promise<Record<string, unknown> | null>
  createA3Document(options: {
    readonly filePath: string
    readonly title: string
    readonly artboardCount?: number
  }): Promise<void>
  runBatchOnFile(
    filePath: string,
    steps: readonly VectorCraftSymbolicCommand[],
    options?: { readonly save?: boolean; readonly preferLive?: boolean },
  ): Promise<{ readonly results: readonly unknown[]; readonly usedLiveControl: boolean }>
  renderArtboardPng(options: {
    readonly filePath: string
    readonly artboardIndex: number
    readonly ppi: number
    readonly outputPath: string
  }): Promise<void>
  exportPages(options: {
    readonly items: readonly {
      readonly filePath: string
      readonly fileName: string
      readonly artboardIndex: number
      readonly pageNumber: string
      readonly pageTitle: string
    }[]
    readonly format: ExportFormat
    readonly outputDir: string
    readonly ppi: number
    readonly mergedPdfFileName?: string
  }): Promise<readonly ExportedFileItem[]>
  openInGui(filePath: string, artboardIndex?: number): Promise<{ readonly usedExistingControl: boolean }>
  dispose(): void
}

function resolveRefTokens(value: unknown, refMap: ReadonlyMap<string, unknown>): unknown {
  if (typeof value === 'string' && value.startsWith('$ref:')) {
    const key = value.slice(5)
    if (!refMap.has(key)) {
      throw new Error(`未解析的 VectorCraft 引用标记: ${value}`)
    }
    return refMap.get(key)
  }
  if (Array.isArray(value)) {
    return value.map(item => resolveRefTokens(item, refMap))
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = resolveRefTokens(v, refMap)
      }
    }
    return out
  }
  return value
}

export function compileCliCommands(
  steps: readonly VectorCraftSymbolicCommand[],
  stepOffset: number,
): { readonly command: string; readonly params: Record<string, unknown> }[] {
  const refMap = new Map<string, string>()
  return steps.map((step, idx) => {
    const resolvedParams = resolveRefTokens(step.params, refMap) as Record<string, unknown>
    if (step.captureAs) {
      refMap.set(step.captureAs, `$${idx + stepOffset}.id`)
    }
    return {
      command: step.command,
      params: resolvedParams,
    }
  })
}

async function resolveExecutable(
  explicitPath: string,
  envVarName: string,
  candidates: readonly string[],
  commandName: string,
): Promise<string | null> {
  const ordered = [
    explicitPath.trim(),
    (process.env[envVarName] ?? '').trim(),
    ...candidates,
  ].filter(Boolean)

  for (const candidate of ordered) {
    try {
      await fsp.access(candidate)
      return normalizeLocalPath(candidate)
    } catch {
      // continue
    }
  }

  try {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which'
    const { stdout } = await execFileAsync(finder, [commandName], {
      timeout: 3000,
      windowsHide: true,
    })
    const first = stdout
      .split(/\r?\n/)
      .map(s => s.trim())
      .find(Boolean)
    if (first) return normalizeLocalPath(first)
  } catch {
    // not in PATH
  }

  return null
}

function sendTcpControlRequest(
  port: number,
  requests: readonly { readonly method: string; readonly params: Record<string, unknown> }[],
  timeoutMs = 15_000,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    let settled = false
    let buffer = ''
    const results = new Array<unknown>(requests.length)
    let receivedCount = 0

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(new Error(`VectorCraft TCP 控制通道超时 (127.0.0.1:${port})`))
    }, timeoutMs)

    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      if (err) reject(err)
      else resolve(results)
    }

    socket.setEncoding('utf8')
    socket.on('error', err => finish(err))
    socket.on('connect', () => {
      for (let i = 0; i < requests.length; i++) {
        const req = requests[i]!
        socket.write(
          `${JSON.stringify({ id: i + 1, method: req.method, params: req.params })}\n`,
        )
      }
    })
    socket.on('data', chunk => {
      buffer += chunk
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as {
            id?: number
            ok?: boolean
            result?: unknown
            error?: { message?: string } | string
          }
          const idx = typeof msg.id === 'number' ? msg.id - 1 : receivedCount
          if (msg.ok === false) {
            const errMsg =
              typeof msg.error === 'string'
                ? msg.error
                : msg.error?.message ?? 'VectorCraft 控制命令执行失败'
            finish(new Error(errMsg))
            return
          }
          results[idx] = msg.result
          receivedCount += 1
          if (receivedCount >= requests.length) {
            finish()
            return
          }
        } catch (err) {
          finish(err instanceof Error ? err : new Error(String(err)))
          return
        }
      }
    })
  })
}

async function runTcpEngineCommand(
  port: number,
  command: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const [res] = await sendTcpControlRequest(port, [
    { method: 'engine.execute', params: { command, params } },
  ])
  return res
}

function sanitizeFileNamePart(raw: string): string {
  return raw
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 64)
}

function buildPageRangeString(zeroBasedIndices: readonly number[]): string {
  const sorted = Array.from(new Set(zeroBasedIndices)).sort((a, b) => a - b)
  const ranges: string[] = []
  let start = -1
  let prev = -1
  for (const idx of sorted) {
    const oneBased = idx + 1
    if (start < 0) {
      start = oneBased
      prev = oneBased
    } else if (oneBased === prev + 1) {
      prev = oneBased
    } else {
      ranges.push(start === prev ? String(start) : `${start}-${prev}`)
      start = oneBased
      prev = oneBased
    }
  }
  if (start >= 0) {
    ranges.push(start === prev ? String(start) : `${start}-${prev}`)
  }
  return ranges.join(',')
}

function sameFilePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  return normalizeLocalPath(a).toLowerCase() === normalizeLocalPath(b).toLowerCase()
}

export function createRealVectorCraftBridge(
  getSettings: () => Promise<MaterialsSettings>,
  hooks?: {
    readonly onBeforeWrite?: (filePath: string) => void
  },
): VectorCraftBridge {
  const fileLocks = new Map<string, Promise<unknown>>()
  let cachedVersion: { cliPath: string; version: string | null } | null = null

  function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const key = normalizeLocalPath(filePath).toLowerCase()
    const prev = fileLocks.get(key) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    const tracked = next.then(
      () => {
        if (fileLocks.get(key) === tracked) fileLocks.delete(key)
      },
      () => {
        if (fileLocks.get(key) === tracked) fileLocks.delete(key)
      },
    )
    fileLocks.set(key, tracked)
    return next
  }

  async function requireCliPath(): Promise<string> {
    const settings = await getSettings()
    const cliPath = await resolveExecutable(
      settings.cliPath,
      'VECTORCRAFT_CLI_PATH',
      DEFAULT_CLI_CANDIDATES,
      'vectorcraft-cli',
    )
    if (!cliPath) {
      throw new FolioError(
        'vectorcraft_cli_not_found',
        '未找到 vectorcraft-cli.exe，请在设置中配置正确的本地路径。',
        404,
      )
    }
    return cliPath
  }

  async function runCliCommand(
    cliPath: string,
    args: readonly string[],
    stdinPayload?: string,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(cliPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        child.kill()
        reject(new FolioError('vectorcraft_timeout', 'VectorCraft CLI 执行超时', 504))
      }, 60_000)

      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', chunk => {
        stdout += chunk
      })
      child.stderr.on('data', chunk => {
        stderr += chunk
      })
      child.on('error', err => {
        clearTimeout(timer)
        reject(new FolioError('vectorcraft_exec_failed', `调用 VectorCraft CLI 失败: ${err.message}`, 500))
      })
      child.on('close', code => {
        clearTimeout(timer)
        if (code !== 0) {
          reject(
            new FolioError(
              'vectorcraft_cli_error',
              stderr.trim() || stdout.trim() || `VectorCraft CLI 退出码 ${code}`,
              500,
            ),
          )
          return
        }
        resolve(stdout)
      })
      if (stdinPayload !== undefined) {
        child.stdin.end(stdinPayload, 'utf8')
      } else {
        child.stdin.end()
      }
    })
  }

  async function probeLiveControl(): Promise<LiveProbeResult> {
    const settings = await getSettings()
    const port = settings.controlPort || DEFAULT_CONTROL_PORT
    try {
      const [uiResult] = await sendTcpControlRequest(
        port,
        [{ method: 'ui.inspect', params: {} }],
        1200,
      )
      const uiObj = (uiResult ?? {}) as {
        readonly documents?: readonly {
          readonly index?: number
          readonly path?: string | null
          readonly title?: string
          readonly dirty?: boolean
          readonly active?: boolean
        }[]
      }
      const docs: LiveDocumentSummary[] = Array.isArray(uiObj.documents)
        ? uiObj.documents.map((d, idx) => ({
            index: typeof d.index === 'number' ? d.index : idx,
            path: d.path ? normalizeLocalPath(d.path) : null,
            title: String(d.title ?? ''),
            dirty: Boolean(d.dirty),
            active: Boolean(d.active),
          }))
        : []
      const activeDoc = docs.find(d => d.active) ?? docs[0] ?? null
      return {
        connected: true,
        documents: docs,
        activePath: activeDoc?.path ?? null,
      }
    } catch {
      return {
        connected: false,
        documents: [],
        activePath: null,
      }
    }
  }

  async function getStatus(): Promise<VectorCraftStatus> {
    const settings = await getSettings()
    const [cliPath, appPath, live] = await Promise.all([
      resolveExecutable(
        settings.cliPath,
        'VECTORCRAFT_CLI_PATH',
        DEFAULT_CLI_CANDIDATES,
        'vectorcraft-cli',
      ),
      resolveExecutable(
        settings.appPath,
        'VECTORCRAFT_APP_PATH',
        DEFAULT_APP_CANDIDATES,
        'vectorcraft',
      ),
      probeLiveControl(),
    ])

    let cliVersion: string | null = null
    if (cliPath) {
      if (cachedVersion && cachedVersion.cliPath === cliPath) {
        cliVersion = cachedVersion.version
      } else {
        try {
          const { stdout } = await execFileAsync(cliPath, ['--version'], {
            timeout: 3000,
            windowsHide: true,
          })
          cliVersion = stdout.trim() || null
          cachedVersion = { cliPath, version: cliVersion }
        } catch {
          cliVersion = null
        }
      }
    }

    return {
      cliPath,
      cliFound: Boolean(cliPath),
      cliVersion,
      appPath,
      appFound: Boolean(appPath),
      controlPort: settings.controlPort || DEFAULT_CONTROL_PORT,
      liveConnected: live.connected,
      liveActiveDocumentPath: live.activePath,
      liveOpenDocuments: live.documents.map(d => ({
        index: d.index,
        path: d.path,
        title: d.title,
        dirty: d.dirty,
      })),
      settings,
    }
  }

  async function readLiveDocumentJson(filePath: string): Promise<Record<string, unknown> | null> {
    const settings = await getSettings()
    const port = settings.controlPort || DEFAULT_CONTROL_PORT
    const live = await probeLiveControl()
    if (!live.connected) return null
    const match = live.documents.find(d => sameFilePath(d.path, filePath))
    if (!match) return null

    try {
      if (!match.active) {
        await runTcpEngineCommand(port, 'document.activate', { index: match.index })
      }
      const res = await runTcpEngineCommand(port, 'document.json', {})
      if (res && typeof res === 'object') {
        return res as Record<string, unknown>
      }
      return null
    } catch {
      return null
    }
  }

  async function createA3Document(options: {
    readonly filePath: string
    readonly title: string
    readonly artboardCount?: number
  }): Promise<void> {
    const targetPath = normalizeLocalPath(options.filePath)
    if (!targetPath) {
      throw new FolioError('invalid_path', '目标文件路径不能为空', 400)
    }
    await withFileLock(targetPath, async () => {
      const cliPath = await requireCliPath()
      await fsp.mkdir(path.dirname(targetPath), { recursive: true })
      const count = Math.max(1, Math.min(100, options.artboardCount ?? 1))
      const cmds = [
        {
          command: 'file.new',
          params: {
            title: options.title.trim() || path.basename(targetPath, '.vectorcraft'),
            width: A3_LANDSCAPE_WIDTH_PT,
            height: A3_LANDSCAPE_HEIGHT_PT,
            units: 'Points',
            backgroundContents: 'white',
            artboards: count,
            artboardLayout: {
              layout: 'row',
              spacing: ARTBOARD_SPACING_PT,
            },
          },
        },
        {
          command: 'document.save',
          params: { path: targetPath },
        },
      ]
      hooks?.onBeforeWrite?.(targetPath)
      await runCliCommand(cliPath, ['run', '--commands', '-'], JSON.stringify(cmds))
    })
  }

  async function runBatchOnFile(
    rawPath: string,
    steps: readonly VectorCraftSymbolicCommand[],
    options: { readonly save?: boolean; readonly preferLive?: boolean } = {},
  ): Promise<{ readonly results: readonly unknown[]; readonly usedLiveControl: boolean }> {
    const targetPath = normalizeLocalPath(rawPath)
    const save = options.save !== false
    const preferLive = options.preferLive !== false

    return withFileLock(targetPath, async () => {
      const settings = await getSettings()
      const port = settings.controlPort || DEFAULT_CONTROL_PORT

      if (preferLive) {
        const live = await probeLiveControl()
        const liveDoc = live.connected
          ? live.documents.find(d => sameFilePath(d.path, targetPath))
          : undefined

        if (liveDoc) {
          if (!liveDoc.active) {
            await runTcpEngineCommand(port, 'document.activate', { index: liveDoc.index })
          }
          const refMap = new Map<string, unknown>()
          const results: unknown[] = []
          for (const step of steps) {
            const resolvedParams = resolveRefTokens(step.params, refMap) as Record<string, unknown>
            const res = await runTcpEngineCommand(port, step.command, resolvedParams)
            results.push(res)
            if (step.captureAs && res && typeof res === 'object' && 'id' in res) {
              refMap.set(step.captureAs, (res as { id: unknown }).id)
            }
          }
          if (save) {
            hooks?.onBeforeWrite?.(targetPath)
            await runTcpEngineCommand(port, 'document.save', { path: targetPath })
          }
          return { results, usedLiveControl: true }
        }
      }

      const cliPath = await requireCliPath()
      const allSteps: VectorCraftSymbolicCommand[] = save
        ? [...steps, { command: 'document.save', params: { path: targetPath } }]
        : [...steps]
      const compiled = compileCliCommands(allSteps, 0)
      if (save) {
        hooks?.onBeforeWrite?.(targetPath)
      }
      const stdout = await runCliCommand(
        cliPath,
        ['run', '--in', targetPath, '--commands', '-'],
        JSON.stringify(compiled),
      )
      const parsed = stdout
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => {
          try {
            const obj = JSON.parse(line) as { result?: unknown }
            return obj.result
          } catch {
            return null
          }
        })
      return {
        results: parsed,
        usedLiveControl: false,
      }
    })
  }

  async function renderArtboardPng(options: {
    readonly filePath: string
    readonly artboardIndex: number
    readonly ppi: number
    readonly outputPath: string
  }): Promise<void> {
    const cliPath = await requireCliPath()
    const targetPath = normalizeLocalPath(options.filePath)
    const outputPath = normalizeLocalPath(options.outputPath)
    await fsp.mkdir(path.dirname(outputPath), { recursive: true })
    await runCliCommand(cliPath, [
      'convert',
      targetPath,
      outputPath,
      '--artboard',
      String(Math.max(0, options.artboardIndex)),
      '--ppi',
      String(Math.max(36, Math.min(300, options.ppi))),
    ])
  }

  async function exportPages(options: {
    readonly items: readonly {
      readonly filePath: string
      readonly fileName: string
      readonly artboardIndex: number
      readonly pageNumber: string
      readonly pageTitle: string
    }[]
    readonly format: ExportFormat
    readonly outputDir: string
    readonly ppi: number
    readonly mergedPdfFileName?: string
  }): Promise<readonly ExportedFileItem[]> {
    const cliPath = await requireCliPath()
    const outDir = normalizeLocalPath(options.outputDir)
    await fsp.mkdir(outDir, { recursive: true })
    const exported: ExportedFileItem[] = []
    const usedNames = new Set<string>()

    const claimPath = (baseName: string, ext: string): string => {
      const cleanBase = sanitizeFileNamePart(baseName) || 'export'
      let candidate = `${cleanBase}.${ext}`
      let suffix = 2
      while (usedNames.has(candidate.toLowerCase()) || fs.existsSync(path.join(outDir, candidate))) {
        candidate = `${cleanBase}-${suffix}.${ext}`
        suffix += 1
      }
      usedNames.add(candidate.toLowerCase())
      return path.join(outDir, candidate)
    }

    if (options.format === 'pdf-merged') {
      const byFile = new Map<string, { fileName: string; indices: number[] }>()
      for (const item of options.items) {
        const key = normalizeLocalPath(item.filePath).toLowerCase()
        const group = byFile.get(key) ?? { fileName: item.fileName, indices: [] }
        group.indices.push(item.artboardIndex)
        byFile.set(key, group)
      }

      const customBase = (options.mergedPdfFileName ?? '').replace(/\.pdf$/i, '').trim()
      const multiFile = byFile.size > 1
      for (const group of byFile.values()) {
        const sourcePath = options.items.find(
          it => it.fileName === group.fileName,
        )!.filePath
        const fileStem = path.basename(group.fileName, path.extname(group.fileName))
        const baseName = customBase
          ? (multiFile ? `${customBase}_${fileStem}` : customBase)
          : `${fileStem}_物料合并`
        const outPath = claimPath(baseName, 'pdf')
        const range = buildPageRangeString(group.indices)
        const stdout = await runCliCommand(cliPath, [
          'convert',
          normalizeLocalPath(sourcePath),
          outPath,
          '--range',
          range,
        ])
        const parsed = JSON.parse(stdout.trim()) as {
          bytes?: number
          format?: string
          warnings?: string[]
        }
        exported.push({
          path: outPath,
          format: parsed.format ?? 'pdf',
          bytes: parsed.bytes ?? 0,
          warnings: parsed.warnings ?? [],
        })
      }
      return exported
    }

    const ext = options.format === 'pdf-separate' ? 'pdf' : options.format
    const includeFilePrefix = new Set(options.items.map(i => i.filePath.toLowerCase())).size > 1
    for (const item of options.items) {
      const fileStem = path.basename(item.fileName, path.extname(item.fileName))
      const titlePart = sanitizeFileNamePart(item.pageTitle) || `第${item.pageNumber}页`
      const baseName = includeFilePrefix
        ? `${fileStem}_${item.pageNumber}_${titlePart}`
        : `${item.pageNumber}_${titlePart}`
      const outPath = claimPath(baseName, ext)
      const args = [
        'convert',
        normalizeLocalPath(item.filePath),
        outPath,
        '--artboard',
        String(item.artboardIndex),
      ]
      if (ext === 'png' || ext === 'jpg' || ext === 'webp') {
        args.push('--ppi', String(Math.max(36, Math.min(600, options.ppi))))
      }
      const stdout = await runCliCommand(cliPath, args)
      const parsed = JSON.parse(stdout.trim()) as {
        bytes?: number
        format?: string
        warnings?: string[]
      }
      exported.push({
        path: outPath,
        format: parsed.format ?? ext,
        bytes: parsed.bytes ?? 0,
        warnings: parsed.warnings ?? [],
      })
    }

    return exported
  }

  async function openInGui(
    rawFilePath: string,
    artboardIndex?: number,
  ): Promise<{ readonly usedExistingControl: boolean }> {
    const targetPath = normalizeLocalPath(rawFilePath)
    if (!targetPath) {
      throw new FolioError('invalid_path', '文件路径不能为空', 400)
    }
    try {
      await fsp.access(targetPath)
    } catch {
      throw new FolioError('not_found', `文件不存在: ${targetPath}`, 404)
    }

    const settings = await getSettings()
    const port = settings.controlPort || DEFAULT_CONTROL_PORT
    const live = await probeLiveControl()

    if (live.connected) {
      const existing = live.documents.find(d => sameFilePath(d.path, targetPath))
      if (existing) {
        if (!existing.active) {
          await runTcpEngineCommand(port, 'document.activate', { index: existing.index })
        }
      } else {
        await runTcpEngineCommand(port, 'document.open', { path: targetPath })
      }
      if (typeof artboardIndex === 'number' && artboardIndex >= 0) {
        await runTcpEngineCommand(port, 'view.goToArtboard', { index: artboardIndex }).catch(() => {})
      }
      return { usedExistingControl: true }
    }

    const appPath = await resolveExecutable(
      settings.appPath,
      'VECTORCRAFT_APP_PATH',
      DEFAULT_APP_CANDIDATES,
      'vectorcraft',
    )
    if (!appPath) {
      throw new FolioError(
        'vectorcraft_app_not_found',
        '未找到 vectorcraft.exe，请在设置中配置正确的本地程序路径。',
        404,
      )
    }

    await new Promise<void>((resolve, reject) => {
      const child = spawn(appPath, ['--control', String(port), targetPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })
      const onError = (err: Error) => {
        reject(new FolioError('vectorcraft_launch_failed', `启动 VectorCraft 失败: ${err.message}`, 500))
      }
      child.once('error', onError)
      child.once('spawn', () => {
        child.off('error', onError)
        child.unref()
        resolve()
      })
    })

    if (typeof artboardIndex === 'number' && artboardIndex >= 0) {
      // Best-effort wait briefly for TCP control server to come online and focus artboard.
      const deadline = Date.now() + 4000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 400))
        const probe = await probeLiveControl()
        if (probe.connected && probe.documents.some(d => sameFilePath(d.path, targetPath))) {
          await runTcpEngineCommand(port, 'view.goToArtboard', { index: artboardIndex }).catch(() => {})
          break
        }
      }
    }

    return { usedExistingControl: false }
  }

  return {
    getStatus,
    probeLiveControl,
    readLiveDocumentJson,
    createA3Document,
    runBatchOnFile,
    renderArtboardPng,
    exportPages,
    openInGui,
    dispose() {
      // stateless
    },
  }
}

export function createTempWorkPath(prefix: string, ext: string): string {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
}
