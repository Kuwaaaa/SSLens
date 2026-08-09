# Theme System

Status: now
Progress: 88
Current stage: Visual QA
Last worked: 2026-08-09

## Resume Point

Theme switching has a documented specimen/manual QA checklist. Continue by
running Classic and Signal through the checklist on real pages, then gradually
replace CSS override rules with direct token consumption.

## Goal

Build a theme contract that lets lumen switch complete UI styles without
hardcoding each new component or motion effect.

## Scope

- Core theme contract.
- Extension CSS variables.
- Stored theme preference.
- Shadow host theme application.
- Popup theme selector.
- A second built-in theme.
- Theme-aware bloom and generated motion.
- Specimen coverage and manual visual QA.

## Out Of Scope

- User-created custom themes.
- Theme marketplace.
- Rich social/chat-room theme customization in the current beta.
- Replacing Reading Mode with theme choices.
- New motion vocabulary that breaks the current quiet marker/card/bloom
  language.

## Current State

Initial implementation is complete:

- `apps/extension/src/theme.ts` defines `classic` and `signal` theme profiles.
- `apps/extension/src/shared/storage.ts` persists `lumen.theme`.
- `apps/extension/src/popup.tsx` exposes a UI skin selector.
- `apps/extension/src/content.tsx` exposes a webpage InfoPanel UI skin selector.
- `apps/extension/src/content.tsx` applies theme attributes to the Shadow host.
- `apps/extension/src/marker.ts` updates Custom Highlight marker colors by theme.
- `apps/extension/src/shapes.tsx` uses theme-aware bloom colors and counts.
- `apps/extension/src/styles.css` and `apps/extension/src/popup.css` contain the
  first token contract and theme override layer.

## Next Actions

- Run the theme QA checklist across Classic and Signal on real pages from both
  popup and webpage InfoPanel entry points.
- Record any contrast, marker readability, bloom, reduced-motion, or density
  issues before changing more theme runtime behavior.
- Progressively replace the post-hoc CSS override layer with direct token
  consumption in component styles.
- Keep richer social or chat-room theme customization deferred until the
  page-bound Lens layer is stable.

## Decisions

- Build a theme contract, not skin-specific CSS.
- Reading Mode and accessibility preferences take priority over theme
  personality.
- Generated motion needs TypeScript theme profiles, not only CSS variables.
- Do not split `content.tsx` merely because it is long; split only when the
  extracted boundary owns a distinct concern such as pure UI, theme runtime,
  webpage surface mechanics, or Lens room state.
- Reader themes stay quiet. More expressive social or chat-room theme ideas are
  deferred into their own roadmap item and should not expand this beta task.

## Manual QA Checklist

Run the checklist for both `classic` and `signal` themes.

### Entry Points

- Switch themes from the extension popup.
- Switch themes from the webpage InfoPanel.
- Refresh the page and confirm the stored theme persists.
- Change reading mode and confirm the theme does not override Quiet, Thinking,
  or Full visibility rules.

### Reader Overlay States

- Orb idle, connected, companion-active, and extra-count states.
- No-token hint.
- Restore tab button after hiding the overlay for the tab.
- InfoPanel normal view and chat-focused collapsed view.
- Lens card with short body, long body preview, expanded long body, refs, code,
  reactions, report/copy states, and same-passage stack.
- Composer with type selector, body textarea, reference picker, tags, anonymous
  toggle, validation error, and busy state.
- Re-anchor confirm and orphan Lens rows.
- Companion controls, emoji buttons, chat list, own/other chat bubbles, and
  disabled/offline states.

### Page And Marker States

- Single marker on normal paragraph text.
- Clustered markers and cluster heat.
- Marker click hit testing on dense text.
- Markers on headings, links, code blocks, light pages, dark pages, and visually
  noisy pages.
- Marker and card bloom should feel visible but not loud.

### Accessibility And Motion

- `prefers-reduced-motion` disables or calms nonessential motion.
- Text contrast remains readable in both themes.
- Focus outlines and hover states remain visible.
- Compact controls do not truncate labels in the current supported widths.

### Regression Checks

- API and WebSocket still use the intended beta server configuration.
- Theme switching does not clear Lens, Companion, draft, or active card state.
- The Shadow host keeps `data-lumen-theme` and `data-lumen-mode` in sync.
- New UI added later must use theme tokens or be added to this checklist.

## Responsibility Boundaries

- Theme contract/profile code owns tokens, built-in skins, and generated visual
  parameters.
- Extension theme storage owns persisted user preference and storage-change
  plumbing.
- Shadow-host theme application owns `data-lumen-theme` and reading-mode
  attributes.
- Content overlay orchestration should compose Lens runtime, Companion runtime,
  surface mechanics, and UI instead of owning theme behavior directly.
- Pure UI components should consume tokens and props; they should not read
  storage, connect to ports, restore anchors, or mutate markers.

## Verification

- Extension typecheck passed for the initial foundation.
- Focused repo tests passed for the initial foundation.
- Use the normal extension dev loop: `bun run dev:extension`.
- Manually inspect overlay cards, orb, composer, InfoPanel, markers, and bloom.

## Agent Update Protocol

Only update the `theme-system` roadmap entry at stage boundaries. Do not add a
custom theme editor in P0. Do not make a loud theme override Quiet mode.

## Links

- `docs/technical/theme-system-design.md`
- `apps/extension/README.md`
- `docs/project-status.md`
