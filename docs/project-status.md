# Lumen Project Status

Date: 2026-05-06
Status: pre-release beta stabilization

This is the current project snapshot for humans and AI assistants. It is the
source of truth for implementation status and near-term planning. For assistant
working rules and document routing, read `AGENTS.md` first.

Deployment notes are intentionally excluded from this status document for now.
Current VPS/OpenResty/Docker drafts are archived and should not drive product or
architecture planning until deployment is revisited explicitly.

## 1. Product Center

Lumen v2 is a quiet, card-based UGC layer on real webpages. The durable unit is
the Lens card. Companion mode is an explicit, ephemeral live layer for people on
the same page. Lounge and Atlas are future ecosystem directions, but they must
not replace page-bound Lens cards as the product center.

Keep these constraints intact:

- Solo reading is the default.
- Companion mode is opt-in.
- Lens cards are persistent; companion and Lounge messages are not the durable
  memory of a page.
- No visible AI-authored content.
- No knowledge graph UI, reputation, karma, leaderboards, or default danmaku.
- Broad URL support is allowed; recommended seed/test pages are examples, not
  runtime injection gates.

## 2. Current Implementation Snapshot

### Server

Implemented:

- Bun + SQLite + WebSocket backend.
- Handle-only signup by default through `POST /api/redeem`.
- Existing handles cannot mint new tokens; lost-token recovery is currently
  operator-assisted.
- Optional invite-only mode with `LUMEN_INVITES_REQUIRED=1`.
- Long-lived EdDSA bearer tokens.
- Operator token revocation through `POST /api/admin/revoke-user`.
- Shared URL canonicalization through `@lumen/url` and server-side roomId
  verification on Lens creation.
- `GET /api/lenses` and `POST /api/lenses`.
- `PATCH /api/lenses/:id/anchor` for author/operator re-anchoring.
- Operator-only `DELETE /api/lenses/:id` moderation route.
- Reactions and a minimal operator report review queue.
- Basic in-memory write rate limits.
- Unauthenticated rate limits ignore proxy forwarding headers unless
  `LUMEN_TRUST_PROXY=1` is explicitly configured.
- Optimized room-level reaction aggregation for `GET /api/lenses`.
- WebSocket room subscription for Lens broadcast and presence.
- WebSocket bearer tokens use a subprotocol instead of query strings for new
  clients; the old query form remains temporarily accepted for beta transition.
- Companion-mode in-memory presence, emoji toss, chat, and short chat history.
- WebSocket presence refcounts for multi-tab stability.
- Companion chat/emoji WebSocket throttles and periodic memory pruning.
- Runtime validation for Lens create/update payloads through `@lumen/schema`.
- Additive SQLite migrations tracked in `schema_migrations`.
- Operator-only `/api/status` health details.
- Admin/test page under `apps/server/public/index.html`.

Not implemented yet:

- Durable preferences sync endpoints.
- Durable companion or Lounge history.
- Backup automation and production observability.

### Extension

Implemented:

- Broad `http://*/*` and `https://*/*` page support.
- Popup signup with handle.
- Popup default reading mode and site-level controls.
- Inline InfoPanel reading mode control.
- Lens creation from selected text.
- W3C-style anchoring through `@lumen/anchoring`.
- CSS Custom Highlight markers.
- Reading modes.
- Anonymous Lens toggle. The server still records the true author.
- Markdown Lens body rendering with Lens and URL reference chips.
- Long Lens preview / expand / internal scroll behavior.
- Copy-ref action.
- Report action.
- Orphan re-anchor flow.
- Client-side overlap heat and progressive stack collapse.
- Service-worker API and WebSocket bridge for HTTP-only beta support.
- Companion mode with opt-in presence, edge emoji toss, tiny chat, and recent
  in-memory history for late joiners.
- Chat-focused InfoPanel collapse with motion reduction support.
- Room debug disclosure for canonical URL and room ID.
- Extension icons in `apps/extension/public/icons/`.

Not implemented yet:

- GitHub OAuth badge.
- Cross-page Lens lookup for references to Lens not on the current page.
- Composer Markdown preview.
- Persistent Lounge.

## 3. Recent Important Changes

### Broad Page Support

The extension manifest matches normal HTTP(S) pages. The old allowlist is only a
recommended seed/test list.

### HTTP-Only Beta Compromise

During no-domain/no-SSL beta testing, content scripts on HTTPS pages cannot fetch
or connect directly to insecure HTTP/WS resources without Mixed Content blocks.
The current compromise is:

- API requests go through the extension service worker.
- The real WebSocket is owned by the extension service worker.
- Content scripts communicate with the worker through extension ports/messages.
- Production builds must set `VITE_LUMEN_API_BASE` to the public server URL.

