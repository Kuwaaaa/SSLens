# Lumen Project Status

Date: 2026-05-04
Status: pre-release beta stabilization

This document is the current project snapshot for humans and AI assistants. It
should be read after `AGENTS.md` and before planning new work. The older MVP
plan still explains the product thesis, but some implementation checkboxes in
that plan are now stale.

## 1. Product Center

Lumen v2 is a quiet, card-based UGC layer on real webpages. The durable unit is
the Lens card. Companion mode is an explicit, ephemeral live layer for people on
the same page. The proposed Lounge feature is a future persistent side channel
for a small group across pages, but it must not replace page-bound Lens cards as
the product center.

Keep these constraints intact:

- Solo reading is the default.
- Companion mode is opt-in.
- Lens cards are persistent; companion and Lounge messages are not the durable
  memory of a page.
- No visible AI-authored content.
- No knowledge graph UI, reputation, karma, leaderboards, or default danmaku.
- Broad URL support is allowed, but recommended seed/test pages can still be
  documented as examples.

## 2. Current Implementation Snapshot

### Server

The backend is a Bun + SQLite + WebSocket server.

Implemented:

- Handle-only signup by default through `POST /api/redeem`.
- Optional invite-only mode with `LUMEN_INVITES_REQUIRED=1`.
- Long-lived EdDSA bearer tokens.
- `GET /api/lenses` and `POST /api/lenses`.
- `PATCH /api/lenses/:id/anchor` for author/operator re-anchoring.
- Reactions and report stubs.
- WebSocket room subscription for Lens broadcast and presence.
- Companion-mode in-memory presence, emoji toss, chat, and short chat history.
- Admin/test page under `apps/server/public/index.html`.

Not implemented yet:

- Rate limiting.
- Token revocation.
- Durable preferences sync endpoints.
- Litestream backup config.
- Production systemd/OpenResty/Caddy config committed to the repo.

### Extension

The extension is MV3 + Vite + React + TypeScript.

Implemented:

- Runs on broad `http://*/*` and `https://*/*` pages.
- Popup signup with handle.
- Lens creation from selected text.
- W3C-style anchoring through `@lumen/anchoring`.
- CSS Custom Highlight markers.
- Reading modes.
- Anonymous Lens toggle. The server still records the true author.
- Inter-Lens and URL reference parsing/rendering.
- Copy-ref action.
- Report action.
- Orphan re-anchor flow.
- Client-side overlap heat and progressive stack collapse.
- Service-worker API and WebSocket bridge.
- Companion mode with opt-in presence, edge emoji toss, tiny chat, and recent
  in-memory history for late joiners.
- Chat-focused InfoPanel collapse with motion reduction support.
- Extension icons in `apps/extension/public/icons/`.

Not implemented yet:

- GitHub OAuth badge.
- Cross-page Lens lookup for references to Lens not on the current page.
- Persistent Lounge.
- Production hardening such as rate limits and abuse controls.

## 3. Recent Important Changes

### Broad Page Support

The extension manifest now matches all normal HTTP(S) pages. The old allowlist is
only a recommended seed/test list, not an injection boundary.

### HTTP-Only Beta Compromise

During no-domain/no-SSL beta testing, content scripts on HTTPS pages cannot fetch
or connect directly to insecure HTTP/WS resources without Mixed Content blocks.
The current compromise is:

- API requests are sent through the extension service worker.
- The real WebSocket is owned by the extension service worker.
- Content scripts communicate with the worker through extension ports/messages.
- Production builds must set `VITE_LUMEN_API_BASE` to the public server URL.

This allows the extension to function on HTTPS webpages while the backend is
still plain HTTP/WS. Once a real HTTPS domain exists, keep the bridge or point it
at `https://...`; `WS_BASE` will derive `wss://...` automatically.

### URL Canonicalization

Room identity is now based on a conservative canonicalization pipeline:

1. Read page-declared canonical candidates from:
   - `link[rel~=canonical]`
   - `og:url`
   - `twitter:url`
2. Accept a document canonical only when it is same-origin or same-host.
3. Drop common tracking/share query parameters.
4. Sort remaining query parameters.
5. Apply small declarative site rules only where a stable content identity is
   obvious.

Current site-specific rule:

- Bilibili video URLs become `https://www.bilibili.com/video/<BV-or-av-id>`.

The rule table is intentionally small. Do not add ad hoc handling for one site
unless it represents a general identity problem that cannot be solved by the
document canonical or tracking-param cleanup.

### Companion Emoji Layer

Emoji tosses now render above the companion panel instead of trying to avoid it.
The layer uses `pointer-events: none`, so the animation can float over panel UI
without blocking clicks.

### Release Docs And Icons

The repo now contains a simple GitHub Pages docs site:

- `docs/index.html`
- `docs/privacy.html`

The extension manifest now includes generated PNG icons.

## 4. Release And Deployment Notes

### Extension Build

Local production build with an HTTP beta server:

```bash
VITE_LUMEN_API_BASE=http://122.51.9.220 bun run build:extension
```

With a real HTTPS domain:

```bash
VITE_LUMEN_API_BASE=https://lumen.example.com bun run build:extension
```

The built extension is `apps/extension/dist/`. For Edge Add-ons, zip the contents
inside `dist`, not the parent `dist` directory itself. Do not publish source,
`node_modules`, `.pem`, or `.crx` files.

Watch item: if `VITE_LUMEN_API_BASE` is missing, the extension falls back to
`http://localhost:3000` in dev. Production extension builds now fail when
`VITE_LUMEN_API_BASE` is missing or points at localhost, so release builds must
provide a public backend URL.

### Server

The currently tested VPS address is `http://122.51.9.220`. It is suitable for
beta testing only. Before a wider release, prefer a domain with HTTPS/WSS and a
reverse proxy config that forwards:

- HTTP API routes to the Bun server.
- WebSocket upgrades for `/ws`.

The server currently stores SQLite data at `data/lumen.db` and keys at
`data/keys.json`. These must be backed up before real users depend on the
service.

### Store Privacy Answer

The extension does access/transmit personal information under store definitions.
Even though Lumen is small and does not sell data, it transmits handles, tokens,
visited page URLs/room IDs, selected text anchors, Lens content, reactions,
reports, companion messages/events, and operational logs. Store privacy forms
should answer this honestly.

## 5. Verification Checklist

Run TypeScript checks after code changes:

```bash
cmd /c bunx tsc -p apps/extension/tsconfig.json --noEmit
cmd /c bunx tsc -p apps/server/tsconfig.json --noEmit
```

Build check:

```bash
cmd /c bun run build:extension
```

Note: Vite/esbuild may fail inside the Codex sandbox with `spawn EPERM`. If that
happens, the user can run the build locally or the assistant can request
escalation when needed.

Manual smoke tests:

- Fresh user can register with handle only.
- A Lens created by user A is visible to user B on the same canonical page.
- Room debug in the InfoPanel shows the expected canonical URL and room ID.
- Two windows on the same Bilibili video URL with different tracking/query
  parameters share one room.
- Companion mode is invisible before opt-in.
- Two opted-in users see companion presence.
- Emoji toss renders above the panel and does not block clicks.
- Tiny chat receives recent in-memory history when a second user joins later.
- HTTPS pages do not show Mixed Content failures for API or WebSocket calls.
- A production build does not point to `localhost:3000`.

## 6. Near-Term Project Plan

### Phase A: Stabilize Current Beta

- Keep the production API-base build guard working.
- Use the InfoPanel room debug disclosure when diagnosing room mismatches.
- Keep focused canonicalization tests passing for common URL patterns.
- Re-test companion mode after every service-worker or WebSocket change.
- Back up `data/lumen.db` and `data/keys.json` before inviting more users.

### Phase B: Release Hygiene

- Move the backend behind HTTPS/WSS once a domain is available.
- Update the privacy policy URL to the GitHub Pages URL or a project domain.
- Ensure Edge package contains only `apps/extension/dist` contents.
- Add basic rate limiting before any larger public exposure.
- Document production proxy and service restart steps in `apps/server/README.md`
  once the final deployment shape is chosen.

### Phase C: Product Quality Pass

- Dogfood on several real sites with query-heavy URLs.
- Tune InfoPanel density and motion if it feels cramped.
- Keep page companion page-bound and opt-in.
- Avoid adding Lounge until the current page-bound MVP is stable in real use.

### Phase D: Lounge MVP, Later

Only after beta stabilization, implement the Lounge design in
`docs/product/persistent-lounge-design.md`:

- Join/leave by code.
- Live member count.
- Short in-memory chat.
- Manual `Share page`.
- Compact orb indicator.

Do not add automatic browsing broadcast, durable room history, public room
directory, notifications, or voice/video in the first Lounge version.

## 7. Files To Read Before Related Work

- Product constraints: `AGENTS.md`
- Project status: `docs/project-status.md`
- Companion mode: `docs/technical/companion-mode-mvp.md`
- Server bottlenecks: `docs/technical/server-bottlenecks.md`
- Lounge design: `docs/product/persistent-lounge-design.md`
- URL identity code: `apps/extension/src/shared/canonicalize.ts`
- Service-worker bridge: `apps/extension/src/service-worker.ts`
- Main content overlay: `apps/extension/src/content.tsx`
- Extension config: `apps/extension/src/shared/config.ts`
- Server WebSocket handling: `apps/server/src/ws.ts`
