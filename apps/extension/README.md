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
4. Select `apps/extension/dist` (after first run; crxjs writes dist/ on dev/build)

The extension activates on these whitelisted hosts:

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

## Architecture deviation note

`docs/ARCHITECTURE.md` §5 describes the WebSocket living in the service worker, with content scripts proxying via `chrome.runtime.connect()` ports. **This MVP puts the WebSocket directly in the content script** — one WS per tab.

Why: server-side per-room presence still works (closing the tab closes the WS, server broadcasts leave). Multi-room subscription via SW-as-router adds non-trivial complexity for ~50 concurrent connections worth of "savings" we don't need yet.

When to refactor back to SW-hosted WS: if N tabs per user routinely exceeds 5–10, or if companion mode needs cross-tab signal aggregation. Tracked as a TODO in `src/content.tsx`.

## Files

- `manifest.json` — MV3 manifest
- `popup.html` + `src/popup.tsx` — popup UI (redeem invite, show identity)
- `src/content.tsx` — content script: overlay, WS, anchoring, marker rendering
- `@lumen/anchoring` (workspace package) — W3C selectors + `approx-string-match` fuzzy fallback
- `src/marker.ts` — CSS Custom Highlight API rendering
- `src/service-worker.ts` — minimal SW (WS does not live here in MVP)
- `src/shared/` — API client, storage, URL canonicalization, config

## What is NOT yet implemented

- GitHub OAuth badge
- Cross-page Lens lookup (referencing a Lens not on the current page renders as a disabled chip)

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

## Deferred verifications

These code paths are implemented but not yet manually confirmed end-to-end:

- **Orphan Lens UI**: when `restoreAnchor()` returns null, the Lens should appear in InfoPanel's "Orphan lens" section. Use `Re-anchor`, select replacement text on the page, then confirm the new anchor. See the comment block in `src/content.tsx` near `orphanIds` for test recipes (admin console with bad anchor, Chrome Sources Overrides, direct SQLite edit).
