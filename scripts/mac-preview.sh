#!/usr/bin/env bash
#
# Ashniva Desk — one-command local preview for macOS (also works on Linux; the browser step is
# macOS-only).
#
# What it does:
#   1. Checks that Docker Desktop is installed and running (and tries to start it on macOS).
#   2. Creates the local .env files from the .env.example files (never overwrites existing ones).
#   3. Builds the application images (dependencies are installed inside the images, never on
#      your Mac) and starts PostgreSQL, Redis and MinIO, waiting until each is healthy.
#   4. Applies the database migrations and loads the safe development seed data.
#   5. Starts the API and the web app, waits until both are healthy, prints every local URL and
#      the demo accounts, and opens the sign-in page in your browser.
#
# Everything here is LOCAL DEVELOPMENT ONLY. No real secrets, customer data or production
# settings are used — the seed contains fictional organizations and example.com users.
#
# Usage:  bash scripts/mac-preview.sh
# Stop:   bash scripts/mac-stop.sh

set -euo pipefail

# ---------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose --profile app)
SERVICE_TIMEOUT_SECONDS="${PREVIEW_SERVICE_TIMEOUT_SECONDS:-180}"
DOCKER_START_TIMEOUT_SECONDS="${PREVIEW_DOCKER_START_TIMEOUT_SECONDS:-120}"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    \033[32m✔ %s\033[0m\n' "$*"; }
warn() { printf '    \033[33m! %s\033[0m\n' "$*"; }

# fail "<message>" [no-logs] — prints a clear failure and exits. Pass "no-logs" for problems that
# happen before the containers exist, where container logs would only confuse.
fail() {
  printf '\n\033[31m\033[1m✖ Preview could not be started.\033[0m\n'
  printf '  %s\n' "$1"
  if [ "${2:-}" != "no-logs" ]; then
    printf '\n  Container status:\n'
    "${COMPOSE[@]}" ps --all 2>/dev/null | sed 's/^/    /' || true
    printf '\n  To see details, run:\n'
    printf '    docker compose --profile app logs --tail=100\n'
  fi
  printf '\n  Then try again with:  bash scripts/mac-preview.sh\n\n'
  exit 1
}

# Any unexpected error prints a friendly failure message instead of a bare stack of commands.
trap 'fail "An unexpected step failed (see the last lines above)."' ERR

# Reads a KEY=value from a .env file without executing it. Prints the fallback when missing.
read_env_value() {
  local file="$1" key="$2" fallback="$3" value
  if [ -f "$file" ]; then
    value="$(grep -E "^${key}=" "$file" | tail -n 1 | cut -d '=' -f 2- | tr -d "\"'" || true)"
    if [ -n "$value" ]; then
      printf '%s' "$value"
      return
    fi
  fi
  printf '%s' "$fallback"
}

# Copies example -> target only when the target does not exist yet.
create_env_if_missing() {
  local example="$1" target="$2"
  if [ -f "$target" ]; then
    ok "$target already exists — left untouched"
  elif [ -f "$example" ]; then
    cp "$example" "$target"
    ok "Created $target from $example"
  else
    warn "$example not found — skipped"
  fi
}

# Health of a compose service as reported by Docker: healthy | unhealthy | starting | exited | missing
service_health() {
  local container_id
  container_id="$("${COMPOSE[@]}" ps -q "$1" 2>/dev/null | head -n 1 || true)"
  if [ -z "$container_id" ]; then
    printf 'missing'
    return
  fi
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || printf 'missing'
}

# Waits until a service is healthy; fails with its last log lines when it dies or times out.
wait_for_service() {
  local service="$1" label="$2" waited=0 status
  printf '    %s ' "$label"
  while true; do
    status="$(service_health "$service")"
    case "$status" in
      healthy)
        printf '\033[32mhealthy\033[0m\n'
        return 0
        ;;
      exited|dead|unhealthy)
        printf '\033[31m%s\033[0m\n' "$status"
        "${COMPOSE[@]}" logs --tail=40 "$service" 2>/dev/null | sed 's/^/    /' || true
        fail "The ${label} container is ${status} (its last log lines are above)."
        ;;
    esac
    if [ "$waited" -ge "$SERVICE_TIMEOUT_SECONDS" ]; then
      printf '\033[31mtimeout\033[0m\n'
      "${COMPOSE[@]}" logs --tail=40 "$service" 2>/dev/null | sed 's/^/    /' || true
      fail "The ${label} container did not become healthy within ${SERVICE_TIMEOUT_SECONDS}s."
    fi
    printf '.'
    sleep 3
    waited=$((waited + 3))
  done
}

# ---------------------------------------------------------------------------------------------
# 1. Docker Desktop
# ---------------------------------------------------------------------------------------------

say "Checking Docker Desktop"

IS_MAC=false
if [ "$(uname -s)" = "Darwin" ]; then
  IS_MAC=true
else
  warn "This script is written for macOS. Continuing, but the browser will not open automatically."
fi

if ! command -v docker >/dev/null 2>&1; then
  fail "Docker Desktop is not installed. Download it from https://www.docker.com/products/docker-desktop/ , install it, open it once, then run this script again." no-logs
fi