Once a real HTTPS domain exists, keep the bridge or point it at `https://...`;
`WS_BASE` should derive `wss://...` automatically.
Production extension builds require an HTTPS API base by default. Temporary HTTP
beta builds require `LUMEN_ALLOW_HTTP_BETA=1`.
Content scripts re-resolve the canonical room after SPA `pushState`,
`replaceState`, `popstate`, or hash navigation, then remount the page overlay
for the new room.

### URL Canonicalization

Room identity uses a conservative canonicalization pipeline:

1. Read same-origin or same-host document canonical candidates from
   `link[rel~=canonical]`, `og:url`, and `twitter:url`.
2. Drop common tracking/share query parameters.
3. Sort remaining query parameters.
4. Apply small declarative site rules only where stable content identity is
   obvious.

Current site-specific rule:

- Bilibili video URLs become `https://www.bilibili.com/video/<BV-or-av-id>`.

Do not add ad hoc handling for one site unless it represents a general identity
problem that cannot be solved by canonical candidates or tracking cleanup.

### Lens Reading

Lens bodies now render a lightweight Markdown subset while preserving
`[[lens:id]]` and `[[url:...]]` refs. Long Lens cards default to a clipped
preview with `Read more`, then expand in place with an internal scroll boundary.

Design doc: `docs/product/lens-reading-design.md`.

### Companion Emoji Layer

Emoji tosses render above the companion panel with `pointer-events: none`, so
the animation can float over panel UI without blocking clicks.

### Release Docs And Icons

The repo contains a simple GitHub Pages docs site:

- `docs/index.html`
- `docs/privacy.html`

The extension manifest includes generated PNG icons.

## 4. Verification Checklist

Run TypeScript checks after code changes:

```bash
cmd /c bun run typecheck
```

Run the focused unit tests currently in the repo:

```bash
cmd /c bun run test
```

Extension release build:

```bash
cmd /c bun run build:extension
```

Note: Vite/esbuild may fail inside the Codex sandbox with `spawn EPERM`. If that
happens, ask the user to run the build locally or request escalation only when
build verification is essential.

Manual smoke tests:

- Fresh user can register with handle only.
- Re-registering an existing handle returns 409 and does not mint a token.
- A Lens created by user A is visible to user B on the same canonical page.
- A Lens create request with mismatched `url` / `roomId` is rejected.
- Markdown Lens content renders paragraphs, lists, links, refs, and code blocks.
- `[[url:...]]` refs only become links for HTTP(S) URLs.
- Long Lens content shows preview, fade, `Read more`, and expanded scrolling.
- Room debug shows the expected canonical URL and room ID.
- Query-heavy URLs for the same content share one room.
- Companion mode is invisible before opt-in.
- Two opted-in users see companion presence.
- Emoji toss renders above the panel and does not block clicks.
- Tiny chat receives recent in-memory history when a second user joins later.
- Content script WebSocket bridge reconnects after worker/port disconnect.
- HTTPS pages do not show Mixed Content failures for API or WebSocket calls.
- A production build uses HTTPS unless `LUMEN_ALLOW_HTTP_BETA=1` is set.

## 5. Near-Term Plan

### Phase A: Stabilize Current Beta

- Keep the production API-base build guard working.
- Keep canonicalization tests passing for common query-heavy URLs.
- Re-test companion mode after every service-worker or WebSocket change.
- Review open reports through the operator queue before inviting more users.
- Dogfood long Lens reading on real pages.
- Back up local/server data before inviting more users.

### Phase B: Product Quality Pass

- Tune InfoPanel density and motion if it feels cramped.
- Improve composer ergonomics for Markdown and references.
- Decide whether Markdown preview is needed before release.
- Keep page companion page-bound and opt-in.

### Phase C: Future Planning, Not Immediate Build

- Lounge remains deferred until the current page-bound MVP is stable.
- Atlas remains a system-level roadmap, not a v2 UI surface.
- Do not add visible knowledge graph UI, public reputation, or durable Lounge
  chat without product review.

## 6. Common Reading Routes

- Assistant entry and rules: `AGENTS.md`.
- Product overview: `docs/PROJECT_OVERVIEW.md`.
- Architecture: `docs/ARCHITECTURE.md`.
- Original Chinese conception: `docs/Chat.md`.
- Lens product design: `docs/product/lens-design.md`.
- Lens reading design: `docs/product/lens-reading-design.md`.
- Ecosystem roadmap: `docs/product/ecosystem-roadmap.md`.
- Companion mode: `docs/technical/companion-mode-mvp.md`.
- Lounge design: `docs/product/persistent-lounge-design.md`.
- Anchoring: `docs/technical/lens-anchoring.md`.
- Server scaling: `docs/technical/server-bottlenecks.md`.
