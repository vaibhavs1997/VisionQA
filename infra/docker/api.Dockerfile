# Multi-stage build for @ui-quality/api, run from the MONOREPO ROOT:
#   docker build -f infra/docker/api.Dockerfile -t ui-quality-api .
#
# A workspace-based monorepo needs the whole dependency graph present to
# resolve @ui-quality/* packages via npm workspaces symlinks — there's no
# way to build just apps/api in isolation, so this stage copies the
# packages the API's dependency chain actually needs (shared, scanner-
# core is NOT needed by the API itself, only database/queue/storage/
# observability) plus apps/api, builds them in dependency order, then a
# slim runtime stage carries over only the compiled output.

FROM node:22-slim AS build
WORKDIR /repo

COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY packages/queue/package.json packages/queue/
COPY packages/storage/package.json packages/storage/
COPY packages/observability/package.json packages/observability/
COPY apps/api/package.json apps/api/

RUN npm install

COPY packages/shared packages/shared
COPY packages/database packages/database
COPY packages/queue packages/queue
COPY packages/storage packages/storage
COPY packages/observability packages/observability
COPY apps/api apps/api

RUN npm run build --workspace=@ui-quality/shared \
 && npm run build --workspace=@ui-quality/database --workspace=@ui-quality/queue --workspace=@ui-quality/storage --workspace=@ui-quality/observability \
 && npm run build --workspace=@ui-quality/api

# --- Runtime stage: only compiled JS + production node_modules ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /repo/package.json /repo/package-lock.json* ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/packages/database/dist ./packages/database/dist
COPY --from=build /repo/packages/database/package.json ./packages/database/package.json
COPY --from=build /repo/packages/queue/dist ./packages/queue/dist
COPY --from=build /repo/packages/queue/package.json ./packages/queue/package.json
COPY --from=build /repo/packages/storage/dist ./packages/storage/dist
COPY --from=build /repo/packages/storage/package.json ./packages/storage/package.json
COPY --from=build /repo/packages/observability/dist ./packages/observability/dist
COPY --from=build /repo/packages/observability/package.json ./packages/observability/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
