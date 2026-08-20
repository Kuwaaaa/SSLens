# lumen Theme System Design

Date: 2026-07-27
Status: Design proposal

This document describes a theme system for lumen UI surfaces. It collects the
current direction for switching whole UI styles, supporting future components
and motion, and keeping the system reusable across extension, web, PDF, and
future surfaces.

The goal is not only to "change colors." The goal is to create a visual
decision layer that every current and future UI element can use.

## 1. Product Goal

lumen should support quickly switching between complete visual styles, similar
to changing skins, without rewriting component CSS each time.

A theme should control:

- color,
- typography,
- radius,
- spacing where needed,
- borders,
- shadows,
- marker treatment,
- motion tone,
- bloom behavior,
- surface-specific accents.

The theme system must preserve lumen's core product constraints:

- The webpage remains the artifact.
- Lens cards remain the primary UI unit.
- Markers stay quiet by default.
- Reading modes keep user control over social signal volume.
- Companion and motion remain opt-in or restrained where appropriate.
- Accessibility preferences override theme personality.

## 2. Core Principle

Do not build "skin CSS." Build a theme contract.

The theme contract defines the tokens and runtime values that all UI surfaces
must consume. Components should not choose raw colors, shadows, or motion values
directly. If a new visual decision is needed, add it to the contract or to a
surface adapter first.

Recommended priority order:

```text
accessibility > reading mode > surface constraints > theme personality
```

This means a loud theme cannot override Quiet mode, reduced motion, or a
surface's readability constraints.

## 3. Token Layers

Use layered tokens instead of a flat color list.

```text
base tokens
  Raw values: purple-700, amber-500, radius-2, shadow-lg.

semantic tokens
  Product meaning: primary, accent, danger, surface, muted text, live state.

component tokens
  Component-specific values only when a component needs to deviate:
  card background, orb background, marker ambient fill, companion chat bubble.

motion tokens
  Motion timing and behavior:
  enter duration, easing, bloom duration, bloom spread, bloom opacity.
```

Most components should consume semantic tokens. Component tokens should be added
only when a component has a real, recurring visual need that cannot be expressed
through shared semantics.

Avoid token names tied to one theme's palette. Prefer semantic names:

```text
primary
accent
surface
surfaceRaised
textMuted
markerAmbient
markerActive
live
danger
warning
```

Avoid component CSS that directly references values such as `#4a1a7a`,
`rgba(...)`, or one-off shadows.

## 4. CSS Variable Contract

For web-based surfaces, themes should compile to CSS custom properties.

Example base contract:

```css
:host {
  --lumen-font-ui: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;

  --lumen-color-text: #1a1a1a;
  --lumen-color-text-muted: #777;
  --lumen-color-primary: #4a1a7a;
  --lumen-color-accent: #f59e0b;
  --lumen-color-danger: #b91c1c;

  --lumen-surface-panel: rgba(255, 255, 255, 0.98);
  --lumen-surface-soft: #faf6ff;
  --lumen-surface-accent-soft: #fffbeb;

  --lumen-border-subtle: rgba(107, 33, 168, 0.18);
  --lumen-border-strong: rgba(107, 33, 168, 0.3);

  --lumen-radius-control: 6px;
  --lumen-radius-panel: 14px;
  --lumen-radius-pill: 999px;

  --lumen-shadow-control: 0 6px 20px rgba(80, 60, 130, 0.2);
  --lumen-shadow-panel: 0 20px 50px rgba(80, 60, 130, 0.22);

  --lumen-motion-enter-duration: 180ms;
  --lumen-motion-enter-easing: cubic-bezier(0.2, 0.8, 0.2, 1);
  --lumen-motion-bloom-duration: 720ms;
  --lumen-motion-bloom-easing: cubic-bezier(0.16, 1, 0.3, 1);
}
```

Component CSS should then depend on the contract:

```css
.card {
  border: 1px solid var(--lumen-border-subtle);
  border-radius: var(--lumen-radius-panel);
  background: var(--lumen-surface-panel);
  color: var(--lumen-color-text);
  box-shadow: var(--lumen-shadow-panel);
}

.pill {
  background: var(--lumen-surface-soft);
  color: var(--lumen-color-primary);
}
```

## 5. Theme Profiles

Each theme should override tokens, not component selectors.

Example:

```css
:host([data-lumen-theme="classic"]) {
  --lumen-color-primary: #4a1a7a;
  --lumen-color-accent: #f59e0b;
  --lumen-surface-panel: rgba(255, 255, 255, 0.98);
  --lumen-surface-soft: #f1e8ff;
  --lumen-shadow-panel: 0 20px 50px rgba(80, 60, 130, 0.22);
}

:host([data-lumen-theme="paper"]) {
  --lumen-color-primary: #24515c;
  --lumen-color-accent: #c8762d;
  --lumen-color-text: #26211b;
  --lumen-color-text-muted: #776d63;
  --lumen-surface-panel: rgba(255, 253, 248, 0.98);
  --lumen-surface-soft: #eaf5f3;
  --lumen-border-subtle: rgba(36, 81, 92, 0.18);
  --lumen-shadow-panel: 0 18px 44px rgba(54, 45, 32, 0.18);
}
```