if ! docker info >/dev/null 2>&1; then
  info "Docker Desktop is installed but not running."
  if [ "$IS_MAC" = true ] && command -v open >/dev/null 2>&1; then
    info "Starting Docker Desktop… (this can take a minute the first time)"
    open -a Docker >/dev/null 2>&1 || true
    waited=0
    until docker info >/dev/null 2>&1; do
      if [ "$waited" -ge "$DOCKER_START_TIMEOUT_SECONDS" ]; then
        fail "Docker Desktop did not start within ${DOCKER_START_TIMEOUT_SECONDS}s. Open Docker Desktop from Applications, wait for the whale icon in the menu bar to stop animating, then run this script again." no-logs
      fi
      sleep 3
      waited=$((waited + 3))
    done
  else
    fail "Start Docker Desktop, wait until it reports 'running', then run this script again." no-logs
  fi
fi

if ! docker compose version >/dev/null 2>&1; then
  fail "Docker Compose v2 is missing. Update Docker Desktop to a current version." no-logs
fi

ok "Docker Desktop is running ($(docker compose version --short 2>/dev/null || echo 'compose v2'))"

# ---------------------------------------------------------------------------------------------
# 2. Local .env files (never overwritten)
# ---------------------------------------------------------------------------------------------

say "Preparing local settings files"
create_env_if_missing ".env.example" ".env"
create_env_if_missing "apps/api/.env.example" "apps/api/.env"
create_env_if_missing "apps/web/.env.example" "apps/web/.env"

API_PORT="$(read_env_value ".env" "API_PORT" "3000")"
WEB_PORT="$(read_env_value ".env" "WEB_PORT" "5173")"
MINIO_CONSOLE_PORT="$(read_env_value ".env" "MINIO_CONSOLE_PORT" "9001")"
SEED_PASSWORD="$(read_env_value ".env" "SEED_USER_PASSWORD" "ChangeMe123!")"

WEB_URL="http://localhost:${WEB_PORT}"
API_URL="http://localhost:${API_PORT}/api/v1"
DOCS_URL="http://localhost:${API_PORT}/api/docs"
HEALTH_URL="${API_URL}/health"
MINIO_URL="http://localhost:${MINIO_CONSOLE_PORT}"

# ---------------------------------------------------------------------------------------------
# 3. Build images, start the infrastructure
# ---------------------------------------------------------------------------------------------

say "Building the application images (first run takes a few minutes)"
"${COMPOSE[@]}" build
ok "Images built"

say "Starting PostgreSQL, Redis and MinIO"
"${COMPOSE[@]}" up -d postgres redis minio minio-init
wait_for_service postgres "PostgreSQL"
wait_for_service redis "Redis"
wait_for_service minio "MinIO"

# ---------------------------------------------------------------------------------------------
# 4. Database migrations and development seed (one-off commands in the API image)
# ---------------------------------------------------------------------------------------------

say "Applying database migrations"
"${COMPOSE[@]}" run --rm --no-deps api migrate
ok "Migrations applied"

say "Loading development seed data (fictional data; safe to repeat)"
"${COMPOSE[@]}" run --rm --no-deps api seed
ok "Seed data loaded"

# ---------------------------------------------------------------------------------------------
# 5. Start the API and the web app, wait until both are healthy
# ---------------------------------------------------------------------------------------------

say "Starting the API"
"${COMPOSE[@]}" up -d --no-deps api
wait_for_service api "API"

say "Starting the web app"
"${COMPOSE[@]}" up -d --no-deps web
wait_for_service web "Web app"

if ! curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  fail "The API is running but ${HEALTH_URL} is not reachable from your Mac. Is port ${API_PORT} used by another program?"
fi
if ! curl -fsS "$WEB_URL/" >/dev/null 2>&1; then
  fail "The web app is running but ${WEB_URL} is not reachable from your Mac. Is port ${WEB_PORT} used by another program?"
fi

# ---------------------------------------------------------------------------------------------
# 6. Done
# ---------------------------------------------------------------------------------------------

trap - ERR

printf '\n\033[32m\033[1m✔ Ashniva Desk preview is running.\033[0m\n\n'
printf '  Web app         %s\n' "$WEB_URL"
printf '  API health      %s\n' "$HEALTH_URL"
printf '  API docs        %s\n' "$DOCS_URL"
printf '  API base URL    %s\n' "$API_URL"
printf '  MinIO console   %s\n' "$MINIO_URL"
printf '  Sign in        %s/login\n' "$WEB_URL"
printf '\n  Demo accounts (fictional, development only) — password for all: %s\n' "$SEED_PASSWORD"
printf '    Internal team (Ashniva Technologies):\n'
printf '      director@example.com   Super Admin / Director\n'
printf '      pm@example.com         Project Manager\n'
printf '      lead@example.com       Senior / Team Lead (reviews and publishes client updates)\n'
printf '      developer@example.com  Developer      developer2@example.com  Developer\n'
printf '      tester@example.com     Tester / QA    support@example.com     Support Executive\n'
printf '      employee@example.com   Internal employee (raises tickets only)\n'
printf '    Client portal:\n'
printf '      client-admin@example.com / client-employee@example.com      Acme Retail Pvt Ltd\n'
printf '      zenith-admin@example.com / zenith-employee@example.com      Zenith Logistics Ltd\n'
printf '\n  To stop:  bash scripts/mac-stop.sh   (your data is kept)\n\n'

if [ "$IS_MAC" = true ] && command -v open >/dev/null 2>&1; then
  open "${WEB_URL}/login" || warn "Could not open the browser automatically — open ${WEB_URL}/login yourself."
else
  info "Open ${WEB_URL}/login in your browser."
fi
