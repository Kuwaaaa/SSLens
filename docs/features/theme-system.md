# Theme System

Status: now
Progress: 72
Current stage: Specimen coverage and visual QA
Last worked: 2026-08-03

## Resume Point

Theme switching foundation is committed on `codex/theme-switching` at
`9776f67`. Continue by adding compact specimen coverage or a manual visual QA
checklist, then reduce the CSS override layer by moving core components to
direct token consumption.

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
  InfoPanel, marker, and bloom states.
- Run the normal extension dev loop and inspect Classic and Signal on real pages.
- Refactor theme runtime application out of `content.tsx` only if another
  theme-related behavior is added.
- Progressively replace the post-hoc CSS override layer with direct token
  consumption in component styles.

## Decisions

- Build a theme contract, not skin-specific CSS.
- Reading Mode and accessibility preferences take priority over theme
  personality.
- Generated motion needs TypeScript theme profiles, not only CSS variables.

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
