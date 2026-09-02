# Ottobot — Linux production deploy

This is the full path from a Contabo VPS that already runs **ServeOS** to a live Ottobot stack. Do not install PostgreSQL, Redis, Node, or a second Caddy on the host.

| Public host                                    | Caddy →                    | Container                              |
| ---------------------------------------------- | -------------------------- | -------------------------------------- |
| `https://ottobot.codecolonies.com`             | `whats-auto-frontend:3200` | Next.js UI                             |
| `https://api.ottobot.codecolonies.com`         | `whats-auto-backend:3201`  | AdonisJS API                           |
| `https://api.ottobot.codecolonies.com/media/*` | `reverse_proxy` → backend  | Adonis reads disk (`MEDIA_LOCAL_ROOT`) |

Postgres, Redis, and the worker stay on the private Docker network `whats-auto-internal`. They are never published and never get a domain.

```text
Internet :80/:443
    └── serveos-production-proxy  (caddy:2.9-alpine)
            └── serveos-production_public
                    ├── ServeOS apps (unchanged)
                    ├── whats-auto-frontend :3200
                    └── whats-auto-backend  :3201
                            └── whats-auto-internal
                                    ├── whats-auto-postgres
                                    ├── whats-auto-redis
                                    └── whats-auto-worker
```

Files in this folder:

| File                 | Role                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `docker-compose.yml` | Stack                                                             |
| `.env.example`       | Copy to `.env` and fill secrets                                   |
| `whats-auto.caddy`   | ServeOS site file                                                 |
| `migrate.sh`         | Lucid migrations + RBAC + superadmin inside the backend container |

---

## 0. Prerequisites

On the VPS you already have:

- Docker + Docker Compose
- Git
- ServeOS Caddy container **`serveos-production-proxy`** bound to host **80** and **443**
- Docker network **`serveos-production_public`**
- Caddy layout:

```text
/etc/caddy/Caddyfile
/etc/caddy/sites/serveos.caddy
/etc/caddy/sites/whats-auto.caddy   # this project — add in step 5
```

Do **not**:

- Bind 80/443 from this compose file
- Replace ServeOS site files (`serveos.caddy`, basilvalleycafe.com, …)
- Open host ports 3200, 3201, 5432, or 6379
- Use the repo-root `.env` for Compose (Compose reads **`deploy/contabo/.env`**)

Firewall: **22, 80, 443** only.

---

## 1. DNS

A records → this VPS:

- `ottobot.codecolonies.com`
- `api.ottobot.codecolonies.com`

---

## 2. Clone

```bash
cd /var/www
git clone <YOUR_GIT_URL> whats-auto
cd /var/www/whats-auto
```

Clone path must be **`/var/www/whats-auto`** so the media bind mount matches Caddy and Compose.

---

## 3. Media folder

```bash
sudo mkdir -p /var/www/whats-auto/apps/backend/media
sudo chown 1001:1001 /var/www/whats-auto/apps/backend/media
```

Public URLs: `https://api.ottobot.codecolonies.com/media/...`

---

## 4. Env file

```bash
cd /var/www/whats-auto
cp deploy/contabo/.env.example deploy/contabo/.env
nano deploy/contabo/.env
```

Generate secrets:

```bash
openssl rand -base64 32   # APP_KEY
openssl rand -base64 32   # BETTER_AUTH_SECRET  (≥32 chars)
openssl rand -base64 24   # PG_PASSWORD
```

Set at least:

```env
NEXT_PUBLIC_APP_URL=https://ottobot.codecolonies.com
NEXT_PUBLIC_API_URL=https://api.ottobot.codecolonies.com
APP_URL=https://api.ottobot.codecolonies.com
CORS_ORIGIN=https://ottobot.codecolonies.com
BETTER_AUTH_URL=https://api.ottobot.codecolonies.com
JWT_ISSUER=https://api.ottobot.codecolonies.com
PG_HOST=whats-auto-postgres
PG_USER=whatsauto
PG_PASSWORD=<generated>
PG_DB_NAME=whatsauto
REDIS_URL=redis://whats-auto-redis:6379
OBJECT_STORAGE_DRIVER=fs
DRIVE_DISK=fs
MEDIA_HOST_PATH=/var/www/whats-auto/apps/backend/media
MEDIA_LOCAL_ROOT=/var/www/whats-auto/apps/backend/media
MEDIA_PUBLIC_BASE_URL=https://api.ottobot.codecolonies.com/media
OUTBOUND_MEDIA_ALLOWED_HOSTS=api.ottobot.codecolonies.com
SUPERADMIN_EMAIL=you@yourdomain.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MAIL_MAILER=smtp
MAIL_FROM_ADDRESS=noreply@ottobot.codecolonies.com
```

