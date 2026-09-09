#!/usr/bin/env bash
#
# Ashniva Desk — stop the local preview started by scripts/mac-preview.sh.
#
# Stops the containers only. Database, Redis and MinIO data live in Docker volumes and are KEPT,
# so the next `bash scripts/mac-preview.sh` starts with the same data.
#
# (If you ever want to delete all local data on purpose, run
#  `docker compose --profile app down -v` yourself — this script never does that.)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

fail() {
  printf '\n\033[31m✖ Could not stop the preview.\033[0m\n  %s\n\n' "$*"
  exit 1
}

if ! command -v docker >/dev/null 2>&1; then
  fail "Docker Desktop is not installed, so there is nothing to stop."
fi

if ! docker info >/dev/null 2>&1; then
  printf '\n\033[32m✔ Docker Desktop is not running, so no Ashniva Desk containers are running.\033[0m\n\n'
  exit 0
fi

printf '\n\033[1m==> Stopping Ashniva Desk containers (data is kept)\033[0m\n'
docker compose --profile app stop

printf '\n\033[32m\033[1m✔ Ashniva Desk preview stopped.\033[0m\n'
printf '  Your local database and files were kept. Run  bash scripts/mac-preview.sh  to start again.\n'
printf '  To also close Docker Desktop, quit it from the whale icon in the menu bar.\n\n'
