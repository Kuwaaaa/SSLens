# Content Runtime Modularization

Status: next
Progress: 22
Current stage: Leaf prop-driven UI extraction
Last worked: 2026-08-08

## Resume Point

Behavior baseline and pure model extraction are complete. Phase 1.5 is
underway: `Orb`, `CompanionEmojiLayer`, `ClusterHeatOverlay`, `NoTokenHint`,
`RestoreTabButton`, `CreateButton`, `ReanchorConfirm`, and `TargetIcon` now live
under `apps/extension/src/content/components/`. Continue by extracting the
larger prop-driven components in small batches, starting with `CompanionChat` or
`Composer` before `InfoPanel`, `LensCard`, and `LensPanel`.

## Goal

Turn the current content script into a small composition layer that starts the
Shadow DOM overlay, wires focused runtime hooks, and renders prop-driven UI
components.

Target shape:

```text
apps/extension/src/content/
  index.tsx
  bootstrap.tsx
  Overlay.tsx
  settings/
  theme/
  ws/
  lens-room/
  companion/
  surface/
  bloom/
  components/
```

Dependency direction:

```text
bootstrap -> Overlay
Overlay -> hooks + components
hooks -> api/storage/ws/surface/domain
components -> props only
domain/model -> no React, no chrome, no DOM where possible
```

## Scope

- Behavior-preserving decomposition of `apps/extension/src/content.tsx`.
- Settings and theme runtime isolation.
- Webpage surface mechanics for selection, marker clicks, Range geometry,
  highlight clusters, scrolling, and layout ticks.
- Lens anchor registry ownership for `lensId -> Range`, restore success/failure,
  and orphan synchronization.
- Active Lens stack ownership for overlap ordering, reference navigation, and
  cluster sibling selection.
- Lens room state, reactions, reports, and re-anchor commands.
- WebSocket bridge separation from Lens and Companion domain events.
- Companion presence, emoji, and chat state.
- Bloom runtime isolation for marker/card-open generated effects.
- Clipboard and browser capability adapters used by UI callbacks.
- Prop-driven UI component extraction.
- Focused pure tests for model/event/cluster logic.

## Out Of Scope

- Product behavior changes.
- New visual language or theme design.
- Server API changes.
- Replacing React or the MV3 service-worker WebSocket bridge.
- Full browser automation as the first testing step.

## Current State

`apps/extension/src/content.tsx` still owns many independent reasons to change:

- Shadow DOM bootstrap and route refresh.
- Token/user/reading mode/theme/site-hidden storage state.
- Theme host attributes and marker theme application.
- Initial Lens fetch, anchor restore, orphan tracking, and local Lens state.
- WebSocket bridge lifecycle and event parsing.
- Companion presence, emoji, and chat state.
- Selection capture, marker click hit testing, Range geometry, and cluster heat
  overlays.
- Publish, re-anchor, react, report, jump, open-reference, and Companion
  commands.
- Orb, InfoPanel, Composer, LensCard, LensPanel, CompanionChat, and overlay
  component rendering.

## Behavior Baseline

Captured before the first extraction pass on 2026-08-08:

- Startup creates one `#lumen-root` Shadow DOM host, injects inline overlay CSS,
  applies the stored theme as `data-lumen-theme`, initializes marker styles, and
  renders one React root for the current canonical room.
- Route hooks wrap `history.pushState` and `history.replaceState`, listen to
  `popstate` and `hashchange`, and re-render only when `window.location.href`
  changes from the boot URL.
- Settings load token, stored user, reading mode, theme, and per-site hidden
  state together. Storage changes from popup update token, user, reading mode,
  theme, and hidden-site state in the content runtime.
- Theme changes apply both Shadow host attributes and marker highlight theme.
- Hiding the runtime clears highlights, cluster highlights, active Lens, draft,
  composer, re-anchor state, WebSocket connection state, Companion state, chat,
  messages, and blooms.
- Initial Lens load fetches by room, restores each anchor into the ref-backed
  range map, marks failed restores as orphan Lens, merges incoming Lens by id,
  and logs out on rejected tokens.
- WebSocket uses one service-worker port. It updates connection state, handles
  Lens create/delete/anchor/reaction events, and handles Companion presence,
  emoji, chat history, and chat events.
- Selection capture ignores clicks inside the overlay, creates a draft for text
  selections of at least three characters, and keeps the cloned Range for create
  and re-anchor commands.
- Marker clicks use `lensIdsAtPoint`, choose the preferred Lens from overlap
  ordering, open the active stack, and clear the draft.
