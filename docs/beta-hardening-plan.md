# Beta Hardening Plan

Date: 2026-05-06
Status: in progress; Phase 0-2 implemented, selected Phase 3 safety items pulled forward
Companion to: `docs/project-status.md`

This document captures concrete fixes and improvements identified through a full
codebase audit. Items are ordered by priority within each phase. Each item
includes the relevant file and line range so a future session can jump straight
to the code.

Note: several line numbers are from the original audit snapshot and may drift as
items are implemented. Prefer current symbols and routes over stale line
numbers.

Do not treat this as a feature roadmap. Everything here serves one goal:
make the current beta robust enough to invite more users without silent
breakage, data loss, or security incidents.

---

## Phase 0: Immediate (before any new invites)

Status: implemented.

### 0-1. Remove CRX signing key and release artifacts from version control

`apps/extension/dist.pem` and generated `apps/extension/dist.*` release
artifacts are committed. Anyone with repo access can sign fraudulent extension
updates, and generated binaries make reviews noisier.

- Delete the file from git history or at minimum remove it from HEAD.
- Remove `apps/extension/dist.crx`, `apps/extension/dist.zip`,
  `apps/extension/dist.rar`, and `apps/extension/dist.pem` from git tracking.
- Add `apps/extension/dist.*` to `.gitignore`.
- Rotate the signing key if the repo has ever been shared or the key has been
  used for real distribution.

### 0-2. Fix `[[url:...]]` XSS vector

`apps/extension/src/refs.tsx:246` -- the `[[url:...]]` syntax places user
content directly into `<a href>` without protocol validation. Markdown links
already enforce `https?://`; apply the same check here.

Invalid URL refs should render as disabled/plain text, not as a clickable
`href="#"` link.

### 0-3. Harden handle-based login

`apps/server/src/routes.ts:60-63` -- if a handle already exists, a fresh token
is issued to anyone who knows the handle.

Minimum viable fix: once a handle is registered, `/api/redeem` must not issue a
new token for it. Return 409 Conflict instead. Users who lose their token need
an operator-assisted reset or a one-time recovery code issued at registration.

The popup should surface 409 as "handle already registered" instead of a generic
failure. A later phase should add a reset CLI or one-time recovery code.

### 0-4. Require HTTPS for production extension builds

`apps/extension/vite.config.ts:6-14` -- the guard blocks `localhost` but allows
plain HTTP IPs. Production builds must use `https://` by default because bearer
tokens travel on every API request.

- Require `VITE_LUMEN_API_BASE` to start with `https://` in production mode.
- Allow temporary HTTP beta builds only with an explicit
  `LUMEN_ALLOW_HTTP_BETA=1` escape hatch.
- Keep the existing localhost guard.

### 0-5. Back up local/server beta data before inviting more users

`data/lumen.db`, `data/lumen.db-wal`, and `data/keys.json` are the current beta
state and signing material. Before widening invites, copy them to a dated backup
folder and record the restore path.

---

## Phase 1: Beta stability (during current beta)

Status: implemented.

### 1-1. Extract canonicalization into a shared package

`scripts/canonicalize-url.ts`, `apps/extension/src/shared/canonicalize.ts`, and
the admin/test page copy in `apps/server/public/index.html` are manually kept in
sync. Divergence silently breaks room matching.

- Create `packages/url/` (or add to `packages/schema/`).
- Move `canonicalizeUrlString`, `applySiteCanonicalRule`, `roomIdFor`, and
  constants into the shared package.
- The extension-only `canonicalUrlFromDocument` stays in the extension but
  imports the shared core.
- Delete duplicated script/extension logic or turn the script and admin page
  into thin wrappers around the shared package.

### 1-2. Server-side roomId verification

`apps/server/src/routes.ts:283` -- the server trusts the client-supplied
`roomId`. After 1-1, the server can import the shared canonicalization and
verify `roomId === sha256(canonicalize(url))` on `POST /api/lenses`.

Important boundary: the server cannot read document-level canonical tags from a
webpage. The extension must send the final canonical URL as `url`; the server
then verifies the hash from that canonical URL. Do not make the server pretend
it can reproduce `link[rel=canonical]` discovery.

### 1-3. Fix presence multi-tab bug

`apps/server/src/ws.ts:17` -- regular presence uses `Map<roomId, Set<userId>>`.
When a user has two tabs on the same page and closes one, the user is removed
from the presence set even though the other tab is still open.

Fix: change to `Map<roomId, Map<userId, number>>` (refcount), matching the
pattern already used for `companionPresence` at line 18.

### 1-4. Service worker lifecycle and WebSocket reconnection

MV3 service workers can be terminated after idle periods. The current heartbeat
and WebSocket bridge need an end-to-end recovery path.

- Prefer `chrome.alarms` for worker wakeups if manual testing confirms it helps
  the current bridge (requires adding `"alarms"` permission to manifest.json).
- In the content script, detect port disconnect and attempt to re-establish the
  port connection after a short delay, rather than requiring a full page reload.
- Acceptance: after worker suspension or socket close, a page recovers live
  events without a full tab reload.
- Reference: `apps/extension/src/service-worker.ts:145-154`,
  `apps/extension/src/content.tsx:441`.

### 1-5. Fix fetch/WS race condition

`apps/extension/src/content.tsx:417` -- `setLenses(ls)` replaces the entire
lens array with the HTTP response, potentially dropping lenses received via
WebSocket during the fetch window.

