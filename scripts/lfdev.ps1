# LocalFolio Monorepo 隔离验证脚本（默认 profile: lfdev，端口: 3081）。
# 通过安装聚合元包 `bundles/bundle-suite-all` 一次性装配整套独立 DSH 插件。
#
#   pwsh -File scripts\lfdev.ps1 install     # 将 @folio/bundle-suite-all 以 link: 装入 lfdev
#   pwsh -File scripts\lfdev.ps1 restart     # 重启实例并立即返回
#   pwsh -File scripts\lfdev.ps1 url         # 读取实例地址
#   pwsh -File scripts\lfdev.ps1 verify      # 校验 boot payload 包含所有 client 插件
#   pwsh -File scripts\lfdev.ps1 stop        # 停止实例

param(
  [ValidateSet('install', 'restart', 'url', 'stop', 'verify', 'all')]
  [string]$Action = 'all',
  [string]$Profile = 'lfdev',
  [int]$Port = 3081
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SuiteDir = Join-Path $RepoRoot 'bundles\bundle-suite-all'
$Exe = if ($env:DSH_EXE) { $env:DSH_EXE } else { 'D:\deepseekharness\DeepSeek Harness.exe' }
$Bin = if ($env:DSH_BIN) { $env:DSH_BIN } else { 'D:\deepseekharness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js' }

$Stamp = "$Profile-$Port"
$StateDir = Join-Path $RepoRoot '.scratch'
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
$UrlFile = Join-Path $StateDir "dsh-$Stamp-url.txt"
$PidFile = Join-Path $StateDir "dsh-$Stamp.pid"
$OutLog = Join-Path $StateDir "dsh-$Stamp.out.log"
$ErrLog = Join-Path $StateDir "dsh-$Stamp.err.log"

$ExpectedClientPlugins = @(
  '@folio/core-ui-kit',
  '@folio/shell-overlay-ui',
  '@folio/shell-settings-ui',
  '@folio/app-starter-ui',
  '@folio/app-gallery-ui',
  '@folio/app-sidebar-ui',
  '@folio/app-admin-ui',
  '@folio/app-studio-ui'
)

function Invoke-Dsh {
  param([string[]]$DshArgs)
  $start = [System.Diagnostics.ProcessStartInfo]::new($Exe)
  $start.ArgumentList.Add($Bin)
  foreach ($a in $DshArgs) { $start.ArgumentList.Add($a) }
  $start.Environment['ELECTRON_RUN_AS_NODE'] = '1'
  $start.UseShellExecute = $false
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($start)
  $out = $p.StandardOutput.ReadToEnd()
  $err = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  [pscustomobject]@{ Code = $p.ExitCode; Out = $out; Err = $err }
}

function Stop-Instance {
  if (Test-Path $PidFile) {
    $oldPid = (Get-Content $PidFile -Raw).Trim()
    if ($oldPid) {
      Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue
      Write-Host "stopped pid $oldPid"
    }
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
  }
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object {
      if ($_ -and $_ -ne 0) {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        Write-Host "freed port $Port (killed pid $_)"
      }
    }
  Start-Sleep -Seconds 2
}

function Ensure-WebAppBundle {
  $manifest = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile\package.json"
  if (-not (Test-Path $manifest)) { Write-Host "no profile manifest at $manifest; skipping web-app check"; return }
  $doc = Get-Content $manifest -Raw | ConvertFrom-Json
  $bundles = @($doc.dsh.profile.bundles)
  if ($bundles -contains '@deepseek-ai/dsh-web-app') { return }
  $next = @()
  foreach ($b in $bundles) {
    $next += $b
    if ($b -eq '@deepseek-ai/dsh-base') { $next += '@deepseek-ai/dsh-web-app' }
  }
  if ($next -notcontains '@deepseek-ai/dsh-web-app') { $next += '@deepseek-ai/dsh-web-app' }
  $doc.dsh.profile.bundles = $next
  ($doc | ConvertTo-Json -Depth 12) + "`n" | Set-Content -Path $manifest -Encoding utf8NoBOM
  Write-Host "added @deepseek-ai/dsh-web-app to profile $Profile"
}

function Install-Bundle {
  # Remove legacy single-bundle package if present in this profile
  $manifest = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile\package.json"
  if (Test-Path $manifest) {
    $doc = Get-Content $manifest -Raw | ConvertFrom-Json
    if ($doc.dsh.profile.bundles -contains '@local/localfolio') {
      Write-Host "removing legacy @local/localfolio from profile $Profile"
      $null = Invoke-Dsh @('plugin', '--profile', $Profile, 'remove', '@local/localfolio')
    }
  }

  $spec = "link:$SuiteDir"
  Write-Host "installing $spec into profile $Profile"
  $r = Invoke-Dsh @('plugin', '--profile', $Profile, 'add', $spec)
  if ($r.Out) { $r.Out.Trim() | Select-Object -Last 8 | ForEach-Object { Write-Host "  $_" } }
  if ($r.Code -ne 0) { if ($r.Err) { Write-Host $r.Err }; throw "install exited $($r.Code)" }
  Ensure-WebAppBundle
}

function Start-Instance {
  Stop-Instance
  Remove-Item $OutLog, $ErrLog, $UrlFile -ErrorAction SilentlyContinue
  $env:ELECTRON_RUN_AS_NODE = '1'
  $p = Start-Process -FilePath $Exe `
    -ArgumentList $Bin, '--profile', $Profile, '--no-open', '--port', $Port `
    -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog `
    -WindowStyle Hidden -PassThru
  Set-Content -Path $PidFile -Value $p.Id -Encoding ascii
  Write-Host "started pid $($p.Id) on port $Port (run 'url' in a few seconds)"
}

function Show-Url {
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $OutLog) {
      $line = (Get-Content $OutLog -Raw) -split "`n" | Select-String -Pattern 'http://127\.0\.0\.1:\d+' | Select-Object -First 1
      if ($line) {
        $url = ([regex]::Match($line.ToString(), 'http://127\.0\.0\.1:\d+/\S*')).Value
        Set-Content -Path $UrlFile -Value $url -Encoding ascii
        Write-Host $url
        return
      }
    }
    Start-Sleep -Milliseconds 400
  }
  throw "no URL yet; check $OutLog"
}

function Verify-Instance {
  if (-not (Test-Path $UrlFile)) { throw "no url file; run restart first" }
  $url = (Get-Content $UrlFile -Raw).Trim()
  $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25
  Write-Host "status=$($r.StatusCode) bytes=$($r.RawContentLength)"
  foreach ($id in $ExpectedClientPlugins) {
    $escaped = [regex]::Escape($id)
    $found = $r.Content -match "`"id`":\s*`"$escaped`""
    Write-Host "  boot payload has ${id}: $found"
    if (-not $found) { throw "missing client plugin in boot payload: $id" }
  }
}

switch ($Action) {
  'install' { Install-Bundle }
  'restart' { Start-Instance }
  'url'     { Show-Url }
  'stop'    { Stop-Instance }
  'verify'  { Verify-Instance }
  'all'     { Install-Bundle; Start-Instance }
}