- Publishing creates an anchor from the draft Range, extracts `[[lens:id]]` and
  `[[url:...]]` refs from Markdown body tokens, posts through the API proxy, and
  clears composer/draft/selection on success.
- Re-anchor patches the selected Lens anchor, restores the returned anchor or
  falls back to the selected Range, updates the range map, clears orphan state,
  and preserves the author/operator permission error message.
- Reactions patch only the affected Lens reaction and `myReactions` state.
- Companion join/leave/chat/emoji commands send payloads through the same WS
  bridge port and do not open their own connection.

## Implementation Progress

2026-08-08:

- Recorded the behavior baseline above.
- Completed phase 1 pure extraction:
  - `apps/extension/src/content/types.ts`
  - `apps/extension/src/content/lens-model.ts`
  - `apps/extension/src/content/companion-model.ts`
- Started phase 1.5 leaf UI extraction:
  - `apps/extension/src/content/components/Orb.tsx`
  - `apps/extension/src/content/components/CompanionEmojiLayer.tsx`
  - `apps/extension/src/content/components/ClusterHeatOverlay.tsx`
  - `apps/extension/src/content/components/NoTokenHint.tsx`
  - `apps/extension/src/content/components/RestoreTabButton.tsx`
  - `apps/extension/src/content/components/CreateButton.tsx`
  - `apps/extension/src/content/components/ReanchorConfirm.tsx`
  - `apps/extension/src/content/components/TargetIcon.tsx`
- Kept runtime hooks, WebSocket lifecycle, storage listeners, and DOM event
  handlers unchanged.
- Verified with `bun run typecheck` and `bun run test`.

## Staged Plan

### 0. Freeze Behavior Baseline

Record the current behavior checklist before moving code:

- token/user/readingMode/theme/siteHidden initialization.
- theme attribute and marker theme application.
- Lens initial load, anchor restore, and orphan handling.
- WebSocket lens_created, lens_deleted, lens_anchor_updated, and
  reaction_updated behavior.
- Companion presence, emoji, chat history, and chat send behavior.
- Selection-to-composer flow.
- Re-anchor flow.
- Highlight click behavior.
- Route refresh behavior.

Verification: `bun run typecheck` and `bun run test`.

### 1. Extract Pure Types And Pure Model Helpers

Create `apps/extension/src/content/types.ts`,
`apps/extension/src/content/lens-model.ts`, and
`apps/extension/src/content/companion-model.ts`.

Move only code that does not require React, chrome APIs, DOM mutation, or
network IO:

- `SelectionDraft`, `ActiveLensStack`, `CompanionChatMessage`, `WsBridgeEvent`,
  and related shared types.
- `shouldShowInMode`, `refsFromBody`, `mergeLensLists`,
  `mergeCompanionMessages`, and defensive message guards.

This phase should be almost mechanical and keep `Overlay` behavior unchanged.

### 1.5 Extract Leaf Prop-Driven UI Components (Fast Shrink)

Immediately after types land, move the components that are already pure and
prop-driven into `content/components/`, before touching any runtime hook:

- `Orb`, `CompanionEmojiLayer`, `ClusterHeatOverlay`, `CompanionChat`,
  `NoTokenHint`, `RestoreTabButton`, `CreateButton`, `ReanchorConfirm`,
  `TargetIcon`, and the larger but still prop-only `Composer`, `LensCard`,
  `LensPanel`, `InfoPanel`.
- Co-locate `writeClipboardText` with the component that uses it (moves to
  `browser/clipboard.ts` in phase 8; a temporary home in `components/` is fine).

These depend only on the extracted types, a few module constants, and
`refs`/`shapes`/`theme` imports. Moving them is mechanical and drops
`content.tsx` from ~2230 to roughly ~900 lines, so the harder hook-extraction
phases (registry, surface, ws) produce small, readable diffs instead of being
buried inside a 2000-line file. This deviates from a strict "UI last" ordering,
but only for leaf components that already take no runtime dependency; stateful
composition still collapses last in phase 10.

### 2. Extract Bootstrap, Route Runtime, And Theme Host

Create `bootstrap.tsx`, `route-runtime.ts`, and `theme-host.ts`.

Move:

- Shadow DOM host creation.
- inline CSS injection.
- `createRoot` mounting.
- canonical URL and room resolution.
- route refresh hooks for pushState, replaceState, popstate, and hashchange.
- `data-lumen-theme` and `data-lumen-mode` application.
- initial marker style injection.

Boundary: bootstrap starts the overlay but does not know Lens, Companion, or UI
details.

