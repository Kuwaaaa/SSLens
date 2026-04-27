# CLAUDE.md — Onboarding for AI assistants working on Lumen v2

You are working on **Lumen v2**, a redesigned browser extension for contextual social commenting on webpages. This file gets you up to speed in ~5 minutes. Read it before doing anything else.

## What this project is

Lumen lets a small invited group leave playful, contextual "Lens" cards on real webpages. Cards persist on a URL forever, signed by handle and dated. Over weeks a page accumulates a Lens layer that makes it feel inhabited. When a user wants company *right now*, they can opt into "companion mode" that matches them with others currently reading the same page; default interaction is tossing emoji at the screen edges, with a tiny chat layer as a togglable upgrade.

The product hypothesis: an entertainment-substrate UGC layer makes long-tail web pages feel inhabited; knowledge emerges from that participation rather than seeding it.

## Current state

Last verified working end-to-end on Paul Graham's *Do Things that Don't Scale*: two Chrome users in different windows, real-time presence, Lens creation, inter-Lens references rendered as chips, geometric outline-emission blooms on card open.

**Backend** (`apps/server/`): complete skeleton, ready for invite-only beta.
- Bun + WS + SQLite on `localhost:3000`
- Routes: `POST /api/redeem`, `GET/POST /api/lenses`, `WS /ws`
- Per-URL room presence + Lens broadcast verified
- `/admin` operator console served at root for dev/testing

**Extension** (`apps/extension/`): most of P0 done.
- Anchoring via `@lumen/anchoring` (TextPosition → TextQuote+context → fuzzy → orphan); CSS Custom Highlight API, no `<mark>` wrapping
- Reading modes (Quiet default / Thinking / Full) — set in popup, applied client-side
- References: `[[lens:id]]` and `[[url:...]]` parse and render in card body
- Visual identity (see "Visual identity" section below and `docs/ARCHITECTURE.md` §13): 12-shape outline-emission blooms on card open; 4-shape marker blooms on new Lens via WS; universal 4px slide-up popover entrance; respects `prefers-reduced-motion`
- Orphan tracking: failed-to-anchor Lens surface in InfoPanel (manual UX verification deferred — recipes in `apps/extension/src/content.tsx`)

