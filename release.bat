@echo off
rem ============================================================================
rem LocalFolio one-click release
rem
rem Usage: release.bat [version] [--skip-verify] [--dry-run]
rem
rem   version         optional, for example 0.3.0-alpha.12.
rem                   Default: bump the trailing number of the current version.
rem   --skip-verify   skip the local "pnpm run verify" gate.
rem   --dry-run       run preflight checks and print the plan, change nothing.
rem
rem Environment:
rem   RELEASE_MSG     optional commit message (default: chore(release): vX)
rem
rem What it does:
rem   1. preflight: main branch, remote up to date, gh authenticated, tag free
rem   2. bump package.json + bundles/workbench-suite/package.json
rem   3. rename the top "## Unreleased" CHANGELOG heading to the version
rem   4. pnpm run verify
rem   5. commit, tag, push main and tag (with retries)
rem   6. wait for the GitHub Actions run, then print the release/installer links
rem
rem ASCII only on purpose: cmd.exe codepages mangle non-ASCII output.
rem ============================================================================
setlocal EnableExtensions
cd /d "%~dp0"

set "VERSION="
set "SKIP_VERIFY=0"
set "DRY_RUN=0"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--skip-verify" (
  set "SKIP_VERIFY=1"
  shift
  goto parse_args
)
if /i "%~1"=="--dry-run" (
  set "DRY_RUN=1"
  shift
  goto parse_args
)
if /i "%~1"=="-h" goto usage
if /i "%~1"=="--help" goto usage
if defined VERSION (
  echo [error] unexpected argument: %~1
  exit /b 2
)
set "VERSION=%~1"
shift
goto parse_args

:args_done
if not exist ".git" (
  echo [error] .git not found - run this script from the repository root.
  exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
  echo [error] git not found in PATH.
  exit /b 1
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo [error] pnpm not found in PATH.
  exit /b 1
)
where gh >nul 2>nul
if errorlevel 1 (
  echo [error] GitHub CLI gh not found in PATH.
  exit /b 1
)
call gh auth token >nul 2>nul
if errorlevel 1 (
  echo [error] gh is not authenticated. Run: gh auth login
  exit /b 1
)

echo [step] preflight
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
if /i not "%BRANCH%"=="main" (
  echo [error] current branch is "%BRANCH%", expected "main".
  exit /b 1
)
set /a FETCH_TRY=0
:fetch_origin
set /a FETCH_TRY+=1
git fetch origin >nul 2>nul
if not errorlevel 1 goto fetch_ok
if %FETCH_TRY% GEQ 3 (
  echo [error] git fetch origin failed after 3 attempts.
  exit /b 1
)
echo [warn] git fetch failed, retrying...
ping -n 4 127.0.0.1 >nul
goto fetch_origin
:fetch_ok
set "BEHIND=0"
for /f "delims=" %%c in ('git rev-list --count HEAD..origin/main') do set "BEHIND=%%c"
if not "%BEHIND%"=="0" (
  echo [error] local main is %BEHIND% commit^(s^) behind origin/main. Pull first.
  exit /b 1
)

if defined VERSION goto version_ready

:auto_version
set "TMP_FILE=%TEMP%\localfolio-release-%RANDOM%%RANDOM%.tmp"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Get-Content -Raw package.json | ConvertFrom-Json; $v = $p.version; $i = $v.Length; while ($i -gt 0 -and [char]::IsDigit($v[$i-1])) { $i-- }; if ($i -eq $v.Length) { exit 2 }; $v.Substring(0, $i) + ([int]$v.Substring($i) + 1)" > "%TMP_FILE%" 2>nul
if errorlevel 1 (
  echo [error] cannot auto-bump the current version. Pass it explicitly:
  echo         release.bat 0.3.0-alpha.12
  del "%TMP_FILE%" >nul 2>nul
  exit /b 1
)
set /p VERSION=<"%TMP_FILE%"
del "%TMP_FILE%" >nul 2>nul

:version_ready

