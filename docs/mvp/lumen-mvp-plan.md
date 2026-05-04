# Lumen v2 MVP Plan

Date: 2026-04-26
Status: Replaces v1 plan. v1 is archived as a sibling.

> Current status note (2026-05-04): this plan remains the original MVP thesis
> and discipline document, but several implementation checkboxes below are now
> stale. Read `docs/project-status.md` for the current beta status and next
> project plan before starting new work.

## 1. MVP thesis

The v2 MVP is not a feature list. It is **a 4-week soak experiment with ~10–15 invited users**, designed to find out whether async-accumulating Lens cards on a page genuinely make the page feel inhabited, and whether opt-in companion mode is a good shape for "I want company right now."

Every line of code, every doc, every decision in the build phase should ask: does this contribute to making that 4-week soak meaningful? If not, defer.

## 2. North-star success condition

```
Setup:   ~10–15 invited users; extension installed; invite codes
         redeemed; a Bun + Caddy + SQLite backend running on a
         Hetzner box; 1–3 essays in the URL allowlist hand-seeded
         with 30–50 Lens cards each from the founder + 1–2 close
         collaborators (no AI-drafted Lens).
Period:  4 weeks of free-form usage. No scheduled events.
Observe: Lens creation by users (not just reactions), repeat visits,
         use of reading modes, use of companion mode, what cards
         users actually leave.

The MVP succeeds when, by the end of week 4:

  - At least 3 invited users are still creating Lens (not just reacting)
  - At least one allowlisted page has accumulated a layer with multiple
    authors, ≥10 cards, and at least one inter-Lens reference
  - Dominant qualitative feedback is some version of "I want to keep
    this on"
  - Bonus: at least one user used companion mode for more than a wave
    of emoji

The MVP fails if creation drops to zero after week 1, no inter-Lens
references appear, or feedback is dominated by "the markers got in
the way" / "I didn't know what to do with this."
```

The criterion is qualitative and accumulative. Numerical engagement metrics on 10 users do not mean anything; the felt experience over weeks does.

## 3. Build phases (5-week timeline to ready-for-soak)

The plan assumes one builder working roughly full-time. Adjust elastically.

### Week 1 — Backend skeleton + extension surgery

**Backend** (apps/server):

- Bun project init, TS config, Caddyfile, systemd unit, dev compose
- SQLite schema from ARCHITECTURE.md §4.3, run migrations
- HTTP routes:
  - `POST /api/redeem` — invite code → bearer token
  - `GET /api/lenses?room=<hash>` — fetch all Lenses for a room
  - `POST /api/lenses` — create a Lens (auth required)
  - `POST /api/reactions` — add a reaction
  - `GET /api/preferences` / `PATCH /api/preferences` — reading mode etc.
- WebSocket route: subscribe to `room=<hash>`, receive `lens_created` / `presence_join` / `presence_leave` events
- CLI tool to issue invite codes
- Deploy to Hetzner CX22 with Caddy + Litestream

**Extension** (apps/extension):

- Strip v1 prototype: remove hardcoded seed Lens, remove AI buttons in composer, remove gradient-text marker styles, remove skill-strip UI from web demo if web demo is kept at all (likely delete the web demo)
- Service worker: partysocket WS connection, room join/leave on tab URL change
- Content script: opens a port to SW, requests current room, receives broadcast events
- Compose UI: select text → "Create Lens" → choose type (Quick / Question only for week 1) → publish
- Marker rendering: dotted underline, no gradients

Done when: a Lens created in Browser A appears in Browser B within ~1s, on the same URL.

### Week 2 — Anchoring + presence + reading modes

**Anchoring**:

- Set up `packages/anchoring` workspace
- Implement W3C TextPosition / TextQuote selectors in `packages/anchoring/src/` (~250 LOC owned in-tree)
- Add `approx-string-match` dependency
- Shim layer: `createAnchor(range)`, `restoreAnchor(selectorJson, root)` returning ranges or null
- Use it in extension: serialize on Lens creation, restore on page load
- Render via CSS Custom Highlight API (no `<mark>` wrapping)
- Orphan state: if all 3 selectors fail, surface "lost its anchor" UI

**Presence**:

- SW aggregates per-room presence; broadcasts `presence_state` on join/leave
- Content script overlay: tiny avatar list at top of page ("3 here") visible only when ≥1 other person is present
- Server-side 45s heartbeat timeout to drop ghosts

**Reading modes**:

- 3 presets: Quiet (default) / Thinking / Full
- Per-user setting in `chrome.storage.local`, mirrored to `user_preferences` table
- Filtering is client-side over the full Lens list; hidden Lens count badge ("3 hidden by Quiet mode")
- Mode picker in extension popup or page overlay corner

