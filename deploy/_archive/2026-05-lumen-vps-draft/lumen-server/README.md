# Lumen Server Docker Compose

This directory is the versioned template for the VPS compose deployment. Copy it
to the server management directory, normally:

```bash
/root/dockerServers/lumen-server
```

The live application and persistent data stay under `/opt/lumen`:

```text
/opt/lumen/current  -> mounted as /app; this is the Lumen repo root
/opt/lumen/data     -> mounted as /app/data
/opt/lumen/keys     -> mounted as /app/keys, read-only
```

`docker-compose.yml` only describes how to run the server. It does not deploy
new application code by itself. The running server reads source files from
`/opt/lumen/current`, so updating `apps/server` means updating the repo checkout
at `/opt/lumen/current` and then restarting the container.

Do not manage the service from Docker's internal overlay path under
`/var/lib/docker/overlay2`. That directory is Docker runtime state, not the
application source of truth.

## Network Shape

The public entrypoint is OpenResty on the VPS, not the Bun container directly:

```text
user / extension -> http://<vps-ip>:80 -> OpenResty -> 127.0.0.1:3000 -> lumen-server container
```

For that reason the compose file intentionally publishes Bun only on the host
loopback interface:

```text
127.0.0.1:3000 -> 3000/tcp
```

Do not change `LUMEN_BIND_HOST` to `0.0.0.0` for the current deployment. Port 80
is the public surface; port 3000 should remain private to the VPS.

OpenResty must proxy both normal HTTP API traffic and WebSocket upgrades. A
minimal location shape is:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

If OpenResty is later moved into Docker, `127.0.0.1` will no longer mean the VPS
host from inside that OpenResty container. In that future layout, put OpenResty
and Lumen on a shared Docker network and proxy to the compose service name, or
use Docker's host gateway intentionally.

## Current Container Baseline

This compose file mirrors the running container inspected on 2026-05-06:

- container: `lumen-server`
- image: `oven/bun:1`
- command: `bun apps/server/src/index.ts`
- working directory: `/app`
- restart policy: `unless-stopped`
- port: `127.0.0.1:3000 -> 3000/tcp`
- database: `/opt/lumen/data/lumen.db`
- keys: `/opt/lumen/keys/keys.json`

## Install On The VPS

```bash
mkdir -p /root/dockerServers/lumen-server
cp docker-compose.yml .env.example README.md /root/dockerServers/lumen-server/
cd /root/dockerServers/lumen-server
cp .env.example .env
docker compose config
```

Review `.env` before starting. The defaults should match the currently running
container.

The compose file intentionally sets `create_host_path: false` for all bind
mounts. If `/opt/lumen/current`, `/opt/lumen/data`, or `/opt/lumen/keys` is
missing, compose should fail instead of silently creating an empty directory.

## Adopt The Existing Container

The current `lumen-server` container was not created by this compose project, so
do not run `docker compose up -d` while it is still running with the same name.
OpenResty can keep its existing proxy config during adoption because the compose
container uses the same host endpoint: `127.0.0.1:3000`.

When ready for a controlled maintenance window:

```bash
cd /root/dockerServers/lumen-server
docker compose config
docker stop lumen-server
docker rename lumen-server lumen-server.manual-$(date +%Y%m%d%H%M%S)
docker compose up -d
docker compose logs -f --tail=100
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1/api/health
```

If the compose-managed container does not start cleanly, stop it and rename the
manual container back:

```bash
docker compose down
docker rename $(docker ps -a --format '{{.Names}}' | grep '^lumen-server.manual-' | head -1) lumen-server
docker start lumen-server
```

## Operational Notes

- Keep `LUMEN_BIND_HOST=127.0.0.1` unless you intentionally want to expose Bun
  directly. The public server should go through OpenResty/Nginx/Caddy.
- After server restarts, check both the private backend health endpoint
  (`http://127.0.0.1:3000/api/health`) and the OpenResty public path from the
  VPS (`http://127.0.0.1/api/health`).
- Back up `/opt/lumen/data/lumen.db` and `/opt/lumen/keys/keys.json` before any
  migration or container adoption.
- `/opt/lumen/keys` is mounted read-only into the container. Keep it that way.
- If `/opt/lumen/current` is updated by git or rsync, restart with
  `docker compose restart lumen-server`.

## Updating Server Code

The container command is:

```bash
bun apps/server/src/index.ts
```

and the container working directory is `/app`, which is mounted from
`/opt/lumen/current`. Therefore `/opt/lumen/current` should be the repo root, not
only `apps/server`:

```text
/opt/lumen/current/
  apps/server/
  packages/
  package.json
  bun.lock
```

Recommended update flow after the compose-managed container is adopted:

```bash
set -euo pipefail

cd /opt/lumen/current
git pull --ff-only

cd /root/dockerServers/lumen-server
docker compose exec lumen-server bun install --frozen-lockfile
docker compose restart lumen-server

curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1/api/health
```

If the old manually-created container is still running and compose has not
adopted it yet, use Docker directly:

```bash
set -euo pipefail

cd /opt/lumen/current
git pull --ff-only

docker exec lumen-server bun install --frozen-lockfile
docker restart lumen-server

curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1/api/health
```

If the VPS does not have this repo cloned at `/opt/lumen/current` yet, create it
there first and keep data/keys separate:

```bash
mkdir -p /opt/lumen /opt/lumen/data /opt/lumen/keys
git clone <repo-url> /opt/lumen/current
cd /opt/lumen/current
docker run --rm -v /opt/lumen/current:/app -w /app oven/bun:1 bun install --frozen-lockfile
```

Do not copy only `apps/server` to `/opt/lumen/current`. The server imports shared
workspace packages, so the repo root is the deployment unit for the current
source-mounted Bun setup.
