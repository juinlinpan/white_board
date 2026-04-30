[CmdletBinding()]
param(
  [string]$BackendRoot,
  [string]$PlanvasRoot,
  [string]$OutputDir
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($BackendRoot)) {
  $BackendRoot = if ([string]::IsNullOrWhiteSpace($env:WHITEBOARD_BACKEND_ROOT)) {
    Join-Path $projectRoot "backend"
  }
  else {
    $env:WHITEBOARD_BACKEND_ROOT
  }
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $projectRoot "backups"
}

$resolvedBackendRoot = [System.IO.Path]::GetFullPath($BackendRoot)
$resolvedPlanvasRoot = if ([string]::IsNullOrWhiteSpace($PlanvasRoot)) {
  if ([string]::IsNullOrWhiteSpace($env:WHITEBOARD_PLANVAS_ROOT)) {
    Join-Path $HOME ".planvas"
  }
  else {
    $env:WHITEBOARD_PLANVAS_ROOT
  }
}
else {
  $PlanvasRoot
}
$resolvedPlanvasRoot = [System.IO.Path]::GetFullPath($resolvedPlanvasRoot)
$resolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputDir)
$logsPath = Join-Path $resolvedBackendRoot "logs"

if (-not (Test-Path $resolvedPlanvasRoot -PathType Container)) {
  throw "Planvas root not found at '$resolvedPlanvasRoot'."
}

New-Item -ItemType Directory -Force -Path $resolvedOutputRoot | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $resolvedOutputRoot "whiteboard-backup-$timestamp"
$backupPlanvasDir = Join-Path $backupRoot "planvas"
$backupLogsDir = Join-Path $backupRoot "logs"

New-Item -ItemType Directory -Force -Path $backupPlanvasDir, $backupLogsDir | Out-Null
Get-ChildItem -LiteralPath $resolvedPlanvasRoot | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $backupPlanvasDir -Recurse -Force
}

$copiedLogs = @()
if (Test-Path $logsPath -PathType Container) {
  $logFiles = Get-ChildItem -LiteralPath $logsPath -File
  foreach ($logFile in $logFiles) {
    Copy-Item -LiteralPath $logFile.FullName -Destination (Join-Path $backupLogsDir $logFile.Name) -Force
    $copiedLogs += $logFile.Name
  }
}

$manifest = @{
  created_at = (Get-Date).ToString("s")
  backend_root = $resolvedBackendRoot
  planvas_root = $resolvedPlanvasRoot
  logs_path = $logsPath
  copied_logs = $copiedLogs
}

$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupRoot "backup.json") -Encoding utf8

Write-Host "Created backup at $backupRoot" -ForegroundColor Green
