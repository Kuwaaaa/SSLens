# Lumen v2 Architecture

Date: 2026-04-26
Status: Architecture decision record for v2

## 1. Why this doc exists

The v1 prototype (now archived as a sibling) proved we could inject markers into real webpages. It did not prove anything about the actual product hypothesis: that an entertainment-substrate UGC layer makes long-tail web pages feel inhabited.

v2 is being rebuilt to validate that hypothesis with a small invite-only beta. This document captures the architectural decisions made before code is written, so future contributors (human or AI) do not have to re-derive them.

## 2. North star

The v2 MVP succeeds when, after ~4 weeks of free-form usage by the invited cohort:

- At least 3 invited users are still actively creating Lens (not just reacting) in week 4
- At least one allowlisted page has accumulated a Lens layer with multiple authors and at least one inter-Lens reference
- The dominant qualitative feedback is some form of "I want to keep this on"

Everything in this architecture exists to support that accumulation. Anything that does not contribute is deferred.

## 3. Stack at a glance

| Layer | Choice | One-line reason |
|---|---|---|
| Runtime (server) | Bun | Fast TS, batteries-included, less config |
| WebSocket (server) | Bun built-in (`ws.subscribe` topics) | Per-URL pub/sub primitive built in |
| DB | SQLite via `bun:sqlite` | One file, microsecond latency, fits the scale |
| TLS / proxy | Caddy 2 | Auto Let's Encrypt, 5-line config |
| Host | Hetzner CX22 | €4.5/mo for 2vCPU/4GB/40GB, 20TB traffic |
| Auth | Paseto v4 bearer token from invite code | No accounts, no passwords |
| Backup | Litestream → R2 | Streaming SQLite replication |
| Extension framework | Vite + MV3 + React + TypeScript | Carry over from v1 |
| WS client (extension) | partysocket | ~3KB reconnecting WS, MV3-safe |
| Anchoring | Vendored `hypothesis/client` anchoring + `approx-string-match` | Production-grade text anchoring without re-inventing |
| Highlight rendering | CSS Custom Highlight API | No DOM mutation, no React fights |

Estimated monthly cost for 100 users: **~$8**.

## 4. Backend

### 4.1 Process model

A single Bun process serves both HTTP (REST for Lens CRUD, history fetch, invite token mint) and WebSocket (presence, Lens broadcast, companion-session events). Caddy fronts it on port 443 and reverse-proxies. systemd keeps it alive.

### 4.2 Per-URL rooms

Each connected client is in exactly one room at a time, keyed by `room_id = SHA256(canonical_url)` where canonicalization strips:

- `utm_*`, `fbclid`, `gclid`, `ref`, `mc_eid` and other known tracking params (use the `clear-urls` rule list as source of truth)
- the URL fragment (`#section-2`)
- trailing slashes
- normalized to lowercase host

Hashing is for **privacy + fixed length**, not collision avoidance — 64 hex characters give us a stable opaque key without leaking which URL the user is reading.

Bun's built-in `ws.subscribe(roomId)` / `server.publish(roomId, payload)` is the pub/sub primitive. Companion sessions get a sub-channel like `roomId:companion`. No external broker.

### 4.3 Persistence