Also fill Meta, Razorpay, and mail. Empty Google / Meta / Razorpay values prevent the API from booting.

Compose **overrides** `PG_HOST` and `REDIS_URL` to the Docker service names. Do not point them at another server’s IP.

`NEXT_PUBLIC_*` are baked into the frontend **image**. Changing them later requires a frontend rebuild (`up -d --build`).

---

## 5. ServeOS Caddy

Main Caddyfile (`/etc/caddy/Caddyfile` inside `serveos-production-proxy`) must import sites. Keep existing global options. Do not paste Ottobot routes into the main file:

```caddy
import /etc/caddy/sites/*.caddy
```

Copy or bind-mount this repo file so it appears as `/etc/caddy/sites/whats-auto.caddy`:

```text
/var/www/whats-auto/deploy/contabo/whats-auto.caddy
  → /etc/caddy/sites/whats-auto.caddy
```

Also mount the site file into the **same** Caddy container (media bytes are served by the API; no media volume on the proxy required):

```yaml
# extra volumes on serveos-production-proxy (keep existing mounts)
- /var/www/whats-auto/deploy/contabo/whats-auto.caddy:/etc/caddy/sites/whats-auto.caddy:ro
```

Optional: mount media on the proxy only if you switch Caddy back to `file_server` instead of `reverse_proxy`.

If ServeOS already mounts a host `sites/` directory to `/etc/caddy/sites`, copy the file into that directory instead:

```bash
cp /var/www/whats-auto/deploy/contabo/whats-auto.caddy /path/to/serveos/sites/whats-auto.caddy
```

New volumes need a **proxy recreate** once (`docker compose up -d` in the ServeOS production directory). File edits after that only need a Caddy reload.

Site file contents (`deploy/contabo/whats-auto.caddy`):

```caddy
ottobot.codecolonies.com {
	reverse_proxy whats-auto-frontend:3200
}

api.ottobot.codecolonies.com {
	request_body {
		max_size 110MB
	}

	handle /media/* {
		reverse_proxy whats-auto-backend:3201
	}

	handle /api/v1/inbox/events {
		reverse_proxy whats-auto-backend:3201 {
			flush_interval -1
		}
	}

	handle {
		reverse_proxy whats-auto-backend:3201
	}
}
```

`flush_interval -1` is required for inbox SSE (`GET /api/v1/inbox/events`). There is no WebSocket / Socket.IO.

Validate and reload (after Whats Auto is up):

```bash
docker exec serveos-production-proxy caddy validate \
  --config /etc/caddy/Caddyfile --adapter caddyfile

docker exec serveos-production-proxy caddy reload \
  --config /etc/caddy/Caddyfile --adapter caddyfile
```

Do not restart the VPS. Do not replace `serveos.caddy`.

---

## 6. Build and start

From the **repo root**:

```bash
cd /var/www/whats-auto

docker compose \
  -f deploy/contabo/docker-compose.yml \
  --env-file deploy/contabo/.env \
  config

docker compose \
  -f deploy/contabo/docker-compose.yml \
  --env-file deploy/contabo/.env \
  up -d --build
```

First build takes several minutes (Node 24, pnpm, Turbo).

```bash
docker compose -f deploy/contabo/docker-compose.yml --env-file deploy/contabo/.env ps
```

Healthy: `whats-auto-postgres`, `whats-auto-redis`, `whats-auto-backend`, `whats-auto-worker`, `whats-auto-frontend` all **Up**. Postgres and Redis should be **healthy**.

Images / containers:

| Container             | Image                        | Port inside Docker | Host port    |
| --------------------- | ---------------------------- | -----------------: | ------------ |
| `whats-auto-frontend` | `whats-auto-frontend:latest` |               3200 | none (Caddy) |
| `whats-auto-backend`  | `whats-auto-backend:latest`  |               3201 | none (Caddy) |
| `whats-auto-worker`   | `whats-auto-backend:latest`  |               none | none         |
| `whats-auto-postgres` | `pgvector/pgvector:pg18`     |               5432 | none         |
| `whats-auto-redis`    | `redis:7-alpine`             |               6379 | none         |

`whats-auto-frontend` and `whats-auto-backend` must be on **`serveos-production_public`**.

---

## 7. Migrations

```bash
bash deploy/contabo/migrate.sh status
bash deploy/contabo/migrate.sh
```

That runs inside `whats-auto-backend`:

```text
node ace migration:status
node ace migration:run --force
node ace db:seed --files=database/seeders/rbac_seeder.ts
node ace db:seed --files=database/seeders/superadmin_seeder.ts
```