if /i "%VERSION:~0,1%"=="v" set "VERSION=%VERSION:~1%"

set "RELEASE_VERSION=%VERSION%"
set "TAG=v%VERSION%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "if ($env:RELEASE_VERSION -notmatch '^[0-9][0-9A-Za-z.-]*$') { exit 2 }"
if errorlevel 1 (
  echo [error] invalid version "%VERSION%". Expected something like 0.3.0-alpha.12.
  exit /b 1
)

git rev-parse -q --verify "refs/tags/%TAG%" >nul 2>nul
if not errorlevel 1 (
  echo [error] local tag %TAG% already exists.
  echo         delete it with: git tag -d %TAG%
  exit /b 1
)
set /a LS_TRY=0
:check_remote_tag
set /a LS_TRY+=1
git ls-remote --exit-code --tags origin "%TAG%" >nul 2>nul
set "TAG_REMOTE=%errorlevel%"
if "%TAG_REMOTE%"=="0" (
  echo [error] remote tag %TAG% already exists.
  exit /b 1
)
if "%TAG_REMOTE%"=="2" goto tag_remote_free
if %LS_TRY% GEQ 3 (
  echo [error] cannot query remote tags from origin.
  exit /b 1
)
echo [warn] remote tag check failed, retrying...
ping -n 4 127.0.0.1 >nul
goto check_remote_tag
:tag_remote_free

echo [info] version: %VERSION%
echo [info] tag:     %TAG%

if "%DRY_RUN%"=="1" (
  if "%SKIP_VERIFY%"=="0" echo [dry-run] would run pnpm run verify
  echo [dry-run] would bump package.json and bundles/workbench-suite/package.json
  echo [dry-run] would rename the top "## Unreleased" CHANGELOG heading
  echo [dry-run] would commit, tag, push, and wait for the GitHub Actions run
  exit /b 0
)

set "TMP_FILE=%TEMP%\localfolio-release-%RANDOM%%RANDOM%.tmp"

if "%SKIP_VERIFY%"=="0" (
  echo [step] pnpm run verify
  call pnpm run verify
  if errorlevel 1 (
    echo [error] verify failed. Fix the errors and run the script again.
    exit /b 1
  )
)

echo [step] bump version files
powershell -NoProfile -ExecutionPolicy Bypass -Command "$v = $env:RELEASE_VERSION; $q = [char]34; $pattern = '(' + $q + 'version' + $q + '\s*:\s*' + $q + ')[^' + $q + ']+(' + $q + ')'; foreach ($f in @('package.json','bundles/workbench-suite/package.json')) { $raw = Get-Content -Raw -LiteralPath $f; $next = [regex]::Replace($raw, $pattern, ('${1}' + $v + '${2}')); if ($next -eq $raw) { Write-Host ('[error] version field not found in ' + $f); exit 1 }; [System.IO.File]::WriteAllText((Resolve-Path -LiteralPath $f), $next) }"
if errorlevel 1 (
  echo [error] failed to update package versions.
  exit /b 1
)

echo [step] update changelog heading
powershell -NoProfile -ExecutionPolicy Bypass -Command "$v = $env:RELEASE_VERSION; $path = 'CHANGELOG.md'; if (Test-Path -LiteralPath $path) { $raw = Get-Content -Raw -LiteralPath $path; $next = $raw.Replace('## Unreleased', '## ' + $v); if ($next -ne $raw) { [System.IO.File]::WriteAllText((Resolve-Path -LiteralPath $path), $next) } }"
if errorlevel 1 (
  echo [error] failed to update CHANGELOG.md.
  exit /b 1
)

echo [step] commit
git add -A
git diff --cached --quiet
if errorlevel 1 (
  if defined RELEASE_MSG (
    git commit -m "%RELEASE_MSG%"
  ) else (
    git commit -m "chore(release): %TAG%"
  )
  if errorlevel 1 (
    echo [error] git commit failed.
    exit /b 1
  )
) else (
  echo [info] no staged changes; tagging the current commit.
)

