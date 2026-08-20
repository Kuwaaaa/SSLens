param(
  [string]$HostName = "tencent_a",
  [string]$PublicBase = "http://122.51.9.220/lumen",
  [string]$RootBase = "http://122.51.9.220",
  [string]$ComposeDir = "/root/dockerServers/lumen-server",
  [string]$Service = "lumen-server",
  [switch]$SkipSmokeWrite
)

$ErrorActionPreference = "Stop"
$script:Failures = New-Object System.Collections.Generic.List[string]

function Pass($name, $detail = "") {
  if ($detail) {
    Write-Host "[PASS] $name - $detail" -ForegroundColor Green
  } else {
    Write-Host "[PASS] $name" -ForegroundColor Green
  }
}

function Fail($name, $detail) {
  $script:Failures.Add("${name}: ${detail}") | Out-Null
  Write-Host "[FAIL] $name - $detail" -ForegroundColor Red
}

function Info($message) {
  Write-Host "[INFO] $message" -ForegroundColor Cyan
}

function Assert($name, [bool]$condition, $detail = "") {
  if ($condition) {
    Pass $name $detail
  } else {
    Fail $name $detail
  }
}

function RunText($command, $arguments, $allowFail = $false) {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $command
  $psi.Arguments = $arguments
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  if ($p.ExitCode -ne 0 -and -not $allowFail) {
    throw "$command $arguments exited with $($p.ExitCode): $stderr"
  }
  [pscustomobject]@{
    ExitCode = $p.ExitCode
    Stdout = $stdout
    Stderr = $stderr
  }
}

function RunTextList($command, [string[]]$arguments, $allowFail = $false) {
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName = $command
  $psi.Arguments = ($arguments | ForEach-Object { QuoteArg $_ }) -join " "
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $stdout = $p.StandardOutput.ReadToEnd()
  $stderr = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  if ($p.ExitCode -ne 0 -and -not $allowFail) {
    throw "$command exited with $($p.ExitCode): $stderr"
  }
  [pscustomobject]@{
    ExitCode = $p.ExitCode
    Stdout = $stdout
    Stderr = $stderr
  }
}

