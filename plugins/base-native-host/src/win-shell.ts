import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import {
  FolioError,
  type NativePickFilesOptions,
  type NativePickFilesResult,
  type NativePickFolderOptions,
  type NativePickFolderResult,
  type NativePickSaveFileOptions,
  type NativePickSaveFileResult,
} from '@folio/base-contract'

const execFileAsync = promisify(execFile)

export function normalizeLocalPath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.includes('\0')) return ''
  if (/^[a-zA-Z]:$/.test(trimmed)) {
    return `${trimmed.toUpperCase()}\\`
  }
  const resolved = path.resolve(trimmed)
  if (/^[a-z]:\\/.test(resolved)) {
    return `${resolved[0].toUpperCase()}${resolved.slice(1)}`
  }
  return resolved
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

function launchDetached(
  command: string,
  args: readonly string[],
  errorCode: string,
  errorPrefix: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    const onError = (err: Error): void => {
      reject(new FolioError(errorCode, `${errorPrefix}: ${err.message}`, 500))
    }
    child.once('error', onError)
    child.once('spawn', () => {
      child.off('error', onError)
      child.unref()
      resolve()
    })
  })
}

async function assertExistingPath(rawPath: string): Promise<{ normalized: string; stats: fs.Stats }> {
  const normalized = normalizeLocalPath(rawPath)
  if (!normalized) {
    throw new FolioError('invalid_path', '目标路径不能为空', 400)
  }
  try {
    const stats = await fsp.stat(normalized)
    return { normalized, stats }
  } catch {
    throw new FolioError('not_found', `路径不存在: ${normalized}`, 404)
  }
}

export async function pickNativeFolder(
  options: NativePickFolderOptions = {},
): Promise<NativePickFolderResult> {
  if (process.platform !== 'win32') {
    return { supported: false, cancelled: false, folderPath: null }
  }

  const initialDir = options.initialDir ? normalizeLocalPath(options.initialDir) : ''
  const initialDirB64 = Buffer.from(initialDir, 'utf8').toString('base64')
  const titleB64 = Buffer.from(options.title?.trim() || '选择文件夹', 'utf8').toString('base64')

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
$dlg.Description = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${titleB64}'))
$dlg.ShowNewFolderButton = $true
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
}

export async function pickNativeFiles(
  options: NativePickFilesOptions = {},
): Promise<NativePickFilesResult> {
  if (process.platform !== 'win32') {
    return { supported: false, cancelled: false, paths: [] }
  }

  const multi = options.multi !== false
  const initialDir = options.initialDir ? normalizeLocalPath(options.initialDir) : ''
  const initialDirB64 = Buffer.from(initialDir, 'utf8').toString('base64')
  const titleB64 = Buffer.from(options.title?.trim() || '选择文件', 'utf8').toString('base64')
  const filterB64 = Buffer.from(
    options.filter?.trim() || '所有文件 (*.*)|*.*',
    'utf8',
  ).toString('base64')

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
$dlg.Title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${titleB64}'))
$dlg.Filter = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${filterB64}'))
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
      paths: Array.isArray(parsed.paths)
        ? parsed.paths.map(normalizeLocalPath).filter(Boolean)
        : [],
    }
  } catch {
    return { supported: false, cancelled: false, paths: [] }
  }
}

