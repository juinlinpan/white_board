[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [string]$BackendRoot,
  [string]$FrontendDist
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Restore-EnvVar {
  param(
    [string]$Name,
    [bool]$HadValue,
    [string]$Value
  )

  if ($HadValue) {
    Set-Item -Path ("Env:{0}" -f $Name) -Value $Value
    return
  }

  Remove-Item -Path ("Env:{0}" -f $Name) -ErrorAction SilentlyContinue
}

$hadBackendRoot = Test-Path Env:WHITEBOARD_BACKEND_ROOT
$previousBackendRoot = $env:WHITEBOARD_BACKEND_ROOT
$hadFrontendDist = Test-Path Env:WHITEBOARD_FRONTEND_DIST
$previousFrontendDist = $env:WHITEBOARD_FRONTEND_DIST

Push-Location $projectRoot

try {
  if ([string]::IsNullOrWhiteSpace($BackendRoot)) {
    $BackendRoot = Join-Path $projectRoot "backend"
  }

  if ([string]::IsNullOrWhiteSpace($FrontendDist)) {
    $FrontendDist = Join-Path $projectRoot "frontend\\dist"
  }

  $resolvedBackendRoot = [System.IO.Path]::GetFullPath($BackendRoot)
  $resolvedFrontendDist = [System.IO.Path]::GetFullPath($FrontendDist)

  if (-not $SkipBuild) {
    Write-Host "Building frontend bundle..." -ForegroundColor Cyan
    npm run build
  }

  if (-not (Test-Path $resolvedFrontendDist -PathType Container)) {
    throw "Frontend dist not found at '$resolvedFrontendDist'. Run npm run build first."
  }

  $env:WHITEBOARD_BACKEND_ROOT = $resolvedBackendRoot
  $env:WHITEBOARD_FRONTEND_DIST = $resolvedFrontendDist

  Write-Host "Running backend smoke tests..." -ForegroundColor Cyan
  uv run --project backend python -m pytest `
    backend/tests/test_healthz.py `
    backend/tests/test_static_serving.py

  Write-Host ""
  Write-Host "Smoke checks passed." -ForegroundColor Green
  Write-Host "Backend root : $resolvedBackendRoot" -ForegroundColor DarkCyan
  Write-Host "Frontend dist: $resolvedFrontendDist" -ForegroundColor DarkCyan
}
finally {
  Pop-Location
  Restore-EnvVar -Name "WHITEBOARD_BACKEND_ROOT" -HadValue $hadBackendRoot -Value $previousBackendRoot
  Restore-EnvVar -Name "WHITEBOARD_FRONTEND_DIST" -HadValue $hadFrontendDist -Value $previousFrontendDist
}