SQLite WAL mode. Schema (initial cut):

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- ulid
  handle TEXT NOT NULL UNIQUE,
  github_login TEXT,             -- optional, for badge
  invited_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE invite_codes (
  code TEXT PRIMARY KEY,
  issued_by TEXT REFERENCES users(id),
  consumed_by TEXT REFERENCES users(id),
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE lenses (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,         -- SHA256 of canonical URL
  url TEXT NOT NULL,             -- canonical URL itself, stored for display
  author_id TEXT NOT NULL REFERENCES users(id),
  anonymous INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,            -- quick | fun | question | poll | knowledge | challenge | spoiler
  tags TEXT NOT NULL DEFAULT '[]',  -- json array of strings
  body TEXT NOT NULL,            -- Markdown; supports [[lens:id]] / [[url:...]]
  refs TEXT NOT NULL DEFAULT '[]',  -- json array of LensRef (extracted from body)
  anchor TEXT NOT NULL,          -- json blob of selector array
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_lenses_room ON lenses(room_id, created_at);
CREATE INDEX idx_lenses_author ON lenses(author_id, created_at);

CREATE TABLE reactions (
  lens_id TEXT NOT NULL REFERENCES lenses(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,            -- lol | true | aha | nope | confused
  created_at INTEGER NOT NULL,
  PRIMARY KEY (lens_id, user_id, kind)
);

CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  reading_mode TEXT NOT NULL DEFAULT 'quiet',  -- quiet | thinking | full
  per_site_overrides TEXT NOT NULL DEFAULT '{}',  -- P1
  custom_tag_filters TEXT NOT NULL DEFAULT '[]', -- P1
  updated_at INTEGER NOT NULL
);

-- Companion mode: ephemeral, not durable across server restart by design
CREATE TABLE companion_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE TABLE companion_participants (
  session_id TEXT NOT NULL REFERENCES companion_sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  PRIMARY KEY (session_id, user_id)
);
-- Companion events (emoji + chat) are NOT persisted — they live only in the
-- WebSocket broadcast and are gone when the session ends.
```

Litestream replicates the DB file to R2/B2 every ~10s. Companion event traffic is intentionally *not* in the replicated DB — it's ephemeral by design.

### 4.4 Auth

1. Founder generates an invite code via CLI: `bun cli/issue-invite.ts --by founder`
2. User pastes code into extension; extension POSTs `/api/redeem` with `{code, handle}`
3. Server creates `users` row, marks invite consumed, returns Paseto v4 bearer token (`sub=user_id`, `exp=+365d`, signed with Ed25519)
4. Extension stores token in `chrome.storage.local`
5. All API and WS connections include token; server verifies, attaches `user_id` to context

Optional GitHub OAuth (P1) is layered on top: a `users.github_login` column populated via standard OAuth flow. It is a **badge**, not a login. The bearer token remains the auth credential.

Per-Lens `anonymous: bool` flag: server records true author, client renders as "Anonymous" when set. This is **not zero-knowledge anonymity** — moderation requires us to know who said what. The privacy policy must say so plainly.

### 4.5 Deployment

- Single Hetzner CX22 in Falkenstein/Helsinki
- Caddyfile + systemd unit + Bun binary + SQLite file
- Litestream as separate systemd unit
- No Docker for v2 (one process, one file — Docker is overhead at this scale)
- Fly.io is the graduation path if we outgrow one box

## 5. Extension

### 5.1 Topology

```
┌───────────────────────────────────────────────────┐
│  Browser                                          │
│                                                   │
│   ┌─────────────────────────────────────────┐    │
│   │ Service Worker (singleton)              │    │
│   │  - 1× WS connection (partysocket)       │    │
│   │  - room membership + presence aggregator│    │
│   │  - chrome.alarms 25s heartbeat          │    │
│   └─────────────────────────────────────────┘    │
│        ▲ port (chrome.runtime.connect)            │
│        │                                          │
│   ┌────┴───────┬───────────────┬──────────────┐  │
│   │ Tab A      │ Tab B         │ Tab C        │  │
│   │ content.ts │ content.ts    │ content.ts   │  │
│   │ + overlay  │ + overlay     │ + overlay    │  │
│   └────────────┴───────────────┴──────────────┘  │
│                                                   │
└───────────────────────────────────────────────────┘
```

### 5.2 Load-bearing invariant

> **The lifecycle of a `chrome.runtime` port = the user's presence in that page's room.**

When a content script connects to the SW via `port = chrome.runtime.connect()`, the SW joins that user to the URL's room. When the tab closes (or navigates away, or is discarded), the port's `onDisconnect` fires immediately and the SW broadcasts `leave`. No `beforeunload` polling, no heartbeat-timeout dance for departure detection.

### 5.3 Service worker lifecycle survival

- Active WS traffic counts as keep-alive (Chrome 116+), so an idle room holds the SW alive via heartbeat
- 25s `chrome.alarms` ping prevents idle-suspension during conversational lulls
- On SW restart: `chrome.storage.session` retains room membership and last-seen Lens cursor; content scripts auto-reconnect their port within ~100ms via `chrome.runtime.onStartup`

### 5.4 Why not Socket.io / offscreen / content-script-WS

- **Socket.io**: client lib uses `eval`-style code paths and assumes `window`; broken in MV3 since manifest v3 launched. Unchanged in 2026.
- **Offscreen document**: needed for things requiring DOM (audio, WebRTC, clipboard) that SWs cannot do. Pure WebSocket is not one of those things; offscreen adds an IPC hop with no benefit.
- **WS in content script**: one connection per tab. 5 tabs on the same domain = 5 connections. Rejected.

## 6. Anchoring

### 6.1 Multi-selector model

Following the W3C Web Annotation Data Model. Each anchor stores three selectors and tries them in this order on restore:

1. `TextPositionSelector` — fastest when DOM is unchanged
2. `RangeSelector` — fast when only specific subtree changed
3. `TextQuoteSelector` (with prefix/suffix context) — most resilient

If all three fail, the Lens enters `orphan` state and surfaces a "lost its anchor" UI affordance.

### 6.2 Implementation

Vendor `hypothesis/client/src/annotator/anchoring/` (~1500 LOC, BSD-2-Clause) into `packages/anchoring/vendor/hypothesis/`. Add a top-level shim in `packages/anchoring/src/` that exposes the API we actually use. Bring in `approx-string-match` for fuzzy fallback (Bitap algorithm, bounded edit distance).

Why vendor instead of `npm install`: the Hypothesis anchoring code is not separately published — it lives inside the client repo. Vendoring gives us the modification right we need for MV3-specific tweaks; the cost is tracking upstream bugfixes manually. License (BSD-2) and attribution preserved in the vendor directory.

### 6.3 Highlight rendering

**No DOM mutation.** Use the CSS Custom Highlight API:

```ts
const highlight = new Highlight(...ranges);
CSS.highlights.set(`lumen-${lensId}`, highlight);
```

Style via `::highlight(lumen-{id}) { background: ... }` in injected CSS. Browser support as of 2026: Chrome 105+, Safari 17.2+, Firefox 140+ (Interop 2026 focus).

Why this matters: wrapping selected text in `<mark>` mutates the DOM. SPAs reconcile and erase the wrap. Anchoring offsets shift because *we* changed the text. Custom Highlight API skips all of that — the DOM is untouched, the highlight is purely a render-layer overlay.

### 6.4 Deferred anchoring features

- PDF anchoring (use PDF.js text layer integration; not before v3)
- Cross-iframe selections
- Shadow DOM internals
- Canvas/SVG content
- Video timestamps
- Semantic/embedding-based anchoring (no production-grade open-source option in 2026)

## 7. Cold start: async accumulation + opt-in companion mode + reading modes

The earlier instinct to manufacture concurrency (scheduled cohort co-reads + animated time-shifted danmaku) was wrong-shaped for a reading product. Reading is personal, paced, interruptible. Forcing a cohort onto the same essay at the same hour creates Twitch-chat dynamics that fight against reading; floating text across the page actively interrupts what users are there to do.

The real cold-start model is three layers, and the form is **cards, not floating UI**.

### 7.1 Async accumulation as the substrate

Lens cards are persistent, signed by handle, dated. They live on a URL forever. When a user opens a page that has accumulated 8 cards from past visitors over the last month, the page already feels inhabited — not because anyone is there now, but because people have been there before, and they left something useful or funny.

This is closer to StackOverflow's accretive model than to Twitch's concurrent model. It is long-tail compatible: even a page with one reader per week grows over time.

The first-comment problem (an empty page is a dead page) is solved by **founder + early users seeding pages they personally care about, by hand**. There is no AI seeding (see §10).

### 7.2 Companion mode (opt-in real-time matching)

When a user wants company while reading, they click a "Find companion" (搜寻同伴) button in the page overlay. The server matches them with anyone else on the same room (canonicalized URL) whose button is currently on. The interaction has two layers:

- **Emoji toss** (default, ambient): participants throw single emoji that briefly appear floating on the page edges. Lowest-friction, no typing.
- **Chat layer** (toggle): a small ephemeral chat panel for typed messages.

Sessions are session-scoped: closing the tab or toggling the button off ends participation. **Companion exchanges are independent of the Lens layer** — they do not auto-promote into Lens. If a particularly good exchange should become a Lens, the user creates one explicitly.

The button is always opt-in. Default state is solo reading. **A user who never clicks the button never appears in any companion match.**

Server-side: companion events flow through `roomId:companion` sub-channel. Events are not persisted (see §4.3).

### 7.3 Reading modes (user-controlled volume)

Each user has a current "reading mode" — a declaration of how much social signal they want right now. Three presets:

- **Quiet (default)**: minimal markers; only featured + saved + author=friend Lens render. The page reads almost like the original. This is the default for new users so first impression isn't overwhelming.
- **Thinking**: show types `{question, knowledge, challenge}`; hide pure jokes / reactions / polls. For deep reading.
- **Full**: show everything — including hot takes, jokes, polls.

The mode is per-user, persisted in `chrome.storage.local` and mirrored to the server (`user_preferences.reading_mode`). Per-site overrides and custom tag filter sets are P1.

**Filtering is client-side over the full Lens list returned by the server.** The server returns all room Lens; the extension hides what the active mode excludes. This keeps the server simple, lets users switch modes instantly with no refetch, and makes a hidden Lens count badge trivial to surface ("3 hidden by Quiet mode").

Tags are the underlying field. Modes are presets over tags + types. Conventional tag categories are documented in `packages/schema/src/index.ts`.

### 7.4 Floating danmaku — deferred, low-priority

The Niconico-style ghost comments animating in on scroll were attractive in research but interrupt reading in practice. They are deferred to **post-MVP, opt-in extension feature**, not part of the core experience. If they ever ship, they ship behind a user-explicit toggle and probably only inside `Full` reading mode. They will not be the default form of the social layer.

## 8. Identity & auth model

| Layer | Required? | Stored | Display |
|---|---|---|---|
| Invite code | Required to join | one-time, marked consumed | not displayed |
| Bearer token | Required for every request | `chrome.storage.local` | not displayed |
| Handle | Required, semi-real | `users.handle` | always |
| GitHub login | Optional (P1) | `users.github_login` | as a badge |
| Per-Lens `anonymous` flag | Optional | `lenses.anonymous` | toggles author display to "Anonymous" |

Anonymity is **moderation-aware**: the server still knows who wrote each Lens. The privacy policy must state this. Anyone wanting unlinkable anonymity is the wrong audience for v2.

## 9. Failure modes the architecture is designed against

| Failure | Detection | Response |
|---|---|---|
| Laptop sleep / network change | App-layer ping with 5s timeout; `navigator.onLine`; `chrome.idle.onStateChanged` | Force WS close + reconnect; replay missed Lenses since cursor |
| Service worker suspended / restarted | `chrome.runtime.onStartup` + port `onDisconnect` | Re-handshake within ~100ms; re-subscribe to active tab's room |
| Server presence ghost (client died silently) | 45s heartbeat timeout server-side | Drop user from room, broadcast leave |
| Anchor unrecoverable (DOM heavily changed) | All 3 selectors fail | Mark Lens `orphan`; surface re-anchor affordance |
| Companion mode finds no one | Server returns `match: empty` | UI shows "no one else here right now, leaving the door open" with soft cancel; auto-notify if someone else opts in within next N minutes |
| Reading mode hides important Lens | Lens count badge | Show "N hidden by Quiet mode" affordance for one-tap upgrade |
| Concurrent Lens creation race | Server is single writer (SQLite) | Last-write-wins is fine; no conflict resolution needed for append-only |
| Bad actor in invite group | Token revocation table | `/admin/revoke <user>` invalidates all their tokens |
| SQLite file loss | Litestream streaming replication | RPO ~10s; restore from R2 |

## 10. What v2 explicitly will NOT build

In MVP scope:

- AI auto-marker / AI explanation of paragraphs
- Visible AI-authored Lens (AI as draft assistant only, never as default visible commenter)
- **Visible floating danmaku layer** (deferred to post-MVP opt-in extension; cards are the primary form)
- **Scheduled cohort co-read events** (opt-in companion mode covers the synchronous case)
- Knowledge graph / canonical knowledge node system
- Skill tree UI (track signals in DB silently if useful, but no UI)
- Reputation system / karma / public leaderboards
- Atlas / 3D showroom / Toy Project workshop
- Browser app shell
- Cross-browser packaging (Chrome only for v2)
- Public reputation voting / "merging PRs to canonical knowledge"
- Real-time voice/video rooms
- Mobile

If a feature is here, it is **deferred until after the v2 hypothesis is validated**. A successful 4-week soak may justify some of these for v3; an unsuccessful one means the premise needs to change before any of these matter.

## 11. File layout (planned)

```
SStree/                            (currently SStree-v2, will be renamed)
├── CLAUDE.md                      onboarding for AI assistants
├── README.md
├── package.json                   workspace root
├── docs/
│   ├── ARCHITECTURE.md            this file
│   ├── PROJECT_OVERVIEW.md
│   ├── Chat.md                    original conception (preserved)
│   ├── product/lens-design.md
│   ├── mvp/lumen-mvp-plan.md
│   ├── research/seed-webpages.md
│   └── technical/lens-anchoring.md
├── apps/
│   ├── extension/                 MV3 extension (Vite + React + TS)
│   └── server/                    Bun backend
├── packages/
│   ├── schema/                    shared types (Lens, User, Anchor, etc.)
│   ├── anchoring/                 vendored Hypothesis + shim
│   └── lens-ui/                   shared React components (later, P1)
├── scripts/
│   ├── issue-invite.ts            CLI to mint invite codes
│   └── canonicalize-url.ts        URL normalization (also used by extension)
└── infra/
    ├── Caddyfile
    ├── lumen.service              systemd unit
    └── litestream.yml
```

## 12. Library appendix (for reference)

| Tool | Repo / docs | Last verified active |
|---|---|---|
| Bun | https://bun.sh | 2026-Q1 |
| partysocket | https://github.com/partykit/partykit/tree/main/packages/partysocket | 2026-Q1 |
| hypothesis/client anchoring | https://github.com/hypothesis/client/tree/main/src/annotator/anchoring | 2026-02 |
| approx-string-match | https://www.npmjs.com/package/approx-string-match | stable |
| Caddy | https://caddyserver.com | 2026-Q1 |
| Litestream | https://litestream.io | 2026-Q1 |
| Paseto | https://paseto.io | spec stable |
| CSS Custom Highlight API (MDN) | https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API | Interop 2026 |
| W3C Web Annotation Data Model | https://www.w3.org/TR/annotation-model/ | REC since 2017 |
| ClearURLs rules (URL canonicalization) | https://github.com/ClearURLs/Rules | active |
