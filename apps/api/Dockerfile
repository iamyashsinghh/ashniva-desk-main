# Ashniva Desk API — production image.
# Build from the repository root:  docker build -f apps/api/Dockerfile .
#
# - Dependencies are installed and the app is compiled during the image build (stages deps/build).
# - The runtime stage contains no pnpm at all: the container runs node and the Prisma CLI directly
#   through docker/entrypoint.sh, as the unprivileged `node` user that owns /repo.
# - Debian (glibc) base rather than Alpine: argon2 and the Prisma engines ship glibc builds.

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

# ---- install dependencies (cached separately from source) -------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
# Every workspace package.json is needed: --frozen-lockfile verifies the lockfile against ALL
# workspace projects, even those excluded from the install by --filter.
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
# Build scripts run only for the packages allow-listed in pnpm-workspace.yaml (argon2, prisma).
RUN pnpm install --frozen-lockfile --filter @ashniva/api...

# ---- build ---------------------------------------------------------------------------------
FROM deps AS build
COPY packages/config packages/config
COPY packages/types packages/types
COPY apps/api apps/api
RUN pnpm --filter @ashniva/types build \
  && pnpm --filter @ashniva/api db:generate \
  && pnpm --filter @ashniva/api build \
  && chmod +x apps/api/docker/entrypoint.sh

# ---- runtime -------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
# openssl: the Prisma schema engine (migrations) links against libssl and warns without it.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
# Everything the app needs at runtime, owned by the unprivileged user it runs as. The workspace
# layout is kept so the pnpm symlinks inside node_modules keep resolving. Each workspace package
# resolves its own dependencies from its own node_modules (pnpm layout), so those come along too.
COPY --from=build --chown=node:node /repo/node_modules /repo/node_modules
COPY --from=build --chown=node:node /repo/packages/types/package.json /repo/packages/types/package.json
COPY --from=build --chown=node:node /repo/packages/types/node_modules /repo/packages/types/node_modules
COPY --from=build --chown=node:node /repo/packages/types/dist /repo/packages/types/dist
COPY --from=build --chown=node:node /repo/apps/api/package.json /repo/apps/api/package.json
COPY --from=build --chown=node:node /repo/apps/api/node_modules /repo/apps/api/node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist /repo/apps/api/dist
COPY --from=build --chown=node:node /repo/apps/api/prisma /repo/apps/api/prisma
COPY --from=build --chown=node:node /repo/apps/api/prisma.config.ts /repo/apps/api/prisma.config.ts
# The seed script (prisma/seed.ts, run with tsx) imports the generated client from src/generated,
# the pure daily-report builder/collector and the contract billing-period maths, so the seeded
# reports and hour ledger match exactly what the API computes.
COPY --from=build --chown=node:node /repo/apps/api/src/generated /repo/apps/api/src/generated
COPY --from=build --chown=node:node /repo/apps/api/src/modules/reports/daily-report-builder.ts /repo/apps/api/src/modules/reports/daily-report-builder.ts
COPY --from=build --chown=node:node /repo/apps/api/src/modules/reports/daily-report-collector.ts /repo/apps/api/src/modules/reports/daily-report-collector.ts
COPY --from=build --chown=node:node /repo/apps/api/src/modules/contracts/contract-periods.ts /repo/apps/api/src/modules/contracts/contract-periods.ts
COPY --from=build --chown=node:node /repo/apps/api/docker/entrypoint.sh /repo/apps/api/docker/entrypoint.sh
WORKDIR /repo/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=40s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["/repo/apps/api/docker/entrypoint.sh"]
CMD ["start"]
