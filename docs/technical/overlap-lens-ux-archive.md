# Overlap Lens UX Archive

Date: 2026-04-29

This note archives the current state of the overlapping Lens marker and Lens stack UX work. It is a handoff for future contributors before moving on to companion mode.

## Product Intent

Overlapping Lens should feel like a page has accumulated human traces, not like a badge-count UI. The page remains the artifact; Lumen should add quiet texture and reveal richer card stacks only when the user engages.

The current direction is:

- No floating numeric cluster badge on the article body.
- Keep CSS Custom Highlight API for marker hit testing and dotted underline rendering.
- Use a separate Shadow DOM overlay for rounded heat/marker texture so the original page DOM is not mutated.
- When users click a marked region, prioritize the Lens they most likely clicked, then show the rest of the overlapping stack.

## Current Behavior

### Marker Rendering

Plain Lens markers still use dotted underline through CSS Custom Highlight.

Visible marker fill is now drawn by `ClusterHeatOverlay` in `apps/extension/src/content.tsx`, using fixed-position, pointer-events-none spans in the extension Shadow DOM.

The overlay paints every visible marker segment:

- Depth 1: very quiet purple marker fill.
- Depth 2: light amber fill.
- Depth 3: stronger amber fill.
- Depth 4+: deepest amber fill.

The overlay is generated from flat text segments:

1. Restore Lens anchors to DOM `Range`s.
2. Convert ranges to flat offsets via `@lumen/anchoring`.
3. Split by all start/end boundaries.
4. Compute coverage depth per segment.
5. Convert segments back to `Range`s.
6. Draw rects from `Range.getClientRects()`.

This means only the exact overlapping text span gets the deeper heat treatment. A large Lens does not make the whole large passage amber just because one phrase inside it overlaps.

### Marker Texture

The current visual style is an experimental soft marker / light crayon treatment:

- Rounded per-line rects.
- Stable micro-jitter in position, size, border radius, and rotation.
- Slight blur.
- Layered gradients and subtle pigment streaks.

The jitter is deterministic per segment key, so it should not flicker between renders.

This visual direction is not final. It is intentionally left as a tunable layer in `apps/extension/src/styles.css`.

### Click Priority

Clicking a marker uses `lensIdsAtPoint(x, y)` from `apps/extension/src/marker.ts`.

If multiple Lens cover the clicked point, the preferred Lens is the shortest anchored range. This makes nested/smaller Lens open first when the user clicks the smaller marked phrase. If the user clicks a larger Lens-only region, the larger Lens opens first.

If multiple Lens have identical ranges, the current fallback is creation time.

### Lens Stack

The Lens stack now keeps the clicked Lens as the root card. Other same-passage Lens are appended after it, sorted by anchor length and creation time.

For large overlap groups, the stack uses progressive collapse:

- The root Lens is always fully visible.
- Up to two same-passage sibling Lens are fully visible.
- Remaining same-passage Lens are shown as compact preview rows.
- `Show N more` expands the remaining same-passage Lens.
- `Collapse same-passage Lens` collapses them again.
- Referenced Lens remain after the same-passage group.

Expand/collapse uses a measured `max-height` transition with opacity and small translateY changes. It respects `prefers-reduced-motion`.

### Card Positioning

The card positioning now reads the real card size after render and clamps the card to the viewport. Long stacks use internal card scrolling instead of being clipped by the viewport.

Relevant behavior:

- `positionCardNear()` accepts both anchor rect and card rect.
- `LensCard` repositions on scroll, resize, stack length changes, and expand/collapse changes.
- `.card-stack` has `max-height: calc(100vh - 16px)` and `overflow-y: auto`.

## Files Touched

Primary extension files:

- `apps/extension/src/content.tsx`
- `apps/extension/src/marker.ts`
- `apps/extension/src/styles.css`

Supporting package export:

- `packages/anchoring/src/index.ts`

The anchoring package now exports:

- `buildTextIndex`
- `rangeToFlatOffsets`
- `flatOffsetsToRange`

These are used by the extension to compute overlap heat segments using the same text-index model as anchor creation/restoration.

## Current Open Issues

### Marker Texture Is Still Experimental

The soft marker / crayon effect may still be too subtle or too decorative. Future tuning should happen in CSS first before changing behavior.

Likely knobs:

- Depth opacity values.
- Purple depth-1 visibility.
- Amber saturation for depth 2/3/4.
- Micro-jitter amount.
- Rotation range.
- Texture opacity in `::before` and `::after`.
- Whether to keep the crayon direction or return to a cleaner highlighter style.

### Expand/Collapse Motion May Need Browser UX Pass

The animation is implemented, but should be manually checked on the PG test page with long stacks:

- It should not flicker.
- It should not move the card so much that the user loses context.
- It should remain readable when card scrolling is already active.

### Stack Collapse Defaults May Need Tuning

Current default is two visible same-passage siblings before collapse. If the card still feels too tall, reduce `DEFAULT_CLUSTER_SIBLINGS` in `content.tsx` from `2` to `1`.

### Exact Same Range Remains Ambiguous

If several Lens share exactly the same anchor range, click position cannot distinguish them. Current ordering is creation time after anchor length. A future UI could expose a small local chooser inside the card, but do not bring back floating numeric badges without product review.

### Overlay Rects Are Viewport-Based

Heat overlay rects are fixed-position and refresh on scroll/resize. This is intentional, but should be watched on unusual pages:

- heavy layout shifts,
- transformed parent containers,
- zoomed pages,
- non-standard writing modes.

## Manual Test Recipe

Use Paul Graham's "Do Things that Don't Scale" page with nested Lens around `going out`.

Expected checks:

1. Plain Lens regions show subtle purple marker fill and dotted underline.
2. Nested overlap regions get deeper amber heat only on the exact overlapping phrase.
3. Clicking the small `going out` region opens a `going out` Lens first.
4. Clicking a larger-only portion opens the larger Lens first.
5. A 4-Lens stack shows root + up to two siblings + compact previews.
6. `Show N more` expands smoothly.
7. `Collapse same-passage Lens` collapses smoothly.
8. Long stacks stay inside the viewport and scroll internally.
9. Reactions, reference chips, jump-to-anchor, report/copy actions, and re-anchor UI still work.

## Verification So Far

Typecheck has been run successfully after the latest overlap UX changes:

```text
cmd /c node_modules\.bin\tsc -p apps\extension\tsconfig.json --noEmit
```

Build still needs to be run after future changes before loading the unpacked extension from `apps/extension/dist`.

## Do Not Regress

- Do not wrap article text in `<mark>` or injected spans for marker rendering.
- Do not reintroduce numeric floating cluster handles as the primary overlap UI.
- Do not make Lens presence visible unless the user engages with Lumen.
- Do not optimize away repeated or overlapping Lens; repetition is a social signal.
- Keep reading modes respected when deciding which Lens are visibly marked.

## Recommended Next Step

Treat this overlap UX as stable enough to move on to companion mode. Only return to it if manual testing reveals a blocker or if the visual texture clearly feels wrong in real reading.
