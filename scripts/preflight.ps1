[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Write-Status {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Details
  )

  $label = if ($Ok) { "OK" } else { "MISSING" }
  $color = if ($Ok) { "Green" } else { "Yellow" }
  Write-Host ("[{0}] {1} - {2}" -f $label, $Name, $Details) -ForegroundColor $color
}

function Get-CommandVersion {
  param(
    [string]$Command,
    [string[]]$VersionArgs = @("--version"),
    [string[]]$FallbackPaths = @()
  )

  $cmd = Get-Command $Command -ErrorAction SilentlyContinue
  $commandPath = $null
  if ($cmd) {
    $commandPath = if ($cmd.Source) { $cmd.Source } elseif ($cmd.Path) { $cmd.Path } else { $cmd.Definition }
  }

  if (-not $commandPath) {
    foreach ($candidate in $FallbackPaths) {
      if (Test-Path $candidate) {
        $commandPath = $candidate
        break
      }
    }
  }

  if (-not $commandPath) {
    return $null
  }

  try {
    $output = & $commandPath @VersionArgs 2>$null | Select-Object -First 1
    return [string]$output
  }
  catch {
    return $null
  }
}

Write-Host "Whiteboard Planner preflight" -ForegroundColor Cyan
Write-Host "Project root: $PSScriptRoot\.." -ForegroundColor DarkCyan

$nodeVersion = Get-CommandVersion -Command "node"
Write-Status "Node.js" ($null -ne $nodeVersion) $(if ($nodeVersion) { $nodeVersion } else { "Install Node.js LTS" })

$npmVersion = Get-CommandVersion -Command "npm"
Write-Status "npm" ($null -ne $npmVersion) $(if ($npmVersion) { $npmVersion } else { "Install npm" })

$uvVersion = Get-CommandVersion -Command "uv"
Write-Status "uv" ($null -ne $uvVersion) $(if ($uvVersion) { $uvVersion } else { "Install uv" })

$python312 = Get-CommandVersion -Command "py" -VersionArgs @("-3.12", "--version") -FallbackPaths @(
  (Join-Path $env:LocalAppData "Programs\Python\Launcher\py.exe"),
  (Join-Path $env:LocalAppData "Programs\Python\Python312\python.exe")
)
Write-Status "Python 3.12" ($null -ne $python312) $(if ($python312) { $python312 } else { "Install Python 3.12" })

Write-Host ""
Write-Host "Recommended next steps" -ForegroundColor Cyan
if ($null -eq $python312) {
  Write-Host "./scripts/bootstrap.ps1 -InstallPython"
}
if ($null -eq $nodeVersion -or $null -eq $npmVersion) {
  Write-Host "Install Node.js LTS from https://nodejs.org/"
}
if ($null -eq $uvVersion) {
  Write-Host "Install uv from https://docs.astral.sh/uv/"
}