export async function pickNativeSaveFile(
  options: NativePickSaveFileOptions = {},
): Promise<NativePickSaveFileResult> {
  if (process.platform !== 'win32') {
    return { supported: false, cancelled: false, filePath: null }
  }

  const initialDir = options.initialDir ? normalizeLocalPath(options.initialDir) : ''
  const initialDirB64 = Buffer.from(initialDir, 'utf8').toString('base64')
  const titleB64 = Buffer.from(options.title?.trim() || '保存文件', 'utf8').toString('base64')
  const filterB64 = Buffer.from(
    options.filter?.trim() || '所有文件 (*.*)|*.*',
    'utf8',
  ).toString('base64')
  const defaultExtB64 = Buffer.from(options.defaultExt?.trim() || '', 'utf8').toString('base64')
  const defaultNameB64 = Buffer.from(options.defaultName?.trim() || '', 'utf8').toString('base64')

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
$dlg = New-Object System.Windows.Forms.SaveFileDialog
$dlg.Title = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${titleB64}'))
$dlg.Filter = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${filterB64}'))
$defExt = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${defaultExtB64}'))
if ($defExt) {
  $dlg.DefaultExt = $defExt
  $dlg.AddExtension = $true
}
$defName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${defaultNameB64}'))
if ($defName) {
  $dlg.FileName = $defName
}
$initDir = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${initialDirB64}'))
if ($initDir -and (Test-Path -LiteralPath $initDir)) {
  $dlg.InitialDirectory = $initDir
}
$result = $dlg.ShowDialog($owner)
$owner.Dispose()
if ($result -eq [System.Windows.Forms.DialogResult]::OK -and $dlg.FileName) {
  $payload = @{ cancelled = $false; filePath = $dlg.FileName }
} else {
  $payload = @{ cancelled = $true; filePath = $null }
}
[Console]::Out.WriteLine(($payload | ConvertTo-Json -Compress))
`

  try {
    const raw = await runPowerShellSta(script)
    const parsed = JSON.parse(raw) as { cancelled?: boolean; filePath?: string | null }
    return {
      supported: true,
      cancelled: Boolean(parsed.cancelled),
      filePath: parsed.filePath ? normalizeLocalPath(parsed.filePath) : null,
    }
  } catch {
    return { supported: false, cancelled: false, filePath: null }
  }
}

export async function revealLocalPath(
  targetRawPath: string,
): Promise<{ readonly revealedPath: string }> {
  const { normalized, stats } = await assertExistingPath(targetRawPath)
  const isDir = stats.isDirectory()

  if (process.platform === 'win32') {
    const args = isDir ? [normalized] : [`/select,${normalized}`]
    await launchDetached('explorer.exe', args, 'reveal_failed', '无法打开系统资源管理器')
  } else if (process.platform === 'darwin') {
    const args = isDir ? [normalized] : ['-R', normalized]
    await launchDetached('open', args, 'reveal_failed', '无法在 Finder 中定位')
  } else {
    await launchDetached(
      'xdg-open',
      [isDir ? normalized : path.dirname(normalized)],
      'reveal_failed',
      '无法打开文件管理器',
    )
  }

  return { revealedPath: normalized }
}

export async function openLocalPath(
  targetRawPath: string,
): Promise<{ readonly openedPath: string }> {
  const { normalized } = await assertExistingPath(targetRawPath)

  if (process.platform === 'win32') {
    const pathB64 = Buffer.from(normalized, 'utf8').toString('base64')
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$target = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${pathB64}'))`,
      'Start-Process -LiteralPath $target',
    ].join('\n')
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    try {
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        { timeout: 8000, windowsHide: true },
      )
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new FolioError('open_failed', `无法打开目标路径: ${msg}`, 500)
    }
  } else if (process.platform === 'darwin') {
    await launchDetached('open', [normalized], 'open_failed', '无法打开目标路径')
  } else {
    await launchDetached('xdg-open', [normalized], 'open_failed', '无法打开目标路径')
  }

  return { openedPath: normalized }
}

export async function setWindowsHiddenAttribute(
  targetRawPath: string,
  hidden = true,
): Promise<boolean> {
  if (process.platform !== 'win32') return false
  const normalized = normalizeLocalPath(targetRawPath)
  if (!normalized) return false
  try {
    await execFileAsync('attrib', [hidden ? '+h' : '-h', normalized], {
      timeout: 3000,
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

export async function recycleLocalPaths(
  rawPaths: readonly string[],
): Promise<{ readonly recycled: number }> {
  const existingPaths: string[] = []
  for (const raw of rawPaths) {
    const normalized = normalizeLocalPath(raw)
    if (!normalized) continue
    try {
      await fsp.lstat(normalized)
      existingPaths.push(normalized)
    } catch {
      // Skip non-existent paths
    }
  }
  if (existingPaths.length === 0) return { recycled: 0 }

  if (process.platform !== 'win32') {
    let recycled = 0
    for (const p of existingPaths) {
      await fsp.rm(p, { recursive: true, force: true })
      recycled += 1
    }
    return { recycled }
  }

  const pathsB64 = Buffer.from(JSON.stringify(existingPaths), 'utf8').toString('base64')
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName Microsoft.VisualBasic
$json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${pathsB64}'))
$items = $json | ConvertFrom-Json
if ($items -is [string]) { $items = @($items) }
$count = 0
foreach ($p in $items) {
  if ([System.IO.File]::Exists($p)) {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
      $p,
      [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
      [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
    )
    $count++
  } elseif ([System.IO.Directory]::Exists($p)) {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
      $p,
      [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
      [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
    )
    $count++
  }
}
[Console]::Out.WriteLine((@{ recycled = $count } | ConvertTo-Json -Compress))
`
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
      )
      let out = ''
      let err = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', chunk => {
        out += chunk
      })
      child.stderr.on('data', chunk => {
        err += chunk
      })
      child.on('error', reject)
      child.on('close', code => {
        if (code !== 0) reject(new Error(err.trim() || `PowerShell exited with code ${code}`))
        else resolve(out.trim())
      })
    })
    const parsed = JSON.parse(stdout) as { recycled?: number }
    return { recycled: typeof parsed.recycled === 'number' ? parsed.recycled : existingPaths.length }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new FolioError('recycle_failed', `移入回收站失败: ${msg}`, 500)
  }
}