Then **Forgot password** on the login page (mail must work). Superadmin password is random on first seed.

Other commands:

```bash
bash deploy/contabo/migrate.sh seed       # RBAC + superadmin only
bash deploy/contabo/migrate.sh rollback   # last batch
# CONFIRM_FRESH=1 bash deploy/contabo/migrate.sh fresh   # DROPS ALL TABLES
```

---

## 8. Dashboards (external)

| Service                  | Value                                                                   |
| ------------------------ | ----------------------------------------------------------------------- |
| Google authorized origin | `https://ottobot.codecolonies.com`                                      |
| Google redirect          | `https://api.ottobot.codecolonies.com/api/auth/callback/google`         |
| WhatsApp webhook         | `https://api.ottobot.codecolonies.com/api/v1/webhooks/whatsapp`         |
| Razorpay webhook         | `https://api.ottobot.codecolonies.com/api/v1/webhooks/billing/razorpay` |

---

## 9. Verify

From Caddy:

```bash
docker exec serveos-production-proxy getent hosts whats-auto-frontend
docker exec serveos-production-proxy getent hosts whats-auto-backend
docker exec serveos-production-proxy wget -qO- http://whats-auto-backend:3201/
# {"hello":"world"}
docker exec serveos-production-proxy test -f /etc/caddy/sites/whats-auto.caddy && echo site_ok
```

In a browser:

1. `https://ottobot.codecolonies.com/en` — UI
2. `https://api.ottobot.codecolonies.com/` — `{"hello":"world"}`
3. Login / Google OAuth / Forgot password
4. Confirm basilvalleycafe.com (ServeOS) still works

Worker log line: `job_queue.worker.started`

```bash
docker compose -f deploy/contabo/docker-compose.yml --env-file deploy/contabo/.env exec whats-auto-postgres \
  psql -U whatsauto -d whatsauto -c '\dt'
```

There is **no** `/health` route. Use `GET /` as above.

---

## 10. Later updates

```bash
cd /var/www/whats-auto
git pull
docker compose -f deploy/contabo/docker-compose.yml --env-file deploy/contabo/.env up -d --build
bash deploy/contabo/migrate.sh
```

Rebuild frontend if you change `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_API_URL`.

---

## 11. Env changes — which container to recreate

Compose reads env at **container create**. `restart` keeps the old env. Use `--force-recreate`.

| Changed keys                                                                                        | Recreate                                                                    |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, Meta, Razorpay, mail, `APP_KEY`, JWT, `PG_*` (app-side) | `whats-auto-backend` (and `whats-auto-worker` if jobs use the same secrets) |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`                                                        | rebuild **frontend** image                                                  |
| `PG_PASSWORD` / `PG_USER` / `PG_DB_NAME` **before first postgres start**                            | set in `.env` then `up -d`                                                  |
| Same Postgres keys **after** volume exists                                                          | keep old values, or `down -v` (destroys DB)                                 |

Example (Google only):

```bash
docker compose \
  -f deploy/contabo/docker-compose.yml \
  --env-file deploy/contabo/.env \
  up -d --force-recreate --no-deps whats-auto-backend
```

No image rebuild. No Caddy restart.

---

## 12. Useful commands

```bash
alias wa='docker compose -f deploy/contabo/docker-compose.yml --env-file deploy/contabo/.env'

wa ps
wa logs -f --tail=200 whats-auto-backend
wa logs -f --tail=200 whats-auto-worker
wa logs -f --tail=200 whats-auto-frontend
docker logs --tail=100 serveos-production-proxy

wa restart whats-auto-backend whats-auto-worker   # does NOT reload .env
wa down            # keeps DB volume
# wa down -v       # DESTROYS Docker Postgres + Redis data for this stack only
```

---

## 13. Troubleshooting

**`docker compose config` still shows `api` / `postgres`**  
The VPS compose file is old. `git pull` and confirm `whats-auto-backend` is in `deploy/contabo/docker-compose.yml`.

**502 from Caddy**  
Aliases exist only after Whats Auto is up on `serveos-production_public`. Run the `getent` / `wget` checks in step 9.

**Caddy cannot read `whats-auto.caddy`**  
Host paths are not visible inside Docker until bind-mounted. Recreate the proxy after adding volumes.

**API will not boot**  
Empty required env (Google, Meta, Razorpay, `APP_KEY`, mail). Check:

```bash
wa logs --tail=80 whats-auto-backend
```

**Forgot password / superadmin**  
Mail (`MAIL_MAILER`) must work. Then use Forgot password for `SUPERADMIN_EMAIL`.

**`down -v`**  
Deletes only this stack’s Docker volumes, not ServeOS.
