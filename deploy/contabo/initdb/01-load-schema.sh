#!/bin/bash
# Runs once on empty postgres volume (first `docker compose up`).
# Strips pg_dump 18 \restrict / \unrestrict so psql in the image can load the dump.
set -euo pipefail

SCHEMA="${SCHEMA_FILE:-/schema/whatsapp_schema.sql}"

if [ ! -f "$SCHEMA" ]; then
  echo "error: schema file not found at $SCHEMA"
  echo "Copy whatsapp_schema.sql next to the repo (mounted at /schema/whatsapp_schema.sql)."
  exit 1
fi

echo "Loading $SCHEMA into database ${POSTGRES_DB}..."

sed -E \
  -e '/^\\restrict /d' \
  -e '/^\\unrestrict /d' \
  "$SCHEMA" \
  | psql \
    -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB"

echo "Schema load complete."
