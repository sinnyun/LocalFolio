# LocalFolio 套件的 profile 安装 / 实例验证脚本（默认 profile: lfdev，端口: 3081）。
# 开发默认装两个聚合元包：
#   bundles/workbench-suite  产品入口：基础能力 + 桥接 + 正式工作区
#   bundles/test-suite       六个 test-* 验证界面（产品安装不含它们）
# 想只验证产品安装，手动 `dsh plugin --profile <name> add link:...\bundles\workbench-suite` 即可。
#
#   pwsh -File scripts\lfdev.ps1 install [-Profile <name>]   # link: 装入两个套件，并清理指向旧路径的悬空 bundle
#   pwsh -File scripts\lfdev.ps1 restart [-Port <port>]      # 重启实例并立即返回
#   pwsh -File scripts\lfdev.ps1 url                        # 读取实例地址
#   pwsh -File scripts\lfdev.ps1 verify                      # 校验 boot payload 包含所有 client 插件
#   pwsh -File scripts\lfdev.ps1 stop                        # 停止实例
#
# `desktop` profile 由 Electron 应用独占，CLI 会拒绝（"managed exclusively by the
# Electron application"）；桌面版请在应用内的插件管理里添加依赖：
#   link:F:\AI\geren\LocalFolio\bundles\workbench-suite

param(
  [ValidateSet('install', 'restart', 'url', 'stop', 'verify', 'all')]
  [string]$Action = 'all',
  [string]$Profile = 'lfdev',
  [int]$Port = 3081
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SuiteDir = Join-Path $RepoRoot 'bundles\workbench-suite'
$TestSuiteDir = Join-Path $RepoRoot 'bundles\test-suite'
$SuiteNames = @('@folio/workbench-suite', '@folio/test-suite')
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
  '@folio/base-ui-kit',
  '@folio/base-shell-ui',
  '@folio/base-settings-ui',
  '@folio/test-overview-ui',
  '@folio/test-gallery-ui',
  '@folio/test-sidebar-ui',
  '@folio/test-shadcn-admin-ui',
  '@folio/test-studio-admin-ui',
  '@folio/base-frame-ui',
  '@folio/bridge-dsh-interactions-ui',
  '@folio/bridge-frame-test-ui',
  '@folio/workspace-files-ui',
  '@folio/workspace-canvas-ui',
  '@folio/feature-canvas-eagle-ui',
  '@folio/workspace-materials-ui',
  '@folio/workspace-projects-ui',
  '@folio/feature-archive-ui',
  '@folio/feature-thumbs-eagle-ui'
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

function Prune-StaleBundles {
  # A renamed or deleted suite leaves a dangling `dsh.profile.bundles` entry, and
  # `dsh plugin` reconciles that list before it can remove anything itself, so the
  # entry has to go from package.json first.
  $manifest = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile\package.json"
  if (-not (Test-Path $manifest)) { return }

  $stale = @()
  foreach ($prop in @($doc.dependencies.PSObject.Properties)) {
    if ($SuiteNames -contains $prop.Name) { continue }
    $spec = [string]$prop.Value
    $target = if ($spec -like 'link:*') { $spec.Substring(5) -replace '/', '\' } else { $null }
    $pointsHere = $target -and $target -like "*$RepoRoot*"
    $missing = $target -and -not (Test-Path $target)
    if (($prop.Name -like '@folio/*' -or $prop.Name -like '@local/*') -and ($pointsHere -or $missing)) {
      $stale += $prop.Name
    }
  }

  if ($stale.Count -eq 0) { return }
  Write-Host "pruning stale profile bundles: $($stale -join ', ')"
  foreach ($name in $stale) { $doc.dependencies.PSObject.Properties.Remove($name) }
  $doc.dsh.profile.bundles = @($doc.dsh.profile.bundles | Where-Object { $stale -notcontains $_ })
  ($doc | ConvertTo-Json -Depth 12) + "`n" | Set-Content -Path $manifest -Encoding utf8NoBOM
}

function Ensure-SuiteBundleEntry {
  # `dsh plugin add` installs the dependency but leaves `dsh.profile.bundles`
  # alone when the package is already listed in dependencies, so the boot loader
  # would never see the suite; keep the bundle list authoritative.
  $manifest = Join-Path $env:USERPROFILE ".dsh\profiles\$Profile\package.json"
  if (-not (Test-Path $manifest)) { return }

  $doc = Get-Content $manifest -Raw | ConvertFrom-Json
  $bundles = @($doc.dsh.profile.bundles)
  $missing = @($SuiteNames | Where-Object { $bundles -notcontains $_ })
  if ($missing.Count -eq 0) { return }

  foreach ($name in $missing) { Write-Host "enabling $name in profile $Profile" }
  $doc.dsh.profile.bundles = @($bundles + $missing)
  ($doc | ConvertTo-Json -Depth 12) + "`n" | Set-Content -Path $manifest -Encoding utf8NoBOM
}

function Install-Bundle {
  Prune-StaleBundles

  foreach ($dir in @($SuiteDir, $TestSuiteDir)) {
    $spec = "link:$dir"
    Write-Host "installing $spec into profile $Profile"
    $r = Invoke-Dsh @('plugin', '--profile', $Profile, 'add', $spec)
    if ($r.Out) { $r.Out.Trim() | Select-Object -Last 8 | ForEach-Object { Write-Host "  $_" } }
    if ($r.Code -ne 0) { if ($r.Err) { Write-Host $r.Err }; throw "install exited $($r.Code)" }
  }

  Ensure-SuiteBundleEntry
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
