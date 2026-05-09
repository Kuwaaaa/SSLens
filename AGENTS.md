# AGENTS.md - Lumen v2 Assistant Entry

You are working on **Lumen v2**, a browser extension and small backend for
contextual social Lens cards on real webpages. Read this file first. It is the
AI entry and routing document, not the current implementation snapshot.

## Source Of Truth

- Current implementation, release state, verification checklist, and near-term
  plan: `docs/project-status.md`.
- Temporary session handoff: `CODEX_SESSION_HANDOFF.md`. It may be overwritten
  often. If it conflicts with `docs/project-status.md`, trust project status.
- Stable product framing: `docs/PROJECT_OVERVIEW.md`.
- Stable technical architecture and rationale: `docs/ARCHITECTURE.md`.

Do not treat stale checklist text in older planning docs as current status.

## Product Center

Lumen makes webpages feel inhabited through persistent, contextual Lens cards.
People can leave playful comments, questions, explanations, and references on
real pages. Companion is an opt-in live layer for people currently on the same
page. Lounge and Atlas are future ecosystem layers, but page-bound Lens cards
remain the v2 center.

North star:

> Lumen exists to make a webpage feel inhabited through cards that persist, not
> chrome that interrupts.

## Non-Negotiable Principles

1. **UGC first.** Knowledge may emerge from participation, but Lumen is not a
   knowledge tool in the UI.
2. **Entertainment is the substrate.** If a feature feels like school before it
   feels like people have been here, reshape or defer it.
3. **Cards are primary.** Do not make floating text or default danmaku the main
   experience.
4. **Solo reading by default.** Companion and Lounge are explicit opt-in modes.
5. **Reading modes are user control.** Never override Quiet / Thinking / Full
   because a Lens seems important.
6. **No visible AI-authored content.** AI may be an explicit draft assistant
   later, never a default public commenter or explainer.
7. **No knowledge graph UI in v2.** Atlas is real but out of scope for Lumen v2
   unless a feature is independently justified by the page Lens experience.
8. **No reputation, karma, or leaderboards.** Preserve small-group tone.
9. **Default quiet markers.** The page is the artifact; Lumen is a restrained
   overlay.
10. **Do not optimize for total Lens count.** The success metric is qualitative
    and accumulative.

## Read By Task

- Current status or next work: `docs/project-status.md`.
- Product direction: `docs/PROJECT_OVERVIEW.md`, then
  `docs/product/lens-design.md`.
- Original Chinese conception and ecosystem vision: `docs/Chat.md`.
- Architecture or cross-cutting technical decisions: `docs/ARCHITECTURE.md`.
- Lens rich content / long reading: `docs/product/lens-reading-design.md`.
- Ecosystem, Atlas, paths, and toy projects: `docs/product/ecosystem-roadmap.md`.
- Companion mode: `docs/technical/companion-mode-mvp.md`.
- Persistent Lounge: `docs/product/persistent-lounge-design.md`.
- Anchoring: `docs/technical/lens-anchoring.md` and
  `packages/anchoring/README.md`.
- Server scaling risks: `docs/technical/server-bottlenecks.md`.
- Extension implementation notes: `apps/extension/README.md`.
- Server API and local development: `apps/server/README.md`.

Deployment drafts are currently archived and should not be treated as mainline
project plan until the user asks to revisit deployment.

## Current Stack Snapshot

Use `docs/project-status.md` for exact current state. At a high level:

- Backend: Bun, SQLite, Bun WebSocket server.
- Extension: MV3, Vite, React, TypeScript.
- Anchoring: local `@lumen/anchoring` package using W3C-style selectors and
  fuzzy quote recovery.
- Rendering: CSS Custom Highlight API for markers, React overlay for cards and
  panels.

Do not swap core stack choices without reading the architecture rationale and
getting user approval.

## Repository Orientation

```text
apps/extension/    MV3 browser extension
apps/server/       Bun backend
packages/schema/   shared types
packages/anchoring/ anchoring implementation
docs/              product, architecture, technical, and status docs
scripts/           CLI and shared utility scripts
```

The old v1 prototype is deprecated reference only. Do not import code from it.

## Working Conventions

- Respond to the user in Chinese unless they switch language.
- Code and repo docs are English unless the user asks otherwise.
- Prefer editing existing files over creating new docs.
- Do not create new documentation files unless asked; expanding docs dilutes the
  signal.
- If you change an English doc that has a Chinese mirror, update the mirror too.
- Do not commit unless the user explicitly asks.
- Commit messages are imperative, present tense, and have no AI co-author tags
  unless requested.
- Do not revert unrelated user changes. Treat a dirty worktree as normal.
- No emojis in code, docs, or commit messages unless explicitly requested.

## Extension Workflow

The user's normal extension loop is:

```bash
bun run dev:extension
```

Then refresh the test tab. Reload the extension at `chrome://extensions` only
when `manifest.json` or the service worker changes. Do not recommend full
production builds as the default development loop.

## Historical Context To Preserve

- v1 overbuilt knowledge infrastructure before validating participation. v2 is
  deliberately narrower.
- Older docs may mention scheduled co-reading or floating danmaku as central.
  That framing is superseded by async card accumulation, opt-in companion mode,
  and reading modes.
- Atlas is part of the larger vision, but v2 should validate Lens participation
  first.
- Lens body is Markdown. `[[lens:id]]` and `[[url:...]]` references are
  first-class.
- Per-Lens anonymity is moderation-aware: the UI may hide the author, but the
  server records the real author.
- Visual identity should extend the existing quiet marker, card, popover, and
  geometric bloom language rather than introducing a new motion vocabulary.
