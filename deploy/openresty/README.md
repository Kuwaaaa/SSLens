# Lumen OpenResty Deployment

This directory stores the versioned OpenResty config templates for the Lumen VPS.
The VPS still runs OpenResty from its normal install path:

```text
/usr/local/openresty/nginx/conf/nginx.conf
```

## Observed VPS State

Collected on 2026-05-06:

- service: `openresty.service`
- status: active
- systemd unit: `/lib/systemd/system/openresty.service`
- master process: `/usr/local/openresty/nginx/sbin/nginx -g 'daemon on; master_process on;'`
- PID file: `/usr/local/openresty/nginx/logs/nginx.pid`
- config test: `nginx: configuration file /usr/local/openresty/nginx/conf/nginx.conf test is successful`
- public entrypoint: port 80 on the VPS
- upstream Lumen server: `127.0.0.1:3000`

OpenResty is not running in Docker in the current deployment. It is a host-level
systemd service that proxies traffic into the Bun container.

## Network Shape

```text
user / extension -> http://<vps-ip>:80 -> OpenResty -> 127.0.0.1:3000 -> lumen-server container
```

Keep the Bun container private on `127.0.0.1:3000`. OpenResty is the public edge.

## Recommended Pattern

Use one stable main config and one service file per proxied application:

```text
nginx.conf                 main OpenResty config; rarely changes
conf.d/*.conf              global snippets and maps
services/*.conf            one reverse-proxy service per file
```

This is easier to grow than editing one large `nginx.conf` for every new app.
Adding a service should usually mean adding one file under `services/`, running
`nginx -t`, and reloading OpenResty.

If you eventually have domains and HTTPS certificates for several services,
this layout still works: each service file can own its `server_name`, TLS certs,
and upstream.

## Files

- `nginx.conf.example` is a full minimal main config that includes `conf.d/*.conf`.
- `conf.d/00-websocket-map.conf` defines `$connection_upgrade` for WebSocket proxying.
- `conf.d/proxy-headers.conf` defines common reverse-proxy headers.
- `services/lumen.conf` is the Lumen HTTP + WebSocket reverse proxy server block.

If the current VPS `nginx.conf` already contains other useful config, do not
blindly replace it. Prefer adding the `include conf.d/*.conf;` line inside its
existing `http { ... }` block, adding `include services/*.conf;`, and then
copying the `conf.d` and `services` files.

## Recommended VPS Layout

Keep a copy of these versioned files in a management directory:

```text
/root/serverConfigs/lumen-openresty
```

Then install them into OpenResty's real config directory:

```text
/usr/local/openresty/nginx/conf
```

This keeps the same separation as the Docker setup:

- repo/deploy templates: source of truth for humans and git,
- `/root/serverConfigs/...`: VPS management copy,
- `/usr/local/openresty/nginx/conf`: actual runtime config,
- `/root/dockerServers/lumen-server`: Docker compose management,
- `/opt/lumen/...`: app code, database, and keys.

## Safe Install / Update

Run on the VPS from the copied `deploy/openresty` directory:

```bash
set -euo pipefail

OPENRESTY_CONF=/usr/local/openresty/nginx/conf
BACKUP=/root/serverConfigs/openresty-backups/$(date +%Y%m%d%H%M%S)

mkdir -p "$BACKUP" "$OPENRESTY_CONF/conf.d" "$OPENRESTY_CONF/services"
cp -a "$OPENRESTY_CONF/nginx.conf" "$BACKUP/nginx.conf"
cp -a "$OPENRESTY_CONF/conf.d" "$BACKUP/conf.d" 2>/dev/null || true
cp -a "$OPENRESTY_CONF/services" "$BACKUP/services" 2>/dev/null || true

# If nginx.conf does not include these directories, add the includes manually
# inside the existing http block, or replace nginx.conf with nginx.conf.example
# after confirming there are no other sites to preserve.
grep -R "conf.d/\\*.conf" "$OPENRESTY_CONF/nginx.conf" || \
  { echo "Add 'include conf.d/*.conf;' inside the http block before continuing."; exit 1; }
grep -R "services/\\*.conf" "$OPENRESTY_CONF/nginx.conf" || \
  { echo "Add 'include services/*.conf;' inside the http block before continuing."; exit 1; }

cp conf.d/00-websocket-map.conf "$OPENRESTY_CONF/conf.d/00-websocket-map.conf"
cp conf.d/proxy-headers.conf "$OPENRESTY_CONF/conf.d/proxy-headers.conf"
cp services/lumen.conf "$OPENRESTY_CONF/services/lumen.conf"

/usr/local/openresty/nginx/sbin/nginx -t
systemctl reload openresty

curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1/api/health
```

If this is the only site on the VPS, replacing the main config is simpler:

```bash
cp nginx.conf.example /usr/local/openresty/nginx/conf/nginx.conf
mkdir -p /usr/local/openresty/nginx/conf/conf.d /usr/local/openresty/nginx/conf/services
cp conf.d/*.conf /usr/local/openresty/nginx/conf/conf.d/
cp services/*.conf /usr/local/openresty/nginx/conf/services/
/usr/local/openresty/nginx/sbin/nginx -t
systemctl reload openresty
```

## Rollback

```bash
cp "$BACKUP/nginx.conf" /usr/local/openresty/nginx/conf/nginx.conf
rm -rf /usr/local/openresty/nginx/conf/conf.d
cp -a "$BACKUP/conf.d" /usr/local/openresty/nginx/conf/conf.d 2>/dev/null || true
rm -rf /usr/local/openresty/nginx/conf/services
cp -a "$BACKUP/services" /usr/local/openresty/nginx/conf/services 2>/dev/null || true
/usr/local/openresty/nginx/sbin/nginx -t
systemctl reload openresty
```

## Adding Another Service

Create a new file such as `services/my-service.conf`:

```nginx
upstream my_service {
    server 127.0.0.1:4000;
    keepalive 16;
}

server {
    listen 80;
    server_name my-service.example.com;

    location / {
        proxy_pass http://my_service;
        proxy_http_version 1.1;
        include conf.d/proxy-headers.conf;
    }
}
```

For an IP-only VPS without domains, multiple services cannot all own plain
`http://<vps-ip>/` at the same time. Use different path prefixes, different
ports, or domains/subdomains. Domains are the cleanest long-term option.

## Checks

```bash
systemctl status openresty --no-pager -l
/usr/local/openresty/nginx/sbin/nginx -t
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1/api/health
```

For WebSocket checks, use the extension or a small WS client against
`ws://<vps-ip>/ws?token=<token>`.