Done when: opening a page that another user is on shows their avatar; switching reading mode instantly changes which Lens render; opening a page with 5 seeded Lens in Quiet mode shows almost nothing, in Full mode shows all 5.

### Week 3 — Tags + references + companion mode

**Tags**:

- Free-form tag input at Lens creation; suggested common tags from a curated list
- Tags stored as JSON array on Lens
- Reading mode presets are tag/type filters under the hood

**References**:

- `[[lens:id]]` and `[[url:...]]` parsed from Lens body Markdown
- Inline render: `[[lens:id]]` shows a hover preview card; `[[url:...]]` is a normal link with a small chip
- Refs extracted at write time and stored in `lenses.refs` for fast lookup ("which Lens cite this one?")

**Companion mode**:

- "Find companion" button in page overlay (always opt-in; default off)
- Server matches user with others on same room with button on; broadcasts `companion_session_start`
- Emoji-toss UI: small floating layer at page edges; participants click an emoji button to send
- Chat layer: small ephemeral panel; togglable; messages are not persisted
- Closing tab or toggling button off ends participation
- "No one else here right now, leaving the door open" state for unmatched

Done when: two browsers on the same allowlisted page can find each other via companion mode, exchange emoji, and toggle into chat.

### Week 4 — Soak prep: content + identity polish + dogfooding

**Content seeding**:

- Pick 1–3 essays for initial allowlist (recommend Karpathy *A Recipe for Training Neural Networks* + PG *Do Things that Don't Scale* + one science/popular essay TBD)
- Founder + 1–2 collaborators **write 30–50 Lens by hand** across these essays, all signed with real handles. Tag them. Use inter-Lens references in at least 3 cases. **No AI-drafted Lens.** This sets the tone for everything that follows.
- Stagger `created_at` over the past few weeks so the layer feels accumulated, not bulk-uploaded

**Identity**:

- Handle picker UI in extension on first launch
- Anonymous reply toggle in compose UI
- (Stretch, P1) GitHub OAuth flow for badge — defer if behind schedule

**Dogfooding**:

- 3-day internal soak with founder + 1–2 close collaborators
- Hammer the failure modes from ARCHITECTURE.md §9
- Patch what breaks

Done when: founder spent 30 min of pleasure-reading on a seeded essay and felt it was worth their time.

### Week 5 — Soak start: invite the cohort

- Send invite codes to ~12–15 candidates (expect 8–10 redeem; 6–8 use the extension regularly)
- Short 1-screen onboarding inside the extension explaining: cards are the form; reading modes are how you control noise; companion mode is opt-in
- Privacy policy linked from onboarding (must exist by now — see §5 open question 5)
- Group chat platform set up for the cohort (see §5 open question 1)
- Founder is reachable in that chat for the first 2 weeks
- Founder continues to leave Lens themselves — sets ongoing tone, not just initial seeding

This is **not** a scheduled event. It's "the door is open, come read whenever." Soak runs for 4 weeks.

### After week 5 — observe, do not redesign mid-soak

- Read what users post but resist the urge to change product mid-soak
- Note: bug fixes are fine; product changes are not
- At end of week 4 of soak: collect feedback (DM each user; small form), evaluate against §2 success criterion

## 4. Feature priorities

### P0 (must have before soak start)

Done:

- ✅ Invite code → handle → bearer token flow
- ✅ Whitelisted URL injection (5 essays in current allowlist)
- ✅ All 7 Lens types in composer (Quick / Fun / Question / Poll / Knowledge / Challenge / Spoiler)
- ✅ Real-time Lens broadcast within a room
- ✅ Presence (who's here now) via `chrome.runtime.connect` port lifecycle
- ✅ Tags on Lens (free-form input)
- ✅ Reading modes (Quiet default / Thinking / Full) — set in popup, applied client-side
- ✅ References (`[[lens:id]]` and `[[url:...]]` parse + chip/link rendering in card body)
- ✅ Anchoring via `@lumen/anchoring` (TextPosition → TextQuote+context → fuzzy)
- ✅ CSS Custom Highlight API rendering (no `<mark>` wrap)
- ✅ Visual identity (12-shape outline-emission blooms on card open; 4-shape marker blooms on new Lens; universal popover entrance; respects `prefers-reduced-motion`) — see ARCHITECTURE.md §13
- ✅ Orphan tracking (failed-to-anchor Lens surface in InfoPanel; manual UX verification deferred — recipes in `apps/extension/src/content.tsx`)

Still needed before soak:

- ⏳ Anonymous toggle in composer (schema + server already record `lens.anonymous`)
- ⏳ Hide Lens on page (per-tab toggle)
- ⏳ Hide Lens on site (persistent setting)
- ⏳ LensCard "copy ref" button (so users can grab `[[lens:id]]` syntax)
- ⏳ Report button (server-side stub OK; no automation needed)
- ⏳ Companion mode (button + emoji toss + chat layer toggle) — the largest remaining block
- ⏳ Privacy policy (1 page, plain English)
- ⏳ Orphan re-anchor flow (orphans are visible, not yet repairable)

### P1 (next, after soak validates the shape)

- Poll Lens type
- Fun Lens type (longer, more polished form)
- Reactions (lol / true / aha / nope) — beyond what's in P0
- Reply threads
- AI-as-draft-assistant in compose ("make this funnier", "turn into a question") — never AI as the visible commenter
- GitHub OAuth badge
- Per-site reading mode overrides
- Custom tag filter sets
- "Ping the group: I'm reading this" affordance
- Inter-Lens reference reverse links ("3 Lens cite this")

### P2 (only after v2 hypothesis validated)

- Knowledge Lens promotion mechanic
- Cross-page user profile pages
- Friends-following filter
- Skill signal surfacing
- Optional floating danmaku layer (only inside Full mode, behind explicit toggle)
- Browser app / standalone shell
- Cross-browser packaging
- Mobile

## 5. Open questions to resolve before soak

1. **Group chat platform** for the invited cohort: Discord? Telegram? group iMessage? This is where the cohort communicates. Pick one.
2. **First essays**: Karpathy + PG + 1 popular-science / entertainment piece. Owner picks final list.
3. **Founder = ongoing tone-setter**: confirm the founder will spend ≥30 min/day in week 1 of soak posting and reacting to set tone.
4. **Seed Lens sign-off**: who reviews the 30–50 hand-written seed Lens before soak start for tone? At least 2 humans.
5. **Privacy policy draft**: short, plain-English, must say (a) what URLs the extension reports to the server, (b) anonymous Lens are not zero-knowledge anonymous to operators. 1 page max. **Must exist before invites go out.**

## 6. Metrics

The MVP metric is qualitative (see §2). For internal observability:

**Operational**:
- WS reconnect rate per user-session (alerts if > 3/hour)
- Lens creation latency (publish → other clients receive) p50/p95
- Anchor recovery success rate (anchored / orphan / failed)
- SW restart frequency per browser session

**Engagement signals during the soak** (observation, not success criterion):
- Lens created per active user per week (especially week 4 vs week 1)
- Inter-Lens reference count
- Reading mode distribution (how many users settled in each mode)
- Companion mode session count, average duration, emoji-only vs chat
- Reaction rate, reply depth
- Lens hidden by reading mode (signal: are modes too aggressive?)

**Anti-metrics** (we are explicitly NOT optimizing for):
- Total Lens count
- DAU/MAU
- Time on page (could rise simply because users are reading more carefully — meaningless without context)

## 7. Things explicitly NOT to build during these 5 weeks

This list is here so the temptation to "just add" is visible:

- AI auto-marker
- AI-generated visible Lens
- Visible floating danmaku layer (deferred to P2; cards are the primary form)
- Scheduled cohort co-read events (opt-in companion mode covers the synchronous case)
- Knowledge graph or canonical knowledge node system
- Skill tree UI (or any user-facing skill surface)
- Browser app shell
- Cross-browser support beyond Chrome
- Mobile UI
- Email notifications
- Public reputation / karma / leaderboards
- Public Lens (everything is invited-only at this stage)
- PDF / iframe / Shadow DOM anchoring
- Voice/video rooms
- Onboarding tour beyond a 1-screen explainer

If any of these get built before soak end, we have failed the discipline test, regardless of what shipped.

## 8. After the soak — the fork

Two outcomes, two responses.

**If the hypothesis lands** (success criteria in §2 met):

- Add P1 features in the order users naturally asked for them
- Open invites to a slightly larger circle (maybe 30 people)
- Begin sketching what knowledge emergence (UGC → Knowledge Lens promotion) actually looks like — but only after raw UGC is happening reliably
- Consider a second allowlist expansion (more essays / more sites)

**If the hypothesis does not land**:

- Do not double down on engineering. The premise is wrong somewhere.
- Run structured interviews with all participants
- Identify the specific reason engagement decayed (the marker? the cards? the modes? the audience? the essays? companion mode never used?)
- Redesign the one thing, run a 2-week mini-soak again
- Two consecutive failed soaks → step further back; possibly the cold-start mechanic itself needs replacing, not the implementation

## 9. North star, restated

> The MVP succeeds when ten people read the same kinds of essays over four weeks and at least three keep coming back, leaving cards that build on each other. Everything in this plan exists to make that paragraph possible.