Fix: merge instead of replace. Use a Map keyed by lens ID, or deduplicate
after setting.

### 1-6. Add WebSocket message rate limiting

`apps/server/src/ws.ts` -- companion chat and emoji messages have no
server-side throttle. Add a per-user per-room rate limit (e.g., 10 messages/s
for chat, 5/s for emoji).

### 1-7. Clean up `companionChatHistory` for empty rooms

`apps/server/src/ws.ts:19` -- chat history for rooms with zero presence is
never pruned. Clean by companion state, not ordinary room presence:

- In `companionLeave`, when the companion room becomes empty, keep only the
  intended short late-joiner window.
- Add periodic age pruning so abandoned rooms disappear even without new joins.

### 1-8. Add default case to service worker API handler

`apps/extension/src/service-worker.ts:41-66` -- unrecognized `action` values
cause `sendResponse` to never be called, hanging the caller. Add a `default`
branch that returns `{ ok: false, error: "unknown action" }`.

### 1-9. Add emergency token revocation

`apps/server/src/auth.ts` -- add a `revoked_tokens` table or an in-memory
blocklist checked in `verifyToken`. Expose an operator route to revoke a token
by user ID. This is urgent because existing long-lived tokens may have been
minted through the insecure handle flow.

---

## Phase 2: Pre-release quality (before widening invites)

Status: implemented except broad test expansion beyond the focused canonicalize,
schema-validation, and anchoring tests already added.

### 2-1. Add runtime schema validation

Create shared validation functions in `packages/schema/` for at least:

- `validateLensAnchor(unknown): LensAnchor | null`
- `validateCreateLensInput(unknown): CreateLensInput | null`

Use these on the server side in `handleCreateLens` and `handleUpdateLensAnchor`.
Also validate `tags` (array of strings, bounded length) and `refs`.

### 2-2. Add operator status endpoint

Extend `/api/health` or add `/api/status` (operator-only) with:

- Uptime
- DB writable check
- WebSocket connection count
- Room count and largest room
- Companion room count
- Recent error count

### 2-3. Add root-level typecheck and test scripts

`package.json` -- add:

```json
"typecheck": "bunx tsc -p apps/extension/tsconfig.json --noEmit && bunx tsc -p apps/server/tsconfig.json --noEmit",
"test": "bun run test:canonicalize"
```

Expand `test` as more test files are added.

### 2-4. Fix anchoring package tsconfig boundary

`packages/anchoring/tsconfig.json` -- `rootDir: "src"` conflicts with the
workspace path reference to `packages/schema/src/index.ts`. Either use
TypeScript project references (`composite: true` + `references`) or adjust
`rootDir` to encompass the monorepo root.

### 2-5. Add core anchoring tests

`packages/anchoring/` has zero tests. Priority test cases:

- `buildTextIndex` on a known HTML fragment
- `createAnchor` + `restoreAnchor` round-trip on unchanged DOM
- `restoreAnchor` after text shift (position fails, quote succeeds)
- `restoreAnchor` after minor edit (fuzzy fallback)
- Empty selection edge case
- Very long selection

### 2-6. Fix document encoding issues

`docs/ARCHITECTURE.md`, `docs/product/lens-design.md`, and Chinese mirrors
reportedly contain mojibake. Re-save with correct UTF-8 encoding.

Status: partially handled. The operator console mojibake and broken JavaScript
were fixed. Product/architecture docs still need a careful targeted pass because
some files also contain active product edits that should not be overwritten.

### 2-7. Update stale README claims

`apps/server/README.md` still says rate limiting is not implemented. Audit
READMEs against actual code state.

---

## Phase 3: Deferred (after beta validates)

These are real issues but should not block the current beta cycle.

| Item | Location | Notes |
|------|----------|-------|
| Migrate to database migration versioning | `db.ts` | Implemented as additive `schema_migrations` runner |
| Add foreign key constraints to schema | `db.ts` | Enable after migration system exists |
| Remove unused DB tables (`companion_sessions`, `companion_participants`) | `db.ts` | Or implement them |
| Remove unused schema types (`SkillNode`, `SkillLink`, `LiveMessage`, `LensContent`) | `packages/schema/` | Dead code cleanup |
| Remove `LensAnchor.domRange` (declared, never populated) | `packages/schema/` | |
| Pin `@types/bun` version | root `package.json` | Implemented: pinned to `1.3.13` |
| Cache `buildTextIndex` result in content script | `content.tsx:870` | Performance on large pages |
| Use binary search in `flatOffsetForBoundary` | `text-index.ts:58` | Performance on large pages |
| Handle SPA navigation (re-compute roomId on URL change) | `content.tsx` | Implemented for history/hash navigation |
| Normalize `www.` prefix in canonicalization | `canonicalize.ts` | Product decision; prefer canonical tags or site rules |
| Allow authors to delete their own lenses | `routes.ts:362` | Product decision |
| Move WebSocket token from URL to protocol-level auth | `service-worker.ts:145` | Implemented for new clients; query fallback retained temporarily |
| Stop trusting spoofable proxy IP headers by default | `rate-limit.ts` | Implemented; opt in with `LUMEN_TRUST_PROXY=1` behind a trusted proxy |
| Add Composer Markdown preview | Extension | Product quality |
| Build minimal report review queue for operators | Server | Implemented: operator GET/PATCH routes plus console controls |
