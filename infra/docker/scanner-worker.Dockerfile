# Multi-stage build for @ui-quality/scanner-worker, run from the
# MONOREPO ROOT:
#   docker build -f infra/docker/scanner-worker.Dockerfile -t ui-quality-scanner-worker .
#
# This is the one image that needs a real Chromium — `playwright install
# --with-deps` pulls both the browser binary AND the system libraries
# (libnss3, libatk, etc.) it needs, which is exactly the download this
# project's own development sandbox couldn't reach (see README's
# "Chromium binary" note) but which works normally in a real Docker
# build environment with full internet access.

FROM node:22-slim AS build
WORKDIR /repo

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/scanner-core/package.json packages/scanner-core/
COPY packages/detectors/package.json packages/detectors/
COPY packages/issue-engine/package.json packages/issue-engine/
COPY packages/ai-engine/package.json packages/ai-engine/
COPY packages/database/package.json packages/database/
COPY packages/queue/package.json packages/queue/
COPY packages/storage/package.json packages/storage/
COPY packages/observability/package.json packages/observability/
COPY apps/scanner-worker/package.json apps/scanner-worker/

RUN npm install

COPY packages/shared packages/shared
COPY packages/scanner-core packages/scanner-core
COPY packages/detectors packages/detectors
COPY packages/issue-engine packages/issue-engine
COPY packages/ai-engine packages/ai-engine
COPY packages/database packages/database
COPY packages/queue packages/queue
COPY packages/storage packages/storage
COPY packages/observability packages/observability
COPY apps/scanner-worker apps/scanner-worker

RUN npm run build --workspace=@ui-quality/shared \
 && npm run build --workspace=@ui-quality/detectors --workspace=@ui-quality/issue-engine --workspace=@ui-quality/scanner-core --workspace=@ui-quality/ai-engine --workspace=@ui-quality/database --workspace=@ui-quality/queue --workspace=@ui-quality/storage --workspace=@ui-quality/observability \
 && npm run build --workspace=@ui-quality/scanner-worker

# --- Runtime stage ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Real Chromium + its system libraries. This is the step that would have
# failed in this project's own development sandbox (network egress
# restricted to an allowlist that didn't include Playwright's CDN) — see
# README for how that was worked around during development. In a normal
# Docker build with internet access, this just works.
COPY --from=build /repo/node_modules/playwright ./node_modules/playwright
RUN npx --prefix . playwright install --with-deps chromium

COPY --from=build /repo/package.json /repo/package-lock.json* ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/packages/scanner-core/dist ./packages/scanner-core/dist
COPY --from=build /repo/packages/scanner-core/package.json ./packages/scanner-core/package.json
COPY --from=build /repo/packages/detectors/dist ./packages/detectors/dist
COPY --from=build /repo/packages/detectors/package.json ./packages/detectors/package.json
COPY --from=build /repo/packages/issue-engine/dist ./packages/issue-engine/dist
COPY --from=build /repo/packages/issue-engine/package.json ./packages/issue-engine/package.json
COPY --from=build /repo/packages/ai-engine/dist ./packages/ai-engine/dist
COPY --from=build /repo/packages/ai-engine/package.json ./packages/ai-engine/package.json
COPY --from=build /repo/packages/database/dist ./packages/database/dist
COPY --from=build /repo/packages/database/package.json ./packages/database/package.json
COPY --from=build /repo/packages/queue/dist ./packages/queue/dist
COPY --from=build /repo/packages/queue/package.json ./packages/queue/package.json
COPY --from=build /repo/packages/storage/dist ./packages/storage/dist
COPY --from=build /repo/packages/storage/package.json ./packages/storage/package.json
COPY --from=build /repo/packages/observability/dist ./packages/observability/dist
COPY --from=build /repo/packages/observability/package.json ./packages/observability/package.json
COPY --from=build /repo/apps/scanner-worker/dist ./apps/scanner-worker/dist
COPY --from=build /repo/apps/scanner-worker/package.json ./apps/scanner-worker/package.json

# Per the Phase 4 worker-isolation spec: run as an unprivileged user, no
# persistent state between scans (each scan gets its own temp dir, see
# process-scan-job.ts, cleaned up in a `finally` block regardless of
# success/failure).
RUN groupadd -r scanner && useradd -r -g scanner scanner \
 && chown -R scanner:scanner /app
USER scanner

EXPOSE 9091
CMD ["node", "apps/scanner-worker/dist/index.js"]
