# Staging verification (Anthropic + S3)

Use this checklist before calling production paths “verified.”

## Anthropic vision (`--ai anthropic`)

1. Set `ANTHROPIC_API_KEY` on the scanner worker (not the web app).
2. Run a scan with `aiMode: anthropic` against a public page with ambiguous overlap.
3. Confirm `ai_telemetry` on the scan row and `aiValidation` on at least one issue.
4. CI: add a manual `workflow_dispatch` job with `ANTHROPIC_API_KEY` secret (optional).

## S3 object storage

1. Implement `S3ObjectStorage` in [packages/storage/src/s3-adapter.ts](../packages/storage/src/s3-adapter.ts) (stub today).
2. Set `STORAGE_BACKEND=s3`, bucket, and credentials on API + worker.
3. Confirm signed evidence URLs load screenshots without the API `/evidence` proxy.
4. Run `npm run backup --workspace=@ui-quality/database` with `BACKUP_S3_BUCKET` set.

## Docker Compose

1. `docker compose -f infra/docker/docker-compose.yml up --build`
2. Register, scan, and download CSV export end-to-end.
