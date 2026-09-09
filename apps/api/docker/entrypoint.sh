#!/bin/sh
#
# Entry point of the API container. Runs the compiled application with node directly —
# pnpm is NOT available or needed at runtime (dependencies are installed during the image build).
#
#   entrypoint.sh start              apply pending migrations, then start the API (default)
#   entrypoint.sh migrate            apply pending migrations and exit
#   entrypoint.sh seed               load the idempotent development seed data and exit
#   entrypoint.sh sweep <queue> <job>  run one occurrence of a scheduled job now, and exit
#   entrypoint.sh <cmd>              run any other command (for debugging)

set -eu

cd /repo/apps/api

PRISMA=./node_modules/.bin/prisma
TSX=./node_modules/.bin/tsx

case "${1:-start}" in
  start)
    echo "[api] applying database migrations"
    "$PRISMA" migrate deploy
    echo "[api] starting"
    exec node dist/main.js
    ;;
  migrate)
    exec "$PRISMA" migrate deploy
    ;;
  seed)
    exec "$TSX" prisma/seed.ts
    ;;
  sweep)
    # Enqueues one occurrence of a scheduled job through BullMQ's own API, then exits. It starts
    # no workers and touches no table: the instance that is already running picks the job up. Run
    # it as a one-off container (`docker compose run --rm api sweep …`), never against a queue by
    # hand — a job written straight into Redis is a record no worker can load.
    shift
    exec "$TSX" scripts/enqueue-scheduled-job.ts "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
