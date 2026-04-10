[CmdletBinding()]
param(
  [switch]$InstallPython
)

$ErrorActionPreference = "Stop"

function Assert-Winget {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget is required to run bootstrap.ps1"
  }
}

Assert-Winget

Write-Host "Whiteboard Planner bootstrap" -ForegroundColor Cyan

if (-not $InstallPython) {
  Write-Host "Nothing selected. Use -InstallPython to install Python 3.12." -ForegroundColor Yellow
  exit 0
}

Write-Host "Installing Python 3.12..." -ForegroundColor Yellow
winget install --id Python.Python.3.12 --exact --accept-package-agreements --accept-source-agreements

Write-Host ""
Write-Host "Run ./scripts/preflight.ps1 again after installation completes." -ForegroundColor Green