echo [step] tag %TAG%
git tag "%TAG%"
if errorlevel 1 (
  echo [error] git tag failed.
  exit /b 1
)

echo [step] push main
set /a PUSH_TRY=0
:push_main
set /a PUSH_TRY+=1
git push origin main
if not errorlevel 1 goto push_main_ok
if %PUSH_TRY% GEQ 3 (
  echo [error] git push origin main failed after 3 attempts.
  echo         retry manually: git push origin main
  echo         then:          git push origin %TAG%
  exit /b 1
)
echo [warn] push failed, retrying...
ping -n 4 127.0.0.1 >nul
goto push_main
:push_main_ok

echo [step] push tag
set /a PUSH_TRY=0
:push_tag
set /a PUSH_TRY+=1
git push origin "%TAG%"
if not errorlevel 1 goto push_tag_ok
if %PUSH_TRY% GEQ 3 (
  echo [error] git push origin %TAG% failed after 3 attempts.
  echo         retry manually: git push origin %TAG%
  exit /b 1
)
echo [warn] tag push failed, retrying...
ping -n 4 127.0.0.1 >nul
goto push_tag
:push_tag_ok

echo [step] waiting for the GitHub Actions run
set "RUN_ID="
set /a WAIT_TRY=0
:wait_run
set /a WAIT_TRY+=1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$tag = $env:TAG; $runs = gh run list --workflow release-workbench.yml --limit 20 --json databaseId,headBranch | ConvertFrom-Json; $run = @($runs | Where-Object { $_.headBranch -eq $tag }) | Select-Object -First 1; if ($run) { $run.databaseId }" > "%TMP_FILE%" 2>nul
set "RUN_ID="
set /p RUN_ID=<"%TMP_FILE%"
if defined RUN_ID goto run_found
if %WAIT_TRY% GEQ 40 (
  echo [error] no workflow run appeared for %TAG% after about 2 minutes.
  del "%TMP_FILE%" >nul 2>nul
  exit /b 1
)
ping -n 4 127.0.0.1 >nul
goto wait_run
:run_found
del "%TMP_FILE%" >nul 2>nul

echo [info] run id: %RUN_ID%
call gh run watch %RUN_ID% --interval 10 --exit-status
if errorlevel 1 (
  echo [error] GitHub Actions run failed.
  for /f "delims=" %%u in ('gh run view %RUN_ID% --json url --jq .url') do set "RUN_URL=%%u"
  if defined RUN_URL echo [info] run: %RUN_URL%
  exit /b 1
)

echo [step] read release links
set "RELEASE_URL="
set "ASSET_URL="
set /a LINK_TRY=0
:read_links
set /a LINK_TRY+=1
for /f "delims=" %%u in ('gh release view "%TAG%" --json url --jq .url 2^>nul') do set "RELEASE_URL=%%u"
for /f "delims=" %%u in ('gh release view "%TAG%" --json assets --jq .assets[0].url 2^>nul') do set "ASSET_URL=%%u"
if defined ASSET_URL goto links_ready
if %LINK_TRY% GEQ 5 (
  echo [warn] release exists but the asset link was not readable yet.
  exit /b 0
)
ping -n 4 127.0.0.1 >nul
goto read_links
:links_ready

echo.
echo ============================================================
echo [ok] release:   %RELEASE_URL%
echo [ok] installer: %ASSET_URL%
echo ============================================================
exit /b 0

:usage
echo Usage: release.bat [version] [--skip-verify] [--dry-run]
echo.
echo   version         optional, e.g. 0.3.0-alpha.12
echo                   default: bump the trailing number of the current version
echo   --skip-verify   skip the local "pnpm run verify" gate
echo   --dry-run       preflight and print the plan, change nothing
echo.
echo   RELEASE_MSG     optional commit message
echo                   default: chore(release^): vX
echo.
echo   Add a "## Unreleased" heading at the top of CHANGELOG.md before
echo   running so its notes are relabeled with the new version.
exit /b 0
