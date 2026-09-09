# Ashniva Desk web — static build served by an unprivileged nginx (which also proxies /api and /ws
# to the API container). Build from the repository root:  docker build -f apps/web/Dockerfile .

FROM node:22-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
# Every workspace package.json is needed: --frozen-lockfile verifies the lockfile against ALL
# workspace projects, even those excluded from the install by --filter.
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --filter @ashniva/web...
COPY packages/config packages/config
COPY packages/types packages/types
COPY packages/ui packages/ui
COPY apps/web apps/web
# Relative by default: nginx.conf forwards /api to the API container.
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @ashniva/types build && pnpm --filter @ashniva/web build

# nginx-unprivileged runs as the `nginx` user (uid 101) and listens on 8080 — no root process.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
