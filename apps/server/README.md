# Lumen v2 Server

Bun + WebSocket + SQLite. Single process, single SQLite file.

## Quick start

```bash
# from repo root
bun install
bun run keygen                          # writes data/keys.json
bun run dev:server                      # http://localhost:3000
bun run issue-invite -- --by founder    # mint an invite, copy the code
```

## HTTP routes

| Method | Path | Auth | Body / Query | Returns |
|---|---|---|---|---|
| GET | `/api/health` | – | – | `{ ok: true }` |
| POST | `/api/redeem` | – | `{ code, handle }` | `{ userId, handle, token }` |
| GET | `/api/lenses` | bearer | `?room=<sha256>` | `{ lenses: [...] }` |
| POST | `/api/lenses` | bearer | `{ roomId, url, type, body, anchor, tags?, refs?, anonymous? }` | `{ lens }` |
| PATCH | `/api/lenses/:id/anchor` | bearer | `{ anchor }` | `{ lens }` |
| POST | `/api/reactions` | bearer | `{ lensId, kind }` | `{ lensId, kind, selected, reactions, myReactions }` |
| POST | `/api/reports` | bearer | `{ lensId, reason? }` | `{ reportId, lensId }` |

`PATCH /api/lenses/:id/anchor` is limited to the original Lens author or an operator. Configure operators with comma-separated `LUMEN_OPERATOR_USER_IDS` or `LUMEN_OPERATOR_HANDLES`.

## WebSocket

`ws://localhost:3000/ws?token=<bearer>`

Client → server messages:
- `{ type: "subscribe", roomId }` — join a room
- `{ type: "companion_join" }` - opt into companion presence for the subscribed room
- `{ type: "companion_leave" }` - leave companion presence
- `{ type: "companion_emoji", emoji, edge, y }` - toss an ephemeral emoji from the left or right edge
- `{ type: "companion_chat", body }` - send an ephemeral tiny-chat message
- `{ type: "ping" }` — keep-alive

Server → client messages:
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

- `src/index.ts` — Bun.serve entrypoint (HTTP + WS)
- `src/db.ts` — SQLite open + auto-migrate (schema applied on import)
- `src/auth.ts` — Ed25519 bearer token sign/verify (loads `data/keys.json`)
- `src/ulid.ts` — tiny ulid generator (no deps)
- `src/routes.ts` — HTTP route handlers
- `src/ws.ts` — WebSocket handlers (subscribe, presence, ping)
- `../../scripts/canonicalize-url.ts` — URL → roomId (shared with extension later)
- `../../scripts/issue-invite.ts` — invite-code minting CLI
- `../../scripts/keygen.ts` — generate Ed25519 key pair

## Database

SQLite at `data/lumen.db`. Schema is applied automatically on every import of `src/db.ts` via `CREATE TABLE IF NOT EXISTS`. Drop the file to reset.

## Auth

Bearer tokens are JWT-shaped (`base64url(header).base64url(payload).base64url(sig)`) with `alg: EdDSA`. Keys live in `data/keys.json` (private + public JWKs). Tokens last 365 days. Token revocation is a future addition.

## What this skeleton does NOT do yet

- Preferences endpoints (reading mode sync)
- Rate limiting
- Litestream backup config
- Caddy / systemd configs

These are deliberately out of scope for the first vertical slice. Add as needed.
