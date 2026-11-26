import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { FolioError } from '@folio/base-contract'
import { classifyImageFile, normalizeLocalPath } from './image-meta.js'
import type {
  CanvasDirEntry,
  CanvasDriveInfo,
  CanvasListDirResult,
  CanvasQuickFolder,
  CanvasRootsResult,
} from './types.js'

const execFileAsync = promisify(execFile)

export interface PickImagesOptions {
  readonly multi?: boolean
  readonly initialDir?: string
}

export interface PickImagesResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly paths: readonly string[]
}

export interface PickFolderResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly folderPath: string | null
}

export interface CanvasDialogProvider {
  pickImages(options?: PickImagesOptions): Promise<PickImagesResult>
  pickFolder(options?: { readonly initialDir?: string }): Promise<PickFolderResult>
  revealPath(filePath: string): Promise<{ readonly revealedPath: string }>
}

function runPowerShellSta(script: string): Promise<string> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`))
        return
      }
      resolve(stdout.trim())
    })
  })
}

function launchDetached(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    const onError = (err: Error): void => {
      reject(new FolioError('reveal_failed', `无法打开系统资源管理器: ${err.message}`, 500))
    }
    child.once('error', onError)
    child.once('spawn', () => {
      child.off('error', onError)
      child.unref()
      resolve()
    })
  })
}

export async function revealLocalPath(targetRawPath: string): Promise<{ readonly revealedPath: string }> {
  const targetPath = normalizeLocalPath(targetRawPath)
  if (!targetPath) {
    throw new FolioError('invalid_path', '目标路径不能为空', 400)
  }

  let st: fs.Stats
  try {
    st = await fsp.stat(targetPath)
  } catch {
    throw new FolioError('not_found', `路径不存在: ${targetPath}`, 404)
  }

  const isDir = st.isDirectory()
  if (process.platform === 'win32') {
    const args = isDir ? [targetPath] : [`/select,${targetPath}`]
    await launchDetached('explorer.exe', args)
  } else if (process.platform === 'darwin') {
    const args = isDir ? [targetPath] : ['-R', targetPath]
    await launchDetached('open', args)
  } else {
    await launchDetached('xdg-open', [isDir ? targetPath : path.dirname(targetPath)])
  }

  return { revealedPath: targetPath }
}

export function createWindowsDialogProvider(): CanvasDialogProvider {
  return {
    async pickImages(options: PickImagesOptions = {}): Promise<PickImagesResult> {
      if (process.platform !== 'win32') {
        return { supported: false, cancelled: false, paths: [] }
      }

      const multi = options.multi !== false
      const initialDir = options.initialDir ? normalizeLocalPath(options.initialDir) : ''
      const initialDirB64 = Buffer.from(initialDir, 'utf8').toString('base64')

      const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.StartPosition = 'Manual'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Location = New-Object System.Drawing.Point(-32000, -32000)
$owner.ShowInTaskbar = $false
$dlg = New-Object System.Windows.Forms.OpenFileDialog
$dlg.Title = '${multi ? '选择要链接的图片' : '重新选择链接图片'}'
$dlg.Filter = '图片文件|*.png;*.jpg;*.jpeg;*.jfif;*.webp;*.gif;*.bmp;*.ico;*.avif;*.svg;*.tif;*.tiff;*.heic;*.heif;*.psd|所有文件|*.*'
$dlg.Multiselect = ${multi ? '$true' : '$false'}
$dlg.RestoreDirectory = $true
$initDir = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${initialDirB64}'))
if ($initDir -and (Test-Path -LiteralPath $initDir)) {
  $dlg.InitialDirectory = $initDir
}
$result = $dlg.ShowDialog($owner)
$owner.Dispose()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  $payload = @{ cancelled = $false; paths = @($dlg.FileNames) }
} else {
  $payload = @{ cancelled = $true; paths = @() }
}
[Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress))
`
      try {
        const raw = await runPowerShellSta(script)
        const parsed = JSON.parse(raw) as { cancelled?: boolean; paths?: string[] }
        return {
          supported: true,
          cancelled: Boolean(parsed.cancelled),
          paths: Array.isArray(parsed.paths) ? parsed.paths.map(normalizeLocalPath).filter(Boolean) : [],
        }
      } catch {
        return { supported: false, cancelled: false, paths: [] }
      }
    },

    async pickFolder(options: { readonly initialDir?: string } = {}): Promise<PickFolderResult> {
      if (process.platform !== 'win32') {
        return { supported: false, cancelled: false, folderPath: null }
      }

      const initialDir = options.initialDir ? normalizeLocalPath(options.initialDir) : ''
      const initialDirB64 = Buffer.from(initialDir, 'utf8').toString('base64')

      const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.StartPosition = 'Manual'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Location = New-Object System.Drawing.Point(-32000, -32000)
$owner.ShowInTaskbar = $false
$dlg = New-Object System.Windows.Forms.FolderBrowserDialog
$dlg.Description = '选择包含已移动图片的文件夹，用于批量重新链接'
$dlg.ShowNewFolderButton = $false
$initDir = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${initialDirB64}'))
if ($initDir -and (Test-Path -LiteralPath $initDir)) {
  $dlg.SelectedPath = $initDir
}
$result = $dlg.ShowDialog($owner)
$owner.Dispose()
if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dlg.SelectedPath) {
  $payload = @{ cancelled = $false; folderPath = $dlg.SelectedPath }
} else {
  $payload = @{ cancelled = $true; folderPath = $null }
}
[Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress))
`
      try {
        const raw = await runPowerShellSta(script)
        const parsed = JSON.parse(raw) as { cancelled?: boolean; folderPath?: string | null }
        return {
          supported: true,
          cancelled: Boolean(parsed.cancelled),
          folderPath: parsed.folderPath ? normalizeLocalPath(parsed.folderPath) : null,
        }
      } catch {
        return { supported: false, cancelled: false, folderPath: null }
      }
    },

    revealPath: revealLocalPath,
  }
}

async function listDrives(): Promise<CanvasDriveInfo[]> {
  if (process.platform !== 'win32') {
    return [{ name: '/', path: '/' }]
  }

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady } | ForEach-Object { $_.Name }',
      ],
      { timeout: 3000, windowsHide: true },
    )
    const drives = stdout
      .split(/\r?\n/)
      .map(s => normalizeLocalPath(s))
      .filter(Boolean)
      .map(p => ({ name: p.replace(/\\$/, ''), path: p }))
    if (drives.length > 0) return drives
  } catch {
    // fallback probe common drive letters
  }

  const probes: CanvasDriveInfo[] = []
  for (const letter of ['C', 'D', 'E', 'F', 'G', 'H']) {
    const p = `${letter}:\\`
    try {
      await fsp.access(p)
      probes.push({ name: `${letter}:`, path: p })
    } catch {
      // skip
    }
  }
  return probes
}

export async function listCanvasRoots(): Promise<CanvasRootsResult> {
  const home = normalizeLocalPath(os.homedir())
  const specs: Array<{ id: string; name: string; path: string; kind: CanvasQuickFolder['kind'] }> = [
    { id: 'home', name: '主目录', path: home, kind: 'home' },
    { id: 'pictures', name: '图片', path: normalizeLocalPath(path.join(home, 'Pictures')), kind: 'pictures' },
    { id: 'desktop', name: '桌面', path: normalizeLocalPath(path.join(home, 'Desktop')), kind: 'desktop' },
    { id: 'downloads', name: '下载', path: normalizeLocalPath(path.join(home, 'Downloads')), kind: 'downloads' },
    { id: 'documents', name: '文档', path: normalizeLocalPath(path.join(home, 'Documents')), kind: 'documents' },
  ]

  const quickFolders: CanvasQuickFolder[] = []
  for (const spec of specs) {
    try {
      const st = await fsp.stat(spec.path)
      if (st.isDirectory()) quickFolders.push(spec)
    } catch {
      // skip missing special folder
    }
  }

  const drives = await listDrives()
  return {
    homePath: home,
    platform: process.platform,
    quickFolders,
    drives,
  }
}

const MAX_PICKER_ENTRIES = 1200

export async function listCanvasDirectory(options: {
  readonly path?: string
  readonly showHidden?: boolean
}): Promise<CanvasListDirResult> {
  const target = normalizeLocalPath(options.path?.trim() || os.homedir())
  const showHidden = Boolean(options.showHidden)

  let st: fs.Stats
  try {
    st = await fsp.stat(target)
  } catch {
    throw new FolioError('not_found', `目录不存在: ${target}`, 404)
  }
  if (!st.isDirectory()) {
    throw new FolioError('not_a_directory', `目标不是文件夹: ${target}`, 400)
  }

  const dirents = await fsp.readdir(target, { withFileTypes: true })
  const visible = showHidden ? dirents : dirents.filter(d => !d.name.startsWith('.'))
  const dirs: CanvasDirEntry[] = []
  const images: CanvasDirEntry[] = []

  for (const dirent of visible) {
    if (dirs.length + images.length >= MAX_PICKER_ENTRIES) break
    const fullPath = normalizeLocalPath(path.join(target, dirent.name))
    try {
      const entryStat = await fsp.stat(fullPath)
      if (entryStat.isDirectory()) {
        dirs.push({
          name: dirent.name,
          path: fullPath,
          isDir: true,
          ext: '',
          mime: 'inode/directory',
          size: 0,
          mtimeMs: entryStat.mtimeMs,
        })
      } else if (entryStat.isFile()) {
        const meta = classifyImageFile(dirent.name)
        if (!meta.isImage) continue
        images.push({
          name: dirent.name,
          path: fullPath,
          isDir: false,
          ext: meta.ext,
          mime: meta.mime,
          size: entryStat.size,
          mtimeMs: entryStat.mtimeMs,
        })
      }
    } catch {
      // skip inaccessible entry
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
  images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

  const parsed = path.parse(target)
  const parent = parsed.root === target ? null : normalizeLocalPath(path.dirname(target))

  return {
    path: target,
    parentPath: parent,
    entries: [...dirs, ...images],
    truncated: visible.length > MAX_PICKER_ENTRIES,
  }
}
