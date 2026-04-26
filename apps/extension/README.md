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
- `src/anchoring.ts` — text-quote anchor (TODO: vendor `hypothesis/client`)
- `src/marker.ts` — CSS Custom Highlight API rendering
- `src/service-worker.ts` — minimal SW (WS does not live here in MVP)
- `src/shared/` — API client, storage, URL canonicalization, config

## What is NOT yet implemented

- Reading mode picker (Quiet / Thinking / Full)
- Tag input on creation
- `[[lens:id]]` / `[[url:...]]` reference rendering
- Companion mode (Find companion button, emoji toss, chat layer)
- Hypothesis-grade multi-selector anchoring (current is exact-match TextQuoteSelector)
- GitHub OAuth badge
- Anonymous flag UI