function QuoteArg([string]$argument) {
  if ($argument -notmatch '[\s"]') {
    return $argument
  }
  '"' + ($argument -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

function Ssh($remoteCommand, $allowFail = $false) {
  RunText "ssh.exe" "$HostName ""$remoteCommand""" $allowFail
}

function InvokeHttp($url, $method = "GET", $body = $null, $headers = @()) {
  $args = @("-sS", "-i", "-m", "12", "-X", $method)
  foreach ($header in $headers) {
    $args += @("-H", $header)
  }
  if ($null -ne $body) {
    $args += @("-d", $body)
  }
  $args += $url
  $result = RunTextList "curl.exe" $args $true
  $raw = $result.Stdout
  $separator = "`r`n`r`n"
  $separatorIndex = $raw.IndexOf($separator)
  if ($separatorIndex -lt 0) {
    $separator = "`n`n"
    $separatorIndex = $raw.IndexOf($separator)
  }
  if ($separatorIndex -ge 0) {
    $head = $raw.Substring(0, $separatorIndex)
    $responseBody = $raw.Substring($separatorIndex + $separator.Length)
  } else {
    $head = $raw
    $responseBody = ""
  }
  $status = 0
  if ($head -match "HTTP/\S+\s+(\d+)") {
    $status = [int]$Matches[1]
  }
  [pscustomobject]@{
    ExitCode = $result.ExitCode
    Status = $status
    Headers = $head
    Body = $responseBody.Trim()
    Raw = $raw
    Error = $result.Stderr.Trim()
  }
}

function JsonBody($response) {
  try {
    $response.Body | ConvertFrom-Json
  } catch {
    $null
  }
}

function RunLocalBunScript($source) {
  $path = Join-Path ([System.IO.Path]::GetTempPath()) "lumen-ws-check-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()).mjs"
  [System.IO.File]::WriteAllText($path, $source, [System.Text.UTF8Encoding]::new($false))
  try {
    RunText "bun.exe" $path $true
  } finally {
    if (Test-Path $path) {
      Remove-Item -LiteralPath $path -Force
    }
  }
}

$PublicBase = $PublicBase.TrimEnd("/")
$RootBase = $RootBase.TrimEnd("/")
$stamp = Get-Date -Format "yyyyMMddHHmmss"
$handle = "smoke_$stamp"
$testUrl = "https://paulgraham.com/ds.html"

Info "Checking $PublicBase on $HostName"

try {
  $compose = Ssh "cd $ComposeDir && docker compose ps"
  Assert "compose lists lumen-server" ($compose.Stdout -match $Service) ($compose.Stdout.Trim() -replace "`r?`n", " | ")
  Assert "compose container healthy" ($compose.Stdout -match "healthy") ($compose.Stdout.Trim() -replace "`r?`n", " | ")
} catch {
  Fail "compose status" $_.Exception.Message
}

try {
  $current = Ssh "readlink -f /opt/lumen/current"
  Assert "current release symlink resolves" ($current.Stdout.Trim() -match "^/opt/lumen/releases/") $current.Stdout.Trim()
} catch {
  Fail "current release symlink" $_.Exception.Message
}

try {
  $logs = Ssh "cd $ComposeDir && docker compose logs --tail=120 $Service"
  Assert "server log has startup line" ($logs.Stdout -match "lumen server listening") "startup seen"
  Assert "server log has no recent fatal markers" (-not ($logs.Stdout -match "(?i)(sqlite.*error|uncaught|panic|failed to start)")) "no fatal markers in last 120 lines"
} catch {
  Fail "server logs" $_.Exception.Message
}

try {
  $nginx = Ssh "/usr/local/openresty/nginx/sbin/nginx -t 2>&1 && systemctl is-active openresty && grep -n 'location .*lumen' /usr/local/openresty/nginx/conf/conf.d/drug-manager-pocketbase.conf"
  Assert "OpenResty config valid and active" ($nginx.Stdout -match "successful" -and $nginx.Stdout -match "active") "nginx -t ok"
  Assert "OpenResty has /lumen locations" ($nginx.Stdout -match "location = /lumen" -and $nginx.Stdout -match "location \^~ /lumen/") "prefix block present"
} catch {
  Fail "OpenResty routing" $_.Exception.Message
}

$health = InvokeHttp "$PublicBase/api/health"
$healthJson = JsonBody $health
Assert "public /lumen/api/health" ($health.Status -eq 200 -and $healthJson.ok -eq $true) "status=$($health.Status) body=$($health.Body)"

$rootHealth = InvokeHttp "$RootBase/api/health"
Assert "root /api/health remains non-lumen" ($rootHealth.Status -eq 200 -and $rootHealth.Body -match "API is healthy" -and $rootHealth.Body -notmatch '"ok"\s*:\s*true') "body=$($rootHealth.Body)"

$console = InvokeHttp "$PublicBase/"
Assert "operator console loads" ($console.Status -eq 200 -and $console.Body -match "lumen operator console") "status=$($console.Status)"
Assert "operator console is prefix-aware" ($console.Body -match "BASE_PATH" -and $console.Body -match "serverBasePath" -and $console.Body -match "\$\(`"privacy-link`"\)\.href") "base path script present"

$privacy = InvokeHttp "$PublicBase/privacy"
Assert "privacy page loads under prefix" ($privacy.Status -eq 200 -and $privacy.Body -match "<html") "status=$($privacy.Status)"

$token = $null
$room = $null
$lensId = $null

if ($SkipSmokeWrite) {
  Info "Skipping write smoke tests by request."
} else {
  $redeemBody = @{ handle = $handle } | ConvertTo-Json -Compress
  $redeem = InvokeHttp "$PublicBase/api/redeem" "POST" $redeemBody @("Content-Type: application/json")
  $redeemJson = JsonBody $redeem
  $token = $redeemJson.token
  Assert "redeem smoke user" ($redeem.Status -eq 200 -and $token) "handle=$handle status=$($redeem.Status)"

  $duplicate = InvokeHttp "$PublicBase/api/redeem" "POST" $redeemBody @("Content-Type: application/json")
  Assert "duplicate handle rejected" ($duplicate.Status -eq 409) "status=$($duplicate.Status)"

  if ($token) {
    $roomResp = InvokeHttp "$PublicBase/api/room?url=$([Uri]::EscapeDataString($testUrl))" "GET" $null @("Authorization: Bearer $token")
    $room = JsonBody $roomResp
    Assert "resolve room" ($roomResp.Status -eq 200 -and $room.roomId -match "^[a-f0-9]{64}$") "room=$($room.roomId)"

    if ($room -and $room.roomId) {
      $createBody = @{
        roomId = $room.roomId
        url = $room.canonical
        type = "quick"
        tags = @("smoke")
        body = "VPS smoke test $stamp"
        anchor = @{ quote = @{ exact = "VPS smoke test $stamp" } }
        anonymous = $false
      } | ConvertTo-Json -Depth 8 -Compress
      $create = InvokeHttp "$PublicBase/api/lenses" "POST" $createBody @("Content-Type: application/json", "Authorization: Bearer $token")
      $createJson = JsonBody $create
      $lensId = $createJson.lens.id
      Assert "create smoke lens" ($create.Status -eq 201 -and $lensId) "lens=$lensId status=$($create.Status)"

      $list = InvokeHttp "$PublicBase/api/lenses?room=$($room.roomId)" "GET" $null @("Authorization: Bearer $token")
      Assert "list smoke lens" ($list.Status -eq 200 -and $list.Body -match [Regex]::Escape($lensId)) "status=$($list.Status)"
    }
  }
}

if ($token -and $room -and $room.roomId) {
  $wsUrl = $PublicBase.Replace("http://", "ws://").Replace("https://", "wss://") + "/ws"
  $wsScript = @"
const token = "$token";
const roomId = "$($room.roomId)";
const ws = new WebSocket("$wsUrl", ["lumen-token." + token, "lumen.v1"]);
const timeout = setTimeout(() => {
  console.error("timeout");
  try { ws.close(); } catch {}
  process.exit(2);
}, 8000);
ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ type: "subscribe", roomId }));
});
ws.addEventListener("message", (event) => {
  const text = String(event.data || "");
  if (text.includes("presence") || text.includes("subscribed")) {
    clearTimeout(timeout);
    ws.close();
    process.exit(0);
  }
});
ws.addEventListener("error", () => {
  clearTimeout(timeout);
  process.exit(3);
});
"@
  $ws = RunLocalBunScript $wsScript
  Assert "public prefixed WebSocket" ($ws.ExitCode -eq 0) "exit=$($ws.ExitCode) stderr=$($ws.Stderr.Trim())"
} elseif (-not $SkipSmokeWrite) {
  Fail "public prefixed WebSocket" "skipped because token/room setup failed"
}

try {
  $dbScript = @'
import { Database } from "bun:sqlite";
const db = new Database("/app/data/lumen.db", { readonly: true });
const tables = db.query("select name from sqlite_master where type='table' order by name").all().map((row) => row.name);
const counts = {};
for (const table of ["users", "lenses", "reactions", "reports", "schema_migrations", "token_revocations"]) {
  if (tables.includes(table)) counts[table] = db.query(`select count(*) as n from ${table}`).get().n;
}
console.log(JSON.stringify({ tables, counts }));
'@
  $remoteDb = $dbScript -replace "`r`n", "`n"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteDb))
  $db = Ssh "echo $encoded | base64 -d | docker compose -f $ComposeDir/docker-compose.yml exec -T $Service bun -"
  $dbJson = $db.Stdout.Trim() | ConvertFrom-Json
  Assert "database has current migration tables" ($dbJson.tables -contains "schema_migrations" -and $dbJson.tables -contains "token_revocations") (($dbJson.tables -join ","))
  Assert "database has users and lenses" ($dbJson.counts.users -ge 1 -and $dbJson.counts.lenses -ge 1) ("users=$($dbJson.counts.users) lenses=$($dbJson.counts.lenses)")
} catch {
  Fail "database inspection" $_.Exception.Message
}

try {
  $rollback = Ssh "printf 'current='; readlink -f /opt/lumen/current; printf 'backups='; ls -1 /opt/lumen/backups 2>/dev/null | tail -3 | xargs echo; printf 'manual='; docker ps -a --filter name=lumen-server.manual --format '{{.Names}} {{.Status}}' | xargs echo"
  Assert "rollback artifacts visible" ($rollback.Stdout -match "current=/opt/lumen/releases/" -and $rollback.Stdout -match "backups=") ($rollback.Stdout.Trim() -replace "`r?`n", " | ")
} catch {
  Fail "rollback artifact check" $_.Exception.Message
}

if ($script:Failures.Count -gt 0) {
  Write-Host ""
  Write-Host "FAILED CHECKS:" -ForegroundColor Red
  foreach ($failure in $script:Failures) {
    Write-Host "- $failure" -ForegroundColor Red
  }
  exit 1
}

Write-Host ""
Write-Host "All lumen VPS checks passed." -ForegroundColor Green
