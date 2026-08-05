param(
  [ValidateSet("install", "build", "help")]
  [string]$Action = "help"
)

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

switch ($Action) {
  "install" {
    npm install
    npx playwright install chromium
  }
  "build" {
    npm run build
  }
  default {
    Write-Host "Usage: dev-windows.ps1 -Action install|build"
  }
}
