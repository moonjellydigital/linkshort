# syntax=docker/dockerfile:1.7
#
# Targets
#   runtime  API + built web client. Used by both `app` and `migrate`
#            (same image, different command), so they can never disagree
#            about schema or code version.
#   e2e      Playwright test runner. Based on the Playwright image, whose
#            version must match @playwright/test in packages/e2e.
#
# Images are pinned by tag for readability. For reproducible runs across
# laptop and cloud sandbox, pin by digest as well (tag@sha256:...).

ARG NODE_IMAGE=node:24.21.0-bookworm-slim
ARG PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble
ARG PNPM_VERSION=12.6.0

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN npm install --global --no-fund --no-audit "pnpm@${PNPM_VERSION}"
WORKDIR /repo

# Manifests only, so dependency layers are reused until a manifest changes.
# All workspace manifests are copied (even unused ones) so the frozen lockfile
# matches the workspace exactly; --filter then limits what is installed.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json    packages/api/
COPY packages/web/package.json    packages/web/
COPY packages/e2e/package.json    packages/e2e/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter @linkshort/api... --filter @linkshort/web...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/api    packages/api
COPY packages/web    packages/web
RUN pnpm --filter @linkshort/api --filter @linkshort/web build

# ---------------------------------------------------------------------------
# The API is bundled by esbuild into self-contained files: no node_modules.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    MIGRATIONS_DIR=/app/drizzle \
    STATIC_DIR=/app/public
WORKDIR /app
COPY --from=build /repo/packages/api/dist    ./dist
COPY --from=build /repo/packages/api/drizzle ./drizzle
COPY --from=build /repo/packages/web/dist    ./public
USER node
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/server.mjs"]

# ---------------------------------------------------------------------------
FROM ${PLAYWRIGHT_IMAGE} AS e2e
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN npm install --global --no-fund --no-audit "pnpm@${PNPM_VERSION}"
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json    packages/api/
COPY packages/web/package.json    packages/web/
COPY packages/e2e/package.json    packages/e2e/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @linkshort/e2e...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/e2e    packages/e2e
WORKDIR /repo/packages/e2e
# Browsers ship in the base image; never download them at test time
# (the sandbox network policy would block it anyway).
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
CMD ["pnpm", "exec", "playwright", "test"]
