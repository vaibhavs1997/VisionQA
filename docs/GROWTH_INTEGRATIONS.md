# Growth integrations

## Stripe billing

- Webhook stub: `POST /api/billing/webhook` (requires `STRIPE_WEBHOOK_SECRET`).
- Plan catalog: `GET /api/billing/plans`.
- Wire workspace `plan` column to checkout sessions in a future pass.

## GitHub Action

See [action.yml](../.github/workflows/ui-scan-action.yml) — runs the CLI against a URL on pull requests when configured with `UI_SCAN_URL`.

## Issue workflow

- `PATCH /api/workspaces/:workspaceId/issues/:issueId` with `{ workflowStatus, assigneeUserId }`.
- CSV export: `GET /api/workspaces/:workspaceId/scans/:scanId/export.csv`.

## Scheduled scans

- `POST /api/workspaces/:workspaceId/schedules` with project + crawl options.
- API runs `runScheduleTick` every 60s (UTC hour match on cron’s hour field).
