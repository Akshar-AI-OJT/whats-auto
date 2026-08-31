#!/bin/bash
# ==============================================================================
# Verify ServeOS Caddy can reach Whats Auto. Read-only — changes nothing.
#
#   bash deploy/contabo/inspect-serveos-caddy.sh
#
# Expected:
#   container: serveos-production-proxy
#   network:   serveos-production_public
#   Caddyfile: /var/www/serveos/docker/production/Caddyfile → /etc/caddy/Caddyfile
# ==============================================================================
set -euo pipefail

PROXY="${PROXY_CONTAINER:-serveos-production-proxy}"
NETWORK="${CADDY_NETWORK:-serveos-production_public}"
WA_CADDY="/var/www/whats-auto/deploy/contabo/Caddyfile"
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

if docker inspect -f '{{range .Mounts}}{{.Destination}}{{println}}{{end}}' "$PROXY" \
  | grep -qx "$WA_CADDY"; then
  ok "Whats Auto Caddyfile is mounted at ${WA_CADDY}"
else
  bad "Whats Auto Caddyfile is NOT mounted inside ${PROXY}"
  echo "       Add the bind mount from deploy/contabo/serveos-caddy.snippet"
  echo "       then recreate the proxy container (reload will not add volumes)."
fi

if docker inspect -f '{{range .Mounts}}{{.Destination}}{{println}}{{end}}' "$PROXY" \
  | grep -qx "$WA_MEDIA"; then
  ok "media directory is mounted at ${WA_MEDIA}"
else
  bad "media directory is NOT mounted inside ${PROXY} (needed for /media file_server)"
fi

bold "4. ServeOS Caddyfile import"
hr
if docker exec "$PROXY" grep -q "import ${WA_CADDY}" /etc/caddy/Caddyfile 2>/dev/null; then
  ok "import ${WA_CADDY} is present in /etc/caddy/Caddyfile"
else
  bad "import line missing. Append to /var/www/serveos/docker/production/Caddyfile:"
  echo "       import ${WA_CADDY}"
fi

bold "5. DNS from ${PROXY} (Compose service names on ${NETWORK})"
hr
for host in frontend api; do
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
