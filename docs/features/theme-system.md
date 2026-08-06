# Theme System

Status: now
Progress: 72
Current stage: Specimen coverage and visual QA
Last worked: 2026-08-06

## Resume Point

Theme switching foundation is committed on `codex/theme-switching` at
`9776f67`. Current follow-up is a narrow quality pass: add compact specimen
coverage or a manual visual QA checklist, keep theme runtime concerns behind
storage and Shadow-host adapters, then reduce the CSS override layer by moving
core components to direct token consumption.

## Goal

Build a theme contract that lets Lumen switch complete UI styles without
hardcoding each new component or motion effect.

## Scope

- Core theme contract.
- Extension CSS variables.
- Stored theme preference.
- Shadow host theme application.
- Popup theme selector.
- A second built-in theme.
- Theme-aware bloom and generated motion.
- Specimen coverage.

## Out Of Scope

- User-created custom themes.
- Theme marketplace.
- Replacing Reading Mode with theme choices.
- New motion vocabulary that breaks the current quiet marker/card/bloom
  language.

## Current State

Initial implementation is complete:

- `apps/extension/src/theme.ts` defines `classic` and `signal` theme profiles.
- `apps/extension/src/shared/storage.ts` persists `lumen.theme`.
- `apps/extension/src/popup.tsx` exposes a UI skin selector.
- `apps/extension/src/content.tsx` applies theme attributes to the Shadow host.
- `apps/extension/src/marker.ts` updates Custom Highlight marker colors by theme.
- `apps/extension/src/shapes.tsx` uses theme-aware bloom colors and counts.
- `apps/extension/src/styles.css` and `apps/extension/src/popup.css` contain the
  first token contract and theme override layer.

## Next Actions

- Add specimen coverage or a manual visual QA checklist for orb, card, composer,
  InfoPanel, marker, bloom, popup selector, and reduced-motion states.
- Run the normal extension dev loop and inspect Classic and Signal on real
  pages. Reload the extension only when manifest or service-worker code changes.
- Keep theme persistence, theme application, and generated visual profiles
  separated from content overlay orchestration.
- Progressively replace the post-hoc CSS override layer with direct token
  consumption in component styles.
- Extract UI/runtime/surface modules from `content.tsx` only at
  behavior-preserving seams that clarify ownership.

## Decisions

- Build a theme contract, not skin-specific CSS.
- Reading Mode and accessibility preferences take priority over theme
  personality.
- Generated motion needs TypeScript theme profiles, not only CSS variables.
- Do not split `content.tsx` merely because it is long; split only when the
  extracted boundary owns a distinct concern such as pure UI, theme runtime,
  webpage surface mechanics, or Lens room state.

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
