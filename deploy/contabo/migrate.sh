#!/bin/bash
# ==============================================================================
# WhatsAuto - Production Database Migration & Seeding Tool
# ==============================================================================
# Runs Lucid migrations inside the whats-auto-backend container.
#
# Usage (from repo root or this directory):
#   bash deploy/contabo/migrate.sh              # Run pending migrations + RBAC + superadmin bootstrap
#   bash deploy/contabo/migrate.sh status       # View migration status
#   bash deploy/contabo/migrate.sh rollback     # Rollback the last migration batch
#   bash deploy/contabo/migrate.sh seed              # Run RBAC + superadmin seed only
#   bash deploy/contabo/migrate.sh grant-superadmin  # Restore superadmin for SUPERADMIN_EMAIL
#   bash deploy/contabo/migrate.sh fresh             # [DANGER] Drop all tables & re-run all migrations
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
  if ! compose exec -T whats-auto-backend true 2>/dev/null; then
    echo "error: whats-auto-backend container is not running."
    echo "Start the stack first:"
    echo "  docker compose -f deploy/contabo/docker-compose.yml --env-file deploy/contabo/.env up -d --build"
    exit 1
  fi
}

ace() {
  compose exec -T whats-auto-backend node ace "$@"
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
    echo "==> [1/4] Pre-migration status check..."
    ace migration:status

    echo "==> [2/4] Executing pending migrations..."
    ace migration:run --force

    echo "==> [3/4] Synchronizing RBAC roles and permissions catalog..."
    ace db:seed --files=database/seeders/rbac_seeder.ts

    echo "==> [4/4] Bootstrapping platform superadmin (skipped if one already exists)..."
    ace db:seed --files=database/seeders/superadmin_seeder.ts

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
    echo "==> [1/2] Running RBAC seeder (idempotent sync of roles & permissions)..."
    ace db:seed --files=database/seeders/rbac_seeder.ts
    echo "==> [2/2] Bootstrapping platform superadmin (skipped if one already exists)..."
    ace db:seed --files=database/seeders/superadmin_seeder.ts
    ;;

  grant-superadmin)
    require_api
    shift
    echo "==> Ensuring RBAC catalog is present..."
    ace db:seed --files=database/seeders/rbac_seeder.ts
    echo "==> Restoring global superadmin grant for SUPERADMIN_EMAIL..."
    ace superadmin:grant "$@"
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
    echo "==> Bootstrapping platform superadmin..."
    ace db:seed --files=database/seeders/superadmin_seeder.ts
    echo "==> Database re-initialized cleanly."
    ;;

  *)
    echo "Usage: $0 [status|run|rollback|seed|grant-superadmin|fresh]"
    exit 1
    ;;
esac
