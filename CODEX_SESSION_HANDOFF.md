# Codex Session Handoff

Date: 2026-04-29
Branch: `codex`
Last committed baseline: `93c6a5d Refine overlap Lens UX and archive handoff`

## Read First

Before changing code, read `AGENTS.md`, then the core docs listed there. Product constraint remains: Lumen v2 is a quiet, card-based UGC layer that makes webpages feel inhabited. Do not add AI-authored visible content, knowledge-graph UI, reputation, or default floating/danmaku UI.

Respond to the user in Chinese unless they switch language. Code and repo docs should stay English.

Do not commit unless the user explicitly asks.

## Current Working Tree

This handoff describes the uncommitted work after `93c6a5d`.

Modified files:

- `CODEX_SESSION_HANDOFF.md`
- `apps/extension/README.md`
- `apps/extension/src/content.tsx`
- `apps/extension/src/styles.css`
- `apps/server/README.md`
- `apps/server/src/ws.ts`
- `packages/schema/src/index.ts`

New files:

- `docs/technical/companion-mode-mvp.md`

Untracked but not part of the main implementation:

- `apps/extension/dist.crx`
- `apps/extension/dist.pem`

Git still prints warnings about being unable to access `C:\Users\l7867/.config/git/ignore`; this has not affected checks.

## High-Level Project State

Done or effectively done:

- Invite redemption and token flow.
- Lens creation and realtime broadcast.
- Anchoring and CSS Highlight marker rendering.
- Reading modes.
- Anonymous composer toggle.
- Inter-Lens refs and card stack.
- Copy reference through InfoPanel current Lens actions.
- Emoji reactions MVP.
- Hide controls: per-tab and per-site.
- Report stub and privacy policy.
- Orphan re-anchor flow.
- Composer insert-reference picker.
- Client-side overlap / nested Lens UX with heat markers, click-priority, and progressive stack collapse.
- Companion mode MVP: opt-in presence, companion-only count, edge emoji toss, tiny chat, short in-memory chat history for late joiners, and chat-focus InfoPanel collapse.

Still needed:

- Manual UX pass on the latest overlap stack behavior after each build.
- Manual UX pass on companion mode with two Chrome windows after each build.
- Final soak-readiness pass across extension + server before inviting users.

## Implemented In This Session

### Orphan Re-anchor MVP

Backend:

- Added `PATCH /api/lenses/:id/anchor` in `apps/server/src/routes.ts`.
- Wired route in `apps/server/src/index.ts`.
- Only the original Lens author or an operator may update an anchor.
- Operators can be configured with comma-separated:
  - `LUMEN_OPERATOR_USER_IDS`
  - `LUMEN_OPERATOR_HANDLES`
- On success, the server broadcasts `{ type: "lens_anchor_updated", lens }`.

Schema / response:

- Added `Lens.canEditAnchor?: boolean` so the client can avoid showing a misleading re-anchor action.
- Added `Lens.viewerIsAuthor?: boolean` so the client can show the current user's own Lens even when reading mode would otherwise filter it out.

Frontend:

- Added `updateLensAnchor()` in `apps/extension/src/shared/api.ts`.
- InfoPanel orphan rows show `Re-anchor` only when `canEditAnchor` is true.
- If the user starts re-anchor, selects replacement text, and confirms `Use as anchor`, the client creates a new anchor and patches the Lens.
- 403 now shows a clear message: only original author/operator can re-anchor.

Important UX note: if testing with admin-console-created Lens, use the same user or configure the extension user as operator. Otherwise re-anchor is intentionally forbidden.

### Composer Insert-reference Picker

- Composer now has `Insert reference` when the current page has Lens.
- It inserts `[[lens:id]]` into the body at the cursor position.
- Publishing now extracts refs from body with `parseBody()` and sends `refs` to the server.
- Composer also shows `N Lens already here` when the draft selection overlaps existing Lens and offers `Reference one`.

### Selection vs Marker Click Conflict

Bug fixed:

- Selecting text inside an existing marker used to trigger the document `click` handler after `mouseup`, opening the LensCard and clearing the `Create Lens` draft.
- Now if there is an active text selection of length >= 3, marker click handling yields, so `Create Lens` remains available.

