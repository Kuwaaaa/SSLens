# Lumen v2 — Project Overview

Date: 2026-04-26
Status: Replaces v1 overview. v1 is archived as a sibling.

## 1. What Lumen is

Lumen is a browser extension that lets a small invited group leave contextual, playful comments — "Lens" cards — on real webpages. Cards persist on a URL forever, signed by handle and dated. Over time a page accumulates a Lens layer that makes it feel inhabited. When a user actively wants company while reading, they can opt into a "companion mode" that matches them with others currently reading the same page.

The simplest description:

> Lumen turns a webpage into a place that has been read, and occasionally a place where someone else is reading right now.

## 2. The bet

There is a long-running idea behind Lumen — that knowledge wants to be open-sourced beyond software, that a "lens" you learn changes what you can perceive in the world, and that toy projects are the unit of joy in learning. The original conception (preserved in `docs/Chat.md`) frames an entire ecosystem around this: Lumen as the perceptive layer, Atlas as the personal workshop, knowledge graphs, salons, project scaffolding.

v2 narrows the bet to one tractable claim, the load-bearing one for everything else:

> **People will participate (write, react, return) on a webpage when it feels like other people have been there. Knowledge emerges from that participation; it does not seed it.**

If this is true, the ecosystem becomes possible. If it is not, no amount of knowledge graph engineering will save it. So v2 tests this — and only this — first.

The cause-and-effect chain v2 is built on:

```
entertainment substrate  →  attracts users  →  UGC  →  emergent knowledge
```

Reverse the arrows and you get the v1 trap: build the knowledge layer first, hope users come for it, watch them not come.

## 3. Why this is a hard problem on the open web

