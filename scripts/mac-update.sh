#!/usr/bin/env bash
#
# Ashniva Desk — update an installation you already have, in Docker.
#
# Use this when you already have Ashniva Desk running with data in it and you want a newer
# version. It builds the new images, applies the pending database migrations, and restarts the
# API and the web app.
#
# It does NOT:
#   * load seed or demo data,
#   * reset the database,
#   * delete, prune or recreate any Docker volume,
#   * overwrite a .env file you already have.
#
# Your data stays where it is. Migrations only add to the database — no column is dropped and no
# existing row is rewritten.
#
# For a first-ever install with demo data, use scripts/mac-preview.sh instead. That one does load
# demo accounts, which is why it is not the script to point at a database you care about.
#
# Usage:  bash scripts/mac-update.sh
# Stop:   bash scripts/mac-stop.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMPOSE=(docker compose --profile app)
SERVICE_TIMEOUT_SECONDS="${PREVIEW_SERVICE_TIMEOUT_SECONDS:-180}"
DOCKER_START_TIMEOUT_SECONDS="${PREVIEW_DOCKER_START_TIMEOUT_SECONDS:-120}"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
ok()   { printf '    \033[32m✔ %s\033[0m\n' "$*"; }
warn() { printf '    \033[33m! %s\033[0m\n' "$*"; }

fail() {
  printf '\n\033[31m\033[1m✖ The update did not finish.\033[0m\n'
  printf '  %s\n' "$1"
  printf '\n  Nothing was deleted. Your database and your files are as they were.\n'
  if [ "${2:-}" != "no-logs" ]; then
    printf '\n  Container status:\n'
    "${COMPOSE[@]}" ps --all 2>/dev/null | sed 's/^/    /' || true
    printf '\n  To see details, run:\n'
    printf '    docker compose --profile app logs --tail=100\n'
  fi
  printf '\n  Then try again with:  bash scripts/mac-update.sh\n\n'
  exit 1
}

trap 'fail "An unexpected step failed (see the last lines above)."' ERR

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

service_health() {
  local container_id
  container_id="$("${COMPOSE[@]}" ps -q "$1" 2>/dev/null | head -n 1 || true)"
  if [ -z "$container_id" ]; then
    printf 'missing'
    return
  fi
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || printf 'missing'
}

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

ok "Docker Desktop is running"

# ---------------------------------------------------------------------------------------------
# 2. Settings files
# ---------------------------------------------------------------------------------------------

say "Checking local settings files"
create_env_if_missing ".env.example" ".env"
create_env_if_missing "apps/api/.env.example" "apps/api/.env"
create_env_if_missing "apps/web/.env.example" "apps/web/.env"

API_PORT="$(read_env_value ".env" "API_PORT" "3000")"
WEB_PORT="$(read_env_value ".env" "WEB_PORT" "5173")"

WEB_URL="http://localhost:${WEB_PORT}"
API_URL="http://localhost:${API_PORT}/api/v1"
DOCS_URL="http://localhost:${API_PORT}/api/docs"
HEALTH_URL="${API_URL}/health"

# ---------------------------------------------------------------------------------------------
# 3. Build the new images
# ---------------------------------------------------------------------------------------------

say "Building the new application images (a few minutes)"
"${COMPOSE[@]}" build
ok "Images built"

# ---------------------------------------------------------------------------------------------
# 4. Infrastructure — the same containers and the same volumes as before
# ---------------------------------------------------------------------------------------------

say "Starting PostgreSQL, Redis and MinIO"
"${COMPOSE[@]}" up -d postgres redis minio minio-init
wait_for_service postgres "PostgreSQL"
wait_for_service redis "Redis"
wait_for_service minio "MinIO"

# ---------------------------------------------------------------------------------------------
# 5. Migrations
#
# The API container applies pending migrations itself every time it starts, so this step is not
# what makes them happen — it is what makes them VISIBLE. Running them here, before the app comes
# up, means a migration problem shows in this window with its own error rather than as an API
# container that will not become healthy.
# ---------------------------------------------------------------------------------------------

say "Applying database migrations (additive — nothing existing is removed)"
"${COMPOSE[@]}" run --rm --no-deps api migrate
ok "Migrations applied"

# Informational, and deliberately not allowed to stop the update.
#
# `migrate status` exits non-zero for things that are not failures here — most easily when the
# database has run a migration this copy of the project does not contain, which is what happens if
# you last updated from a newer ZIP than this one. Under `set -e` that aborted the script *before*
# the containers were restarted, leaving the old version running and a message saying the update
# had failed when the migrations had in fact applied cleanly.
say "Checking the database is up to date"
if ! "${COMPOSE[@]}" run --rm --no-deps api ./node_modules/.bin/prisma migrate status; then
  warn "Could not confirm the migration history (see above). The update continues."
else
  ok "Migration history checked"
fi

# ---------------------------------------------------------------------------------------------
# 6. Restart the application
# ---------------------------------------------------------------------------------------------

say "Restarting the API"
"${COMPOSE[@]}" up -d --no-deps api
wait_for_service api "API"

say "Restarting the web app"
"${COMPOSE[@]}" up -d --no-deps web
wait_for_service web "Web app"

if ! curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
  fail "The API is running but ${HEALTH_URL} is not reachable from your Mac. Is port ${API_PORT} used by another program?"
fi
if ! curl -fsS "$WEB_URL/" >/dev/null 2>&1; then
  fail "The web app is running but ${WEB_URL} is not reachable from your Mac. Is port ${WEB_PORT} used by another program?"
fi

trap - ERR

printf '\n\033[32m\033[1m✔ Ashniva Desk is updated and running.\033[0m\n\n'
printf '  Web app         %s\n' "$WEB_URL"
printf '  API health      %s\n' "$HEALTH_URL"
printf '  API docs        %s\n' "$DOCS_URL"
printf '\n  Sign in with your existing accounts — no seed was run and no data was changed.\n'
printf '  To stop:  bash scripts/mac-stop.sh   (your data is kept)\n\n'

if [ "$IS_MAC" = true ] && command -v open >/dev/null 2>&1; then
  open "${WEB_URL}/login" || warn "Could not open the browser automatically — open ${WEB_URL}/login yourself."
else
  info "Open ${WEB_URL}/login in your browser."
fi