### 3. Extract Settings And Theme Runtime Hook

Create `settings/useOverlaySettings.ts`.

Own:

- loading `token`, `user`, `readingMode`, `theme`, and per-site hidden state.
- listening to `chrome.storage.onChanged`.
- `tabHidden` and derived `lumenHidden`.
- `changeReadingMode` and `changeTheme` commands.

Boundary: `Overlay` consumes settings state and commands; it no longer reads
storage directly.

### 4. Extract Anchor Registry And Active Stack Model

Create `lens-room/anchor-registry.ts` and `lens-room/active-stack.ts`.

Own:

- `lensId -> Range` state.
- anchor restore success and failure.
- orphan add/remove synchronization.
- active stack construction.
- overlap sibling ordering.
- reference navigation stack updates.

This phase should happen before extracting page surface hooks. Otherwise the
same mutable `anchorRanges` ref is likely to leak into multiple modules and
hide the ownership problem.

Boundary: the registry owns Lens anchor state; surface code may ask questions
about ranges, but should not own the mutable map.

Constraint: keep the registry backed by a `useRef<Map>` with imperative
`get/set/delete/has/clear` methods. Do NOT convert `anchorRanges` into React
state. The WebSocket `lens_created` handler dedups against the "always-current"
ref Map by design (see the ref-Map dedup path in `content.tsx`); moving to
state would reintroduce stale-closure and double-insert races on rapid live
events. Orphan tracking (`orphanIds`) can stay React state, but the range map
stays a ref.

### 5. Extract Webpage Surface Mechanics

Create `surface/usePageSelection.ts`, `surface/useMarkerClicks.ts`,
`surface/useLayoutTick.ts`, `surface/clusters.ts`, and `surface/anchors.ts`.

Own:

- document selection capture and draft creation.
- overlay-exclusion checks for page events.
- marker hit testing through `lensIdsAtPoint`.
- Range overlap, equality, text length, and viewport rect calculations that do
  not belong to the anchor registry.
- cluster heat segments and overlay rects.
- jump-to-anchor helpers.

Boundary: surface code may depend on DOM/Range and marker hit testing, but it
should not fetch API data, read storage, or render UI.

### 6. Extract Lens Room State

Create `lens-room/useLensRoom.ts`, `lens-room/lens-events.ts`, and
`lens-room/lens-commands.ts`.

Own:

- initial `fetchLensesForRoom`.
- `lenses` and orchestration around the anchor registry.
- visible and clusterable Lens derivation.
- publish, re-anchor, react, and report commands.
- Lens WebSocket event application.

Boundary: Lens room may depend on API proxy, anchoring, anchor registry, and
surface helpers, but it does not own chrome port lifecycle or Companion state.

### 7. Extract WebSocket Bridge And Companion Room

Create `ws/useWsBridge.ts`, `ws/ws-events.ts`,
`companion/useCompanionRoom.ts`, and `companion/companion-events.ts`.

`useWsBridge` owns:

- `chrome.runtime.connect`.
- connect/disconnect/retry lifecycle.
- bridge envelope decode.
- raw send function.

`useCompanionRoom` owns:

- join and leave commands.
- presence users.
- emoji bursts.
- chat history and chat send.
- Companion event application.

Boundary: WebSocket transport emits events; Lens and Companion modules decide
which events they own.

Constraint: `useWsBridge` must keep a single `chrome.runtime.connect` port and
a single message effect that dispatches decoded events to registered
subscribers. Lens and Companion rooms subscribe through callbacks; they do not
each open a port. Today the one WS effect already has an overloaded dependency
array (it re-runs on the companion emoji/message callbacks), so splitting into
per-domain connections would cause reconnect churn and presence flapping. Keep
the transport lifecycle keyed only on `token`, `roomId`, `lumenHidden`, and the
retry tick.

### 8. Extract Bloom Runtime And Browser Capability Adapters

Create `bloom/useBloomRuntime.ts` and `browser/clipboard.ts`.

`useBloomRuntime` owns:

- bloom list state.
- marker and card-open bloom creation.
- timeout/completion cleanup.
- theme-aware bloom spec creation through `shapes.tsx`.

`browser/clipboard.ts` owns:

- clipboard write fallback behavior.

Boundary: UI components receive callbacks for copy/report/bloom-triggering and
do not grow direct access to browser capabilities beyond local presentation
state.

### 9. Extract Prop-Driven UI Components

Create component files under `content/components/`:

- `Orb.tsx`
- `InfoPanel.tsx`
- `Composer.tsx`
- `ReanchorConfirm.tsx`
- `CreateButton.tsx`
- `RestoreTabButton.tsx`
- `LensCard.tsx`
- `LensPanel.tsx`
- `CompanionChat.tsx`
- `ClusterHeatOverlay.tsx`
- `CompanionEmojiLayer.tsx`

Components may keep local UI state such as copied/reported/expanded, but they
must not read storage, open chrome ports, restore anchors, mutate markers, or
fetch Lens data.

### 10. Shrink Overlay To Composition

`Overlay.tsx` should only:

- call focused hooks.
- combine derived state.
- handle ready/hidden/no-token branches.
- pass props and callbacks into components.

Target size: roughly 250-450 lines. The content entry should become a tiny
bootstrap call.

### 11. Add Focused Tests

Prefer pure tests before browser automation:

- `lens-model.test.ts` for merge, filter, refs, and event state helpers.
- `companion-model.test.ts` for chat history merge and event guards.
- `active-stack.test.ts` for overlap ordering, exact-range priority, short-range
  priority, and created-at tiebreakers.
- `clusters.test.ts` for pure cluster and segment logic where feasible.
- `ws-events.test.ts` for defensive bridge event decoding.
- `theme-host.test.ts` for `data-lumen-theme`, `data-lumen-mode`, and marker
  theme application timing.

Browser/manual verification remains necessary for Range, Highlight, Shadow DOM,
and route behavior.

## Audit Notes

A sub-agent audit on 2026-08-07 agreed with the overall direction but called out
one ordering risk: extracting surface before anchor ownership can merely spread
the same mutable `anchorRanges` reference across more modules. The staged plan
therefore puts `anchor-registry` and `active-stack` before surface hooks.

The audit also added explicit boundaries for visibility lifecycle reset,
bloom runtime, and clipboard/browser services. These should be treated as
composition concerns rather than allowed to leak into low-level domain helpers
or prop-driven UI components.

A second review on 2026-08-07 confirmed the direction and added four
constraints now folded into the phases above:

1. Test wiring is currently a no-op for the extension. `bun run test` only runs
   canonicalize, anchoring, and schema suites, and there are no extension
   `*.test.ts` files. A `test:extension` script (for example
   `bun test apps/extension`) must be added and wired into `test` before the
   focused tests in phase 11 provide any signal. `typecheck` already covers the
   extension tsconfig.
2. `anchorRanges` stays a ref, never state (phase 4 constraint) to preserve the
   live-event dedup path.
3. Visibility reset must be coordinated. The current single "hide resets a dozen
   states" effect will fragment across hooks; each hook should expose a `reset()`
   that `Overlay` invokes on the visibility transition, rather than letting reset
   become an implicit cross-hook coupling.
4. `useWsBridge` stays a single connection with subscriber callbacks (phase 7
   constraint) to avoid reconnect churn.

The review also reordered leaf UI extraction earlier (phase 1.5) because those
components are already prop-driven and moving them first shrinks the file that
every later phase has to diff against.

## Verification

Every phase should run:

```bash
bun run typecheck
bun run test
```

Wiring gap to fix first: `bun run test` in `package.json` currently runs only
`test:canonicalize`, `test:anchoring`, and `test:schema`. It does not collect
any `apps/extension` tests, and none exist yet. Before phase 11, add a
`test:extension` script (for example `bun test apps/extension`) and include it
in the `test` chain, otherwise the new pure-model/event/cluster tests are never
executed. Until then, `bun run typecheck` is the only automated gate for the
extracted extension modules.

Manual verification after phases 2, 4, 5, 6, and 7:

- `bun run dev:extension`.
- Refresh a real HTTP(S) page.
- Verify selection, composer, Lens card opening, references, reactions,
  reports, re-anchor, Companion join/leave/chat/emoji, route refresh, and
  Classic/Signal theme switching from both popup and InfoPanel.

## Decisions

- Aim for the large rewrite architecture, but land it as small
  behavior-preserving phases.
- Extract pure/domain code before hooks and UI.
- Split by reason to change, not by line count.
- Keep storage, transport, DOM surface mechanics, domain state, and UI on
  separate sides of the boundary.
- Do not introduce a global store until focused hooks prove insufficient.

## Agent Update Protocol

Only advance stages after a phase lands and passes automated verification. Keep
the plan behavior-preserving unless the user explicitly asks for a product
change.

## Links

- `apps/extension/src/content.tsx`
- `docs/features/theme-system.md`
- `docs/project-status.md`
