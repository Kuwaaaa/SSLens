# Server Bottlenecks And Scaling Notes

Date: 2026-05-05
Status: beta architecture notes

This document summarizes where the current Lumen server is most likely to hit
limits, what has already been fixed, and what a future session should look at
next. Read this before changing server performance, persistence, or WebSocket
behavior.

## 1. Current Server Shape

The backend is intentionally simple:

- One Bun process.
- SQLite database at `data/lumen.db`.
- HTTP API routes in `apps/server/src/index.ts` and `apps/server/src/routes.ts`.
- WebSocket room handling in `apps/server/src/ws.ts`.
- In-memory companion presence and companion chat history.
- In-memory beta rate limit buckets.

This is the right shape for the current small beta. The first bottlenecks are
expected to come from query shape, connection visibility, and missing operational
observability before raw machine capacity.

## 2. Already Fixed: Lens List N+1 Query

The first likely performance issue was `GET /api/lenses?room=<roomId>`.

Before the fix, listing a room did:

```text
1 query for all Lens
+ 1 reaction-count query per Lens
+ 1 viewer-reaction query per Lens
+ repeated operator checks while building each Lens response
```

So a room with 100 Lens could issue about 201 SQLite queries plus repeated
operator checks.

Current behavior:

```text
1 query for all Lens in the room
+ 1 room-level reaction-count aggregation query
+ 1 room-level viewer-reaction query
+ 1 operator check for the viewer
```

The response shape did not change. Single-Lens write/update paths still use
single-Lens lookups because they do not have the same N+1 problem.

Relevant code:

- `apps/server/src/routes.ts`
  - `listLensesByRoom`
  - `reactionCountsByRoom`
  - `userReactionsByRoom`
  - `handleListLenses`
  - `rowToLens`

## 3. Remaining Likely Bottlenecks

### 3.1 Full-Room Lens Fetches

`GET /api/lenses` still returns all Lens for a room. This is product-simple and
good for beta, but a heavily used page can eventually create large payloads and
expensive client-side anchor restoration.

Watch for:

- slow first overlay load,
- large JSON responses,
- high extension CPU during anchor restore,
- pages with hundreds of Lens.

Do not add pagination too early. If needed, prefer an additive API such as:

```text
GET /api/lenses?room=<roomId>&limit=200&before=<createdAt>
```

The extension would then need a careful loading strategy so Quiet/Thinking modes
do not accidentally hide context users expect.

### 3.2 SQLite Write Contention

SQLite WAL is fine for the current small cohort. The risk is write concurrency,
because SQLite still has one writer at a time.

Likely write pressure sources:

- reaction bursts,
- multiple users creating Lens at once,
- operator deletion while users interact,
- future durable Lounge/chat history if added.

Current mitigation:

- Companion chat is intentionally in memory and not written to SQLite.
- Write routes have small in-memory rate limits.

Keep chat and Lounge history non-durable until product review. Durable chat would
move pressure from WebSocket memory into SQLite writes and also compete with Lens
as page memory.

### 3.3 WebSocket Connection Count

Each active tab can own a WebSocket through the extension service-worker bridge.
The server tracks presence with per-user connection counts, but total connection
count can still grow with tabs.

Watch for:

- many open sockets from one user,
- reverse proxy WebSocket upgrade issues,
- idle timeout disconnects,
- hot rooms with many subscribers,
- companion emoji/chat burst broadcasts.

Future optimization:

- aggregate WebSocket connections per browser profile in the extension service
  worker and fan out to tabs,
- expose server-side connection counts,
- log room count and largest room size.

### 3.4 In-Memory State

The server currently keeps these in memory:

- companion presence,
- companion chat history,
- rate-limit buckets.

This is acceptable for one process. It means:

- server restart clears companion state and recent chat,
- rate limits reset on restart,
- multiple server processes would not share this state.

Do not run multiple Bun server processes behind a load balancer without first
deciding how to share or route WebSocket/presence state.

### 3.5 Operator Lookup

Operator checks can use `LUMEN_OPERATOR_USER_IDS` or `LUMEN_OPERATOR_HANDLES`.
Handle-based checks require reading the user row. The list endpoint now does
that once per request, but single-Lens operator paths still do it as needed.

If operator checks become common, prefer operator user IDs in production config.

### 3.6 Missing Observability

The next practical bottleneck is not raw performance; it is knowing what failed.
Many user-facing failures look similar:

- wrong API base,
- invalid token,
- WebSocket upgrade failure,
- canonical URL mismatch,
- room ID mismatch,
- database write error,
- reverse proxy timeout.

Current partial mitigation:

- extension InfoPanel has Room debug with canonical URL and roomId,
- `/api/health` exists but is minimal.

Suggested next observability work:

- extend `/api/health` or add `/api/status` for operator use,
- expose uptime, DB availability, current WS connections, current rooms,
  companion room count, and recent error count,
- log slow requests with path and elapsed time,
- log WS open/close counts and close codes.

## 4. Rate Limit Notes

`apps/server/src/rate-limit.ts` adds in-memory beta protection for:

- redeem,
- createLens,
- updateAnchor,
- deleteLens,
- reaction,
- report.

This is a guardrail, not a production abuse system:

- resets on server restart,
- not shared across processes,
- depends on proxy-provided `x-forwarded-for` / `x-real-ip` for unauthenticated
  requests.

If Lumen gets wider exposure, add reverse-proxy-level limits and better logging.

## 5. Admin / Moderation Notes

Operators can delete a Lens with:

```text
DELETE /api/lenses/:id
```

It removes the Lens plus associated reactions/reports, then broadcasts:

```ts
{ type: "lens_deleted", lensId }
```

The extension removes the Lens from the current page when it receives this
message. The admin test page also includes a simple moderation section.

Operators are configured with:

```text
LUMEN_OPERATOR_USER_IDS
LUMEN_OPERATOR_HANDLES
```

Prefer user IDs for production because they avoid handle ambiguity and extra
lookup work.

## 6. Recommended Next Server Work

1. Add lightweight status/observability.
2. Add slow-request logging around HTTP routes.
3. Add WebSocket connection and room counters.
4. Back up `data/lumen.db`, `data/lumen.db-wal`, and `data/keys.json`.
5. Watch real room Lens counts before adding pagination.
6. Keep companion/Lounge chat ephemeral unless there is a product decision to
   make chat durable.

## 7. What Not To Do Yet

- Do not migrate to Postgres just because SQLite has theoretical limits.
- Do not add pagination before real room payloads become a problem.
- Do not persist companion chat as a performance "upgrade".
- Do not run multiple server processes without a presence/WebSocket state plan.
- Do not optimize total Lens count as a product metric.

