#!/bin/bash
# ==============================================================================
# WhatsAuto - Production Database Migration & Seeding Tool
# ==============================================================================
# Runs Lucid migrations inside the api container (targets whatever PG_* the api uses).
#
# Usage (from repo root or this directory):
#   bash deploy/contabo/migrate.sh              # Run pending migrations + sync RBAC seed
#   bash deploy/contabo/migrate.sh status       # View migration status
#   bash deploy/contabo/migrate.sh rollback     # Rollback the last migration batch
#   bash deploy/contabo/migrate.sh seed         # Run RBAC seed only
#   bash deploy/contabo/migrate.sh fresh        # [DANGER] Drop all tables & re-run all migrations
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "error: $ENV_FILE not found. Copy your env file: cp deploy/contabo/.env.example deploy/contabo/.env"
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

require_api() {
  if ! compose exec -T api true 2>/dev/null; then
    echo "error: api container is not running."
    echo "Start the stack first:"
    echo "  docker compose -f deploy/contabo/docker-compose.yml --env-file deploy/contabo/.env up -d --build"
    exit 1
  fi
}

ace() {
  compose exec -T api node ace "$@"
}

cmd="${1:-run}"

case "$cmd" in
  status)
    require_api
    echo "==> Checking migration status..."
    ace migration:status
    ;;

  run)
    require_api
    echo "==> [1/3] Pre-migration status check..."
    ace migration:status

    echo "==> [2/3] Executing pending migrations..."
    ace migration:run --force

    echo "==> [3/3] Synchronizing RBAC roles and permissions catalog..."
    ace db:seed --files=database/seeders/rbac_seeder.ts

    echo "==> Migration & seeding complete. Current status:"
    ace migration:status
    ;;

  rollback)
    require_api
    echo "==> Rolling back last migration batch..."
    ace migration:rollback --force
    ace migration:status
    ;;

  seed)
    require_api
    echo "==> Running RBAC seeder (idempotent sync of roles & permissions)..."
    ace db:seed --files=database/seeders/rbac_seeder.ts
    ;;

  fresh)
    require_api
    if [ "${CONFIRM_FRESH:-}" != "1" ]; then
      read -p "WARNING: This will DROP ALL TABLES and ERASE DATA. Are you sure? (y/N): " -n 1 -r
      echo
      if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Operation cancelled."
        exit 0
      fi
    fi
    echo "==> Dropping all tables and re-running all migrations from scratch..."
    ace migration:fresh --force
    echo "==> Seeding essential RBAC roles and permissions..."
    ace db:seed --files=database/seeders/rbac_seeder.ts
    echo "==> Database re-initialized cleanly."
    ;;

  *)
    echo "Usage: $0 [status|run|rollback|seed|fresh]"
    exit 1
    ;;
esac