Good initial themes:

- `classic`: current lumen purple/amber, geometric bloom, light glass.
- `paper`: calmer reader-like surface, warmer panels, less motion.
- `focus`: lower saturation, low motion, reduced social visual weight.

Avoid building a free-form custom theme editor early. If customization is added,
start with official themes plus limited accent selection and generate derived
tokens from that accent.

## 6. Reading Mode Interaction

Theme controls visual personality. Reading mode controls social signal volume.

They should combine instead of competing:

```text
theme = visual personality
reading mode = social volume and visual intensity
```

Example:

```css
:host([data-lumen-theme="classic"][data-lumen-mode="quiet"]) {
  --lumen-marker-opacity: 0.22;
  --lumen-bloom-opacity: 0.45;
}

:host([data-lumen-theme="classic"][data-lumen-mode="full"]) {
  --lumen-marker-opacity: 0.45;
  --lumen-bloom-opacity: 1;
}
```

Quiet mode must remain quiet in every theme. A high-energy theme may feel more
alive in Full mode, but it should not make default reading feel polluted.

## 7. Motion And Generated Effects

Motion is part of the theme. It cannot be handled only through CSS variables,
because some lumen effects are generated by TypeScript.

Examples:

- bloom color palette,
- bloom shape count,
- bloom spread,
- marker bloom count,
- emoji toss trajectory,
- companion animation intensity.

Use a TypeScript theme profile for generated behavior:

```ts
export interface LumenThemeProfile {
  id: "classic" | "paper" | "focus";
  bloom: {
    colors: string[];
    spread: number;
    cardOpenCount: number;
    markerCount: number;
    opacity: number;
  };
  motion: {
    enterMs: number;
    bloomMs: number;
    reduceByDefault?: boolean;
  };
}
```

CSS should handle styling. TypeScript profiles should handle generated visual
behavior.

Reduced motion remains non-negotiable. It should override theme motion.

## 8. Multi-Surface Reuse

The reusable unit should be the theme source and contract, not the extension CSS.

Recommended structure:

```text
packages/theme/
  src/
    tokens.ts
    themes.ts
    motion.ts
    css.ts
    index.ts

apps/extension/src/theme/
  extension adapter:
  orb, card, marker, bloom, companion token mapping

future apps/pdf-reader/src/theme/
  PDF adapter:
  page rectangle marker, PDF toolbar, page overlay token mapping

future apps/web/src/theme/
  web app adapter:
  app shell, dashboard, panel token mapping
```

The theme source can be TypeScript or JSON-like data:

```ts
export interface LumenTheme {
  id: "classic" | "paper" | "focus";
  color: {
    text: string;
    muted: string;
    panel: string;
    primary: string;
    accent: string;
    border: string;
    marker: string;
  };
  radius: {
    control: number;
    panel: number;
    pill: number;
  };
  shadow: {
    panel: string;
    control: string;
  };
  motion: {
    enterMs: number;
    bloomMs: number;
    bloomSpread: number;
  };
}
```

Web and extension surfaces compile it to CSS variables. Native or other future
surfaces consume it as structured values.

## 9. Core Tokens Vs Surface Tokens

Not every token should be shared across all surfaces.

Core tokens:

- brand colors,
- semantic colors,
- typography scale,
- radius,
- spacing,
- elevation,
- motion rhythm.

Surface tokens:

- web marker treatment,
- PDF marker rectangle styling,
- browser-extension orb styling,
- companion emoji treatment,
- mobile navigation treatment,
- page contrast rings.

This prevents multi-surface reuse from becoming either too generic to be useful
or too extension-specific to reuse.

## 10. Runtime Application

For the extension, store theme choice in `chrome.storage.local` alongside
reading mode.

Suggested storage shape:

```ts
export const KEY_THEME = "lumen.theme";

export type LumenThemeId = "classic" | "paper" | "focus";

export interface StoredThemePreference {
  themeId: LumenThemeId;
  themeVersion?: number;
}
```

The content script should read the theme before rendering the React overlay, so
the Shadow DOM does not flash from the default theme to the stored theme.

The Shadow host can receive:

```html
<div id="lumen-root" data-lumen-theme="classic" data-lumen-mode="quiet"></div>
```

Then CSS can select:

```css
:host([data-lumen-theme="classic"]) {}
:host([data-lumen-mode="quiet"]) {}
```