**Not yet built (still in Task #6)**:
- Anonymous toggle in composer (schema + server already record `lens.anonymous`)
- Hide controls (per-tab / per-site)
- LensCard "copy ref" button
- Orphan re-anchor flow
- Composer "insert reference" picker (users currently type `[[lens:id]]` syntax manually)
- Companion mode — largest remaining block; spec in `docs/ARCHITECTURE.md` §7.2
- Privacy policy
- Report button (server-side stub is fine)

### Where to start

Smallest remaining P0 items (~half hour each, can be a single commit):

1. **Anonymous toggle** in composer — checkbox sets `body.anonymous`. Server already returns the author as "Anonymous" when set.
2. **Hide controls** — × button in InfoPanel hides on this tab; popup checkbox hides on this site.
3. **LensCard "copy ref" button** — copies `[[lens:id]]` to clipboard so users can paste into their own Lens body.

Then attack companion mode as its own arc — it's the largest remaining feature and touches both server and extension.

## Read in this order before contributing

1. `docs/Chat.md` — the original conception (Chinese), the ecosystem vision Lumen sits inside
2. `docs/PROJECT_OVERVIEW.md` — what v2 is narrowing to and why
3. `docs/ARCHITECTURE.md` — every technical decision, with rationale
4. `docs/mvp/lumen-mvp-plan.md` — 5-week build plan + 4-week soak, success criterion, what NOT to build
5. `docs/product/lens-design.md` — Lens content types and interaction loops (carryover from v1; passages framing Lumen as "danmaku energy" are now superseded — Lumen's primary form is cards, not floating text)

If a question is not answered by these, ask before building.

## Non-negotiable principles (do not deviate without user approval)

1. **UGC > knowledge.** Knowledge Lens is one type, not the default. Quick Lens is the default creation mode. Never frame Lumen as a "knowledge tool" in UI copy — it is a social commenting layer where knowledge sometimes emerges.
2. **Entertainment is the substrate.** If a feature would make Lumen feel more like school or a knowledge graph and less like "people have been here," it's wrong-shaped. Re-frame or defer.
3. **No visible AI-authored content.** AI is allowed only as a draft-assist tool the user actively invokes ("make this funnier"). Never AI as a default visible commenter, never AI-explained paragraphs, never "smart highlights from AI." This is a hard line. Search "kills UGC motivation" in `docs/ARCHITECTURE.md` for the reason.
4. **Cards are the primary form. Not floating UI.** Floating danmaku-style text scrolling across the page interrupts reading. It is deferred to a post-MVP opt-in feature, never the default. Anything that "scrolls across the screen" should be questioned hard.
5. **Reading is solo by default; companion mode is opt-in.** Do not auto-match users, do not push notifications about who else is reading, do not surface "X is reading this" without the user opting in. Default state is private reading; social presence is a button the user presses when they want it.
6. **Reading modes are the user's volume control.** Quiet (default) shows almost nothing; Full shows everything; Thinking is in between. Never override the user's mode. Never show all Lens regardless of mode "because we think it's important."
7. **No knowledge graph UI.** Skill signals can be tracked silently in the DB if useful. They get **zero** user-facing surface in v2. The v1 web demo's skill-strip is a counterexample — it is gone.
8. **No reputation / karma / leaderboards.** They kill small-group tone instantly. Do not add them.
9. **Default quiet markers.** Dotted underline + tiny dot. Never gradient text, never heavy backgrounds, never large icons. The original page is the artifact; Lumen is a quiet overlay.
10. **The success metric is qualitative + accumulative**, defined in `docs/mvp/lumen-mvp-plan.md` §2. Total Lens count is an anti-metric. Do not optimize for it.

## Visual identity (frozen)

The product is for young developers; the visual goal is **rich when engaged, invisible when not**. Animations and geometric flourishes appear on Lumen elements (cards, markers, popovers) — *never* on the article body itself.

- **Palette**: deep purple `#4a1a7a` (chrome — borders, text, dotted underline marker) · purple `#8b5cf6` (~45% of bloom shapes) · deep purple variant `#7c3aed` (~20%) · amber `#f59e0b` (~35%, live/active accent).
- **Forms**: cards (primary, persistent) · markers (CSS Custom Highlight API dotted underline) · small popovers (orb, info panel, composer, lens card, create button) · bloom shapes. **No floating UI on the article body.**
- **Animation language**: bloom shapes emit from card outline (12 shapes) on card open; from marker top edge (4 shapes) on new Lens arrival via WS. All popovers get a 4px slide-up + fade entrance (180ms). Bloom uses `cubic-bezier(0.16, 1, 0.3, 1)`; popover entrance uses `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- **Restraint rules**: animations only on Lumen elements, never on page content. All keyframe animations gated by `@media (prefers-reduced-motion: reduce)`. Bloom z-index sits below popovers so shapes "emerge from behind."
- **Tunable knobs** in `apps/extension/src/shapes.tsx` (`SPREAD`, `TOP_N`/`BOTTOM_N`/`SIDE_N`, stagger delays, `pickColor`/`pickOutlined` probabilities) and `apps/extension/src/styles.css` (`lumen-bloom` / `lumen-appear` durations and easings).

For full rationale and unimplemented future directions (B option: outline trace; C option: continuous micro-motion; numeric typography swap), see `docs/ARCHITECTURE.md` §13.

## Stack (frozen for v2)

| Layer | Choice |
|---|---|
| Server runtime | Bun |
| WS server | Bun's built-in (`ws.subscribe` topics) |
| DB | SQLite via `bun:sqlite` |
| Reverse proxy | Caddy 2 |
| Host | Hetzner CX22 |
| Backup | Litestream → R2 |
| Auth | Paseto v4 bearer token from invite code |
| Extension | Vite + MV3 + React + TypeScript |
| Extension WS client | partysocket |
| Anchoring | `@lumen/anchoring` (W3C selectors + `approx-string-match`) |
| Highlight render | CSS Custom Highlight API (NOT `<mark>` wrapping) |

Rationale for each choice is in `docs/ARCHITECTURE.md` §3 and §4–§6. Do not swap a component without reading why it was chosen.

## Repo orientation

```
SStree/                          (currently SStree-v2 pending a manual rename)
├── CLAUDE.md                    you are here
├── docs/                        read these first
├── apps/
│   ├── extension/               MV3 extension
│   └── server/                  Bun backend
└── packages/
    ├── schema/                  shared types (Lens, User, ReadingMode, CompanionEvent, etc.)
    ├── anchoring/               W3C selectors + `approx-string-match`
    └── lens-ui/                 (P1) shared React components
```

A sibling directory `e:/src/SStree-v1/` (after the manual rename) holds the v1 prototype. **Treat it as deprecated reference only.** Do not import code from it. Patterns in v1 may have been chosen for v1's framing, not v2's.

## Working conventions

- **Edit existing files in preference to creating new ones.**
- **Do not create documentation files unless asked.** The doc set above is the canonical set; expanding it dilutes signal.
- **No emojis in code or docs unless explicitly requested.** Emoji is allowed inside the product (companion mode emoji toss); never in source code, commit messages, or doc prose.
- **Commit messages**: imperative, present tense, no AI co-author tags unless the user asks for them.
- **When unsure**, ask. The cost of pausing to confirm is low; the cost of a wrong-shaped feature shipped is the success of the entire MVP.
- **Dev workflow for the extension**: keep `bun run dev:extension` running (Vite + crxjs auto-rebuild). On each save, just F5 the test tab — the content script re-mounts. Reload the extension itself at `chrome://extensions` only when `manifest.json` or the service worker changes. CSS imported via `?inline` is baked into the JS bundle, so CSS changes also need rebuild (auto-handled by the dev server). Don't recommend `bun run build:extension` + manual reload as the default loop — it's slower than necessary.

## Critical context that is not in the docs

These are decisions / context from the conversations that produced v2. They live here because they shaped many small choices and should not be re-derived:

- **The v1 prototype existed in this same workspace before v2.** v1's failure mode was over-emphasizing knowledge infrastructure (vector summoning, 7-pillar canonical nodes, skill graphs) before validating that anyone wanted to participate at all. v2 is a deliberate narrowing.
- **An earlier pass of v2 docs over-extrapolated from research findings.** The first draft wrote scheduled cohort co-reads + Niconico-style time-shifted floating danmaku as the central cold-start mechanism. The user corrected this: scheduled co-reads create awkward dynamics for reading, and floating text interrupts the page. The actual model is async card accumulation + opt-in companion mode + reading modes. If you find any old-model phrasing in docs, flag it.
- **The user's original conception (in `docs/Chat.md`) framed Lumen as the "lens" half of a two-app ecosystem (App A = Lumen, App B = Atlas).** Atlas is real and intended for v3+, but is out of scope for v2. Do not propose features that "set up Atlas later" unless they are also independently justified by v2.
- **The first invited cohort is ~10–15 close friends + open-source-curious young people** brought in by project announcement. The cohort's tribal cohesion is load-bearing — design for "the friends will roast each other in good humor," not "strangers from the internet need clear UX."
- **Lens body is Markdown.** Inter-Lens references use `[[lens:id]]` syntax; URL refs use `[[url:...]]`. The original Chat.md called out citation as a first-class feature ("user researched a formula and summarizes the explanation in a card") — make sure refs render well, not as raw text.
- **Anonymity is moderation-aware.** Per-Lens `anonymous` flag hides the author in the UI, but the server records the real author. The privacy policy must say so. Do not promote this as "anonymous" without that caveat.
- **The user's habitual language is Chinese**, but documentation and code are in English. Match this when writing docs; respond to the user in Chinese unless they switch.
- **Chinese mirror docs exist** at `docs/*.zh.md` and `CLAUDE.zh.md`. They are mirrors of the English versions; if you change content in one, update the mirror.
- **Architecture deviations from initial spec, all documented in code / READMEs**:
  - WebSocket lives in the **content script, not the service worker** (`apps/extension/README.md`). Each tab owns its own WS; presence is detected via WS connect/close, not via `chrome.runtime.connect` ports as ARCHITECTURE.md §5 originally proposed. The original SW-hosted design is the right long-term pattern; the deviation is an MVP shortcut documented for revisit.
  - Anchoring is a **clean ~250-LOC implementation, not vendored hypothesis** (`packages/anchoring/README.md`). The W3C selector model and `approx-string-match` (the actual algorithmic value) are preserved; the surrounding hypothesis-internal scaffolding is not.
  - `Lens.body` is **top-level on the schema** (was originally in `Lens.content.body`). `LensContent` remains as an optional reserved type for richer content (poll options, challenge prompts) but is currently unused. Server returns body at top level; extension reads it at top level. The schema now matches reality.
- **Visual identity decisions came from a specific user note**: "色块从卡片背景中冒出来" (color blocks emerge from the card's background). The 12-shape outline-emission design is a direct interpretation of that. If asked to add more animation, **lean toward extending this language** (more triggers, finer micro-motion in Full mode) rather than introducing a new motion vocabulary.
- **The user iterates with `bun run dev:extension` + tab F5**, not full extension reload. Don't recommend a slow workflow without checking.

## When something is missing

- Need a sample workflow? `docs/mvp/lumen-mvp-plan.md` §3 has the 5-week phase plan.
- Need to know if a library is already chosen? `docs/ARCHITECTURE.md` §12 is the appendix.
- Need to know what's in/out of scope? `docs/ARCHITECTURE.md` §10 and `docs/mvp/lumen-mvp-plan.md` §7 are the explicit "do NOT build" lists.
- Failure modes the architecture is designed against: `docs/ARCHITECTURE.md` §9.

## North star, restated

> Lumen exists to make a webpage feel inhabited — through cards that persist, not chrome that interrupts. Knowledge, skill growth, and a wider ecosystem are downstream effects of solving that one problem first.

If a proposed change does not, even indirectly, contribute to that one sentence, defer it.
