# Windows development

## Option A — Docker Desktop (recommended)

```powershell
cd ui-quality-platform
$env:JWT_SECRET = -join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
$env:STORAGE_SIGNING_SECRET = -join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
docker compose -f infra/docker/docker-compose.yml up --build
```

Open http://localhost:3000

## Option B — Native Node + WSL2 services

1. Install **Node 22**, **Playwright Chromium**, **Postgres 16**, and **Redis** (WSL2 Ubuntu is closest to CI).
2. From repo root:

```powershell
cd ui-quality-platform
npm install
npx playwright install chromium
npm run build
```

3. Start services (three terminals):

```powershell
# API
cd apps\api
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/uiquality_dev"
$env:JWT_SECRET="dev-secret-change-me"
$env:STORAGE_SIGNING_SECRET="dev-signing-secret"
npm run dev

# Worker
cd apps\scanner-worker
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/uiquality_dev"
$env:STORAGE_SIGNING_SECRET="dev-signing-secret"
# Optional if Playwright browser path differs:
# $env:UI_SCAN_CHROMIUM_PATH="C:\path\to\chrome.exe"
npm run dev

# Web
cd apps\web
npm run dev
```

## Helper script

```powershell
.\scripts\dev-windows.ps1 -Action install   # npm install + playwright
.\scripts\dev-windows.ps1 -Action build
```

## Notes

- Use `UI_SCAN_CHROMIUM_PATH` when corporate proxies block Playwright’s CDN.
- OneDrive paths can slow `npm install`; cloning outside OneDrive avoids file-lock issues.