The popup should use the same theme preference. When storage changes, content
scripts and popup UI should update without requiring a page reload.

## 11. Hidden Problems To Watch

### Lowest Common Denominator

Cross-surface themes can become too abstract. Keep core tokens broad and let
surface adapters express UI-specific needs.

### Product Semantics

Themes should not replace product controls. Reading modes, companion opt-in, and
accessibility settings keep their own authority.

### Runtime Flash

Avoid rendering with the default theme before storage has loaded. Apply the
theme attribute before mounting React where possible.

### Versioning

Theme values will change. Store theme IDs in a way that leaves room for
versioning or migration.

### Contrast And Accessibility

Every theme must cover text, muted text, disabled states, errors, warnings,
success, selected, active, hover, live, orphan, and hidden-by-mode states.

### Unknown Page Backgrounds

lumen runs over arbitrary pages. Themes need panel backdrop, outline, and
contrast-ring tokens that work on light, dark, image-heavy, and visually noisy
pages.

### Marker Reliability

Markers render over real page text. Test themes on light text, dark text, links,
code blocks, headings, and dense pages.

### Shadow DOM Boundaries

Shadow DOM protects most overlay styles, but Custom Highlight styling,
z-index, fixed positioning, system preferences, and browser rendering behavior
still interact with the host page.

### Token Explosion

Do not create component tokens for every property of every component. Prefer
semantic tokens unless a component genuinely needs its own recurring visual
role.

### Maintenance Discipline

New UI and motion should follow the theme contract. Add a rule to future
implementation notes: no new hardcoded visual values in component CSS unless
they are layout-specific and not part of the theme.

## 12. Suggested Implementation Order

1. Add `packages/theme` with core theme types and initial theme profiles.
2. Convert current extension overlay styles to CSS variables while preserving
   the existing visual output.
3. Add `classic` as the current default theme.
4. Add one contrasting theme, such as `paper`, to validate the contract.
5. Store theme preference in extension storage and apply it to the Shadow host.
6. Add a popup theme selector.
7. Move bloom and generated visual parameters into TypeScript theme profiles.
8. Add a UI specimen page or debug surface showing all major states.
9. Use the same contract when introducing PDF or future web surfaces.

## 13. Roadmap Feedback Contract

Theme switching is the first feature that should continuously report its
development state back to the public roadmap.

The roadmap source is the local/static snapshot:

```text
docs/roadmap.json
```

The generated agent-readable roadmap is:

```text
docs/roadmap.md
```

The rendered human page is:

```text
docs/roadmap.html
```

Any agent implementing theme switching must update the `theme-system` roadmap
entry at feature-stage boundaries. Do not update the roadmap for every small CSS
or code edit. Update it when a meaningful stage starts, completes, gets blocked,
or is intentionally cut.

Recommended theme-system stages:

```text
design
tokens
runtime
switcher
second-theme
motion
specimen
qa
```

Stage status values:

```text
planned
next
now
done
blocked
cut
```

When starting a stage:

- set that stage to `now`,
- move the previous active stage to `done` or `blocked`,
- update `currentStage`,
- update `progress`,
- append a concise item to `updates`,
- update `updatedAt`.

When completing a stage:

- set that stage to `done`,
- move the next stage to `next` or `now`,
- update `currentStage`,
- update `progress`,
- add verification notes to `updates` when useful,
- update `updatedAt`.

Theme work should only edit the `theme-system` entry in `docs/roadmap.json`
unless the roadmap schema itself must change. Run `bun scripts/export-roadmap.ts`
after roadmap edits so `docs/roadmap.md` stays current for agents.

Suggested progress checkpoints:

```text
10  design contract documented
25  CSS token extraction started
40  overlay uses theme variables
55  runtime storage and Shadow host application
65  popup switcher
75  second theme validates the contract
85  bloom and generated motion are theme-aware
95  specimen coverage and QA
100 shipped
```

## 14. Specimen Coverage

Create or reuse a local debug surface that shows:

- orb,
- no-token hint,
- restore tab,
- create button,
- composer,
- re-anchor confirm,
- InfoPanel,
- reading mode switch,
- companion controls,
- companion chat,
- Lens card,
- long Lens preview and expanded state,
- Markdown content,
- code block,
- reaction picker,
- referenced Lens,
- orphan Lens row,
- cluster heat,
- marker bloom,
- card bloom,
- disabled/error/success/warning states.

Every theme should be checked against this specimen before being considered
ready.

## 15. Summary

The theme system should answer this question:

> Given the current theme, reading mode, surface, and accessibility preferences,
> how bright, animated, emphasized, and quiet should this UI be?

If the system answers that question through a stable contract, future UI,
motion, PDF readers, web surfaces, and native surfaces can share one visual
language without being forced into the extension's exact CSS.
