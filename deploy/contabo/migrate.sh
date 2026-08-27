#!/bin/bash
# Run Lucid migrations inside the api container.
# Usage (from repo root or this directory):
#   bash deploy/contabo/migrate.sh
#   bash deploy/contabo/migrate.sh status
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "error: $ENV_FILE not found. Copy your env:  cp .env deploy/contabo/.env"
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

cmd="${1:-run}"

case "$cmd" in
  status)
    compose exec api node ace migration:status
    ;;
  run)
    compose exec api node ace migration:status
    compose exec api node ace migration:run
    compose exec api node ace migration:status
    ;;
  *)
    echo "usage: $0 [status|run]"
    exit 1
    ;;
esac
