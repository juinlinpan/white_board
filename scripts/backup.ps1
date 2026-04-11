[CmdletBinding()]
param(
  [string]$BackendRoot,
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
$resolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputDir)
$databasePath = Join-Path $resolvedBackendRoot "data\\whiteboard.db"
$logsPath = Join-Path $resolvedBackendRoot "logs"

if (-not (Test-Path $databasePath -PathType Leaf)) {
  throw "SQLite database not found at '$databasePath'."
}

New-Item -ItemType Directory -Force -Path $resolvedOutputRoot | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $resolvedOutputRoot "whiteboard-backup-$timestamp"
$backupDataDir = Join-Path $backupRoot "data"
$backupLogsDir = Join-Path $backupRoot "logs"

New-Item -ItemType Directory -Force -Path $backupDataDir, $backupLogsDir | Out-Null
Copy-Item -LiteralPath $databasePath -Destination (Join-Path $backupDataDir "whiteboard.db") -Force

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
  sqlite_path = $databasePath
  logs_path = $logsPath
  copied_logs = $copiedLogs
}

$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupRoot "backup.json") -Encoding utf8

Write-Host "Created backup at $backupRoot" -ForegroundColor Green