### Overlap / Nested Lens UX

This replaced the earlier amber numeric cluster-handle experiment. Do not reintroduce floating count handles as the primary UI without product review.

Current implementation:

- `apps/extension/src/marker.ts` exposes `lensIdsAtPoint(x, y)` for multi-hit marker clicks.
- `content.tsx` builds overlap heat segments from restored ranges.
- CSS Custom Highlight remains responsible for dotted underline and hit testing.
- A Shadow DOM overlay (`ClusterHeatOverlay`) draws rounded fixed-position heat rects.
- The overlay paints every visible marker segment:
  - depth 1: quiet purple fill,
  - depth 2: light amber,
  - depth 3: stronger amber,
  - depth 4+: deepest amber.
- Heat depth is calculated from flat text offsets, so only the exact overlapping phrase becomes deeper.
- Heat rects have an experimental soft-marker / light-crayon visual style with stable micro-jitter.
- Click priority now keeps the clicked Lens as the root:
  - If multiple Lens cover the click point, the shortest anchor range wins.
  - If ranges are identical, creation time is the fallback.
  - Clicking a large-only region opens the larger Lens first.
- Same-passage Lens stack now uses progressive collapse:
  - root Lens always full,
  - up to two same-passage siblings full,
  - remaining same-passage Lens as compact preview rows,
  - `Show N more` expands,
  - `Collapse same-passage Lens` collapses.
- Expand/collapse has measured max-height transitions and respects `prefers-reduced-motion`.
- Long stacks are clamped to the viewport and scroll internally rather than being clipped.

Supporting package change:

- `packages/anchoring/src/index.ts` now exports:
  - `buildTextIndex`
  - `rangeToFlatOffsets`
  - `flatOffsetsToRange`

These are used by the extension to compute exact overlap heat segments using the same text-index model as anchoring.

Detailed archive:

- Read `docs/technical/overlap-lens-ux-archive.md` before changing overlap marker/stack behavior.

### Companion Mode MVP

Detailed archive:

- Read `docs/technical/companion-mode-mvp.md` before changing companion mode behavior.

Product constraints preserved:

- Reading is solo by default.
- Companion mode is opt-in only.
- No default "X people are reading" surface.
- No default danmaku / floating text layer.
- Companion exchanges are ephemeral and separate from durable Lens cards.

Backend:

- `apps/server/src/ws.ts` maintains companion presence separately from normal room subscription presence.
- Client messages:
  - `{ type: "companion_join" }`
  - `{ type: "companion_leave" }`
  - `{ type: "companion_emoji", emoji, edge, y }`
  - `{ type: "companion_chat", body }`
- Server messages:
  - `{ type: "companion_presence", users }`
  - `{ type: "companion_joined", userId, users }`
  - `{ type: "companion_left", userId, users }`
  - `{ type: "companion_emoji", userId, emoji, edge, y, at }`
  - `{ type: "companion_chat", id, userId, handle, body, at }`
  - `{ type: "companion_chat_history", messages }`
- Presence uses per-user connection counts so multiple active tabs from the same user do not flicker presence incorrectly.
- Chat history is server-memory only: latest 30 messages, at most 30 minutes old, lost on server restart, never written to SQLite.

Frontend:

- InfoPanel exposes `Find companion` / `Leave companion`.
- Orb shows companion count only after the user has opted into companion mode.
- Companion mode shows a small fixed emoji toss row; emoji render as short left/right edge bursts.
- Tiny chat is closed by default and toggled from companion mode.
- Opening chat puts InfoPanel into chat focus mode:
  - reading mode,
  - Lens counts,
  - hide controls,
  - current Lens actions,
  - orphan rows
  collapse with a soft transition so the chat area has room.
- `prefers-reduced-motion` disables keyframe animations and transition-heavy collapse.

Schema / docs:

- `packages/schema/src/index.ts` now includes companion WS message types.
- `apps/extension/README.md` and `apps/server/README.md` describe current companion mode status.

## Important Current Behavior

On Paul Graham's "Do Things that Don't Scale", nested Lens around `going out` should behave like this:

- The large passage Lens has a subtle purple fill outside overlap.
- The exact nested overlap phrase gets deeper amber heat.
- Clicking the small `going out` region opens a `going out` Lens first.
- Clicking a larger-only region opens the larger Lens first.
- A 4-Lens stack shows root + up to two same-passage siblings + compact previews.
- Long stacks do not clip out of the viewport; they scroll internally.

Known database facts from earlier local verification:

Room id:

```text
7030ae9cff7dc62076a2efde04bab68b5ada358ccffbaad48d9663ba0ca37529
```

Relevant Lens rows in `data/lumen.db`:

```text
01KQ5DZ58SVY338J8JR63HXW6F | quick | daze | quote: the spot.There are two reasons founders resist going out and recruiting users | position 1784-1861
01KQ77B7FGHFSAQ6NSDFZ7QXWE | quick | daze | quote: resist going | position 1824-1836
01KQ7D8A2STYGG2T0ENM2A9Y80 | quick | daze | quote: going out | position 1831-1840
01KQ7YPVJ5AT46VTW0K73GB1CZ | quick | daze | quote: going out | position 1831-1840
```

## Verification State

Passing after latest changes:

- `cmd /c node_modules\.bin\tsc -p apps\extension\tsconfig.json --noEmit`
- `cmd /c node_modules\.bin\tsc -p apps\server\tsconfig.json --noEmit`
- `cmd /c bun run build:extension`

Notes:

- `bun run build:extension` often fails inside Codex sandbox with Vite/esbuild `spawn EPERM`; rerun with escalation when needed.
- The user has been manually building/reloading the extension while testing. After future code changes, rebuild `apps/extension/dist` or run `bun run dev:extension` depending on the user's current loop.
- User manually verified two-window companion communication after the first chat pass.

## Companion Mode Current State

Implemented:

- `Find companion` / `Leave companion` in InfoPanel.
- `N here now` is shown only while companion mode is active.
- Edge emoji toss works over WS.
- Tiny chat works over WS.
- Late joiners receive short in-memory room chat history.
- Chat open state collapses non-chat InfoPanel sections with a soft transition.

Still needs manual UX pass:

- Late joiner history in two Chrome windows.
- Chat focus collapse/expand smoothness.
- Edge emoji animation across small and large viewports.
- Leave/rejoin cleanup and history behavior.
- Reduced-motion behavior.

## Open Issues / Watch Items

- The soft marker / crayon heat texture is experimental. If it feels too decorative, tune CSS before changing behavior.
- Expand/collapse animation should be manually checked after each build for flicker, excessive repositioning, or awkward scroll jumps.
- `DEFAULT_CLUSTER_SIBLINGS` is currently `2`. If stack cards are still too tall, reduce to `1`.
- Exact same-range Lens remain ambiguous; click cannot distinguish them, so ordering falls back to creation time.
- Overlay heat rects are fixed-position and refresh on scroll/resize. Watch unusual pages with transforms, heavy layout shifts, zoom, or non-standard writing modes.
- Do not optimize away repeated Lens content. Repetition/overlap is a social signal.

## Recommended Next Session Plan

1. Read `AGENTS.md`.
2. Read this handoff.
3. Read `docs/technical/overlap-lens-ux-archive.md`.
4. Read `docs/technical/companion-mode-mvp.md`.
5. Run or request a fresh extension build if browser testing is needed.
6. Do a two-window smoke test on the PG page:
   - overlap Lens stack still behaves,
   - companion presence updates,
   - emoji toss appears on both windows,
   - late joiner receives chat history,
   - chat focus collapse/expand feels smooth.

## Cautions For Next Session

- Do not put `useEffect`, `useMemo`, `useState`, or other hooks after early returns in React components.
- Preserve the card-stack model for references. Do not return to mouse-position ref previews.
- Keep LensCard as content-first. Avoid reintroducing visible tool chrome (`X`, `...`, top-level copy/report`).
- `Copy reference` and `Report` are intentionally in InfoPanel, not on the card.
- If editing reactions, `REACTION_KINDS` is shared from `@lumen/schema`; do not duplicate lists in server/extension.
- Avoid broad docs unless the user asks. This handoff exists because the user explicitly requested session archival.
- Do not commit unless the user asks.
