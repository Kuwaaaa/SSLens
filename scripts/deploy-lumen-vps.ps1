param(
  [string]$HostName = "tencent_a",
  [string]$PublicPrefix = "/lumen",
  [string]$ComposeDir = "/root/dockerServers/lumen-server",
  [string]$ReleaseRoot = "/opt/lumen/releases",
  [string]$CurrentLink = "/opt/lumen/current",
  [string]$DataDir = "/opt/lumen/data",
  [string]$KeysDir = "/opt/lumen/keys",
  [switch]$SkipTypecheck,
  [switch]$SkipComposeAdoption,
  [switch]$SkipOpenResty,
  [switch]$KeepArchive
)

$ErrorActionPreference = "Stop"

function Run($command, $arguments) {
  Write-Host "+ $command $arguments"
  $process = Start-Process -FilePath $command -ArgumentList $arguments -NoNewWindow -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "$command exited with code $($process.ExitCode)"
  }
}

function RunRemoteScript($hostName, $remoteArgs, $script) {
  $script = $script.TrimStart([char]0xFEFF) -replace "`r`n", "`n"
  $scriptPath = Join-Path ([System.IO.Path]::GetTempPath()) "lumen-remote-deploy-$stamp.sh"
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  [System.IO.File]::WriteAllText($scriptPath, $script, $utf8NoBom)

  try {
    $arguments = "/c ""ssh.exe $hostName $($remoteArgs -join " ") < ""$scriptPath"""""
    Run "cmd.exe" $arguments
  }
  finally {
    if (Test-Path $scriptPath) {
      Remove-Item -LiteralPath $scriptPath -Force
    }
  }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$stamp = Get-Date -Format "yyyyMMddHHmmss"
$archiveName = "lumen-release-$stamp.tar.gz"
$archivePath = Join-Path ([System.IO.Path]::GetTempPath()) $archiveName
$remoteArchive = "/tmp/$archiveName"
$releaseDir = "$ReleaseRoot/$stamp"

Push-Location $repoRoot
try {
  if (-not $SkipTypecheck) {
    Run "cmd.exe" "/c bun run typecheck"
  }

  if (Test-Path $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }

  $tarArgs = @(
    "-czf", $archivePath,
    "--exclude=.git",
    "--exclude=node_modules",
    "--exclude=.npm-cache",
    "--exclude=data",
    "--exclude=apps/extension/dist",
    "--exclude=apps/extension/dist.*",
    "--exclude=.env",
    "--exclude=.env.local",
    "."
  )
  Run "tar.exe" ($tarArgs -join " ")
  Run "scp.exe" "$archivePath ${HostName}:$remoteArchive"

  $remoteScript = @'
set -euo pipefail

REMOTE_ARCHIVE="$1"
RELEASE_DIR="$2"
CURRENT_LINK="$3"
COMPOSE_DIR="$4"
DATA_DIR="$5"
KEYS_DIR="$6"
PUBLIC_PREFIX="$7"
SKIP_ADOPTION="$8"
SKIP_OPENRESTY="$9"

SERVICE="lumen-server"
OPENRESTY_CONF="/usr/local/openresty/nginx/conf/conf.d/drug-manager-pocketbase.conf"
BACKUP_ROOT="/opt/lumen/backups"
STAMP="$(basename "$RELEASE_DIR")"
MANUAL_CONTAINER=""
OPENRESTY_BACKUP=""

log() { printf '\n== %s ==\n' "$*"; }

log "preflight"
test -f "$REMOTE_ARCHIVE"
test -d "$(dirname "$RELEASE_DIR")"
test -d "$COMPOSE_DIR"
test -d "$DATA_DIR"
test -d "$KEYS_DIR"
docker --version
docker compose version

PREVIOUS_TARGET="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
if [ -z "$PREVIOUS_TARGET" ]; then
  echo "Cannot resolve previous release from $CURRENT_LINK" >&2
  exit 1
fi
echo "previous release: $PREVIOUS_TARGET"
echo "next release: $RELEASE_DIR"

rollback() {
  code=$?
  if [ "$code" -eq 0 ]; then
    return 0
  fi
  echo "deploy failed; attempting rollback to $PREVIOUS_TARGET" >&2
  ln -sfn "$PREVIOUS_TARGET" "$CURRENT_LINK" || true
  if [ -n "$OPENRESTY_BACKUP" ] && [ -f "$OPENRESTY_BACKUP" ]; then
    cp -a "$OPENRESTY_BACKUP" "$OPENRESTY_CONF" || true
    /usr/local/openresty/nginx/sbin/nginx -t >/dev/null 2>&1 && systemctl reload openresty || true
  fi
  if [ -n "$MANUAL_CONTAINER" ] && docker ps -a --format '{{.Names}}' | grep -qx "$MANUAL_CONTAINER"; then
    (cd "$COMPOSE_DIR" && docker compose down >/dev/null 2>&1) || true
    docker rename "$MANUAL_CONTAINER" "$SERVICE" >/dev/null 2>&1 || true
  fi
  if docker ps -a --format '{{.Names}}' | grep -qx "$SERVICE"; then
    docker restart "$SERVICE" >/dev/null 2>&1 || true
  fi
  exit "$code"
}
trap rollback EXIT

log "extract release"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf "$REMOTE_ARCHIVE" -C "$RELEASE_DIR"
rm -f "$REMOTE_ARCHIVE"

log "install dependencies"
docker run --rm \
  -v "$RELEASE_DIR:/app" \
  -w /app \
  oven/bun:1 \
  bun install --frozen-lockfile

log "backup data"
mkdir -p "$BACKUP_ROOT/$STAMP"
cp -a "$DATA_DIR" "$BACKUP_ROOT/$STAMP/data"
cp -a "$KEYS_DIR" "$BACKUP_ROOT/$STAMP/keys"
echo "backup: $BACKUP_ROOT/$STAMP"

log "switch current symlink"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
readlink -f "$CURRENT_LINK"

log "compose adoption or restart"
cd "$COMPOSE_DIR"
if docker compose ps -a --services --filter status=running | grep -qx "$SERVICE"; then
  docker compose restart "$SERVICE"
else
  has_compose_label="$(docker inspect "$SERVICE" --format '{{ index .Config.Labels "com.docker.compose.project" }}' 2>/dev/null || true)"
  if [ -n "$has_compose_label" ] && [ "$has_compose_label" != "<no value>" ]; then
    docker compose restart "$SERVICE"
  elif [ "$SKIP_ADOPTION" = "1" ]; then
    docker restart "$SERVICE"
  else
    if docker ps -a --format '{{.Names}}' | grep -qx "$SERVICE"; then
      docker stop "$SERVICE"
      MANUAL_CONTAINER="$SERVICE.manual-$STAMP"
      docker rename "$SERVICE" "$MANUAL_CONTAINER"
    fi
    docker compose up -d
  fi
fi

log "container status"
docker ps --filter "name=^/${SERVICE}$" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

log "private health"
for attempt in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:3000/api/health; then
    break
  fi
  if [ "$attempt" = "5" ]; then
    exit 1
  fi
  sleep 2
done
echo

if [ "$SKIP_OPENRESTY" != "1" ]; then
  log "configure openresty prefix"
  test -f "$OPENRESTY_CONF"
  OPENRESTY_BACKUP="$OPENRESTY_CONF.bak.$STAMP"
  cp -a "$OPENRESTY_CONF" "$OPENRESTY_BACKUP"
  python3 - "$OPENRESTY_CONF" "$PUBLIC_PREFIX" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
prefix = sys.argv[2].rstrip("/") or "/lumen"
text = path.read_text()
marker = f"location ^~ {prefix}/"

block = f"""
    location = {prefix} {{
        return 308 {prefix}/;
    }}

    location ^~ {prefix}/ {{
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $drug_manager_connection_upgrade;

        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 3600s;
    }}

"""

if marker not in text:
    needle = "    location / {\n"
    if needle not in text:
        raise SystemExit("could not find location / insertion point")
    text = text.replace(needle, block + needle, 1)

path.write_text(text)
PY
  /usr/local/openresty/nginx/sbin/nginx -t
  systemctl reload openresty

  log "public prefix health"
  for attempt in 1 2 3 4 5; do
    if curl -fsS "http://127.0.0.1${PUBLIC_PREFIX}/api/health"; then
      break
    fi
    if [ "$attempt" = "5" ]; then
      exit 1
    fi
    sleep 2
  done
  echo
fi

log "done"
trap - EXIT
'@

  $skipAdoptionValue = if ($SkipComposeAdoption) { "1" } else { "0" }
  $skipOpenRestyValue = if ($SkipOpenResty) { "1" } else { "0" }
  $remoteArgs = @(
    "bash", "-s", "--",
    $remoteArchive,
    $releaseDir,
    $CurrentLink,
    $ComposeDir,
    $DataDir,
    $KeysDir,
    $PublicPrefix,
    $skipAdoptionValue,
    $skipOpenRestyValue
  )

  RunRemoteScript $HostName $remoteArgs $remoteScript
}
finally {
  Pop-Location
  if (-not $KeepArchive -and (Test-Path $archivePath)) {
    Remove-Item -LiteralPath $archivePath -Force
  }
}
