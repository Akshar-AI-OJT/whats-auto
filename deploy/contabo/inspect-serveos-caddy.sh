#!/bin/bash
# ==============================================================================
# Verify ServeOS Caddy can reach Whats Auto. Read-only — changes nothing.
#
#   bash deploy/contabo/inspect-serveos-caddy.sh
#
# Expected inside serveos-production-proxy:
#   /etc/caddy/Caddyfile
#   /etc/caddy/sites/whats-auto.caddy
#   network: serveos-production_public
# ==============================================================================
set -euo pipefail

PROXY="${PROXY_CONTAINER:-serveos-production-proxy}"
NETWORK="${CADDY_NETWORK:-serveos-production_public}"
WA_SITE="/etc/caddy/sites/whats-auto.caddy"
WA_MEDIA="/var/www/whats-auto/apps/backend/media"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
hr() { printf '\n%s\n' "----------------------------------------"; }
ok() { printf '  OK   %s\n' "$*"; }
bad() { printf '  FAIL %s\n' "$*"; }

bold "1. Proxy container ${PROXY}"
hr
if ! docker inspect "$PROXY" >/dev/null 2>&1; then
  bad "container not found"
  exit 1
fi
ok "$(docker inspect -f '{{.Config.Image}}  {{.State.Status}}' "$PROXY")"

bold "2. Networks on ${PROXY}"
hr
docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{println}}{{end}}' "$PROXY"
if docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{println}}{{end}}' "$PROXY" \
  | grep -qx "$NETWORK"; then
  ok "attached to ${NETWORK}"
else
  bad "not attached to ${NETWORK}"
fi

bold "3. Bind mounts on ${PROXY}"
hr
docker inspect -f '{{range .Mounts}}{{printf "%s -> %s\n" .Source .Destination}}{{end}}' "$PROXY"

if docker exec "$PROXY" test -f "$WA_SITE" 2>/dev/null; then
  ok "${WA_SITE} exists in the container"
else
  bad "${WA_SITE} is missing inside ${PROXY}"
  echo "       Mount or copy deploy/contabo/whats-auto.caddy there"
  echo "       (see deploy/contabo/serveos-caddy.snippet)."
fi

if docker inspect -f '{{range .Mounts}}{{.Destination}}{{println}}{{end}}' "$PROXY" \
  | grep -qx "$WA_MEDIA"; then
  ok "media directory is mounted at ${WA_MEDIA}"
elif docker exec "$PROXY" test -d "$WA_MEDIA" 2>/dev/null; then
  ok "media path ${WA_MEDIA} exists in the container"
else
  bad "media directory is NOT available inside ${PROXY} (needed for /media file_server)"
fi

bold "4. Central Caddyfile imports sites/"
hr
if docker exec "$PROXY" grep -E 'import .*/sites/\*\.caddy|import sites/\*\.caddy' /etc/caddy/Caddyfile >/dev/null 2>&1; then
  ok "main Caddyfile imports /etc/caddy/sites/*.caddy"
else
  bad "main Caddyfile does not import sites/*.caddy"
  echo "       Add this to /etc/caddy/Caddyfile (keep existing ServeOS global options):"
  echo "       import /etc/caddy/sites/*.caddy"
fi

bold "5. DNS from ${PROXY} (Compose names on ${NETWORK})"
hr
for host in whats-auto-frontend whats-auto-backend; do
  if docker exec "$PROXY" getent hosts "$host" >/dev/null 2>&1; then
    ok "$(docker exec "$PROXY" getent hosts "$host" | awk '{print $2" -> "$1}')"
  else
    bad "${host} does not resolve (start Whats Auto, or check a name collision on ${NETWORK})"
  fi
done

bold "6. Caddy validate"
hr
if docker exec "$PROXY" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  ok "caddy validate passed"
else
  bad "caddy validate failed"
  exit 1
fi
