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
| POST | `/api/reactions` | bearer | `{ lensId, kind }` | `{ lensId, kind, selected, reactions, myReactions }` |
| POST | `/api/reports` | bearer | `{ lensId, reason? }` | `{ reportId, lensId }` |

## WebSocket

`ws://localhost:3000/ws?token=<bearer>`

Client → server messages:
- `{ type: "subscribe", roomId }` — join a room
- `{ type: "ping" }` — keep-alive

Server → client messages:
- `{ type: "subscribed", roomId, presence: [userId...] }`
- `{ type: "presence_join", userId }`
- `{ type: "presence_leave", userId }`
- `{ type: "lens_created", lens }`
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
- Companion mode (matching, emoji toss, chat layer)
- Rate limiting
- Litestream backup config
- Caddy / systemd configs

These are deliberately out of scope for the first vertical slice. Add as needed.
