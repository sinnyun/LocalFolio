import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { FolioError } from '@folio/base-contract'

export interface PickFilesResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly paths: readonly string[]
}

export interface PickSaveFileResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly filePath: string | null
}

export interface PickFolderResult {
  readonly supported: boolean
  readonly cancelled: boolean
  readonly folderPath: string | null
}

export interface MaterialsDialogProvider {
  pickVectorCraftFiles(options?: { readonly multi?: boolean; readonly initialDir?: string }): Promise<PickFilesResult>
  pickSaveVectorCraftFile(options?: { readonly defaultName?: string; readonly initialDir?: string }): Promise<PickSaveFileResult>
  pickFolder(options?: { readonly initialDir?: string; readonly description?: string }): Promise<PickFolderResult>
  revealPath(targetPath: string): Promise<{ readonly revealedPath: string }>
}

export function normalizeLocalPath(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  return path.normalize(trimmed)
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

export function createWindowsMaterialsDialogProvider(): MaterialsDialogProvider {
  return {
    async pickVectorCraftFiles(options = {}): Promise<PickFilesResult> {
      if (process.platform !== 'win32') {
        return { supported: false, cancelled: false, paths: [] }
      }
      const multi = options.multi !== false
      const initialDirB64 = Buffer.from(normalizeLocalPath(options.initialDir ?? ''), 'utf8').toString('base64')
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
$dlg.Title = '选择 VectorCraft 文件'
$dlg.Filter = 'VectorCraft 文件 (*.vectorcraft)|*.vectorcraft|所有文件 (*.*)|*.*'
$dlg.Multiselect = ${multi ? '$true' : '$false'}
$dlg.RestoreDirectory = $true
$initDir = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${initialDirB64}'))
if ($initDir -and (Test-Path -LiteralPath $initDir)) { $dlg.InitialDirectory = $initDir }
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

    async pickSaveVectorCraftFile(options = {}): Promise<PickSaveFileResult> {
      if (process.platform !== 'win32') {
        return { supported: false, cancelled: false, filePath: null }
      }
      const defaultNameB64 = Buffer.from((options.defaultName ?? '新建物料项目.vectorcraft').trim(), 'utf8').toString('base64')
      const initialDirB64 = Buffer.from(normalizeLocalPath(options.initialDir ?? ''), 'utf8').toString('base64')
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
$dlg.Title = '新建 A3 横版 VectorCraft 文件'
$dlg.Filter = 'VectorCraft 文件 (*.vectorcraft)|*.vectorcraft'
$dlg.DefaultExt = 'vectorcraft'
$dlg.AddExtension = $true
$dlg.FileName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${defaultNameB64}'))
$initDir = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${initialDirB64}'))
if ($initDir -and (Test-Path -LiteralPath $initDir)) { $dlg.InitialDirectory = $initDir }
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
    },

    async pickFolder(options = {}): Promise<PickFolderResult> {
      if (process.platform !== 'win32') {
        return { supported: false, cancelled: false, folderPath: null }
      }
      const initialDirB64 = Buffer.from(normalizeLocalPath(options.initialDir ?? ''), 'utf8').toString('base64')
      const descB64 = Buffer.from(options.description ?? '选择导出目标文件夹', 'utf8').toString('base64')
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
$dlg.Description = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${descB64}'))
$dlg.ShowNewFolderButton = $true
$initDir = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${initialDirB64}'))
if ($initDir -and (Test-Path -LiteralPath $initDir)) { $dlg.SelectedPath = $initDir }
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
