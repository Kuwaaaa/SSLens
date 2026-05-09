# Lumen v2 Server

Bun + WebSocket + SQLite. Single process, single SQLite file.

## Quick start

```bash
# from repo root
bun install
bun run keygen                          # writes data/keys.json
bun run dev:server                      # http://localhost:3000
```

By default, small-group signup only requires a handle. Existing handles cannot
be used to mint another token. Set `LUMEN_INVITES_REQUIRED=1` to restore
invite-code-only signup, then mint codes with:

```bash
bun run issue-invite -- --by founder
```

## HTTP routes

| Method | Path | Auth | Body / Query | Returns |
|---|---|---|---|---|
| GET | `/api/health` | none | - | `{ ok: true }` |
| GET | `/api/room` | none | `?url=<url>` | `{ url, canonical, roomId }` |
| POST | `/api/redeem` | none | `{ handle, code? }` | `{ userId, handle, token }` or `409` if handle exists |
| GET | `/api/lenses` | bearer | `?room=<sha256>` | `{ lenses: [...] }` |
| POST | `/api/lenses` | bearer | `{ roomId, url, type, body, anchor, tags?, refs?, anonymous? }` | `{ lens }` |
| PATCH | `/api/lenses/:id/anchor` | bearer | `{ anchor }` | `{ lens }` |
| DELETE | `/api/lenses/:id` | bearer + operator | - | `{ lensId, deleted }` |
| POST | `/api/reactions` | bearer | `{ lensId, kind }` | `{ lensId, kind, selected, reactions, myReactions }` |
| POST | `/api/reports` | bearer | `{ lensId, reason? }` | `{ reportId, lensId }` |
| GET | `/api/admin/reports` | bearer + operator | `?status=open\|reviewed\|dismissed\|all` | `{ reports: [...] }` |
| PATCH | `/api/admin/reports/:id` | bearer + operator | `{ status, note? }` | `{ reportId, status, reviewed }` |
| GET | `/api/status` | bearer + operator | - | uptime, DB, WS, and error counters |
| POST | `/api/admin/revoke-user` | bearer + operator | `{ userId }` | `{ userId, revokedBefore, revoked }` |

`POST /api/lenses` validates the request shape and checks that `roomId` matches
the canonical URL in `url`. `PATCH /api/lenses/:id/anchor` is limited to the
original Lens author or an operator. `DELETE /api/lenses/:id` is operator-only
and also removes reports/reactions for that Lens. Configure operators with
comma-separated `LUMEN_OPERATOR_USER_IDS` or `LUMEN_OPERATOR_HANDLES`.

Write routes have a small in-memory rate limiter as beta abuse protection.
Companion chat and emoji also have per-user WebSocket throttles. These limits
are per-process and reset on server restart; use them as guardrails, not as
durable abuse systems. Unauthenticated limits do not trust `X-Forwarded-For` by
default; set `LUMEN_TRUST_PROXY=1` only when a trusted reverse proxy overwrites
forwarding headers.

## WebSocket

`ws://localhost:3000/ws`

New clients send the bearer token as a WebSocket subprotocol named
`lumen-token.<token>` plus `lumen.v1`, which avoids putting tokens in request
URLs and access logs. The server still accepts `?token=<bearer>` temporarily for
old beta clients.

Client to server messages:

- `{ type: "subscribe", roomId }` - join a room
- `{ type: "companion_join" }` - opt into companion presence for the subscribed room
- `{ type: "companion_leave" }` - leave companion presence
- `{ type: "companion_emoji", emoji, edge, y }` - toss an ephemeral emoji from the left or right edge
- `{ type: "companion_chat", body }` - send an ephemeral tiny-chat message
- `{ type: "ping" }` - keep-alive

Server to client messages:

- `{ type: "subscribed", roomId, presence: [userId...] }`
- `{ type: "presence_join", userId }`
- `{ type: "presence_leave", userId }`
- `{ type: "companion_presence", users: [userId...] }`
- `{ type: "companion_joined", userId, users: [userId...] }`
- `{ type: "companion_left", userId, users: [userId...] }`
- `{ type: "companion_emoji", userId, emoji, edge, y, at }`
- `{ type: "companion_chat", userId, handle, body, at }`
- `{ type: "companion_chat_history", messages: [...] }`
- `{ type: "lens_created", lens }`
- `{ type: "lens_anchor_updated", lens }`
- `{ type: "pong", at }`

## Files

- `src/index.ts` - Bun.serve entrypoint (HTTP + WS)
- `src/db.ts` - SQLite open, base schema, and additive migrations
- `src/auth.ts` - Ed25519 bearer token sign/verify (loads `data/keys.json`)
- `src/ulid.ts` - tiny ULID generator (no deps)
- `src/routes.ts` - HTTP route handlers
- `src/ws.ts` - WebSocket handlers (subscribe, presence, companion)
- `../../packages/url/` - shared URL canonicalization and roomId helpers
- `../../scripts/canonicalize-url.ts` - CLI wrapper for URL canonicalization
- `../../scripts/issue-invite.ts` - invite-code minting CLI
- `../../scripts/keygen.ts` - generate Ed25519 key pair

## Database

SQLite at `data/lumen.db`. Schema is applied automatically on every import of
`src/db.ts`. The base schema uses `CREATE TABLE IF NOT EXISTS`, and additive
changes are tracked in `schema_migrations` so existing beta databases can be
opened safely. Drop the file to reset local development data.

## Auth

Bearer tokens are JWT-shaped
(`base64url(header).base64url(payload).base64url(sig)`) with `alg: EdDSA`.
Keys live in `data/keys.json` (private + public JWKs). Tokens last 365 days.
Operators can revoke existing tokens for a user with
`POST /api/admin/revoke-user`.

Signup mode:

- Default: handle-only signup for small-group use.
- Invite-only: set `LUMEN_INVITES_REQUIRED=1`; `/api/redeem` then requires a valid unused invite code.

## What is not implemented yet

- Preferences endpoints (reading mode sync)
- Litestream backup config
- Caddy / systemd configs
