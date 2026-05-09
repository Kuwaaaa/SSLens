# Lumen v2 Extension

MV3 Chrome extension. Vite + React + TypeScript.

## Dev

```bash
# from repo root
bun install              # installs partysocket, react, vite, etc.
bun run dev:server       # backend on :3000
bun run dev:extension    # vite dev server + crxjs HMR on :5173
```

Then load the extension as unpacked:

1. Open `chrome://extensions`
2. Toggle "Developer mode"
3. Click "Load unpacked"
4. Select `apps/extension/dist` after the first run; crxjs writes `dist/` on dev/build.

The extension activates on normal HTTP(S) pages. These pages remain recommended
seed/test pages, not the only supported pages:

- https://paulgraham.com/*
- https://karpathy.github.io/*
- https://www.joelonsoftware.com/*
- https://kk.org/*
- https://sre.google/*

## Production build

```bash
bun run build:extension
# load apps/extension/dist as unpacked
```

For a real deployment, build with the public server URL:

```bash
VITE_LUMEN_API_BASE=https://lumen.example.com bun run build:extension
```

Production builds intentionally fail if `VITE_LUMEN_API_BASE` is missing,
points at `localhost` / `127.0.0.1`, or uses plain HTTP. Temporary no-domain
HTTP beta builds must set `LUMEN_ALLOW_HTTP_BETA=1` explicitly.

The manifest uses broad `http://*/*` and `https://*/*` access so Lumen can run
on arbitrary webpages. In the Chrome Web Store listing, explain this permission
as necessary for anchoring Lens cards to the page the user is currently reading.

## Architecture deviation note

`docs/ARCHITECTURE.md` section 5 describes the WebSocket living in the service
worker, with content scripts proxying via `chrome.runtime.connect()` ports. The
extension now follows that shape for both live events and companion mode.

Why: while the beta server is exposed over plain HTTP/WS, HTTPS pages block
direct `ws://` connections from content scripts as mixed content. Keeping the
real socket in the extension service worker lets page scripts talk only to the
extension bridge, while the worker owns the backend connection.

When a real domain + HTTPS/WSS is available, this bridge can stay in place or be
simplified; keeping it is still useful for future cross-tab signal aggregation.

## Architecture watch: content runtime boundaries

`src/content.tsx` is currently the MVP aggregation point for most page-runtime
behavior. That was useful for getting the first Lens loop working, but future
work should treat it as a candidate for gradual boundary extraction before
adding PDF, ebook, video, or non-extension surfaces.

Current coupling to watch:

- `Overlay` owns account/settings loading, Lens fetch/merge, WebSocket bridge
  handling, companion state, selection capture, anchor recovery, marker
  rendering, clustering, composer state, InfoPanel state, and card display.
- The Lens runtime assumes a DOM `Range` as the anchor handle. This fits normal
  webpage text, but PDF/ebook surfaces need page rectangles, text item offsets,
  and viewport transforms; video surfaces need timestamps or time ranges.
- Extension platform APIs leak into the runtime through direct use of
  `chrome.storage`, `chrome.runtime.connect`, content-script DOM globals,
  clipboard fallbacks, and the service-worker bridge.
- Reusable UI components such as `Orb`, `InfoPanel`, `Composer`, `LensCard`,
  and `LensPanel` live in the same file as page-specific mechanics.

Recommended direction:

```text
platform adapter
  chrome storage / chrome runtime / clipboard / Shadow DOM mount

transport adapter
  fetch Lens / create Lens / reactions / WebSocket room events

lens runtime
  Lens list state / reading-mode filtering / refs / orphan state / reactions

surface adapter
  selection / restore anchor / marker rendering / hit testing / jump-to-anchor

pure UI
  Orb / InfoPanel / Composer / LensCard / LensPanel / CompanionChat
```

The most important future boundary is the surface adapter. A web-page surface
can continue using `Range`, while a PDF surface can use page-indexed rectangles
and text offsets:

```ts
interface LensSurface<THandle> {
  kind: "web-page" | "pdf-document" | "video";
  roomId: string;
  label: string;

  readSelection(): SelectionDraft<THandle> | null;
  restore(lens: Lens): THandle | null;
  applyMarker(lensId: string, handle: THandle): void;
  clearMarkers(): void;
  hitTest(x: number, y: number): string[];
  getRect(handle: THandle): DOMRect | null;
  jumpTo(handle: THandle): void;
}
```

Suggested gradual order:

1. Move pure UI components out of `content.tsx` without behavior changes.
2. Extract companion room state and WebSocket message handling.
3. Extract Lens room state, reactions, merge logic, and orphan tracking.
4. Extract the current webpage `Range` logic into a `webPageSurface`.
5. Add PDF/ebook support as a new surface instead of expanding the content
   script monolith.

## Files

- `manifest.json` - MV3 manifest
- `popup.html` + `src/popup.tsx` - popup UI (redeem invite, show identity)
- `src/content.tsx` - content script: overlay, live-event bridge, anchoring, marker rendering
- `@lumen/anchoring` (workspace package) - W3C selectors + `approx-string-match` fuzzy fallback
- `src/marker.ts` - CSS Custom Highlight API rendering
- `src/service-worker.ts` - API + WebSocket bridge for content scripts
- `src/shared/` - API client, storage, URL canonicalization, config

## What is not implemented yet

- GitHub OAuth badge
- Cross-page Lens lookup, where referencing a Lens not on the current page renders as a disabled chip

## Recently implemented

- Anonymous flag UI in composer
- Lens card copy-ref action for `[[lens:id]]`
- Inline Lens reference card stack
- Reaction MVP with shared reaction kinds in `@lumen/schema`
- Hide controls: per-tab from the InfoPanel, per-site from the popup
- Lens card report action backed by `POST /api/reports`
- Orphan Lens re-anchor flow from the InfoPanel
- Composer insert-reference picker for current-page Lens
- Client-side overlap clustering for Lens on the same passage, with amber heat on the exact overlapping text segments
- Companion mode opt-in presence with `Find companion` / `Leave companion`
- Companion mode edge emoji toss over WebSocket
- Companion mode tiny ephemeral chat with short in-memory room history for late joiners
- In-panel room debug disclosure showing the canonical URL and roomId for diagnosing same-page room mismatches

## Deferred verifications

These code paths are implemented but not yet manually confirmed end-to-end:

- **Orphan Lens UI**: when `restoreAnchor()` returns null, the Lens should
  appear in InfoPanel's "Orphan lens" section. Use `Re-anchor`, select
  replacement text on the page, then confirm the new anchor. See the comment
  block in `src/content.tsx` near `orphanIds` for test recipes (admin console
  with bad anchor, Chrome Sources Overrides, direct SQLite edit).
