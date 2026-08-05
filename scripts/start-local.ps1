# Start UI Quality Platform locally (Windows).
# Prerequisites: Node 22+, built packages (`npm run build`), Redis, PostgreSQL.
# Easiest full stack: Docker Desktop + `.\scripts\start-local.ps1 -Docker`

param(
  [switch]$Docker,
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function New-SecretHex {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
}

if ($Docker) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker not found. Install Docker Desktop, then re-run with -Docker." -ForegroundColor Red
    exit 1
  }
  if (-not $env:JWT_SECRET) { $env:JWT_SECRET = New-SecretHex }
  if (-not $env:STORAGE_SIGNING_SECRET) { $env:STORAGE_SIGNING_SECRET = New-SecretHex }
  Write-Host "Starting full stack via Docker Compose (Postgres + Redis + API + worker + web)..."
  docker compose -f infra/docker/docker-compose.yml up --build
  exit $LASTEXITCODE
}

# --- Native Node (no Docker) ---
if (-not $SkipBuild) {
  Write-Host "Building monorepo..."
  npm run build
}

function Get-RedisVersionOnPort([int]$Port) {
  $cli = Get-Command redis-cli -ErrorAction SilentlyContinue
  if (-not $cli) { return $null }
  try {
    $line = & redis-cli -p $Port INFO server 2>$null | Select-String -Pattern "^redis_version:" | Select-Object -First 1
    if ($line -match "redis_version:(\S+)") { return [version]$Matches[1] }
  } catch {}
  return $null
}

function Ensure-RedisUrl {
  $minVersion = [version]"5.0.0"
  if ((Test-NetConnection localhost -Port 6379 -WarningAction SilentlyContinue).TcpTestSucceeded) {
    $ver = Get-RedisVersionOnPort 6379
    if ($ver -and $ver -ge $minVersion) {
      return "redis://127.0.0.1:6379"
    }
    if ($ver) {
      Write-Host "Redis on port 6379 is $ver (BullMQ needs 5.0+). Using Redis 7 in Docker on port 6380."
    }
  } else {
    Write-Host "Starting Redis service..."
    Start-Service Redis -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $ver = Get-RedisVersionOnPort 6379
    if ($ver -and $ver -ge $minVersion) {
      return "redis://127.0.0.1:6379"
    }
  }

  $dockerExe = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
  if (-not (Test-Path $dockerExe)) {
    Write-Host "No Redis 5+ on localhost and Docker not found. Install Docker Desktop or Redis 7+." -ForegroundColor Red
    exit 1
  }

  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $dockerExe rm -f uiq-redis | Out-Null
  $ErrorActionPreference = $prevEap
  $null = & $dockerExe run -d --name uiq-redis -p 6380:6379 redis:7-alpine | Out-Null
  $deadline = (Get-Date).AddMinutes(1)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
    if ((Test-NetConnection localhost -Port 6380 -WarningAction SilentlyContinue).TcpTestSucceeded) { break }
  }
  if (-not (Test-NetConnection localhost -Port 6380 -WarningAction SilentlyContinue).TcpTestSucceeded) {
    Write-Host "Failed to start Redis container on port 6380." -ForegroundColor Red
    exit 1
  }
  return "redis://127.0.0.1:6380"
}

$redisUrl = Ensure-RedisUrl

if (-not (Test-NetConnection localhost -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded) {
  $dockerExe = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
  if (Test-Path $dockerExe) {
    Write-Host "Starting PostgreSQL in Docker (postgres:16)..."
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $dockerExe rm -f uiq-postgres | Out-Null
    $ErrorActionPreference = $prevEap
    $null = & $dockerExe run -d --name uiq-postgres -p 5432:5432 `
      -e POSTGRES_USER=uiquality `
      -e POSTGRES_PASSWORD=uiquality_dev `
      -e POSTGRES_DB=uiquality_dev `
      postgres:16-alpine | Out-Null
    $deadline = (Get-Date).AddMinutes(2)
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Seconds 3
      if ((Test-NetConnection localhost -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded) { break }
    }
  }
}

if (-not (Test-NetConnection localhost -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded) {
  Write-Host @"

PostgreSQL is not available on localhost:5432.

On Windows ARM64, use Docker Desktop:
  1. Open Docker Desktop and wait until it says ""Running"".
  2. Run:  .\scripts\start-local.ps1 -Docker
     OR:  .\scripts\start-local.ps1 -SkipBuild   (starts only Postgres container + Node apps)

"@ -ForegroundColor Yellow
  exit 1
}

$jwt = New-SecretHex
$sign = New-SecretHex
$dbUrl = "postgres://uiquality:uiquality_dev@localhost:5432/uiquality_dev"

function Write-EnvFile($path, $content) {
  $full = Join-Path $Root $path
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($full, $content.TrimEnd() + "`n", $utf8NoBom)
  Write-Host "Wrote $path"
}

Write-EnvFile "apps\api\.env" @"
DATABASE_URL=$dbUrl
REDIS_URL=$redisUrl
JWT_SECRET=$jwt
STORAGE_SIGNING_SECRET=$sign
PORT=4000
WEB_ORIGIN=http://localhost:3000
STORAGE_ROOT_DIR=./data/storage
STORAGE_PUBLIC_BASE_URL=http://localhost:4000/evidence
LOG_PRETTY=1
"@

Write-EnvFile "apps\scanner-worker\.env" @"
DATABASE_URL=$dbUrl
REDIS_URL=$redisUrl
STORAGE_SIGNING_SECRET=$sign
STORAGE_ROOT_DIR=./data/storage
STORAGE_PUBLIC_BASE_URL=http://localhost:4000/evidence
LOG_PRETTY=1
"@

Write-EnvFile "apps\web\.env.local" @"
NEXT_PUBLIC_API_URL=http://localhost:4000
"@

Write-Host "Starting API (port 4000), worker, and web (port 3000) in separate windows..."
Write-Host "Open http://localhost:3000 after all three are up.`n"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\apps\api'; npm run dev"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\apps\scanner-worker'; npm run dev"
Start-Sleep -Seconds 1
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\apps\web'; npm run dev"
