# Multi-stage build for @ui-quality/web, run from the MONOREPO ROOT:
#   docker build -f infra/docker/web.Dockerfile -t ui-quality-web .
#
# Uses Next.js's `output: "standalone"` (see next.config.js) so the
# runtime image only carries the traced subset of node_modules the app
# actually needs at runtime, not the whole workspace install.

FROM node:22-slim AS build
WORKDIR /repo

COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/web/package.json apps/web/

RUN npm install

COPY apps/web apps/web

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build --workspace=@ui-quality/web

# --- Runtime stage: only the standalone-traced output ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public

RUN groupadd -r webapp && useradd -r -g webapp webapp \
 && chown -R webapp:webapp /app
USER webapp

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