The classic UGC bootstrapping move is to find an existing concentrated audience (Niconico's otaku watching the same anime drop, Reddit's tech crowd, Quora's startup scene). Long-tail blog posts have no such audience: a Paul Graham essay might have 30 readers in a week, scattered across 24 time zones.

The instinctive answer is to manufacture concurrency — schedule a cohort to open the same page at the same hour, animate past comments as floating danmaku to fake live activity. **That instinct is wrong-shaped for reading.** Reading is paced and interruptible; forcing it onto a clock fights against what users are there to do, and floating text actively interrupts the page.

Lumen's actual model is three layers, all of them in the form of *cards*, not floating UI:

**A. Async accumulation as the substrate.** Lens cards are persistent, signed by handle, dated. Over weeks, even a page with one reader per visit accumulates a layer that feels inhabited — closer to StackOverflow's accretive model than to Twitch chat. Long-tail compatible by design.

**B. Companion mode as an opt-in.** When a user wants company while reading, they click a button. The server matches with anyone else currently on the same page with the button on. Interactions are minimal by default: emoji tossed onto the screen, or a tiny chat layer if someone wants to type. Closing the tab ends the session. A user who never opts in never appears in any match.

**C. Reading modes.** Each user picks how much social signal to see: Quiet (almost the original page), Thinking (questions + knowledge + challenges only), Full (everything). The substrate persists; the user controls their own volume.

The cold-start problem reduces to: **how do we get the first useful cards on each page?** The answer is unglamorous — founder + early users seed pages they personally care about, by hand. No AI seeding (see `docs/ARCHITECTURE.md` §10 for why).

## 4. The 10-person beta

The first audience is intentionally small and tribal:

- ~10–15 people, mostly close friends and people who came in through project announcement
- Demographic guess: young, tech-leaning, interested in open source
- Zero public signup. Invite code only.

The rationale is from every UGC platform that ever bootstrapped (B 站, Reddit, Quora, Lobsters, Stack Overflow): the early users set the tone permanently, and they need to share enough cultural context that the first comments aren't decoded as alien. A small invited tribe with a shared subculture clears that bar; a public open beta does not.

## 5. Identity model

- **Handle**: required, semi-real (alias is fine — Twitter-handle level of "real"). Always shown.
- **Invite code**: required to join. Pre-shared by founder.
- **Bearer token**: minted on redemption, lives in `chrome.storage.local`, used for every API/WS call. No password, no email.
- **GitHub link** (optional, P1): adds a badge to the user's display, since the target audience overlaps heavily with GitHub users. Strictly cosmetic; the bearer token is still the auth.
- **Anonymous reply flag** (per-Lens): can be toggled when posting. Display becomes "Anonymous"; the server still records the real author for moderation. The privacy policy will say so plainly. This is **not zero-knowledge anonymity**.

## 6. North-star success criterion

The success criterion is qualitative and accumulative, not a single event:

> After ~4 weeks of free-form usage by the invited cohort, the project succeeds if:
>
> - At least 3 invited users are still actively *creating* Lens (not just reacting) in week 4
> - At least one allowlisted page has accumulated a Lens layer with multiple authors, ≥10 cards, and at least one inter-Lens reference
> - The dominant qualitative feedback contains some version of "I want to keep this on" rather than "I forgot to open it"
> - Bonus signal: at least one user has used companion mode and had a non-trivial exchange (more than a wave of emoji)

The MVP fails if usage drops to zero after the first week, no inter-Lens references appear, or feedback is dominated by "the markers got in the way" or "I didn't know what to do with this."

If the bar is reached, v2's core hypothesis is validated and we expand. If not, we redesign before adding more code.

## 7. What is NOT in v2 scope

These were prominent in earlier framings; they are **not** in v2 MVP:

- AI-generated visible Lens (the trap: kills UGC motivation by saturating the page; covered in `docs/ARCHITECTURE.md` §10)
- Visible floating danmaku (deferred to opt-in extension feature post-MVP — Lumen's primary form is cards, not floating text)
- Scheduled cohort co-read events (opt-in companion mode handles the synchronous case)
- Knowledge graph / canonical knowledge node system
- Skill tree UI (signals may be tracked silently; no user-facing surface)
- Atlas (App B from the original conception): personal workshop, 3D showroom, project scaffolding
- Reputation/karma/leaderboards (kill small-group tone instantly)
- Public reputation voting / "merging PRs to canonical knowledge"
- 7-Pillar content framework as a user-facing requirement
- Browser app shell / web app
- WebRTC voice/video rooms
- Cross-browser packaging (Chrome only)
- PDF, iframe, Shadow DOM, video-timestamp anchoring

These may return in v3+ if v2's hypothesis is validated. They are deferred, not abandoned.

## 8. Phase plan (high-level)

| Phase | Goal | Done when |
|---|---|---|
| **Phase 0 (now)** | Architecture + scaffolding | `docs/ARCHITECTURE.md` written, v2 repo initialized, stack frozen |
| **Phase 1** | Build minimum viable extension + backend | A user can paste an invite code, redeem a handle, open a whitelisted page, leave a Lens, have it appear in real time on another invited user's browser |
| **Phase 2** | Anchoring + presence | Multi-selector anchoring, CSS Highlight API, basic presence (who's here now), reading-mode filtering |
| **Phase 3** | Tags + references + companion mode | Lens tags, [[lens:id]]/[[url:...]] refs, "Find companion" button with emoji toss + chat layer |
| **Phase 4** | Soak with invited cohort | Hand-seeded content + ~10–15 invitees + 4 weeks of free-form usage; collect qualitative feedback |
| **Phase 5** | Iterate based on what worked | Drop what failed, double down on what felt alive |

Detail and week-by-week timeline lives in `docs/mvp/lumen-mvp-plan.md`.

## 9. Documentation map

For new contributors (human or AI), read in this order:

1. `docs/Chat.md` — the original conception, philosophy, and ecosystem vision
2. `docs/PROJECT_OVERVIEW.md` — this file: the v2 narrowing and current direction
3. `docs/ARCHITECTURE.md` — technical decisions and stack
4. `docs/mvp/lumen-mvp-plan.md` — week-by-week build plan
5. `docs/product/lens-design.md` — Lens content types, interaction loops, visual direction (mostly v1; "danmaku energy" passages are now superseded — cards are the primary form)
6. `docs/technical/lens-anchoring.md` — anchoring technical detail (note: largely superseded by ARCHITECTURE.md §6)
7. `docs/research/seed-webpages.md` — long-term page archetype research

`CLAUDE.md` at the repo root is a short onboarding for AI assistants — read first if you are one.

## 10. North star, restated

> Lumen exists to make a webpage feel inhabited — through cards that persist, not chrome that interrupts. Knowledge, skill growth, and a wider ecosystem are downstream effects of solving that one problem first.
